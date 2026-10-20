import './styles/base.css';
import './styles/app.css';
import { EditorSelection } from '@codemirror/state';
import { createEditor } from './editor';
import { createPreview } from './preview';
import { createLayout, type PaneMode } from './layout';
import { createScrollSync } from './scrollSync';
import { createZoom } from './zoom';
import { DocStore, type Doc } from './documents';
import { createTabBar } from './tabs';
import { installAltOverlay } from './altKeys';
import { createBanners } from './banners';
import { installWatching } from './watching';
import { createTheme, type ThemePref } from './theme';
import { installSession } from './session';
import { SAMPLE } from './sample';
import { createExportDialog } from './exportDialog';
import { createAboutDialog } from './about';
import { sourcePosOf, visibleOffsetOf } from './caretMap';
import type { DocSnapshot, FileData } from '../preload/preload';

/**
 * Renderer entry for one window: tabs over one editor/preview pair, file open/save
 * through the bridge, watch/reload banners, themes, per-window session capture and
 * restore, and tab transfer to other windows.
 */

function button(
  label: string,
  glyph: string,
  title: string,
  keys: string,
  onClick: () => void,
  pressed?: boolean,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tool';
  b.type = 'button';
  b.title = keys ? `${title} (${keys})` : title;
  if (keys) b.dataset.keys = keys;
  b.innerHTML = `<span class="glyph" aria-hidden="true">${glyph}</span><span>${label}</span>`;
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
}

function group(label: string, ...buttons: HTMLElement[]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'toolbar-group';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  buttons.forEach((b) => g.appendChild(b));
  return g;
}

async function boot(): Promise<void> {
  const status = document.getElementById('status')!;
  const statusMain = document.getElementById('status-main')!;
  const statusNote = document.getElementById('status-note')!;
  let noteTimer: number | undefined;
  const note = (message: string) => {
    statusNote.textContent = ` · ${message}`;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (statusNote.textContent = ''), 8000);
  };

  if (!window.md) {
    status.textContent = 'Open this page inside the MD app (no bridge found).';
    return;
  }
  const info = await window.md.getInfo();
  console.log('[md] renderer bridge ok', JSON.stringify(info));

  // Light is the default (D-10). The service reports the preference to main (menu, dialogs).
  const theme = createTheme();
  window.md.onSystemTheme(({ dark }) => theme.systemChanged(dark));

  const zoom = createZoom();
  const store = new DocStore();
  const layout = createLayout(document.getElementById('workspace')!);
  const preview = createPreview(layout.previewPane);
  const banners = createBanners(document.getElementById('banners')!);

  let renderTimer: number | undefined;
  const scheduleRender = (text: string) => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      preview.render(text);
      highlightCursorBlock(); // the re-render replaced the marked element
    }, 100);
  };

  const editor = createEditor({
    parent: layout.editorPane,
    onDocChange: (text) => {
      const d = store.active;
      if (!d) return;
      const dirty =
        d.savedText === null ? text.length > 0 : text !== d.savedText;
      if (dirty !== d.dirty) store.update(d.id, { dirty });
      scheduleRender(text);
      session.touch();
    },
    onCursorChange: () => {
      updateStatus();
      highlightCursorBlock(true);
      session.touch();
    },
  });
  const sync = createScrollSync(editor, preview);

  // Cursor ↔ block highlight: the preview marks the block under the editor cursor and a
  // click on a preview block moves the cursor to its source line. Follows the
  // "Sync scroll" toggle (ENGINEERING; no study on cross-pane highlighting, see H-10).
  function highlightCursorBlock(keepInView = false) {
    if (!sync.isEnabled()) {
      preview.highlightLine(null);
      preview.placeCaret(null);
      return;
    }
    preview.highlightLine(editor.cursor().line, keepInView);
    // Character-level caret: visible-text offset of the cursor within its block.
    const info = editor.blockMap();
    if (!info) {
      preview.placeCaret(null);
      return;
    }
    preview.placeCaret(
      visibleOffsetOf(info.map, editor.view.state.selection.main.head),
    );
  }
  preview.onBlockClick((line, point) => {
    if (!sync.isEnabled()) return;
    const n = Math.max(1, Math.min(line, editor.view.state.doc.lines));
    const lineStart = editor.view.state.doc.line(n).from;
    // Map the clicked character back to the source when the block can be resolved.
    const info = editor.blockMap(lineStart);
    const vis = preview.visibleOffsetAt(point);
    if (info && vis !== null) editor.setCursor(sourcePosOf(info.map, vis));
    else editor.setCursor(lineStart);
  });
  let highlightOn = true;

  // ---- Document switching ----
  const stash = () => {
    const d = store.active;
    if (d) {
      store.patch(d.id, {
        state: editor.getState(),
        scrollTop: editor.view.scrollDOM.scrollTop,
      });
    }
  };
  const show = () => {
    const d = store.active;
    if (!d) return;
    console.log('[md] showing', d.name, d.path ?? '(untitled)');
    editor.setState(d.state);
    requestAnimationFrame(() => {
      editor.view.scrollDOM.scrollTop = d.scrollTop;
    });
    preview.render(d.state.doc.toString());
    updateStatus();
    editor.focus();
  };
  const switchTo = (id: string | null) => {
    if (!id || id === store.activeId) return;
    stash();
    store.activate(id);
    show();
  };

  const newTab = (text = '', name?: string): Doc => {
    stash();
    const d = store.add({
      path: null,
      name: name ?? store.nextUntitledName(),
      state: editor.createState(text),
      savedText: null,
      diskHash: null,
      mtimeMs: null,
      dirty: text.length > 0,
    });
    show();
    return d;
  };

  const isBlankUntitled = (d: Doc) =>
    d.path === null && !d.dirty && d.state.doc.length === 0;
  const dropLoneBlank = () => {
    const list = store.list();
    if (list.length === 1 && isBlankUntitled(list[0]))
      store.remove(list[0].id, false);
  };

  const openFiles = (files: FileData[]) => {
    if (files.length === 0) return;
    stash();
    // A lone blank untitled tab is replaced rather than kept (ENGINEERING).
    const list = store.list();
    const blank =
      list.length === 1 && isBlankUntitled(list[0]) ? list[0] : null;
    let last: Doc | null = null;
    for (const f of files) {
      const existing = store.findByPath(f.path);
      if (existing) {
        last = existing;
        continue;
      }
      last = store.add(
        {
          path: f.path,
          name: f.name,
          state: editor.createState(f.text),
          savedText: f.text,
          diskHash: f.hash,
          mtimeMs: f.mtimeMs,
          eol: f.eol,
        },
        false,
      );
    }
    if (blank) store.remove(blank.id, false);
    if (last) store.activate(last.id);
    show();
  };

  const textOf = (d: Doc) =>
    d.id === store.activeId ? editor.getDoc() : d.state.doc.toString();

  // ---- Moving documents between windows ----
  const snapshot = (d: Doc): DocSnapshot => {
    const state = d.id === store.activeId ? editor.getState() : d.state;
    const sel = state.selection.main;
    return {
      id: d.id,
      path: d.path,
      name: d.name,
      text: state.doc.toString(),
      savedText: d.savedText,
      diskHash: d.diskHash,
      mtimeMs: d.mtimeMs,
      dirty: d.dirty,
      draftId: d.draftId,
      eol: d.eol,
      anchor: sel.anchor,
      head: sel.head,
      scrollTop:
        d.id === store.activeId ? editor.view.scrollDOM.scrollTop : d.scrollTop,
    };
  };
  const addFromSnapshot = (s: DocSnapshot, toIndex?: number): Doc => {
    stash();
    dropLoneBlank();
    const existing = s.path ? store.findByPath(s.path) : undefined;
    if (existing) {
      // Already open here: keep this window's copy, just activate it.
      store.activate(existing.id);
      show();
      return existing;
    }
    const clamp = (n: number) => Math.max(0, Math.min(n, s.text.length));
    const state = editor.createState(s.text).update({
      selection: EditorSelection.single(clamp(s.anchor), clamp(s.head)),
    }).state;
    const d = store.add(
      {
        path: s.path,
        name: s.name,
        state,
        savedText: s.savedText,
        diskHash: s.diskHash,
        mtimeMs: s.mtimeMs,
        dirty: s.dirty,
        draftId: s.draftId,
        eol: s.eol ?? '\n',
      },
      false,
    );
    store.patch(d.id, { scrollTop: s.scrollTop });
    if (toIndex !== undefined) store.move(d.id, toIndex);
    store.activate(d.id);
    show();
    return d;
  };
  /** Remove a document that now lives in another window (no dialog, draft kept). */
  const removeMoved = (id: string) => {
    const d = store.get(id);
    if (!d) return;
    session.forgetDraft(d.draftId);
    if (id === store.activeId) stash();
    store.remove(id, false);
    if (store.list().length === 0) newTab();
    else show();
  };
  const detach = async (id: string, point?: { x: number; y: number }) => {
    const d = store.get(id);
    if (!d) return;
    await window.md.windows.detachTab(snapshot(d), point);
    removeMoved(id);
  };
  window.md.onRemoveMoved(removeMoved);

  // ---- Saving ----
  const saveAs = async (d: Doc): Promise<boolean> => {
    const text = textOf(d);
    const suggested =
      d.path ?? (d.name.endsWith('.md') ? d.name : `${d.name}.md`);
    const result = await window.md.files.saveAs(suggested, text, d.eol);
    if (!result) return false;
    store.update(d.id, {
      path: result.path,
      name: result.name,
      savedText: text,
      diskHash: result.hash,
      mtimeMs: result.mtimeMs,
      dirty: false,
    });
    updateStatus();
    return true;
  };
  const save = async (d: Doc): Promise<boolean> => {
    if (!d.path) return saveAs(d);
    const text = textOf(d);
    const { hash, mtimeMs } = await window.md.files.save(d.path, text, d.eol);
    store.update(d.id, {
      savedText: text,
      diskHash: hash,
      mtimeMs,
      dirty: false,
    });
    updateStatus();
    note(`Saved "${d.name}"`);
    return true;
  };

  // ---- Closing (the one modal dialog, D-21 / R-13) ----
  const closeTab = async (id: string): Promise<boolean> => {
    const d = store.get(id);
    if (!d) return true;
    if (d.dirty) {
      switchTo(id); // show what is being asked about
      const decision = await window.md.confirmClose(d.name);
      if (decision === 'cancel') return false;
      if (decision === 'save' && !(await save(d))) return false;
    }
    if (id === store.activeId) stash();
    store.remove(id);
    if (store.list().length === 0) newTab();
    else show();
    return true;
  };

  const reopenClosed = async () => {
    const c = store.popClosed();
    if (!c) return;
    if (c.path) {
      try {
        openFiles([await window.md.files.read(c.path)]);
        return;
      } catch {
        /* file gone: fall through and restore the text as untitled */
      }
    }
    newTab(c.text, c.name);
  };

  window.md.onRequestClose(async () => {
    for (const d of store.list()) {
      if (d.dirty && !(await closeTab(d.id))) {
        await window.md.closeCancelled();
        return;
      }
    }
    try {
      await session.flush();
    } catch (err) {
      console.error('[md] flush before close failed', err);
    }
    await window.md.closeNow();
  });

  // ---- Tabs ----
  const tabBar = createTabBar(
    document.getElementById('tabbar')!,
    info.windowId,
    {
      onActivate: switchTo,
      onClose: (id) => void closeTab(id),
      onReorder: (id, i) => store.move(id, i),
      dragPayload: (id) => {
        const d = store.get(id);
        return d ? JSON.stringify(snapshot(d)) : '';
      },
      onDetach: (id, point) => void detach(id, point),
      onReceive: (json, sourceWindowId, toIndex) => {
        let s: DocSnapshot;
        try {
          s = JSON.parse(json) as DocSnapshot;
        } catch {
          return;
        }
        addFromSnapshot(s, toIndex);
        void window.md.windows.tabDropped({ sourceWindowId, docId: s.id });
      },
    },
  );
  const updateTitle = () => {
    const d = store.active;
    document.title = d ? `${d.name}${d.dirty ? ' •' : ''} – MD` : 'MD';
  };
  store.onChange(() => {
    tabBar.render(
      store
        .list()
        .map((d) => ({ id: d.id, name: d.name, path: d.path, dirty: d.dirty })),
      store.activeId,
    );
    updateTitle();
    session.touch();
  });

  // ---- Status bar ----
  function updateStatus() {
    const d = store.active;
    const { line, col } = editor.cursor();
    const words = editor.getDoc().split(/\s+/).filter(Boolean).length;
    const where = d?.path ?? 'Not saved to disk';
    statusMain.textContent = `${where} · Ln ${line}, Col ${col} · ${words} words · ${zoom.get()} px`;
  }

  // ---- Toolbar ----
  const toolbar = document.getElementById('toolbar')!;
  const modeButtons: Record<PaneMode, HTMLButtonElement> = {
    editor: button(
      'Editor',
      '▤',
      'Editor only',
      'Ctrl+Shift+E',
      () => setMode('editor'),
      false,
    ),
    split: button(
      'Split',
      '▥',
      'Split',
      'Ctrl+\\',
      () => setMode('split'),
      true,
    ),
    preview: button(
      'Preview',
      '▣',
      'Preview only',
      'Ctrl+Shift+P',
      () => setMode('preview'),
      false,
    ),
  };
  const highlightBtn = button(
    'Markup colour',
    'ab',
    'Colour Markdown markup in the editor',
    '',
    () => setHighlight(!highlightOn),
    true,
  );
  let freezeOn = true;
  layout.previewPane.classList.add('freeze-headers');
  const freezeBtn = button(
    'Freeze headers',
    '\u22a4',
    'Keep table header rows visible while scrolling a long table',
    '',
    () => setFreeze(!freezeOn),
    true,
  );
  const syncBtn = button(
    'Sync scroll',
    '⇅',
    'Keep editor and preview scrolled together',
    '',
    () => setSync(!sync.isEnabled()),
    true,
  );
  toolbar.append(
    group(
      'File',
      button('New', '+', 'New tab', 'Ctrl+T', () => newTab()),
      button(
        'Open',
        '…',
        'Open files',
        'Ctrl+O',
        () => void window.md.files.openDialog().then(openFiles),
      ),
      button(
        'Save',
        '↓',
        'Save',
        'Ctrl+S',
        () => void (store.active && save(store.active)),
      ),
      button(
        'Window',
        '⧉',
        'New window',
        'Ctrl+Shift+N',
        () => void window.md.windows.open(),
      ),
    ),
    group(
      'Pane layout',
      modeButtons.editor,
      modeButtons.split,
      modeButtons.preview,
    ),
    group('Editor options', highlightBtn, syncBtn),
    group('Preview options', freezeBtn),
  );

  function setMode(mode: PaneMode) {
    layout.setMode(mode);
    (Object.keys(modeButtons) as PaneMode[]).forEach((m) =>
      modeButtons[m].setAttribute('aria-pressed', String(m === mode)),
    );
  }
  function setHighlight(on: boolean) {
    highlightOn = on;
    editor.setHighlight(on);
    highlightBtn.setAttribute('aria-pressed', String(on));
    session.touch();
  }
  function setFreeze(on: boolean) {
    freezeOn = on;
    layout.previewPane.classList.toggle('freeze-headers', on);
    freezeBtn.setAttribute('aria-pressed', String(on));
    session.touch();
  }
  function setSync(on: boolean) {
    sync.setEnabled(on);
    syncBtn.setAttribute('aria-pressed', String(on));
    highlightCursorBlock();
    session.touch();
  }
  layout.onModeChange(() => session.touch());
  editor.view.scrollDOM.addEventListener('scroll', () => session.touch(), {
    passive: true,
  });

  // ---- Session (step 6; one entry per window) ----
  const session = installSession({
    store,
    editor,
    banners,
    stash,
    show,
    getUi: () => ({
      theme: theme.get(),
      paneMode: layout.getMode(),
      split: layout.getSplit(),
      fontSize: zoom.get(),
      highlight: highlightOn,
      scrollSync: sync.isEnabled(),
      freezeHeaders: freezeOn,
    }),
    applyUi: async (ui) => {
      await theme.set(ui.theme);
      setMode(ui.paneMode);
      layout.setSplit(ui.split);
      zoom.set(ui.fontSize);
      setHighlight(ui.highlight);
      setSync(ui.scrollSync);
      setFreeze(ui.freezeHeaders ?? true);
    },
  });

  // ---- Commands from the menu (accelerators shown there, D-16) ----
  window.md.onCommand((msg) => {
    switch (msg.name) {
      case 'file:new':
        newTab();
        break;
      case 'file:open':
        void window.md.files.openDialog().then(openFiles);
        break;
      case 'file:save':
        if (store.active) void save(store.active);
        break;
      case 'file:saveAs':
        if (store.active) void saveAs(store.active);
        break;
      case 'file:sample':
        newTab(SAMPLE, 'Sample.md');
        break;
      case 'tab:close':
        if (store.activeId) void closeTab(store.activeId);
        break;
      case 'tab:reopen':
        void reopenClosed();
        break;
      case 'tab:next':
        switchTo(store.neighbour(1));
        break;
      case 'tab:prev':
        switchTo(store.neighbour(-1));
        break;
      case 'edit:find':
      case 'edit:replace':
        editor.openSearch();
        break;
      case 'edit:findNext':
        editor.findNext();
        break;
      case 'edit:findPrev':
        editor.findPrevious();
        break;
      case 'tab:detach':
        if (store.activeId) void detach(store.activeId);
        break;
      case 'mode:editor':
        setMode('editor');
        break;
      case 'mode:split':
        setMode('split');
        break;
      case 'mode:preview':
        setMode('preview');
        break;
      case 'highlight':
        setHighlight(msg.checked ?? true);
        break;
      case 'scrollSync':
        setSync(msg.checked ?? true);
        break;
      case 'freezeHeaders':
        setFreeze(msg.checked ?? true);
        break;
      case 'theme:set':
        void theme.set((msg.value as ThemePref) ?? 'light').then(session.touch);
        break;
      case 'theme:cycle':
        void theme.cycle().then(session.touch);
        break;
      case 'zoom:in':
        zoom.in();
        updateStatus();
        session.touch();
        break;
      case 'zoom:out':
        zoom.out();
        updateStatus();
        session.touch();
        break;
      case 'zoom:reset':
        zoom.reset();
        updateStatus();
        session.touch();
        break;
      case 'export:open':
        if (store.active) exportDialog.open(store.active, textOf(store.active));
        break;
      case 'help:about':
        aboutDialog.open();
        break;
    }
  });

  // Ctrl+1..9 jump to a tab (Ctrl+9 = last). Ctrl+Tab is a menu accelerator.
  window.addEventListener(
    'keydown',
    (e) => {
      if (
        e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key >= '1' &&
        e.key <= '9'
      ) {
        const n = Number(e.key);
        switchTo(n === 9 ? store.at(store.order.length - 1) : store.at(n - 1));
        e.preventDefault();
      }
    },
    true,
  );

  // Drop files on the window to open them (tab drops are handled by the tab bar).
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void Promise.all(
      files.map((f) => window.md.files.read(window.md.files.pathForFile(f))),
    ).then(openFiles);
  });

  installAltOverlay();
  const exportDialog = createExportDialog(note);
  const aboutDialog = createAboutDialog(info);
  installWatching({ store, editor, banners, note, saveAs, closeTab, switchTo });

  // ---- Start: this window's saved tabs, then documents handed over by another window,
  //      then files given on the command line; a blank tab only if nothing else ----
  const restored = await session.restore();
  const handed = await window.md.windows.ready();
  for (const s of handed) addFromSnapshot(s);
  const startup = await window.md.getStartupFiles();
  if (startup.length > 0) {
    openFiles(await Promise.all(startup.map((p) => window.md.files.read(p))));
  } else if (!restored && handed.length === 0) {
    newTab();
  }
  updateStatus();
}

void boot();
