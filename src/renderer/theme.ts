/**
 * Theme service (PLAN.md step 5; D-10, D-17).
 *  - light (default), dark, hc (AAA), system (follows the OS, Media Queries 5 §12.5
 *    via Electron's nativeTheme).
 *  - Light is the default because positive polarity reads better (Buchner & Baumgartner
 *    2007; Piepenbrock et al. 2013, 2014; Dobres et al. 2017).
 *  - The preference is reported to the main process so the menu radio items and the
 *    native dialogs follow it. Persistence moves to the session store in step 6.
 */
export type ThemePref = 'light' | 'dark' | 'hc' | 'system';
export type ThemeName = 'light' | 'dark' | 'hc';

const ORDER: ThemePref[] = ['light', 'dark', 'hc', 'system'];
const KEY = 'md.theme';

export interface ThemeHandle {
  get(): ThemePref;
  applied(): ThemeName;
  set(pref: ThemePref): Promise<void>;
  cycle(): Promise<void>;
  /** Called when the OS theme changes; only matters while pref is "system". */
  systemChanged(dark: boolean): void;
}

export function createTheme(initial?: ThemePref): ThemeHandle {
  let pref: ThemePref = 'light';
  let systemDark = false;
  try {
    const saved = localStorage.getItem(KEY) as ThemePref | null;
    if (saved && ORDER.includes(saved)) pref = saved;
  } catch {
    /* storage unavailable */
  }
  if (initial) pref = initial;

  const applied = (): ThemeName =>
    pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  const paint = () => {
    document.documentElement.dataset.theme = applied();
  };

  const set = async (next: ThemePref) => {
    pref = next;
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    const { dark } = await window.md.theme.set(pref);
    systemDark = dark;
    paint();
  };

  return {
    get: () => pref,
    applied,
    set,
    cycle: () => set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]),
    systemChanged(dark) {
      systemDark = dark;
      paint();
    },
  };
}
