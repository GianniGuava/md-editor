import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { installViewport, keyboardUp } from './viewport';

/**
 * Is the on-screen keyboard covering the page? (PLAN.md D-36.) On iOS the keyboard
 * shrinks only the visual viewport; the layout height (innerHeight) stays.
 */
describe('keyboardUp', () => {
  it('is false when the whole page is visible', () => {
    expect(keyboardUp(390, 390, 1)).toBe(false);
  });

  it('is true when a keyboard covers a large part of a sideways phone', () => {
    expect(keyboardUp(390, 190, 1)).toBe(true);
  });

  it('ignores small changes such as a toolbar sliding in', () => {
    expect(keyboardUp(390, 340, 1)).toBe(false);
  });

  it('is not fooled by pinch zoom, which shrinks the visual viewport too', () => {
    expect(keyboardUp(390, 195, 2)).toBe(false);
    expect(keyboardUp(390, 95, 2)).toBe(true);
  });
});

/** A fake visualViewport the test can resize. */
const fakeViewport = (height: number) => {
  const listeners: Record<string, (() => void)[]> = {};
  const vv = {
    height,
    scale: 1,
    offsetTop: 0,
    addEventListener: (type: string, cb: () => void) =>
      (listeners[type] ??= []).push(cb),
    fire: (type: string) => listeners[type]?.forEach((cb) => cb()),
  };
  Object.defineProperty(window, 'visualViewport', {
    value: vv,
    configurable: true,
  });
  return vv;
};

describe('installViewport', () => {
  afterEach(() => {
    delete document.documentElement.dataset.keyboard;
    document.body.replaceChildren();
  });

  it('rechecks the keyboard when the window itself resizes (rotation)', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    });
    const vv = fakeViewport(390); // visual height already sideways, window still upright
    installViewport();
    expect(document.documentElement.dataset.keyboard).toBe('up');
    Object.defineProperty(window, 'innerHeight', {
      value: 390,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
    void vv;
  });

  it('does not undo the browser scroll that reveals a field in an open dialog', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 390,
      configurable: true,
    });
    const vv = fakeViewport(190);
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    installViewport();
    scrollTo.mockClear();
    const dlg = document.createElement('dialog');
    document.body.appendChild(dlg);
    dlg.setAttribute('open', '');
    vv.offsetTop = 120;
    vv.fire('scroll');
    expect(scrollTo).not.toHaveBeenCalled();
    dlg.removeAttribute('open');
    vv.fire('scroll');
    expect(scrollTo).toHaveBeenCalled();
  });
});
