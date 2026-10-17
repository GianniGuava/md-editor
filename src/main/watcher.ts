import { BrowserWindow } from 'electron';
import { watch, type FSWatcher } from 'chokidar';
import { readTextFile, type FileData } from './files';

/**
 * Per-file watching (PLAN.md step 4; D-27, VENDOR chokidar README).
 *  - `atomic`: editors that save via temp file + rename produce unlink+add within
 *    100 ms; chokidar reports them as one `change`.
 *  - `awaitWriteFinish`: hold events until the size is stable, so a half-written
 *    file is never read.
 *  - UNC paths fall back to polling (Node fs.watch is documented as unreliable on
 *    SMB/NFS shares).
 * Events reach the renderer as file:changed / file:removed / file:watchError; the
 * renderer decides what to do (hash compare, reload policy D-18).
 */

const watchers = new Map<string, FSWatcher>();

// UNC paths: \\server\share or //server/share
const isNetworkPath = (p: string) => p.startsWith('\\\\') || p.startsWith('//');

export function startWatching(
  p: string,
  getWindow: () => BrowserWindow | null,
) {
  if (watchers.has(p)) return;
  const send = (channel: string, payload: unknown) =>
    getWindow()?.webContents.send(channel, payload);

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
      send('file:changed', data);
    } catch (err) {
      send('file:watchError', { path: p, message: String(err) });
    }
  };

  watcher
    .on('change', emitChange)
    .on('add', emitChange) // recreated after an unlink
    .on('unlink', () => send('file:removed', { path: p }))
    .on('error', (err) =>
      send('file:watchError', { path: p, message: String(err) }),
    );

  watchers.set(p, watcher);
}

export async function stopWatching(p: string) {
  const w = watchers.get(p);
  if (!w) return;
  watchers.delete(p);
  await w.close();
}

export async function stopAllWatchers() {
  await Promise.all(Array.from(watchers.keys()).map(stopWatching));
}
