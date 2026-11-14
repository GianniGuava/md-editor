import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBrowserApi } from './api';
import { createStorage } from './storage';
import type { WindowReport } from '../src/main/session';

/**
 * The browser MdApi's bookkeeping of the web "disk" (PLAN.md §35, D-29): what is pruned
 * when the session is written, and imports that arrive together. Scan findings A-F1,
 * A-F6, A-F7 and A-F11 of 2026-11-08.
 */

beforeAll(() => {
  // jsdom has no matchMedia; the API only asks it for the system theme.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const report = (over: Partial<WindowReport> = {}): WindowReport => ({
  theme: 'light',
  paneMode: 'split',
  split: 50,
  fontSize: 16,
  highlight: true,
  scrollSync: true,
  tabs: [],
  activeIndex: 0,
  closed: [],
  ...over,
});

const tab = (path: string | null, draft: string | null = null) => ({
  path,
  name: path ?? 'Untitled-1',
  anchor: 0,
  head: 0,
  scrollTop: 0,
  dirty: draft !== null,
  draft,
});

const fresh = () => {
  const db = `api-${Math.random().toString(36).slice(2)}`;
  return {
    api: createBrowserApi({ dbName: db }).api,
    storage: createStorage(db),
  };
};

const importNamed = async (
  api: ReturnType<typeof fresh>['api'],
  name: string,
  text: string,
) => api.files.read(api.files.pathForFile(new File([text], name)));

describe('imports', () => {
  it('gives two same-named files dropped together their own records', async () => {
    const { api } = fresh();
    const [a, b] = await Promise.all([
      importNamed(api, 'a.md', 'FIRST'),
      importNamed(api, 'a.md', 'SECOND'),
    ]);
    expect(a.path).not.toBe(b.path);
    expect((await api.files.read(a.path)).text).toBe('FIRST');
    expect((await api.files.read(b.path)).text).toBe('SECOND');
  });
});

describe('pruning on session save', () => {
  it('keeps a record imported after the session report was captured', async () => {
    const { api } = fresh();
    const old = await importNamed(api, 'old.md', 'old');
    await api.session.save(report({ tabs: [tab(old.path)] }));
    // A report captured before the import reaches the API after it (a flush in flight).
    const late = await importNamed(api, 'late.md', 'late');
    await api.session.save(report({ tabs: [tab(old.path)] }));
    expect((await api.files.read(late.path)).text).toBe('late');
  });

  it('prunes a record once a report has listed it and a later one does not', async () => {
    const { api } = fresh();
    const a = await importNamed(api, 'a.md', 'a');
    await api.session.save(report({ tabs: [tab(a.path)] }));
    await api.session.save(report({ tabs: [] }));
    await expect(api.files.read(a.path)).rejects.toThrow();
  });

  it('keeps the records of recently closed tabs so Reopen gets the file back', async () => {
    const { api } = fresh();
    const a = await importNamed(api, 'a.md', 'a');
    await api.session.save(report({ tabs: [tab(a.path)] }));
    await api.session.save(
      report({ closed: [{ path: a.path, name: 'a.md', text: 'a' }] }),
    );
    expect((await api.files.read(a.path)).text).toBe('a');
  });

  it('deletes drafts that no tab refers to', async () => {
    const { api, storage } = fresh();
    await api.session.writeDraft('kept', 'unsaved');
    await api.session.writeDraft('orphan', 'left behind');
    await api.session.save(report({ tabs: [tab(null, 'kept')] }));
    expect(await storage.session.readDraft('kept')).toBe('unsaved');
    expect(await storage.session.readDraft('orphan')).toBeNull();
  });
});
