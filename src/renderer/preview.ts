import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

/**
 * Markdown → sanitised HTML for the preview pane (PLAN.md step 2.2).
 *  - markdown-it with raw HTML enabled, then DOMPurify: files on disk are untrusted.
 *  - Every block token that maps to source lines gets data-line="<1-based start line>"
 *    so scroll sync (step 2.5) can pair source lines with rendered blocks.
 */

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
});

// Attach source line numbers to opening block tokens.
md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting === 1) {
      token.attrSet('data-line', String(token.map[0] + 1));
    }
  }
});

// Fenced code blocks and other leaf blocks have no opening token; wrap them.
const defaultFence =
  md.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const line = tokens[idx].map ? tokens[idx].map![0] + 1 : null;
  const html = defaultFence(tokens, idx, options, env, self);
  return line === null
    ? html
    : html.replace(/^<pre/, `<pre data-line="${line}"`);
};

export function renderMarkdown(source: string): string {
  const html = md.render(source);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-line'],
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
  });
}

export interface PreviewHandle {
  /** The scrolling element (for scroll sync). */
  scroller: HTMLElement;
  render(source: string): void;
  /** Rendered blocks with their 1-based source line, in document order. */
  blocks(): { line: number; el: HTMLElement }[];
}

export function createPreview(parent: HTMLElement): PreviewHandle {
  const article = document.createElement('article');
  article.className = 'preview-body';
  parent.appendChild(article);

  return {
    scroller: parent,
    render(source) {
      article.innerHTML = renderMarkdown(source);
    },
    blocks() {
      return Array.from(
        article.querySelectorAll<HTMLElement>('[data-line]'),
      ).map((el) => ({ line: Number(el.dataset.line), el }));
    },
  };
}
