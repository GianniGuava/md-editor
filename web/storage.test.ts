// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createStorage } from './storage';
import type { WindowReport } from '../src/main/session';

const fresh = () =>
  createStorage(`test-${Math.random().toString(36).slice(2)}`);

describe('files (the web disk)', () => {
  it('writes, reads back with a hash, and never reuses a path in use', async () => {
    const s = fresh();
    const p1 = await s.files.uniquePath('Shared', 'a.md');
    expect(p1).toBe('Shared/a.md');
    const written = await s.files.write(p1, 'a.md', 'hello', '\n');
    expect(written).toMatchObject({ path: p1, name: 'a.md', text: 'hello' });
    expect(await s.files.uniquePath('Shared', 'a.md')).toBe('Shared/a (2).md');
    expect(await s.files.uniquePath('Imported', 'a.md')).toBe('Imported/a.md');
    expect(await s.files.uniquePath('Shared', 'README')).toBe('Shared/README');
    const read = await s.files.read(p1);
    expect(read.text).toBe('hello');
    expect(read.hash).toBe(written.hash);
    expect(read.eol).toBe('\n');
  });

  it('throws for an unknown path and prunes everything not kept', async () => {
    const s = fresh();
    await s.files.write('Shared/keep.md', 'keep.md', '1', '\n');
    await s.files.write('Imported/drop.md', 'drop.md', '2', '\r\n');
    await s.files.prune(['Shared/keep.md']);
    expect(await s.files.exists('Shared/keep.md')).toBe(true);
    expect(await s.files.exists('Imported/drop.md')).toBe(false);
    await expect(s.files.read('Imported/drop.md')).rejects.toThrow(
      /not on this device/,
    );
  });
});

describe('session', () => {
  it('starts empty with the light theme', async () => {
    expect(await fresh().session.load()).toEqual({
      theme: 'light',
      window: null,
    });
  });

  it('round-trips the window entry, theme and drafts', async () => {
    const s = fresh();
    const report: WindowReport = {
      theme: 'dark',
      paneMode: 'split',
      split: 40,
      fontSize: 18,
      highlight: true,
      scrollSync: true,
      freezeHeaders: true,
      orientation: 'rows',
      tabs: [
        {
          path: null,
          name: 'Untitled-1',
          anchor: 0,
          head: 0,
          scrollTop: 0,
          dirty: true,
          draft: 'd1',
        },
      ],
      activeIndex: 0,
      closed: [],
    };
    await s.session.save(report);
    await s.session.writeDraft('d1', '# draft');
    const loaded = await s.session.load();
    expect(loaded.theme).toBe('dark');
    expect(loaded.window).toMatchObject({
      id: 'web',
      orientation: 'rows',
      tabs: report.tabs,
    });
    expect(await s.session.readDraft('d1')).toBe('# draft');
    await s.session.deleteDraft('d1');
    expect(await s.session.readDraft('d1')).toBeNull();
    await s.session.setTheme('hc');
    expect((await s.session.load()).theme).toBe('hc');
  });
});
