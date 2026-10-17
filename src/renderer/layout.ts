/**
 * Editor / preview panes with a keyboard-operable splitter (PLAN.md step 2.3; D-14, R-9).
 * The splitter is a WAI-ARIA separator: arrow keys resize, Home/End jump to the limits.
 */

export type PaneMode = 'editor' | 'split' | 'preview';

export interface LayoutHandle {
  editorPane: HTMLElement;
  previewPane: HTMLElement;
  getMode(): PaneMode;
  setMode(mode: PaneMode): void;
  getSplit(): number;
  setSplit(percent: number): void;
  onModeChange(cb: (mode: PaneMode) => void): void;
}

const MIN = 20;
const MAX = 80;

export function createLayout(root: HTMLElement): LayoutHandle {
  root.innerHTML = `
    <div id="panes" data-mode="split" style="--split: 50%">
      <section id="editor-pane" aria-label="Editor"></section>
      <div id="splitter" role="separator" aria-orientation="vertical"
           aria-label="Resize editor and preview" tabindex="0"
           aria-valuemin="${MIN}" aria-valuemax="${MAX}" aria-valuenow="50"></div>
      <section id="preview-pane" aria-label="Preview" tabindex="0"></section>
    </div>`;

  const panes = root.querySelector<HTMLElement>('#panes')!;
  const editorPane = root.querySelector<HTMLElement>('#editor-pane')!;
  const previewPane = root.querySelector<HTMLElement>('#preview-pane')!;
  const splitter = root.querySelector<HTMLElement>('#splitter')!;

  let split = 50;
  let mode: PaneMode = 'split';
  const listeners: ((m: PaneMode) => void)[] = [];

  const setSplit = (pct: number) => {
    split = Math.round(Math.max(MIN, Math.min(MAX, pct)));
    panes.style.setProperty('--split', `${split}%`);
    splitter.setAttribute('aria-valuenow', String(split));
  };

  // Pointer drag
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    const rect = panes.getBoundingClientRect();
    const move = (ev: PointerEvent) =>
      setSplit(((ev.clientX - rect.left) / rect.width) * 100);
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  // Keyboard resize
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setSplit(split - step);
    else if (e.key === 'ArrowRight') setSplit(split + step);
    else if (e.key === 'Home') setSplit(MIN);
    else if (e.key === 'End') setSplit(MAX);
    else return;
    e.preventDefault();
  });

  return {
    editorPane,
    previewPane,
    getMode: () => mode,
    setMode(m) {
      mode = m;
      panes.dataset.mode = m;
      listeners.forEach((cb) => cb(m));
    },
    getSplit: () => split,
    setSplit,
    onModeChange: (cb) => listeners.push(cb),
  };
}
