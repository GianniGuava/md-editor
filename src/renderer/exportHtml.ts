/**
 * Standalone HTML document for export and PDF printing (PLAN.md step 7.1–7.2).
 * Styles are the light token set plus a print-oriented subset of the preview rules;
 * no scripts, no external references (images are inlined by the main process).
 */
export function buildStandaloneHtml(
  title: string,
  bodyHtml: string,
  css: string,
): string {
  const safeTitle = title.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="generator" content="MD">
<title>${safeTitle}</title>
<style>
${css}
</style>
</head>
<body>
<article class="preview-body">
${bodyHtml}
</article>
</body>
</html>
`;
}
