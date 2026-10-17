import './styles/base.css';
import './styles/app.css';
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
import { SAMPLE } from './sample';
import type { FileData } from '../preload/preload';

/**
 * Renderer entry (step 3): tabs over one editor/preview pair, file open/save
 * through the bridge, the single close-confirmation flow, Alt shortcut overlay.
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

  // Light is the default (D-10); "system" resolution comes with step 5.
  document.documentElement.dataset.theme = 'light';

  const zoom = createZoom();
  const store = new DocStore();
  const layout = createLayout(document.getElementById('workspace')!);
  const preview = createPreview(layout.previewPane);

  let renderTimer: number | undefined;
  const scheduleRender = (text: string) => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => preview.render(text), 100);
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
    },
    onCursorChange: () => updateStatus(),
  });
  const sync = createScrollSync(editor, preview);

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
    editor.view.scrollDOM.scrollTop = d.scrollTop;
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

  const openFiles = (files: FileData[]) => {
    if (files.length === 0) return;
    stash();
    // A lone blank untitled tab is replaced rather than kept (ENGINEERING).
    const blank =
      store.list().length === 1 && isBlankUntitled(store.list()[0])
        ? store.list()[0]
        : null;
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
        },
        false,
      );
    }
    if (blank) store.remove(blank.id, false);
    if (last) store.activate(last.id);
    show();
  };

  // ---- Saving ----
  const saveAs = async (d: Doc): Promise<boolean> => {
    const text =
      d.id === store.activeId ? editor.getDoc() : d.state.doc.toString();
    const suggested =
      d.path ?? (d.name.endsWith('.md') ? d.name : `${d.name}.md`);
    const result = await window.md.files.saveAs(suggested, text);
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
    const text =
      d.id === store.activeId ? editor.getDoc() : d.state.doc.toString();
    const { hash, mtimeMs } = await window.md.files.save(d.path, text);
    store.update(d.id, {
      savedText: text,
      diskHash: hash,
      mtimeMs,
      dirty: false,
    });
    updateStatus();
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
      if (d.dirty && !(await closeTab(d.id))) return; // cancelled
    }
    await window.md.closeNow();
  });

  // ---- Tabs ----
  const tabBar = createTabBar(document.getElementById('tabbar')!, {
    onActivate: switchTo,
    onClose: (id) => void closeTab(id),
    onReorder: (id, i) => store.move(id, i),
  });
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
    () => setHighlight(highlightBtn.getAttribute('aria-pressed') !== 'true'),
    true,
  );
  const syncBtn = button(
    'Sync scroll',
    '⇅',
    'Keep editor and preview scrolled together',
    '',
    () => setSync(syncBtn.getAttribute('aria-pressed') !== 'true'),
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
    ),
    group(
      'Pane layout',
      modeButtons.editor,
      modeButtons.split,
      modeButtons.preview,
    ),
    group('Editor options', highlightBtn, syncBtn),
  );

  function setMode(mode: PaneMode) {
    layout.setMode(mode);
    (Object.keys(modeButtons) as PaneMode[]).forEach((m) =>
      modeButtons[m].setAttribute('aria-pressed', String(m === mode)),
    );
  }
  function setHighlight(on: boolean) {
    editor.setHighlight(on);
    highlightBtn.setAttribute('aria-pressed', String(on));
  }
  function setSync(on: boolean) {
    sync.setEnabled(on);
    syncBtn.setAttribute('aria-pressed', String(on));
  }

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
      case 'zoom:in':
        zoom.in();
        updateStatus();
        break;
      case 'zoom:out':
        zoom.out();
        updateStatus();
        break;
      case 'zoom:reset':
        zoom.reset();
        updateStatus();
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

  // Drop files on the window to open them.
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
  const banners = createBanners(document.getElementById('banners')!);
  installWatching({ store, editor, banners, note, saveAs, closeTab, switchTo });

  // ---- Start ----
  const startup = await window.md.getStartupFiles();
  if (startup.length > 0) {
    openFiles(await Promise.all(startup.map((p) => window.md.files.read(p))));
  } else {
    newTab();
  }
  updateStatus();
}

void boot();
