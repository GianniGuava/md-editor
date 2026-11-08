import tokensCss from '../src/renderer/styles/tokens.css?raw';

/**
 * PDF in the browser (PLAN.md §35, D-31): the export HTML the renderer already builds
 * is placed in a print-only root on the page and window.print() is called; on iOS the
 * print sheet offers "Save to Files" as PDF. Electron's printToPDF has no web equivalent.
 */

/** The light token block, with enough specificity to beat the dark and high-contrast themes. */
export function lightTokensForPrint(css: string = tokensCss): string {
  const m = css.match(/:root,\s*:root\[data-theme='light'\]\s*\{([^}]*)\}/);
  return m ? `:root[data-theme][data-theme] {${m[1]}}` : '';
}

export function splitStandalone(html: string): { css: string; body: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const css = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
  const article = doc.querySelector('article.preview-body');
  return { css, body: article ? article.outerHTML : doc.body.innerHTML };
}

export function buildPrintCss(
  css: string,
  pageSize: 'A4' | 'Letter',
  tokens: string = tokensCss,
): string {
  return `@media print {
  body > :not(#print-root) { display: none !important; }
  html, body { display: block !important; height: auto !important; overflow: visible !important; }
  #print-root { display: block !important; }
  ${css}
  ${lightTokensForPrint(tokens)}
  @page { size: ${pageSize}; }
}`;
}

export function printStandalone(html: string, pageSize: 'A4' | 'Letter'): void {
  const { css, body } = splitStandalone(html);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  let style = document.getElementById('print-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'print-style';
    document.head.appendChild(style);
  }
  style.textContent = buildPrintCss(css, pageSize);
  root.innerHTML = body; // already sanitised by DOMPurify in the renderer
  window.print();
}
