/**
 * Hold-Alt shortcut overlay (R-7, decided for v1; CITED Malacria et al. 2013, ExposeHK:
 * showing hotkeys on the commands themselves increased and accelerated hotkey use).
 * Holding Alt for HOLD_MS adds `show-keys` to <body>; CSS then renders each element's
 * data-keys attribute as a badge. A plain Alt tap still reaches the Windows menu bar.
 * HOLD_MS is an ENGINEERING value to tune in testing (PLAN.md step 3.6).
 */
const HOLD_MS = 300;

export function installAltOverlay(): void {
  let timer: number | undefined;
  const show = () => document.body.classList.add('show-keys');
  const hide = () => {
    window.clearTimeout(timer);
    timer = undefined;
    document.body.classList.remove('show-keys');
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !e.repeat && timer === undefined) {
      timer = window.setTimeout(show, HOLD_MS);
    } else if (e.key !== 'Alt') {
      hide(); // Alt+something is a chord, not a request for help
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') hide();
  });
  window.addEventListener('blur', hide);
}
