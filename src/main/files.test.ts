// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashText, readTextFile, writeTextFileAtomic } from './files';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-files-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('writeTextFileAtomic / readTextFile', () => {
  it('writes, leaves no temp file behind, and reads back with a matching hash', async () => {
    const p = path.join(dir, 'note.md');
    const text = '# Hello\n\nworld — café\n';
    const { hash } = await writeTextFileAtomic(p, text);
    const data = await readTextFile(p);
    expect(data.text).toBe(text);
    expect(data.hash).toBe(hash);
    expect(data.hash).toBe(hashText(text));
    expect(data.name).toBe('note.md');
    expect(await fs.readdir(dir)).toEqual(['note.md']);
  });

  it('replaces an existing file in place', async () => {
    const p = path.join(dir, 'note.md');
    await writeTextFileAtomic(p, 'one');
    await writeTextFileAtomic(p, 'two');
    expect((await readTextFile(p)).text).toBe('two');
  });

  it('survives concurrent writes to the same path', async () => {
    const p = path.join(dir, 'session.json');
    const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee'];
    await Promise.all(texts.map((t) => writeTextFileAtomic(p, t)));
    expect(texts).toContain((await readTextFile(p)).text);
    expect(await fs.readdir(dir)).toEqual(['session.json']);
  });

  it('reads CRLF files as LF and writes them back as CRLF', async () => {
    const p = path.join(dir, 'windows.md');
    await fs.writeFile(p, '# Title\r\n\r\nBody line\r\n', 'utf8');
    const data = await readTextFile(p);
    expect(data.eol).toBe('\r\n');
    expect(data.text).toBe('# Title\n\nBody line\n');
    const { hash } = await writeTextFileAtomic(
      p,
      data.text + 'More\n',
      data.eol,
    );
    expect(await fs.readFile(p, 'utf8')).toBe(
      '# Title\r\n\r\nBody line\r\nMore\r\n',
    );
    expect((await readTextFile(p)).hash).toBe(hash);
  });

  it('keeps LF files as LF', async () => {
    const p = path.join(dir, 'unix.md');
    await fs.writeFile(p, 'a\nb\n', 'utf8');
    const data = await readTextFile(p);
    expect(data.eol).toBe('\n');
    await writeTextFileAtomic(p, data.text, data.eol);
    expect(await fs.readFile(p, 'utf8')).toBe('a\nb\n');
  });
});
