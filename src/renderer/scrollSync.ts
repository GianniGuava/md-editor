import type { EditorHandle } from './editor';
import type { PreviewHandle } from './preview';

/**
 * Scroll synchronisation by source position (PLAN.md step 2.5, reworked 2026-10-20).
 * No academic evidence either way (H-10); switchable. Rules:
 *
 *  - Fractional mapping. The editor reports its top as "line + fraction of that
 *    line's height" (long wrapped lines included). The preview's leaf blocks each
 *    cover a source range [start, end]; a position inside a block is interpolated by
 *    pixels, a position between blocks by the gap. Both directions use the same map.
 *  - One coordinate space. Frozen table headers stick to the pane itself, so every
 *    block is measured in pane content coordinates with screen rectangles.
 *  - Who drives. Editor scrolling (yours, or the editor keeping the cursor in view
 *    while you type) moves the preview. The preview moves the editor only when you
 *    scroll the preview yourself (wheel, scrollbar, keys, touch); re-renders, the
 *    caret keep-in-view and sync's own scrolling never move the editor.
 *  - Ends meet: the top of one pane maps to the top of the other, bottom to bottom.
 */
export interface ScrollSyncHandle {
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
}

interface Segment {
  start: number; // first source line, 1-based
  end: number; // last source line, inclusive
  top: number; // pane content coordinates
  bottom: number;
  table: HTMLTableElement | null; // set for table body rows
}

const AT_EDGE = 2; // px

export function createScrollSync(
  editor: EditorHandle,
  preview: PreviewHandle,
): ScrollSyncHandle {
  let enabled = true;
  let lock: 'editor' | 'preview' | null = null;
  let lockTimer: number | undefined;
  const pane = preview.scroller;
  const ed = editor.view.scrollDOM;

  const hold = (who: 'editor' | 'preview') => {
    lock = who;
    window.clearTimeout(lockTimer);
    lockTimer = window.setTimeout(() => (lock = null), 150);
  };

  const frozen = () => pane.classList.contains('freeze-headers');
  const headerHeight = (t: HTMLTableElement | null) =>
    t && frozen() ? (t.tHead?.offsetHeight ?? 0) : 0;

  /** Leaf blocks (no nested data-line) in pane content coordinates. */
  const segments = (): Segment[] => {
    const paneTop = pane.getBoundingClientRect().top;
    const toContent = (y: number) => y - paneTop + pane.scrollTop;
    const out: Segment[] = [];
    for (const { el, line } of preview.blocks()) {
      if (el.querySelector('[data-line]')) continue;
      const end = Math.max(line, Number(el.dataset.lineEnd ?? line));
      const table = el.closest('table');
      let top: number;
      let bottom: number;
      if (table && el.closest('thead')) {
        // A stuck header reports its stuck position; use its natural box instead.
        const t = table.getBoundingClientRect();
        const firstBody = table.tBodies[0]?.rows[0];
        top = toContent(t.top);
        bottom = toContent(
          firstBody ? firstBody.getBoundingClientRect().top : t.bottom,
        );
      } else {
        const r = el.getBoundingClientRect();
        top = toContent(r.top);
        bottom = toContent(r.bottom);
      }
      out.push({
        start: line,
        end,
        top,
        bottom,
        table: table && !el.closest('thead') ? table : null,
      });
    }
    return out;
  };

  /** Pane content y for a fractional source line, and the segment it fell in. */
  const yForLine = (L: number, segs: Segment[]) => {
    let prev: Segment | null = null;
    for (const s of segs) {
      if (L < s.start) {
        const fromLine = prev ? prev.end + 1 : 1;
        const fromY = prev ? prev.bottom : 0;
        const f = clamp01((L - fromLine) / Math.max(1e-6, s.start - fromLine));
        return { y: fromY + f * (s.top - fromY), seg: null };
      }
      if (L < s.end + 1) {
        const f = (L - s.start) / (s.end + 1 - s.start);
        return { y: s.top + f * (s.bottom - s.top), seg: s };
      }
      prev = s;
    }
    return { y: prev ? prev.bottom : 0, seg: null };
  };

  /** Fractional source line for a pane content y. */
  const lineForY = (y: number, segs: Segment[]) => {
    let prev: Segment | null = null;
    for (const s of segs) {
      if (y < s.top) {
        const fromLine = prev ? prev.end + 1 : 1;
        const fromY = prev ? prev.bottom : 0;
        const f = clamp01((y - fromY) / Math.max(1e-6, s.top - fromY));
        return fromLine + f * (s.start - fromLine);
      }
      if (y < s.bottom) {
        const f = (y - s.top) / Math.max(1e-6, s.bottom - s.top);
        return s.start + f * (s.end + 1 - s.start);
      }
      prev = s;
    }
    return prev ? prev.end + 1 : 1;
  };

  const syncPreviewToEditor = () => {
    if (ed.scrollTop <= AT_EDGE) {
      pane.scrollTop = 0;
      return;
    }
    if (ed.scrollTop + ed.clientHeight >= ed.scrollHeight - AT_EDGE) {
      pane.scrollTop = pane.scrollHeight;
      return;
    }
    const segs = segments();
    const { y, seg } = yForLine(editor.topLineFraction(), segs);
    // A body row under a frozen header: keep it below the stuck header row.
    pane.scrollTop = Math.max(0, y - headerHeight(seg?.table ?? null));
  };

  const syncEditorToPreview = () => {
    if (pane.scrollTop <= AT_EDGE) {
      editor.scrollToLineFraction(1);
      return;
    }
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - AT_EDGE) {
      ed.scrollTop = ed.scrollHeight;
      return;
    }
    const segs = segments();
    let y = pane.scrollTop;
    // Inside a table whose header is stuck, the first visible row is below the header.
    for (const s of segs) {
      if (s.table && y >= s.top - headerHeight(s.table) && y < s.bottom) {
        y += headerHeight(s.table);
        break;
      }
    }
    editor.scrollToLineFraction(lineForY(y, segs));
  };

  // ---- Who drives: user intent on the preview ----
  let pointerDown = false;
  let intentUntil = 0;
  const markIntent = () => (intentUntil = performance.now() + 400);
  const userScrollingPreview = () =>
    pointerDown || performance.now() < intentUntil;
  pane.addEventListener('wheel', markIntent, { passive: true, capture: true });
  pane.addEventListener('touchmove', markIntent, {
    passive: true,
    capture: true,
  });
  pane.addEventListener('keydown', markIntent, { capture: true });
  pane.addEventListener('pointerdown', () => (pointerDown = true), {
    capture: true,
  });
  window.addEventListener(
    'pointerup',
    () => {
      if (pointerDown) markIntent();
      pointerDown = false;
    },
    true,
  );

  ed.addEventListener(
    'scroll',
    () => {
      if (!enabled || lock === 'preview') return;
      hold('editor');
      syncPreviewToEditor();
    },
    { passive: true },
  );

  pane.addEventListener(
    'scroll',
    () => {
      if (!enabled || lock === 'editor' || !userScrollingPreview()) return;
      hold('preview');
      syncEditorToPreview();
    },
    { passive: true },
  );

  return {
    setEnabled: (on) => {
      enabled = on;
      if (on) syncPreviewToEditor();
    },
    isEnabled: () => enabled,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
