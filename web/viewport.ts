/**
 * Keep the app inside the visible viewport (PLAN.md §35). On iOS the on-screen keyboard
 * does not shrink the layout viewport, only the visual one, so the page height follows
 * visualViewport and any scroll Safari applies to reveal the caret is undone.
 */
/**
 * Is the on-screen keyboard up? On iOS it shrinks only the visual viewport, so compare the
 * visible height (undoing pinch zoom with `scale`) with the layout height. A change under
 * a fifth of the screen (or 100 px) is a browser bar, not a keyboard (PLAN.md D-36).
 */
export function keyboardUp(
  innerHeight: number,
  visualHeight: number,
  scale: number,
): boolean {
  return innerHeight - visualHeight * scale > Math.max(100, innerHeight * 0.2);
}

export function installViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    // vv.height is in CSS pixels after pinch zoom; times the scale it is the height the
    // layout should keep, so zooming in does not shrink the app (scan finding B-F9).
    document.documentElement.style.setProperty(
      '--vv-height',
      `${Math.round(vv.height * vv.scale)}px`,
    );
    // web.css lets the preview step aside on a short screen while this is set (D-36).
    if (keyboardUp(window.innerHeight, vv.height, vv.scale))
      document.documentElement.dataset.keyboard = 'up';
    else delete document.documentElement.dataset.keyboard;
    // Undo Safari's scroll-to-caret only when not zoomed: while zoomed the user pans.
    if (vv.scale <= 1.01 && (vv.offsetTop > 0 || window.scrollY > 0))
      window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
