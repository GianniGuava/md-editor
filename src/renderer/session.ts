import { EditorSelection } from '@codemirror/state';
import type { DocStore, Doc } from './documents';
import type { EditorHandle } from './editor';
import type { BannersHandle } from './banners';
import type { SessionTab, WindowReport, WindowUi } from '../main/session';
import type { ThemePref } from './theme';

/**
 * Per-window session capture and restore (PLAN.md step 6; D-22, D-23).
 * CITED: Czerwinski, Horvitz & Wilhite 2004 (software should preserve and recreate
 * multi-document task state); Iqbal & Horvitz 2007 (users wanted autosave on switch);
 * Jones & Martin 2003 (failing to save is an attention-driven human error).
 *  - Debounced 500 ms after any change; also on window blur and before close.
 *  - Dirty text goes to a draft file on the same debounce; a draft is removed when the
 *    document becomes clean or is closed. The user's own file is written only by Save.
 *  - A document moved to another window keeps its draft id; the source window
 *    "forgets" it so the draft is neither deleted nor rewritten here.
 *  - Nothing is written until restore() has finished: a report taken from a half-restored
 *    window would list only some tabs, and the browser build prunes stored documents no
 *    report lists (PLAN.md §35, scan finding A-F1). If restore fails, nothing is written.
 */

const DEBOUNCE_MS = 500;

export interface SessionDeps {
  store: DocStore;
  editor: EditorHandle;
  banners: BannersHandle;
  getUi(): WindowUi & { theme: ThemePref };
  applyUi(ui: WindowUi & { theme: ThemePref }): Promise<void>;
  /** Re-sync the editor with the active doc after a bulk restore. */
  show(): void;
  stash(): void;
}

export interface SessionHandle {
  /** Returns true when at least one tab was restored. */
  restore(): Promise<boolean>;
  touch(): void;
  flush(): Promise<void>;
  /** Stop tracking a draft that now belongs to another window. */
  forgetDraft(draftId: string): void;
}

export function installSession(deps: SessionDeps): SessionHandle {
  const { store, editor } = deps;
  let timer: number | undefined;
  let saving: Promise<void> = Promise.resolve();
  let restored = false;
  let failing = false;
  const draftHashes = new Map<string, string>(); // draftId → last written text

  const capture = (): WindowReport => {
    deps.stash();
    const docs = store.list();
    const tabs: SessionTab[] = docs.map((d) => {
      const sel = d.state.selection.main;
      return {
        path: d.path,
        name: d.name,
        anchor: sel.anchor,
        head: sel.head,
        scrollTop:
          d.id === store.activeId
            ? editor.view.scrollDOM.scrollTop
            : d.scrollTop,
        dirty: d.dirty,
        draft: d.dirty ? d.draftId : null,
      };
    });
    return {
      ...deps.getUi(),
      tabs,
      activeIndex: Math.max(
        0,
        docs.findIndex((d) => d.id === store.activeId),
      ),
      closed: store.closed.slice(-10),
    };
  };

  const writeDrafts = async (docs: Doc[]) => {
    const live = new Set<string>();
    for (const d of docs) {
      if (!d.dirty) continue;
      live.add(d.draftId);
      const text = d.state.doc.toString();
      if (draftHashes.get(d.draftId) === text) continue;
      await window.md.session.writeDraft(d.draftId, text);
      draftHashes.set(d.draftId, text);
    }
    for (const id of Array.from(draftHashes.keys())) {
      if (!live.has(id)) {
        await window.md.session.deleteDraft(id);
        draftHashes.delete(id);
      }
    }
  };

  const flush = async () => {
    window.clearTimeout(timer);
    timer = undefined;
    if (!restored) return;
    saving = saving
      .catch(() => undefined)
      .then(async () => {
        const report = capture();
        await writeDrafts(store.list());
        await window.md.session.save(report);
      });
    try {
      await saving;
      if (failing) deps.banners.dismiss('session-failed');
      failing = false;
    } catch (err) {
      console.error('[md] session flush failed', err);
      // Say so once, and keep saying it until a write works again (scan finding A-F4).
      if (!failing)
        deps.banners.show({
          key: 'session-failed',
          tone: 'danger',
          message: `Unsaved changes could not be backed up (${err instanceof Error ? err.message : String(err)}). Save your work to keep it; this notice goes away once backing up works again.`,
          actions: [],
        });
      failing = true;
    }
  };

  const touch = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  };

  const restore = async (): Promise<boolean> => {
    const { theme, window: data } = await window.md.session.load();
    if (!data) {
      await deps.applyUi({ ...deps.getUi(), theme });
      restored = true;
      return false;
    }
    await deps.applyUi({ ...data, theme });
    let restoredAny = false;
    for (const tab of data.tabs) {
      let diskText: string | null = null;
      let diskHash: string | null = null;
      let mtimeMs: number | null = null;
      let missing = false;
      let eol: '\n' | '\r\n' = '\n';
      if (tab.path) {
        try {
          const f = await window.md.files.read(tab.path);
          diskText = f.text;
          diskHash = f.hash;
          mtimeMs = f.mtimeMs;
          eol = f.eol;
        } catch {
          missing = true;
        }
      }
      const draftText = tab.draft
        ? await window.md.session.readDraft(tab.draft)
        : null;
      if (tab.path && missing && draftText === null) {
        deps.banners.show({
          key: `restore:${tab.path}`,
          tone: 'danger',
          message: `"${tab.name}" could not be reopened: ${tab.path} no longer exists.`,
          actions: [],
        });
        continue;
      }
      const text = draftText ?? diskText ?? '';
      const len = text.length;
      const clamp = (n: number) => Math.max(0, Math.min(n, len));
      const state = editor.createState(text);
      const selected = state.update({
        selection: EditorSelection.single(clamp(tab.anchor), clamp(tab.head)),
      }).state;
      const dirty = draftText !== null && draftText !== diskText;
      const d = store.add(
        {
          path: tab.path,
          name: tab.name,
          state: selected,
          savedText: missing ? null : diskText,
          diskHash,
          mtimeMs,
          dirty,
          draftId: tab.draft ?? undefined,
          eol,
        },
        false,
      );
      store.patch(d.id, { scrollTop: tab.scrollTop });
      if (dirty && draftText !== null) draftHashes.set(d.draftId, draftText);
      restoredAny = true;
      if (dirty) {
        deps.banners.show({
          key: `recovered:${d.id}`,
          message: `Recovered unsaved changes to "${tab.name}" from the last session.`,
          actions:
            diskText === null
              ? []
              : [
                  {
                    label: 'Discard recovered changes',
                    run: () => {
                      const fresh = editor.createState(diskText);
                      if (d.id === store.activeId) editor.setState(fresh);
                      store.update(d.id, { state: fresh, dirty: false });
                      deps.show();
                      deps.banners.dismiss(`recovered:${d.id}`);
                      touch();
                    },
                  },
                ],
        });
      }
      if (missing) {
        deps.banners.show({
          key: `disk:${d.id}:removed`,
          tone: 'danger',
          message: `"${tab.name}" no longer exists on disk; showing your unsaved text.`,
          actions: [],
        });
      }
    }
    if (restoredAny) {
      const active = store.at(
        Math.min(data.activeIndex, store.order.length - 1),
      );
      if (active) store.activate(active);
      store.closed = data.closed ?? [];
      deps.show();
    }
    restored = true;
    return restoredAny;
  };

  window.addEventListener('blur', () => void flush());

  return {
    restore,
    touch,
    flush,
    forgetDraft: (id) => draftHashes.delete(id),
  };
}
