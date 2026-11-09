import type {
  AppCommandMessage,
  AppInfo,
  ExportResult,
  FileData,
  MdApi,
} from '../src/preload/preload';
import type { ExportCapabilities } from '../src/main/export';
import type { OrientationPref } from '../src/renderer/layout';
import { askConfirmClose, saveFile } from './dialogs';
import { pickFiles } from './filePicker';
import { printStandalone } from './print';
import { createStorage } from './storage';
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

export function createBrowserApi(dbName?: string): BrowserApi {
  const storage = createStorage(dbName);
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
    fresh.add(path);
    return storage.files.write(path, name, text, eol);
  };

  // One import at a time: choosing a free path and writing it are separate steps, so two
  // same-named files dropped together would otherwise get the same record (A-F6).
  let importing: Promise<unknown> = Promise.resolve();
  const importFile = (file: File): Promise<FileData> => {
    const run = async () => {
      const { text, eol } = splitEol(await file.text());
      const path = await storage.files.uniquePath(
        'Imported',
        file.name || 'Untitled.md',
      );
      return record(path, basename(path), text, eol);
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
      openDialog: async () => {
        const out: FileData[] = [];
        for (const f of await pickFiles()) out.push(await importFile(f));
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
        const name = basename(path);
        const choice = await saveFile({
          suggestedName: name,
          text: joinEol(text, eol),
          mime: 'text/markdown',
          fixedName: true,
        });
        if (!choice) throw new Error('Save cancelled');
        return record(path, name, text, eol ?? '\n');
      },
      // The renderer passes the current path as the suggestion when there is one.
      saveAs: async (suggestedName, text, eol) => {
        const own = suggestedName.includes('/') ? suggestedName : null;
        const choice = await saveFile({
          suggestedName: own ? basename(own) : suggestedName,
          text: joinEol(text, eol),
          mime: 'text/markdown',
          title: 'Save as',
        });
        if (!choice) return null;
        const path =
          own && basename(own) === choice.name
            ? own
            : await storage.files.uniquePath('Shared', choice.name);
        return record(path, basename(path), text, eol ?? '\n');
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
        await storage.session.setTheme(pref);
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
      },
      writeDraft: (id, text) => storage.session.writeDraft(id, text),
      readDraft: (id) => storage.session.readDraft(id),
      deleteDraft: (id) => storage.session.deleteDraft(id),
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
