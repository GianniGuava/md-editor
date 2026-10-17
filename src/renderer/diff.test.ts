import { describe, expect, it } from 'vitest';
import { diffLines } from './diff';

describe('diffLines', () => {
  it('marks added and removed lines and keeps context', () => {
    const d = diffLines('a\nb\nc\nd', 'a\nx\nc\nd\ne');
    expect(d).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
      { kind: 'same', text: 'd' },
      { kind: 'add', text: 'e' },
    ]);
  });

  it('returns all-same for identical input', () => {
    expect(diffLines('p\nq', 'p\nq')?.every((l) => l.kind === 'same')).toBe(
      true,
    );
  });

  it('gives up on very large inputs', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n');
    expect(diffLines(big, big + '\nz')).toBeNull();
  });
});
