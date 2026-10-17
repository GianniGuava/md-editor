// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SESSION_VERSION,
  deleteDraft,
  loadSession,
  pruneDrafts,
  readDraft,
  saveSession,
  sessionFile,
  writeDraft,
  type SessionData,
} from './session';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-session-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const sample = (): SessionData => ({
  version: SESSION_VERSION,
  savedAt: new Date().toISOString(),
  theme: 'light',
  paneMode: 'split',
  split: 50,
  fontSize: 18,
  highlight: true,
  scrollSync: true,
  tabs: [
    {
      path: 'C:\\x\\a.md',
      name: 'a.md',
      anchor: 3,
      head: 3,
      scrollTop: 10,
      dirty: false,
      draft: null,
    },
  ],
  activeIndex: 0,
  closed: [],
});

describe('session.json', () => {
  it('round-trips and is absent before the first save', async () => {
    expect(loadSession(dir)).toBeNull();
    await saveSession(dir, sample());
    expect(loadSession(dir)?.tabs[0].name).toBe('a.md');
  });

  it('ignores unknown versions and corrupt files', async () => {
    await fs.writeFile(sessionFile(dir), '{"version": 99, "tabs": []}');
    expect(loadSession(dir)).toBeNull();
    await fs.writeFile(sessionFile(dir), '{not json');
    expect(loadSession(dir)).toBeNull();
  });
});

describe('drafts', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('writes, reads, deletes, and prunes', async () => {
    await writeDraft(dir, id, 'draft text');
    expect(await readDraft(dir, id)).toBe('draft text');
    const other = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    await writeDraft(dir, other, 'stale');
    await pruneDrafts(dir, new Set([id]));
    expect(await readDraft(dir, other)).toBeNull();
    expect(await readDraft(dir, id)).toBe('draft text');
    await deleteDraft(dir, id);
    expect(await readDraft(dir, id)).toBeNull();
  });

  it('rejects ids that are not UUIDs', async () => {
    await expect(writeDraft(dir, '../evil', 'x')).rejects.toThrow();
  });
});
