import { BrowserWindow, dialog, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * File access for the renderer (PLAN.md step 3). The renderer never sees a
 * filesystem API; it asks for whole files by path and gets text plus a content
 * hash. The hash is what step 4 uses to tell our own saves from external edits.
 */

export interface FileData {
  path: string;
  name: string;
  text: string;
  hash: string;
  mtimeMs: number;
  /** Line ending of the file on disk; `text` is always normalised to LF. */
  eol: '\n' | '\r\n';
}

export type CloseDecision = 'save' | 'discard' | 'cancel';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'All files', extensions: ['*'] },
];

let tmpCounter = 0;

export const hashText = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export async function readTextFile(p: string): Promise<FileData> {
  const raw = await fs.readFile(p, 'utf8');
  const st = await fs.stat(p);
  // The editor works in LF; remember the file's convention so Save writes it back
  // unchanged (a CRLF file saved as LF shows as fully modified in git).
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lf = (raw.match(/\n/g) ?? []).length - crlf;
  const eol: '\n' | '\r\n' = crlf > lf ? '\r\n' : '\n';
  const text = raw.replace(/\r\n/g, '\n');
  return {
    path: p,
    name: path.basename(p),
    eol,
    text,
    hash: hashText(text),
    mtimeMs: st.mtimeMs,
  };
}

/** Write to a sibling temp file, flush it, then rename over the target (ENGINEERING). */
const writeQueues = new Map<string, Promise<unknown>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Write to a sibling temp file, flush it, then rename over the target (ENGINEERING).
 * Writes to one path are serialised (two windows save the session at once) and the
 * rename is retried on the transient EPERM/EBUSY Windows reports when the target is
 * momentarily held by another replace, an antivirus scan or the search indexer.
 */
export async function writeTextFileAtomic(
  p: string,
  text: string,
  eol: '\n' | '\r\n' = '\n',
): Promise<{ hash: string; mtimeMs: number }> {
  // The hash is always of the LF-normalised text, matching readTextFile.
  const normalised = text.replace(/\r\n/g, '\n');
  const onDisk =
    eol === '\r\n' ? normalised.replace(/\n/g, '\r\n') : normalised;
  const key = path.resolve(p);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => writeNow(p, onDisk));
  writeQueues.set(key, run);
  try {
    const { mtimeMs } = await run;
    return { hash: hashText(normalised), mtimeMs };
  } finally {
    if (writeQueues.get(key) === run) writeQueues.delete(key);
  }
}

async function writeNow(
  p: string,
  text: string,
): Promise<{ hash: string; mtimeMs: number }> {
  const tmp = path.join(
    path.dirname(p),
    `.${path.basename(p)}.md-tmp-${process.pid}-${++tmpCounter}`,
  );
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  const delays = [20, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, p);
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY') && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
  const st = await fs.stat(p);
  return { hash: hashText(text), mtimeMs: st.mtimeMs };
}

export function registerFileHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('file:openDialog', async (): Promise<FileData[]> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile', 'multiSelections'],
      filters: MARKDOWN_FILTERS,
    });
    if (result.canceled) return [];
    return Promise.all(result.filePaths.map(readTextFile));
  });

  ipcMain.handle('file:read', (_e, p: string) => readTextFile(p));

  ipcMain.handle(
    'file:save',
    (_e, args: { path: string; text: string; eol?: '\n' | '\r\n' }) =>
      writeTextFileAtomic(args.path, args.text, args.eol ?? '\n'),
  );

  ipcMain.handle(
    'file:saveAsDialog',
    async (
      _e,
      args: { suggestedName: string; text: string; eol?: '\n' | '\r\n' },
    ): Promise<FileData | null> => {
      const win = getWindow();
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        defaultPath: args.suggestedName,
        filters: MARKDOWN_FILTERS,
      });
      if (result.canceled || !result.filePath) return null;
      const { hash, mtimeMs } = await writeTextFileAtomic(
        result.filePath,
        args.text,
        args.eol ?? '\n',
      );
      return {
        path: result.filePath,
        name: path.basename(result.filePath),
        text: args.text,
        eol: args.eol ?? '\n',
        hash,
        mtimeMs,
      };
    },
  );

  // The one modal dialog in the app (D-21, R-13): closing unsaved work.
  ipcMain.handle(
    'dialog:confirmClose',
    async (_e, args: { name: string }): Promise<CloseDecision> => {
      const win = getWindow();
      const { response } = await dialog.showMessageBox(win ?? undefined!, {
        type: 'question',
        title: 'Unsaved changes',
        message: `Save changes to ${args.name}?`,
        detail: 'If you do not save, your changes will be lost.',
        buttons: ['Save', "Don't save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      return (['save', 'discard', 'cancel'] as const)[response];
    },
  );
}
