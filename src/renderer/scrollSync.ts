import type { EditorHandle } from './editor';
import { scrollingTable, type PreviewHandle } from './preview';

/**
 * Best-effort scroll synchronisation by source line (PLAN.md step 2.5).
 * No academic evidence either way (H-10), so it is switchable and conservative:
 * it aligns block starts, never interpolates inside a block.
 *
 * Positions are measured with screen rectangles, never offsetTop: a table row's
 * offsetTop is relative to its table, which made the preview jump inside tables.
 * Tables with frozen headers are their own scroll viewports, so a row is shown by
 * scrolling the pane to the table and the table to the row, under its header.
 */
export interface ScrollSyncHandle {
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
}

export function createScrollSync(
  editor: EditorHandle,
  preview: PreviewHandle,
): ScrollSyncHandle {
  let enabled = true;
  let lock: 'editor' | 'preview' | null = null;
  let lockTimer: number | undefined;

  const hold = (who: 'editor' | 'preview') => {
    lock = who;
    window.clearTimeout(lockTimer);
    lockTimer = window.setTimeout(() => (lock = null), 120);
  };

  const headerHeight = (t: HTMLTableElement) => t.tHead?.offsetHeight ?? 0;

  const editorScrolled = () => {
    if (!enabled || lock === 'preview') return;
    hold('editor');
    const line = editor.topLine();
    let target: HTMLElement | null = null;
    for (const b of preview.blocks()) {
      if (b.line <= line) target = b.el;
      else break;
    }
    if (!target) return;
    const pane = preview.scroller;
    const paneTop = () => pane.getBoundingClientRect().top;
    const t = target.tagName === 'TABLE' ? null : scrollingTable(target);
    if (t) {
      pane.scrollTop += t.getBoundingClientRect().top - paneTop();
      if (target.closest('thead')) {
        t.scrollTop = 0;
      } else {
        t.scrollTop +=
          target.getBoundingClientRect().top -
          t.getBoundingClientRect().top -
          headerHeight(t);
      }
      return;
    }
    pane.scrollTop += target.getBoundingClientRect().top - paneTop();
  };

  const previewScrolled = () => {
    if (!enabled || lock === 'editor') return;
    hold('preview');
    const paneTop = preview.scroller.getBoundingClientRect().top;
    const blocks = preview.blocks();
    let line: number | null = null;
    for (const b of blocks) {
      const el = b.el;
      const tag = el.tagName;
      if (tag === 'THEAD' || tag === 'TBODY') continue;
      let visibleTop = paneTop;
      if (tag === 'TABLE') {
        if (el.scrollTop > 0) continue; // scrolled inside: its rows decide
      } else if (el.closest('table')) {
        if (el.closest('thead')) continue; // a frozen header says nothing about position
        const t = scrollingTable(el);
        if (t) {
          visibleTop = Math.max(
            paneTop,
            t.getBoundingClientRect().top + headerHeight(t),
          );
        }
      }
      if (el.getBoundingClientRect().top >= visibleTop - 1) {
        line = b.line;
        break;
      }
    }
    if (line === null) line = blocks.at(-1)?.line ?? null;
    if (line !== null) editor.scrollToLine(line);
  };

  editor.view.scrollDOM.addEventListener('scroll', editorScrolled, {
    passive: true,
  });

  // Capture catches scrolls of tables inside the pane too (scroll does not bubble).
  // Horizontal-only scrolls (wide tables) are ignored.
  const lastTop = new WeakMap<EventTarget, number>();
  preview.scroller.addEventListener(
    'scroll',
    (e) => {
      const el = e.target as HTMLElement;
      if (lastTop.get(el) === el.scrollTop) return;
      lastTop.set(el, el.scrollTop);
      previewScrolled();
    },
    { passive: true, capture: true },
  );

  return {
    setEnabled: (on) => (enabled = on),
    isEnabled: () => enabled,
  };
}
