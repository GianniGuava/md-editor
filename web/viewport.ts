/**
 * Keep the app inside the visible viewport (PLAN.md §35). On iOS the on-screen keyboard
 * does not shrink the layout viewport, only the visual one, so the page height follows
 * visualViewport and any scroll Safari applies to reveal the caret is undone.
 */
export function installViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    document.documentElement.style.setProperty(
      '--vv-height',
      `${Math.round(vv.height)}px`,
    );
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
