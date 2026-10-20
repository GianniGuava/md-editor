import { describe, expect, it } from 'vitest';
import { formatCount } from './searchCount';

describe('formatCount', () => {
  it('formats every state of the find counter', () => {
    expect(formatCount(null)).toBe('');
    expect(formatCount('invalid')).toBe('Invalid pattern');
    expect(formatCount({ total: 0, current: 0, capped: false })).toBe(
      'No matches',
    );
    expect(formatCount({ total: 1, current: 0, capped: false })).toBe(
      '1 match',
    );
    expect(formatCount({ total: 12, current: 0, capped: false })).toBe(
      '12 matches',
    );
    expect(formatCount({ total: 12, current: 3, capped: false })).toBe(
      '3 of 12',
    );
    expect(formatCount({ total: 10000, current: 0, capped: true })).toBe(
      '10000+ matches',
    );
  });
});
