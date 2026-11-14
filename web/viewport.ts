/**
 * Keep the app inside the visible viewport (PLAN.md §35). On iOS the on-screen keyboard
 * does not shrink the layout viewport, only the visual one, so the page height follows
 * visualViewport and any scroll Safari applies to reveal the caret is undone.
 */
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
    // Undo Safari's scroll-to-caret only when not zoomed: while zoomed the user pans.
    if (vv.scale <= 1.01 && (vv.offsetTop > 0 || window.scrollY > 0))
      window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
