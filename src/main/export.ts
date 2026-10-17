import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeTextFileAtomic } from './files';

/**
 * Export (PLAN.md step 7; D-26, VENDOR Electron printToPDF + Pandoc manual).
 *  - HTML: self-contained file; local images under 5 MB are inlined as data URIs.
 *  - PDF: the same HTML rendered in a hidden window and printed with
 *    webContents.printToPDF — no external dependency.
 *  - DOCX / ODT / EPUB / RTF / LaTeX / Pandoc-PDF: shell out to a user-installed
 *    Pandoc; the renderer shows install guidance when it is missing.
 */

const execFileP = promisify(execFile);
const INLINE_IMAGE_MAX = 5 * 1024 * 1024;
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

export interface ExportCapabilities {
  pandoc: string | null; // version line, or null when not found
  pdfEngines: string[]; // engines Pandoc could use, found on PATH
  installCommand: string;
}

export type PandocFormat = 'docx' | 'odt' | 'epub' | 'rtf' | 'latex' | 'pdf';

const PANDOC_FILTERS: Record<PandocFormat, { name: string; ext: string }> = {
  docx: { name: 'Word document', ext: 'docx' },
  odt: { name: 'OpenDocument text', ext: 'odt' },
  epub: { name: 'EPUB e-book', ext: 'epub' },
  rtf: { name: 'Rich Text Format', ext: 'rtf' },
  latex: { name: 'LaTeX source', ext: 'tex' },
  pdf: { name: 'PDF (via Pandoc)', ext: 'pdf' },
};

async function onPath(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileP(cmd, args, {
      windowsHide: true,
      timeout: 8000,
    });
    return stdout.split(/\r?\n/)[0] ?? '';
  } catch {
    return null;
  }
}

export async function probeCapabilities(): Promise<ExportCapabilities> {
  const pandoc = await onPath('pandoc', ['--version']);
  const engines = ['typst', 'weasyprint', 'wkhtmltopdf', 'xelatex', 'pdflatex'];
  const found = await Promise.all(
    engines.map(async (e) =>
      (await onPath(e, ['--version'])) === null ? null : e,
    ),
  );
  return {
    pandoc,
    pdfEngines: found.filter((e): e is string => e !== null),
    installCommand: 'winget install JohnMacFarlane.Pandoc',
  };
}

/** Replace local <img src> references with data URIs (ENGINEERING). */
export async function inlineImages(
  html: string,
  baseDir: string | null,
): Promise<string> {
  const re = /(<img\b[^>]*\bsrc=")([^"]+)(")/gi;
  const matches = Array.from(html.matchAll(re));
  let out = html;
  for (const m of matches) {
    const src = m[2];
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    let file = src.replace(/^file:\/\/\/?/i, '');
    try {
      file = decodeURIComponent(file);
    } catch {
      /* keep as is */
    }
    const abs = path.isAbsolute(file)
      ? file
      : baseDir
        ? path.join(baseDir, file)
        : null;
    if (!abs) continue;
    const mime = MIME[path.extname(abs).toLowerCase()];
    if (!mime) continue;
    try {
      const st = await fs.stat(abs);
      if (st.size > INLINE_IMAGE_MAX) continue;
      const data = (await fs.readFile(abs)).toString('base64');
      out = out.replace(m[0], `${m[1]}data:${mime};base64,${data}${m[3]}`);
    } catch {
      /* missing image: leave the reference */
    }
  }
  return out;
}

const askWhere = async (
  win: BrowserWindow | null,
  suggested: string,
  filter: { name: string; ext: string },
): Promise<string | null> => {
  const r = await dialog.showSaveDialog(win ?? undefined!, {
    defaultPath: suggested,
    filters: [{ name: filter.name, extensions: [filter.ext] }],
  });
  return r.canceled || !r.filePath ? null : r.filePath;
};

const withExt = (docPath: string | null, name: string, ext: string) => {
  const base = (docPath ? path.basename(docPath) : name).replace(
    /\.[^.]+$/,
    '',
  );
  const dir = docPath ? path.dirname(docPath) : app.getPath('documents');
  return path.join(dir, `${base}.${ext}`);
};

async function renderPdf(
  html: string,
  pageSize: 'A4' | 'Letter',
): Promise<Buffer> {
  const tmpDir = path.join(app.getPath('userData'), 'export-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `print-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize,
      margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 }, // inches
      generateDocumentOutline: true,
    });
  } finally {
    win.destroy();
    await fs.rm(tmp, { force: true });
  }
}

export function registerExportHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('export:capabilities', () => probeCapabilities());

  ipcMain.handle(
    'export:html',
    async (_e, a: { html: string; docPath: string | null; name: string }) => {
      const out = await askWhere(
        getWindow(),
        withExt(a.docPath, a.name, 'html'),
        {
          name: 'HTML document',
          ext: 'html',
        },
      );
      if (!out) return { ok: false as const, cancelled: true as const };
      const html = await inlineImages(
        a.html,
        a.docPath ? path.dirname(a.docPath) : null,
      );
      await writeTextFileAtomic(out, html);
      return { ok: true as const, path: out };
    },
  );

  ipcMain.handle(
    'export:pdf',
    async (
      _e,
      a: {
        html: string;
        docPath: string | null;
        name: string;
        pageSize: 'A4' | 'Letter';
      },
    ) => {
      const out = await askWhere(
        getWindow(),
        withExt(a.docPath, a.name, 'pdf'),
        {
          name: 'PDF document',
          ext: 'pdf',
        },
      );
      if (!out) return { ok: false as const, cancelled: true as const };
      const html = await inlineImages(
        a.html,
        a.docPath ? path.dirname(a.docPath) : null,
      );
      const pdf = await renderPdf(html, a.pageSize);
      await fs.writeFile(out, pdf);
      return { ok: true as const, path: out };
    },
  );

  ipcMain.handle(
    'export:pandoc',
    async (
      _e,
      a: {
        markdown: string;
        format: PandocFormat;
        docPath: string | null;
        name: string;
        title: string;
        pdfEngine?: string;
      },
    ) => {
      const filter = PANDOC_FILTERS[a.format];
      if (!filter)
        return { ok: false as const, error: `unknown format ${a.format}` };
      const out = await askWhere(
        getWindow(),
        withExt(a.docPath, a.name, filter.ext),
        filter,
      );
      if (!out) return { ok: false as const, cancelled: true as const };
      const args = [
        '-f',
        'gfm',
        '-t',
        a.format === 'pdf' ? 'pdf' : a.format,
        '-o',
        out,
        '--standalone',
        '--metadata',
        `title=${a.title}`,
      ];
      if (a.docPath) args.push('--resource-path', path.dirname(a.docPath));
      if (a.format === 'pdf' && a.pdfEngine)
        args.push(`--pdf-engine=${a.pdfEngine}`);
      try {
        await new Promise<void>((resolve, reject) => {
          const child = execFile(
            'pandoc',
            args,
            { windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
            (err, _stdout, stderr) =>
              err
                ? reject(new Error(stderr?.toString().trim() || err.message))
                : resolve(),
          );
          child.stdin?.end(a.markdown, 'utf8');
        });
        return { ok: true as const, path: out };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    },
  );
}
