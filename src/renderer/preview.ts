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
  onBlockClick(
    cb: (line: number, point: { x: number; y: number }) => void,
  ): void;
  /** Draw the caret at a visible-text offset inside the marked block; null removes it. */
  placeCaret(visibleOffset: number | null): void;
  /** Visible-text offset of the character under a screen point within the block at that point. */
  visibleOffsetAt(point: { x: number; y: number }): number | null;
}

export function createPreview(parent: HTMLElement): PreviewHandle {
  const article = document.createElement('article');
  article.className = 'preview-body';
  parent.appendChild(article);

  let clickHandler:
    | ((line: number, point: { x: number; y: number }) => void)
    | null = null;
  article.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('a')) return; // links keep their own behaviour
    const block = target.closest<HTMLElement>('[data-line]');
    if (block && clickHandler) {
      clickHandler(Number(block.dataset.line), { x: e.clientX, y: e.clientY });
    }
  });

  // Text nodes that count towards the visible text of a block: everything except the
  // whitespace markdown-it puts between structural tags, and the caret itself.
  const STRUCTURAL = new Set([
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'UL',
    'OL',
    'SECTION',
    'DIV',
  ]);
  const countedTextNodes = (block: HTMLElement): Text[] => {
    const out: Text[] = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text;
      const parent = t.parentElement;
      if (!parent || parent.closest('.preview-caret')) continue;
      if (STRUCTURAL.has(parent.tagName) && t.data.trim() === '') continue;
      out.push(t);
    }
    return out;
  };
  const removeCaret = () => {
    const old = article.querySelector('.preview-caret');
    if (!old) return;
    const parent = old.parentNode;
    old.remove();
    parent?.normalize(); // re-join the text node the caret split
  };

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
          // Screen rectangles: offsetTop would be relative to the nearest positioned
          // ancestor (a table for its rows), not to the scrolling pane.
          const r = next.getBoundingClientRect();
          const v = parent.getBoundingClientRect();
          if (r.top < v.top || r.bottom > v.bottom) {
            next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        }
      }
    },
    onBlockClick(cb) {
      clickHandler = cb;
    },
    placeCaret(visibleOffset) {
      removeCaret();
      if (visibleOffset === null) return;
      const block = article.querySelector<HTMLElement>('.active-block');
      if (!block) return;
      const nodes = countedTextNodes(block);
      let remaining = visibleOffset;
      let target: Text | null = null;
      let offset = 0;
      for (const t of nodes) {
        if (remaining <= t.length) {
          target = t;
          offset = remaining;
          break;
        }
        remaining -= t.length;
      }
      if (!target) {
        const last = nodes.at(-1);
        if (!last) return;
        target = last;
        offset = last.length;
      }
      const caret = document.createElement('span');
      caret.className = 'preview-caret';
      caret.setAttribute('aria-hidden', 'true');
      const range = document.createRange();
      range.setStart(target, offset);
      range.collapse(true);
      range.insertNode(caret);
    },
    visibleOffsetAt(point) {
      const doc = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      const pos = doc.caretPositionFromPoint?.(point.x, point.y);
      if (!pos) return null;
      const el =
        pos.offsetNode.nodeType === Node.TEXT_NODE
          ? pos.offsetNode.parentElement
          : (pos.offsetNode as Element);
      const block = el?.closest<HTMLElement>('[data-line]');
      if (!block) return null;
      let n = 0;
      for (const t of countedTextNodes(block)) {
        if (t === pos.offsetNode) return n + pos.offset;
        n += t.length;
      }
      return null;
    },
    blocks() {
      return Array.from(
        article.querySelectorAll<HTMLElement>('[data-line]'),
      ).map((el) => ({ line: Number(el.dataset.line), el }));
    },
  };
}
