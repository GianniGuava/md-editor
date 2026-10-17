import tokensCss from './styles/tokens.css?raw';
import exportCss from './styles/export.css?raw';
import { buildStandaloneHtml } from './exportHtml';
import { renderMarkdown } from './preview';
import type { Doc } from './documents';
import type { ExportCapabilities, PandocFormat } from '../main/export';

/**
 * Export dialog (PLAN.md step 7.5): a native <dialog> form (not a confirmation, so it
 * does not count against D-21). Lists each format with its dependency status, offers
 * page size for PDF, and has one primary button. Labels carry the shortcut (D-16).
 */

type FormatKey = 'html' | 'pdf' | PandocFormat;

interface FormatRow {
  key: FormatKey;
  label: string;
  description: string;
  needs: 'none' | 'pandoc' | 'pandoc+engine';
}

const FORMATS: FormatRow[] = [
  {
    key: 'html',
    label: 'HTML',
    description: 'Single self-contained file, images inlined.',
    needs: 'none',
  },
  {
    key: 'pdf',
    label: 'PDF',
    description: 'Printed from the preview; no extra software.',
    needs: 'none',
  },
  {
    key: 'docx',
    label: 'Word (.docx)',
    description: 'Via Pandoc.',
    needs: 'pandoc',
  },
  {
    key: 'odt',
    label: 'OpenDocument (.odt)',
    description: 'Via Pandoc.',
    needs: 'pandoc',
  },
  { key: 'epub', label: 'EPUB', description: 'Via Pandoc.', needs: 'pandoc' },
  {
    key: 'rtf',
    label: 'Rich Text (.rtf)',
    description: 'Via Pandoc.',
    needs: 'pandoc',
  },
  {
    key: 'latex',
    label: 'LaTeX (.tex)',
    description: 'Via Pandoc.',
    needs: 'pandoc',
  },
  {
    key: 'pdf-pandoc' as FormatKey,
    label: 'PDF via Pandoc',
    description:
      'Needs Pandoc and a PDF engine (typst, weasyprint, wkhtmltopdf or LaTeX).',
    needs: 'pandoc+engine',
  },
];

export interface ExportDialogHandle {
  open(doc: Doc, text: string): void;
}

export function createExportDialog(
  note: (message: string) => void,
): ExportDialogHandle {
  const dlg = document.createElement('dialog');
  dlg.id = 'export-dialog';
  dlg.setAttribute('aria-labelledby', 'export-title');
  dlg.innerHTML = `
    <form method="dialog" class="export-form">
      <h2 id="export-title">Export</h2>
      <p id="export-doc" class="export-doc"></p>
      <fieldset class="export-formats">
        <legend>Format</legend>
        <div id="export-list"></div>
      </fieldset>
      <div class="export-options">
        <label for="export-pagesize">Page size (PDF)</label>
        <select id="export-pagesize">
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </select>
      </div>
      <p id="export-status" class="export-status" role="status" aria-live="polite"></p>
      <div class="export-actions">
        <button type="button" class="tool" id="export-cancel">Cancel</button>
        <button type="button" class="tool primary" id="export-go">Export…</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const list = dlg.querySelector<HTMLElement>('#export-list')!;
  const docLabel = dlg.querySelector<HTMLElement>('#export-doc')!;
  const statusEl = dlg.querySelector<HTMLElement>('#export-status')!;
  const pageSize = dlg.querySelector<HTMLSelectElement>('#export-pagesize')!;
  const goBtn = dlg.querySelector<HTMLButtonElement>('#export-go')!;
  dlg
    .querySelector('#export-cancel')!
    .addEventListener('click', () => dlg.close());

  // Letter for US-style locales, A4 elsewhere (ENGINEERING default; user-selectable).
  pageSize.value = /^(en-US|en-CA|es-MX|en-PH)$/i.test(navigator.language)
    ? 'Letter'
    : 'A4';

  let current: { doc: Doc; text: string } | null = null;
  let caps: ExportCapabilities | null = null;
  let selected: FormatKey = 'html';

  const renderList = () => {
    list.innerHTML = '';
    for (const f of FORMATS) {
      const available =
        f.needs === 'none' ||
        (f.needs === 'pandoc' && !!caps?.pandoc) ||
        (f.needs === 'pandoc+engine' &&
          !!caps?.pandoc &&
          (caps?.pdfEngines.length ?? 0) > 0);
      const id = `fmt-${f.key}`;
      const row = document.createElement('label');
      row.className = `export-row${available ? '' : ' unavailable'}`;
      row.htmlFor = id;
      const why = available
        ? ''
        : f.needs === 'pandoc+engine' && caps?.pandoc
          ? ' — no PDF engine found on PATH'
          : ' — Pandoc not found';
      row.innerHTML = `
        <input type="radio" name="format" id="${id}" value="${f.key}" ${selected === f.key ? 'checked' : ''} ${available ? '' : 'disabled'}>
        <span class="export-row-text"><strong>${f.label}</strong><span>${f.description}${why}</span></span>`;
      row.querySelector('input')!.addEventListener('change', () => {
        selected = f.key;
        pageSize.disabled = selected !== 'pdf';
      });
      list.appendChild(row);
    }
    if (!caps?.pandoc) {
      const help = document.createElement('div');
      help.className = 'export-help';
      help.innerHTML = `<span>Pandoc adds Word, OpenDocument, EPUB, RTF and LaTeX. Install it with:</span>
        <code>${caps?.installCommand ?? 'winget install JohnMacFarlane.Pandoc'}</code>`;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'tool';
      copy.textContent = 'Copy command';
      copy.addEventListener('click', () => {
        void navigator.clipboard
          .writeText(caps?.installCommand ?? '')
          .then(() => note('Install command copied'));
      });
      help.appendChild(copy);
      list.appendChild(help);
    }
  };

  const htmlFor = (doc: Doc, text: string) =>
    buildStandaloneHtml(
      doc.name.replace(/\.[^.]+$/, ''),
      renderMarkdown(text),
      `${tokensCss}\n${exportCss}`,
    );

  goBtn.addEventListener('click', async () => {
    if (!current) return;
    const { doc, text } = current;
    goBtn.disabled = true;
    statusEl.textContent = 'Exporting…';
    try {
      const base = { docPath: doc.path, name: doc.name };
      let result: {
        ok: boolean;
        path?: string;
        error?: string;
        cancelled?: boolean;
      };
      if (selected === 'html') {
        result = await window.md.export.html({
          ...base,
          html: htmlFor(doc, text),
        });
      } else if (selected === 'pdf') {
        result = await window.md.export.pdf({
          ...base,
          html: htmlFor(doc, text),
          pageSize: pageSize.value as 'A4' | 'Letter',
        });
      } else {
        const format = (
          selected === ('pdf-pandoc' as FormatKey) ? 'pdf' : selected
        ) as PandocFormat;
        result = await window.md.export.pandoc({
          ...base,
          markdown: text,
          format,
          title: doc.name.replace(/\.[^.]+$/, ''),
          pdfEngine: caps?.pdfEngines[0],
        });
      }
      if (result.ok) {
        dlg.close();
        note(`Exported to ${result.path}`);
      } else if (result.cancelled) {
        statusEl.textContent = '';
      } else {
        statusEl.textContent = `Export failed: ${result.error ?? 'unknown error'}`;
      }
    } catch (err) {
      statusEl.textContent = `Export failed: ${(err as Error).message}`;
    } finally {
      goBtn.disabled = false;
    }
  });

  return {
    open(doc, text) {
      current = { doc, text };
      docLabel.textContent = `Document: ${doc.name}`;
      statusEl.textContent = '';
      pageSize.disabled = selected !== 'pdf';
      renderList();
      dlg.showModal();
      void window.md.export.capabilities().then((c) => {
        caps = c;
        renderList();
      });
    },
  };
}
