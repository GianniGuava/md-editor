/**
 * The colour iOS paints behind the clock and battery (`theme-color`) follows the app's
 * theme, so dark mode does not keep a light grey strip at the top (Gianni 2026-11-20,
 * "2 yes"). It takes the header colour (--surface2) of whichever theme is applied.
 */
export function installThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) return;
  const paint = () => {
    const colour = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface2')
      .trim();
    if (colour) meta.content = colour;
  };
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  paint();
}
