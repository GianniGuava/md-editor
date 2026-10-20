import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import footnote from 'markdown-it-footnote';

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

// Footnotes ([^1] … [^1]: text) are a Pandoc/PHP-Markdown extension, not CommonMark or
// GFM; the plugin renders superscript links and a numbered list at the end (VENDOR).
md.use(footnote);

// Attach source line numbers to opening block tokens.
md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting === 1) {
      token.attrSet('data-line', String(token.map[0] + 1));
      token.attrSet('data-line-end', String(token.map[1])); // last line, 1-based
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
    : html.replace(
        /^<pre/,
        `<pre data-line="${line}" data-line-end="${tokens[idx].map![1]}"`,
      );
};

export function renderMarkdown(source: string): string {
  const html = md.render(source);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-line', 'data-line-end'],
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
  });
}

export interface PreviewHandle {
  /** The scrolling element (for scroll sync). */
  scroller: HTMLElement;
  render(source: string): void;
  /** Rendered blocks with their 1-based source line, in document order. */
  blocks(): { line: number; el: HTMLElement }[];
  /** Mark the block that contains the given 1-based source line; null clears. */
  highlightLine(line: number | null, keepInView?: boolean): void;
  /** Called with the source line of a block the user clicked (links excluded). */
  onBlockClick(cb: (line: number) => void): void;
}

export function createPreview(parent: HTMLElement): PreviewHandle {
  const article = document.createElement('article');
  article.className = 'preview-body';
  parent.appendChild(article);

  let clickHandler: ((line: number) => void) | null = null;
  article.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('a')) return; // links keep their own behaviour
    const block = target.closest<HTMLElement>('[data-line]');
    if (block && clickHandler) clickHandler(Number(block.dataset.line));
  });

  /** Innermost block whose source range contains the line. */
  const blockFor = (line: number): HTMLElement | null => {
    let best: HTMLElement | null = null;
    for (const el of article.querySelectorAll<HTMLElement>('[data-line]')) {
      const start = Number(el.dataset.line);
      const end = Number(el.dataset.lineEnd ?? start);
      if (start > line) break; // document order
      if (line <= end) best = el; // a later, nested start that still contains the line wins
    }
    return best;
  };

  return {
    scroller: parent,
    render(source) {
      article.innerHTML = renderMarkdown(source);
    },
    highlightLine(line, keepInView = false) {
      const current = article.querySelector<HTMLElement>('.active-block');
      const next = line === null ? null : blockFor(line);
      if (current === next) return;
      current?.classList.remove('active-block');
      if (next) {
        next.classList.add('active-block');
        if (keepInView) {
          const top = next.offsetTop;
          const bottom = top + next.offsetHeight;
          const viewTop = parent.scrollTop;
          const viewBottom = viewTop + parent.clientHeight;
          if (top < viewTop || bottom > viewBottom) {
            next.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    },
    onBlockClick(cb) {
      clickHandler = cb;
    },
    blocks() {
      return Array.from(
        article.querySelectorAll<HTMLElement>('[data-line]'),
      ).map((el) => ({ line: Number(el.dataset.line), el }));
    },
  };
}
