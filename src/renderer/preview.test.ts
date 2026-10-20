import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './preview';

describe('renderMarkdown', () => {
  it('renders CommonMark', () => {
    const html = renderMarkdown('# Title\n\nSome *text*.');
    expect(html).toContain('<h1');
    expect(html).toContain('<em>text</em>');
  });

  it('strips scripts and event handlers from raw HTML', () => {
    const html = renderMarkdown(
      'Hi <script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">x</a>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('forbids form controls and style blocks', () => {
    const html = renderMarkdown(
      '<style>body{display:none}</style><input><button>b</button>',
    );
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
  });

  it('tags blocks with their 1-based source line', () => {
    const html = renderMarkdown('# A\n\npara\n\n```js\nx\n```\n\n- item');
    expect(html).toContain('<h1 data-line="1"');
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain('<pre data-line="5"');
    expect(html).toContain('<ul data-line="9"');
  });

  it('renders footnotes (renumbered in order of appearance) with a list at the end', () => {
    const html = renderMarkdown('Claim.[^3]\n\n[^3]: The note.');
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('href="#fn1"');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('id="fn1"');
    expect(html).toContain('The note.');
    expect(html).toContain('class="footnote-backref"');
  });
});
