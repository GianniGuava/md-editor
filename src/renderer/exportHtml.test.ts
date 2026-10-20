import { describe, expect, it } from 'vitest';
import { buildStandaloneHtml } from './exportHtml';
import { renderMarkdown } from './preview';

describe('buildStandaloneHtml', () => {
  it('wraps sanitised body in a self-contained document with the title escaped', () => {
    const body = renderMarkdown('# Hi\n\n<script>x()</script>para');
    const html = buildStandaloneHtml(
      'A <b> "quoted" & title',
      body,
      'p{margin:0}',
    );
    expect(html).toContain(
      '<title>A &lt;b&gt; &quot;quoted&quot; &amp; title</title>',
    );
    expect(html).toContain('<style>\np{margin:0}\n</style>');
    expect(html).toContain('<h1 data-line="1" data-line-end="1">Hi</h1>');
    expect(html).not.toContain('<script');
    expect(html).toContain("default-src 'none'");
  });
});
