import type { DocStore, Doc } from './documents';
import type { EditorHandle } from './editor';
import type { BannersHandle } from './banners';
import type { FileData } from '../preload/preload';
import { diffLines } from './diff';

/**
 * External-change policy (PLAN.md step 4.3; D-18, R-11):
 *  - our own saves are recognised by hash and ignored;
 *  - clean buffer  → reload silently, note in the status bar (passive awareness);
 *  - dirty buffer  → non-modal banner: Reload / Keep mine / Show differences;
 *  - file removed  → banner: Save as… / Close; the buffer is kept.
 */
export interface WatchingDeps {
  store: DocStore;
  editor: EditorHandle;
  banners: BannersHandle;
  note: (message: string) => void;
  saveAs: (d: Doc) => Promise<boolean>;
  closeTab: (id: string) => Promise<boolean>;
  switchTo: (id: string) => void;
}

const time = () =>
  new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export function installWatching(deps: WatchingDeps): void {
  const { store, editor, banners } = deps;
  const watched = new Set<string>();

  const syncWatchers = () => {
    const wanted = new Set(
      store.list().flatMap((d) => (d.path ? [d.path] : [])),
    );
    for (const p of wanted)
      if (!watched.has(p)) {
        watched.add(p);
        void window.md.watch.start(p);
      }
    for (const p of Array.from(watched))
      if (!wanted.has(p)) {
        watched.delete(p);
        void window.md.watch.stop(p);
      }
    const ids = new Set(store.order);
    banners.dismissWhere((key) => {
      const id = key.split(':')[1];
      return key.startsWith('disk:') && !ids.has(id);
    });
  };
  store.onChange(syncWatchers);
  syncWatchers();

  const currentText = (d: Doc) =>
    d.id === store.activeId ? editor.getDoc() : d.state.doc.toString();

  const applyDisk = (d: Doc, data: FileData) => {
    store.patch(d.id, {
      savedText: data.text,
      diskHash: data.hash,
      mtimeMs: data.mtimeMs,
    });
    if (d.id === store.activeId) {
      const view = editor.view;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: data.text },
      });
      store.update(d.id, { dirty: false });
    } else {
      const state = d.state.update({
        changes: { from: 0, to: d.state.doc.length, insert: data.text },
      }).state;
      store.update(d.id, { state, dirty: false });
    }
    console.log('[md] reloaded from disk', d.name);
  };

  const showChangedBanner = (d: Doc, data: FileData, detail?: HTMLElement) => {
    banners.show({
      key: `disk:${d.id}`,
      message: `"${d.name}" changed on disk at ${time()} while you have unsaved edits.`,
      detail,
      actions: [
        {
          label: 'Reload from disk',
          primary: true,
          run: () => {
            applyDisk(d, data);
            banners.dismiss(`disk:${d.id}`);
          },
        },
        {
          label: 'Keep mine',
          run: () => {
            // Next save overwrites the disk version; no further prompts for this change.
            store.patch(d.id, { diskHash: data.hash, mtimeMs: data.mtimeMs });
            banners.dismiss(`disk:${d.id}`);
          },
        },
        {
          label: 'Show differences',
          run: () => {
            deps.switchTo(d.id);
            const lines = diffLines(currentText(d), data.text);
            const pre = document.createElement('pre');
            pre.className = 'banner-detail';
            pre.setAttribute(
              'aria-label',
              'Differences: struck-through lines are yours, bold lines are on disk',
            );
            if (!lines) {
              pre.textContent =
                'The file is too large to show line differences.';
            } else {
              for (const l of lines) {
                const span = document.createElement('span');
                span.className = l.kind;
                span.textContent =
                  (l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  ') +
                  l.text +
                  '\n';
                pre.appendChild(span);
              }
            }
            showChangedBanner(d, data, pre);
          },
        },
      ],
    });
  };

  window.md.onFileChanged((data) => {
    const d = store.findByPath(data.path);
    if (!d) return;
    if (data.hash === d.diskHash) {
      store.patch(d.id, { mtimeMs: data.mtimeMs }); // our own save, or a no-op touch
      return;
    }
    if (!d.dirty) {
      applyDisk(d, data);
      deps.note(`Reloaded "${d.name}" from disk at ${time()}`);
    } else {
      showChangedBanner(d, data);
    }
  });

  window.md.onFileRemoved(({ path }) => {
    const d = store.findByPath(path);
    if (!d) return;
    // The buffer is now the only copy: treat it as unsaved (savedText null → dirty if non-empty).
    store.update(d.id, {
      savedText: null,
      diskHash: null,
      dirty: currentText(d).length > 0,
    });
    banners.show({
      key: `disk:${d.id}:removed`,
      tone: 'danger',
      message: `"${d.name}" no longer exists on disk (deleted or renamed). Your text is still here.`,
      actions: [
        {
          label: 'Save as…',
          primary: true,
          run: async () => {
            if (await deps.saveAs(d)) banners.dismiss(`disk:${d.id}:removed`);
          },
        },
        {
          label: 'Close tab',
          run: () => void deps.closeTab(d.id),
        },
      ],
    });
  });

  window.md.onWatchError(({ path, message }) => {
    console.error('[md] watch error', path, message);
    deps.note(`Cannot watch ${path}: ${message}`);
  });
}
