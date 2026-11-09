import type {
  AppCommandMessage,
  AppInfo,
  ExportResult,
  FileData,
  MdApi,
} from '../src/preload/preload';
import type { ExportCapabilities } from '../src/main/export';
import { decodeText } from '../src/main/decodeText';
import type { OrientationPref } from '../src/renderer/layout';
import { askConfirmClose, saveFile, showTakenOver } from './dialogs';
import { soleInstance, type Instance } from './instance';
import { pickFiles } from './filePicker';
import { printStandalone } from './print';
import { createStorage, type Storage } from './storage';
import { basename, joinEol, splitEol } from './text';
import type { MenuState } from './commands';

/**
 * `window.md` for the browser (PLAN.md §35). The renderer's whole view of the outside
 * world is the MdApi object the Electron preload exposes; this module implements the
 * same interface with browser means and the renderer runs unchanged:
 *  - files: import copies a chosen file into the web "disk" (IndexedDB); Save and
 *    Save as share or download the text and record what was shared (D-29, D-30);
 *  - watching, multiple windows, startup files and the close handshake do not exist in
 *    a browser tab: their events never fire and their calls resolve at once (D-33);
 *  - export: HTML is shared or downloaded, PDF goes through the print sheet, Pandoc is
 *    reported absent so the dialog hides it (D-31).
 */

class Signal<T> {
  private subs = new Set<(payload: T) => void>();
  on(cb: (payload: T) => void): () => void {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  }
  emit(payload: T): void {
    for (const cb of this.subs) cb(payload);
  }
}

/** Subscription for an event that never fires in the browser. */
const never = () => () => {};

export interface BrowserApi {
  api: MdApi;
  /** Send a command to the renderer as the application menu would. */
  dispatch: (msg: AppCommandMessage) => void;
  /** What the menu shows as current (theme, layout). */
  state: MenuState;
}

export interface BrowserApiOptions {
  storage?: Storage;
  /** Which open copy of the site may write (instance.ts, D-35). */
  instance?: Instance;
  /** IndexedDB name prefix when no storage is given (tests). */
  dbName?: string;
}

export function createBrowserApi(opts: BrowserApiOptions = {}): BrowserApi {
  const storage = opts.storage ?? createStorage(opts.dbName);
  const instance = opts.instance ?? soleInstance();
  const commands = new Signal<AppCommandMessage>();
  const systemTheme = new Signal<{ dark: boolean }>();
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkQuery.addEventListener('change', (e) =>
    systemTheme.emit({ dark: e.matches }),
  );
  const state: MenuState = { theme: 'light', orientation: 'auto' };

  // Files dropped on the window arrive as File objects; the renderer asks for a "path"
  // and then reads it, so hand out a token and import on read.
  const dropped = new Map<string, File>();
  let dropCounter = 0;

  // The renderer writes the session on window blur; a backgrounded or closing page
  // must count as blur too, or the last half-second of edits is lost (D-23).
  const flush = () => window.dispatchEvent(new Event('blur'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  window.addEventListener('pagehide', flush);

  // Another copy of the site asked to take over: write this copy's session (the next
  // session.save after the flush), then stop saving and say so (D-35).
  let afterSave: (() => void) | null = null;
  instance.setHandover(
    () =>
      new Promise<void>((resolve) => {
        afterSave = resolve;
        flush();
        window.setTimeout(resolve, 1000);
      }),
  );
  instance.onLost(() => showTakenOver());
  /** The name a record was shared under; its path may carry a " (2)". */
  const nameOf = (path: string): Promise<string> =>
    storage.files.read(path).then(
      (f) => f.name,
      () => basename(path),
    );
  const describe = (err: unknown) =>
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // A share or download has already happened when the record is written; if that write
  // fails, say what did happen rather than reporting a plain failure.
  const recordOrExplain = async (
    via: 'share' | 'download',
    write: () => Promise<FileData>,
  ): Promise<FileData> => {
    try {
      return await write();
    } catch (err) {
      throw new Error(
        `it was ${via === 'share' ? 'shared' : 'downloaded'}, but this device could not record it (${describe(err)}), so the tab still shows unsaved changes.`,
      );
    }
  };
  const notMine = () =>
    new Error('MD is open in another tab; this tab no longer saves.');

  // Records written since the last session report that listed them. A report captured
  // before an import or a share can reach session.save after it; its tab list does not
  // name the new record yet, so pruning must spare it (scan finding A-F1).
  const fresh = new Set<string>();
  const record = async (
    path: string,
    name: string,
    text: string,
    eol: '\n' | '\r\n',
  ): Promise<FileData> => {
    if (!(await instance.mayWrite())) throw notMine();
    fresh.add(path);
    return storage.files.write(path, name, text, eol);
  };

  // One import at a time: choosing a free path and writing it are separate steps, so two
  // same-named files dropped together would otherwise get the same record (A-F6).
  let importing: Promise<unknown> = Promise.resolve();
  const importFile = (file: File): Promise<FileData> => {
    const run = async () => {
      // Same decoding as the desktop: a byte-order mark is kept, and a file that is not
      // UTF-8 is read as Windows-1252 and flagged (src/main/decodeText.ts).
      const decoded = decodeText(new Uint8Array(await file.arrayBuffer()));
      const { text, eol } = splitEol(decoded.text);
      const path = await storage.files.uniquePath(
        'Imported',
        file.name || 'Untitled.md',
      );
      const data = await record(path, basename(path), text, eol);
      return decoded.encoding ? { ...data, encoding: decoded.encoding } : data;
    };
    const next = importing.then(run, run);
    importing = next.catch(() => undefined);
    return next;
  };

  const dispatch = (msg: AppCommandMessage) => {
    if (msg.name === 'layout:set' && msg.value)
      state.orientation = msg.value as OrientationPref;
    if (msg.name === 'theme:set' && msg.value)
      state.theme = msg.value as MenuState['theme'];
    commands.emit(msg);
  };

  const api: MdApi = {
    getInfo: async (): Promise<AppInfo> => ({
      name: 'MD',
      version: __APP_VERSION__,
      electron: '',
      systemTheme: darkQuery.matches ? 'dark' : 'light',
      windowId: 1,
      defaultOrientation: 'auto',
    }),
    onCommand: (cb) => commands.on(cb),

    files: {
      // Each file is imported on its own: one failure does not discard the others. The
      // error carries the files that did import so the renderer can still open them.
      openDialog: async () => {
        const out: FileData[] = [];
        const failed: string[] = [];
        for (const f of await pickFiles()) {
          try {
            out.push(await importFile(f));
          } catch (err) {
            failed.push(`"${f.name}" (${describe(err)})`);
          }
        }
        if (failed.length > 0)
          throw Object.assign(
            new Error(`Could not import ${failed.join(', ')}.`),
            { opened: out },
          );
        return out;
      },
      read: async (path) => {
        const file = dropped.get(path);
        if (file) {
          dropped.delete(path);
          return importFile(file);
        }
        return storage.files.read(path);
      },
      // Save = share or download again under the same name; the record keeps the path.
      save: async (path, text, eol) => {
        const name = await nameOf(path);
        const choice = await saveFile({
          suggestedName: name,
          text: joinEol(text, eol),
          mime: 'text/markdown',
          fixedName: true,
        });
        if (!choice) throw new DOMException('Save cancelled', 'AbortError');
        return recordOrExplain(choice.via, () =>
          record(path, name, text, eol ?? '\n'),
        );
      },
      // The renderer passes the current path as the suggestion when there is one.
      saveAs: async (suggestedName, text, eol) => {
        const own = suggestedName.includes('/') ? suggestedName : null;
        const ownName = own ? await nameOf(own) : null;
        const choice = await saveFile({
          suggestedName: ownName ?? suggestedName,
          text: joinEol(text, eol),
          mime: 'text/markdown',
          title: 'Save as',
        });
        if (!choice) return null;
        return recordOrExplain(choice.via, async () => {
          // The record keeps the name the user typed even when its path needs a
          // " (2)" to stay unique, so the tab and later Saves use that name (A-flagB).
          const path =
            own && ownName === choice.name
              ? own
              : await storage.files.uniquePath('Shared', choice.name);
          return record(path, choice.name, text, eol ?? '\n');
        });
      },
      pathForFile: (file) => {
        const key = `drop:${++dropCounter}`;
        dropped.set(key, file);
        return key;
      },
    },

    watch: {
      start: async () => undefined,
      stop: async () => undefined,
    },
    onFileChanged: never,
    onFileRemoved: never,
    onWatchError: never,

    theme: {
      set: async (pref) => {
        state.theme = pref;
        if (await instance.mayWrite()) await storage.session.setTheme(pref);
        return { dark: darkQuery.matches };
      },
    },
    onSystemTheme: (cb) => systemTheme.on(cb),

    session: {
      load: async () => {
        const loaded = await storage.session.load();
        state.theme = loaded.theme;
        if (loaded.window?.orientation)
          state.orientation = loaded.window.orientation;
        return loaded;
      },
      save: async (report) => {
        if (!(await instance.mayWrite())) return;
        state.theme = report.theme;
        if (report.orientation) state.orientation = report.orientation;
        await storage.session.save(report);
        // No library: records that no open or recently closed tab refers to are not kept
        // (D-29). Closed tabs keep theirs so Reopen gets the file back (A-F7); records
        // newer than this report are spared until a report has seen them (A-F1).
        const listed = [...report.tabs, ...report.closed].flatMap((t) =>
          t.path ? [t.path] : [],
        );
        for (const p of listed) fresh.delete(p);
        await storage.files.prune([...listed, ...fresh]);
        // Drafts no tab refers to are left over from an earlier session (A-F11).
        await storage.session.pruneDrafts(
          report.tabs.flatMap((t) => (t.draft ? [t.draft] : [])),
        );
        afterSave?.();
        afterSave = null;
      },
      writeDraft: async (id, text) => {
        if (await instance.mayWrite())
          await storage.session.writeDraft(id, text);
      },
      readDraft: (id) => storage.session.readDraft(id),
      deleteDraft: async (id) => {
        if (await instance.mayWrite()) await storage.session.deleteDraft(id);
      },
    },

    windows: {
      open: async () => undefined,
      // Rejecting keeps the document here: the renderer removes its copy only on success.
      detachTab: async () => {
        throw new Error(
          'Tabs cannot be moved to another window in the browser',
        );
      },
      tabDropped: async () => undefined,
      ready: async () => [],
    },
    onRemoveMoved: never,

    export: {
      capabilities: async (): Promise<ExportCapabilities> => ({
        pandoc: null,
        pdfEngines: [],
        installCommand: '',
      }),
      html: async ({ html, name }): Promise<ExportResult> => {
        const choice = await saveFile({
          suggestedName: `${name.replace(/\.[^.]+$/, '')}.html`,
          text: html,
          mime: 'text/html',
          title: 'Export HTML',
        });
        if (!choice) return { ok: false, cancelled: true };
        return {
          ok: true,
          path:
            choice.via === 'share'
              ? `"${choice.name}" through the share sheet`
              : `Downloads/${choice.name}`,
        };
      },
      pdf: async ({ html, pageSize }): Promise<ExportResult> => {
        printStandalone(html, pageSize);
        return {
          ok: true,
          path: 'the print sheet; choose Save to Files or Save as PDF there',
        };
      },
      pandoc: async (): Promise<ExportResult> => ({
        ok: false,
        error: 'Pandoc is not available in the browser version.',
      }),
    },

    confirmClose: (name) => askConfirmClose(name),

    onRequestClose: never,
    closeNow: async () => undefined,
    closeCancelled: async () => undefined,
    getStartupFiles: async () => [],
  };

  return { api, dispatch, state };
}
