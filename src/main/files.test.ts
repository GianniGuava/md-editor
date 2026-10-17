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
});
