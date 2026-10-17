import type { EditorHandle } from './editor';
import type { PreviewHandle } from './preview';

/**
 * Best-effort scroll synchronisation by source line (PLAN.md step 2.5).
 * No academic evidence either way (H-10), so it is switchable and conservative:
 * it aligns block starts, never interpolates inside a block.
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

  const editorScrolled = () => {
    if (!enabled || lock === 'preview') return;
    hold('editor');
    const line = editor.topLine();
    const blocks = preview.blocks();
    let target: HTMLElement | null = null;
    for (const b of blocks) {
      if (b.line <= line) target = b.el;
      else break;
    }
    if (target) preview.scroller.scrollTop = target.offsetTop;
  };

  const previewScrolled = () => {
    if (!enabled || lock === 'editor') return;
    hold('preview');
    const top = preview.scroller.scrollTop;
    const blocks = preview.blocks();
    const first = blocks.find((b) => b.el.offsetTop >= top) ?? blocks.at(-1);
    if (first) editor.scrollToLine(first.line);
  };

  editor.view.scrollDOM.addEventListener('scroll', editorScrolled, {
    passive: true,
  });
  preview.scroller.addEventListener('scroll', previewScrolled, {
    passive: true,
  });

  return {
    setEnabled: (on) => (enabled = on),
    isEnabled: () => enabled,
  };
}
