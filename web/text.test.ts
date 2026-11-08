// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { basename, hashText, joinEol, splitEol } from './text';

describe('line endings', () => {
  it('normalises CRLF to LF and remembers the majority convention', () => {
    expect(splitEol('a\r\nb\r\nc')).toEqual({ text: 'a\nb\nc', eol: '\r\n' });
    expect(splitEol('a\nb\r\nc\n')).toEqual({ text: 'a\nb\nc\n', eol: '\n' });
    expect(splitEol('plain')).toEqual({ text: 'plain', eol: '\n' });
  });
  it('writes the remembered convention back', () => {
    expect(joinEol('a\nb', '\r\n')).toBe('a\r\nb');
    expect(joinEol('a\nb')).toBe('a\nb');
  });
});

describe('hashText', () => {
  it('is stable and distinguishes texts', async () => {
    expect(await hashText('x')).toBe(await hashText('x'));
    expect(await hashText('x')).not.toBe(await hashText('y'));
    expect(await hashText('x')).toMatch(/^[0-9a-f]{8,64}$/);
  });
});

it('basename strips the folder', () => {
  expect(basename('Shared/notes (2).md')).toBe('notes (2).md');
  expect(basename('notes.md')).toBe('notes.md');
});
