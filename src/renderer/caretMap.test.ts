import { describe, expect, it } from 'vitest';
import { buildVisibleMap, sourcePosOf, visibleOffsetOf } from './caretMap';

describe('buildVisibleMap', () => {
  it('drops emphasis marks and keeps positions', () => {
    const src = 'a **bold** word';
    const map = buildVisibleMap(
      src,
      0,
      [
        { from: 2, to: 4 },
        { from: 8, to: 10 },
      ],
      src.length,
    );
    expect(map.visible).toBe('a bold word');
    // cursor after "**bo" (source 6) → visible offset 4 ("a bo")
    expect(visibleOffsetOf(map, 6)).toBe(4);
    // visible offset 4 → source 6
    expect(sourcePosOf(map, 4)).toBe(6);
    // cursor inside the closing marks maps to after "bold"
    expect(visibleOffsetOf(map, 9)).toBe(6);
  });

  it('removes a heading mark and the space after it', () => {
    const src = '# Title';
    const map = buildVisibleMap(src, 100, [{ from: 100, to: 101 }], 107);
    expect(map.visible).toBe('Title');
    expect(sourcePosOf(map, 0)).toBe(102);
    expect(visibleOffsetOf(map, 102)).toBe(0);
  });

  it('counts escapes and entities as one character', () => {
    const src = 'x \\* y';
    const map = buildVisibleMap(
      src,
      0,
      [{ from: 2, to: 4, keep: 1 }],
      src.length,
    );
    expect(map.visible).toBe('x * y');
    expect(sourcePosOf(map, 2)).toBe(3);
  });

  it('trims continuation indentation and table cell padding', () => {
    const para = 'one\n   two';
    expect(buildVisibleMap(para, 0, [], para.length).visible).toBe('one\ntwo');
    const row = '| a b | c |';
    const map = buildVisibleMap(
      row,
      0,
      [
        { from: 0, to: 1, boundary: true },
        { from: 6, to: 7, boundary: true },
        { from: 10, to: 11, boundary: true },
      ],
      row.length,
    );
    expect(map.visible).toBe('a bc');
    expect(sourcePosOf(map, 3)).toBe(8); // "c"
  });

  it('clamps past the end', () => {
    const map = buildVisibleMap('ab', 10, [], 12);
    expect(sourcePosOf(map, 5)).toBe(12);
    expect(visibleOffsetOf(map, 99)).toBe(2);
  });
});
