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
}

export type CloseDecision = 'save' | 'discard' | 'cancel';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'All files', extensions: ['*'] },
];

export const hashText = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export async function readTextFile(p: string): Promise<FileData> {
  const text = await fs.readFile(p, 'utf8');
  const st = await fs.stat(p);
  return {
    path: p,
    name: path.basename(p),
    text,
    hash: hashText(text),
    mtimeMs: st.mtimeMs,
  };
}

/** Write to a sibling temp file, flush it, then rename over the target (ENGINEERING). */
export async function writeTextFileAtomic(
  p: string,
  text: string,
): Promise<{ hash: string; mtimeMs: number }> {
  const tmp = path.join(
    path.dirname(p),
    `.${path.basename(p)}.md-tmp-${process.pid}`,
  );
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, p);
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

  ipcMain.handle('file:save', (_e, args: { path: string; text: string }) =>
    writeTextFileAtomic(args.path, args.text),
  );

  ipcMain.handle(
    'file:saveAsDialog',
    async (
      _e,
      args: { suggestedName: string; text: string },
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
      );
      return {
        path: result.filePath,
        name: path.basename(result.filePath),
        text: args.text,
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
