/**
 * Editor / preview panes with a keyboard-operable splitter (PLAN.md step 2.3; D-14, R-9).
 * The splitter is a WAI-ARIA separator: arrow keys resize, Home/End jump to the limits.
 *
 * Orientation (PLAN.md §35, D-28): "columns" puts the editor left of the preview;
 * "rows" puts the editor above it; "auto" chooses rows while the viewport is portrait
 * or narrower than 600 px (phones, tablets held upright) and columns otherwise.
 * The desktop app passes "columns"; the web build passes "auto".
 */

export type PaneMode = 'editor' | 'split' | 'preview';
export type Orientation = 'columns' | 'rows';
export type OrientationPref = Orientation | 'auto';

export interface LayoutHandle {
  editorPane: HTMLElement;
  previewPane: HTMLElement;
  getMode(): PaneMode;
  setMode(mode: PaneMode): void;
  getSplit(): number;
  setSplit(percent: number): void;
  getOrientation(): OrientationPref;
  /** The orientation in effect once "auto" is resolved. */
  appliedOrientation(): Orientation;
  setOrientation(pref: OrientationPref): void;
  /** Fires on every layout change: pane mode, split ratio or orientation. */
  onModeChange(cb: (mode: PaneMode) => void): void;
}

export interface LayoutOptions {
  orientation?: OrientationPref;
}

const MIN = 20;
const MAX = 80;
/** "auto" resolves to rows while this query matches (ENGINEERING; PLAN.md §35). */
const AUTO_ROWS_QUERY = '(orientation: portrait), (max-width: 600px)';

export function createLayout(
  root: HTMLElement,
  options: LayoutOptions = {},
): LayoutHandle {
  root.innerHTML = `
    <div id="panes" data-mode="split" data-orientation="columns" style="--split: 50%">
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
  let pref: OrientationPref = options.orientation ?? 'columns';
  const listeners: ((m: PaneMode) => void)[] = [];
  const notify = () => listeners.forEach((cb) => cb(mode));

  // Test environments without matchMedia resolve "auto" to columns.
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(AUTO_ROWS_QUERY)
      : null;
  const applied = (): Orientation =>
    pref === 'auto' ? (media?.matches ? 'rows' : 'columns') : pref;

  const paintOrientation = () => {
    const o = applied();
    panes.dataset.orientation = o;
    // A separator's orientation is its own: the bar between stacked panes is horizontal.
    splitter.setAttribute(
      'aria-orientation',
      o === 'rows' ? 'horizontal' : 'vertical',
    );
  };
  media?.addEventListener('change', () => {
    if (pref !== 'auto') return;
    paintOrientation();
    notify();
  });
  paintOrientation();

  const setSplit = (pct: number) => {
    split = Math.round(Math.max(MIN, Math.min(MAX, pct)));
    panes.style.setProperty('--split', `${split}%`);
    splitter.setAttribute('aria-valuenow', String(split));
    notify();
  };

  // Pointer drag
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    const rect = panes.getBoundingClientRect();
    const rows = applied() === 'rows';
    const move = (ev: PointerEvent) =>
      setSplit(
        rows
          ? ((ev.clientY - rect.top) / rect.height) * 100
          : ((ev.clientX - rect.left) / rect.width) * 100,
      );
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  // Keyboard resize: Left/Right for side-by-side panes, Up/Down for stacked ones.
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const rows = applied() === 'rows';
    const less = rows ? 'ArrowUp' : 'ArrowLeft';
    const more = rows ? 'ArrowDown' : 'ArrowRight';
    if (e.key === less) setSplit(split - step);
    else if (e.key === more) setSplit(split + step);
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
      notify();
    },
    getSplit: () => split,
    setSplit,
    getOrientation: () => pref,
    appliedOrientation: applied,
    setOrientation(next) {
      pref = next;
      paintOrientation();
      notify();
    },
    onModeChange(cb) {
      listeners.push(cb);
    },
  };
}
