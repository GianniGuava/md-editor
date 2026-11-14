import { describe, expect, it } from 'vitest';
import { acceleratorFor, formatKeys } from './commands';

/**
 * Hardware-keyboard accelerators (D-32) by platform, per the notebook's
 * shortcut-conventions note: Command on Apple devices, Control elsewhere, and Control+Tab
 * for next/previous tab on both (Safari's own convention). Scan findings B-F4, B-F5.
 */

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key: k, ...mods });

describe('acceleratorFor', () => {
  it('uses Control on Windows and Linux and leaves Command alone', () => {
    expect(acceleratorFor(key('s', { ctrlKey: true }), false)?.name).toBe(
      'file:save',
    );
    expect(acceleratorFor(key('s', { metaKey: true }), false)).toBeNull();
  });

  it('uses Command on Apple devices and leaves Control to text editing', () => {
    expect(acceleratorFor(key('s', { metaKey: true }), true)?.name).toBe(
      'file:save',
    );
    for (const k of ['e', 'f', 'h', 't', 'o', 'w'])
      expect(acceleratorFor(key(k, { ctrlKey: true }), true)).toBeNull();
  });

  it('maps Control+Tab and Control+Shift+Tab to next and previous tab on every platform', () => {
    for (const apple of [false, true]) {
      expect(acceleratorFor(key('Tab', { ctrlKey: true }), apple)?.name).toBe(
        'tab:next',
      );
      expect(
        acceleratorFor(key('Tab', { ctrlKey: true, shiftKey: true }), apple)
          ?.name,
      ).toBe('tab:prev');
    }
  });

  it('finds next and previous with Command+G on Apple devices, F3 elsewhere', () => {
    expect(acceleratorFor(key('g', { metaKey: true }), true)?.name).toBe(
      'edit:findNext',
    );
    expect(
      acceleratorFor(key('G', { metaKey: true, shiftKey: true }), true)?.name,
    ).toBe('edit:findPrev');
    expect(acceleratorFor(key('F3'), false)?.name).toBe('edit:findNext');
  });
});

describe('formatKeys', () => {
  it('shows Apple symbols on Apple devices and leaves others as written', () => {
    expect(formatKeys('Ctrl+Shift+S', true)).toBe('⇧⌘S');
    expect(formatKeys('Ctrl+Tab', true)).toBe('⌃Tab');
    expect(formatKeys('Ctrl+Shift+Tab', true)).toBe('⌃⇧Tab');
    expect(formatKeys('Ctrl+\\', true)).toBe('⌘\\');
    expect(formatKeys('Ctrl+Shift+S', false)).toBe('Ctrl+Shift+S');
  });
});
