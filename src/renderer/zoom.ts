/**
 * Text zoom (PLAN.md §6: default 18 px, range 12–32, D-1 / R-3).
 * Changes --font-size on <html>, so editor, preview and UI scale together.
 * Persistence moves to the session store in step 6; localStorage is a stop-gap.
 */
const DEFAULT = 18;
const MIN = 12;
const MAX = 32;
const STEP = 2;
const KEY = 'md.fontSize';

export interface ZoomHandle {
  get(): number;
  set(px: number): number;
  in(): number;
  out(): number;
  reset(): number;
}

export function createZoom(): ZoomHandle {
  let size = DEFAULT;
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (saved >= MIN && saved <= MAX) size = saved;
  } catch {
    /* storage unavailable: keep default */
  }

  const apply = (px: number) => {
    size = Math.max(MIN, Math.min(MAX, px));
    document.documentElement.style.setProperty('--font-size', `${size}px`);
    try {
      localStorage.setItem(KEY, String(size));
    } catch {
      /* ignore */
    }
    return size;
  };

  apply(size);

  return {
    get: () => size,
    set: apply,
    in: () => apply(size + STEP),
    out: () => apply(size - STEP),
    reset: () => apply(DEFAULT),
  };
}
