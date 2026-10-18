import { BrowserWindow } from 'electron';
import { watch, type FSWatcher } from 'chokidar';
import { readTextFile, type FileData } from './files';

/**
 * Per-file watching shared by all windows (PLAN.md step 4; D-27, VENDOR chokidar README).
 *  - `atomic`: editors that save via temp file + rename produce unlink+add within
 *    100 ms; chokidar reports them as one `change`.
 *  - `awaitWriteFinish`: hold events until the size is stable, so a half-written
 *    file is never read.
 *  - UNC paths fall back to polling (Node fs.watch is documented as unreliable on
 *    SMB/NFS shares).
 * Each window holds a reference; the watcher closes when the last one releases it.
 * Events go to every window; renderers ignore paths they do not have open.
 */

interface Entry {
  watcher: FSWatcher;
  refs: Set<number>; // BrowserWindow ids
}

const watchers = new Map<string, Entry>();

// UNC paths: \\server\share or //server/share
const isNetworkPath = (p: string) => p.startsWith('\\\\') || p.startsWith('//');

const broadcast = (channel: string, payload: unknown) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
};

export function startWatching(p: string, windowId: number) {
  const existing = watchers.get(p);
  if (existing) {
    existing.refs.add(windowId);
    return;
  }

  const watcher = watch(p, {
    ignoreInitial: true,
    atomic: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    usePolling: isNetworkPath(p),
    interval: 1000,
  });

  const emitChange = async () => {
    try {
      const data: FileData = await readTextFile(p);
      broadcast('file:changed', data);
    } catch (err) {
      broadcast('file:watchError', { path: p, message: String(err) });
    }
  };

  watcher
    .on('change', emitChange)
    .on('add', emitChange) // recreated after an unlink
    .on('unlink', () => broadcast('file:removed', { path: p }))
    .on('error', (err) =>
      broadcast('file:watchError', { path: p, message: String(err) }),
    );

  watchers.set(p, { watcher, refs: new Set([windowId]) });
}

export async function stopWatching(p: string, windowId: number) {
  const entry = watchers.get(p);
  if (!entry) return;
  entry.refs.delete(windowId);
  if (entry.refs.size > 0) return;
  watchers.delete(p);
  await entry.watcher.close();
}

/** Release everything a closed window held. */
export async function releaseWindow(windowId: number) {
  await Promise.all(
    Array.from(watchers.keys()).map((p) => stopWatching(p, windowId)),
  );
}

export async function stopAllWatchers() {
  const all = Array.from(watchers.values());
  watchers.clear();
  await Promise.all(all.map((e) => e.watcher.close()));
}
