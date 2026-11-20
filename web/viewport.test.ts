import { describe, expect, it } from 'vitest';
import { keyboardUp } from './viewport';

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
