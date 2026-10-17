import './styles/base.css';
import './styles/app.css';
import { createEditor } from './editor';
import { createPreview } from './preview';
import { createLayout, type PaneMode } from './layout';
import { createScrollSync } from './scrollSync';
import { createZoom } from './zoom';
import { SAMPLE } from './sample';

/**
 * Renderer entry (step 2): one document, editor + preview, split layout, zoom,
 * scroll sync, toolbar and status bar. Tabs and file I/O arrive in step 3.
 */

function button(
  label: string,
  glyph: string,
  title: string,
  onClick: () => void,
  pressed?: boolean,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tool';
  b.type = 'button';
  b.title = title;
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
  if (!window.md) {
    status.textContent = 'Open this page inside the MD app (no bridge found).';
    return;
  }
  const info = await window.md.getInfo();
  console.log('[md] renderer bridge ok', JSON.stringify(info));

  // Light is the default (D-10); "system" resolution comes with step 5.
  document.documentElement.dataset.theme = 'light';

  const zoom = createZoom();
  const layout = createLayout(document.getElementById('workspace')!);
  const preview = createPreview(layout.previewPane);

  let renderTimer: number | undefined;
  const scheduleRender = (doc: string) => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => preview.render(doc), 100);
  };

  const updateStatus = () => {
    const { line, col } = editor.cursor();
    const words = editor.getDoc().split(/\s+/).filter(Boolean).length;
    status.textContent = `Ln ${line}, Col ${col} · ${words} words · ${zoom.get()} px`;
  };

  const editor = createEditor({
    parent: layout.editorPane,
    doc: SAMPLE,
    onDocChange: scheduleRender,
    onCursorChange: () => updateStatus(),
  });
  preview.render(SAMPLE);

  const sync = createScrollSync(editor, preview);

  // ---- Toolbar ----
  const chrome = document.getElementById('chrome')!;
  const modeButtons: Record<PaneMode, HTMLButtonElement> = {
    editor: button(
      'Editor',
      '▤',
      'Editor only (Ctrl+Shift+E)',
      () => setMode('editor'),
      false,
    ),
    split: button(
      'Split',
      '▥',
      'Split (Ctrl+\\)',
      () => setMode('split'),
      true,
    ),
    preview: button(
      'Preview',
      '▣',
      'Preview only (Ctrl+Shift+P)',
      () => setMode('preview'),
      false,
    ),
  };
  const highlightBtn = button(
    'Markup colour',
    'ab',
    'Colour Markdown markup in the editor (View menu)',
    () => setHighlight(highlightBtn.getAttribute('aria-pressed') !== 'true'),
    true,
  );
  const syncBtn = button(
    'Sync scroll',
    '⇅',
    'Keep editor and preview scrolled together (View menu)',
    () => setSync(syncBtn.getAttribute('aria-pressed') !== 'true'),
    true,
  );
  chrome.append(
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

  // ---- Menu commands (accelerators live in the View menu, D-16) ----
  window.md.onViewCommand((msg) => {
    switch (msg.name) {
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

  updateStatus();
  editor.view.focus();
}

void boot();
