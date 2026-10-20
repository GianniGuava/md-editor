import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Match counter for the find panel (user request 2026-10-20): "3 of 12" when the
 * selection is on a match, "12 matches" otherwise, "No matches", or "Invalid pattern"
 * for a broken regular expression. Announced politely to screen readers.
 * Counting stops at MAX so a one-letter search in a huge file stays responsive.
 */
const MAX = 10000;

export function countMatches(
  view: EditorView,
): { total: number; current: number; capped: boolean } | 'invalid' | null {
  const query = getSearchQuery(view.state);
  if (!query.search) return null;
  if (!query.valid) return 'invalid';
  const sel = view.state.selection.main;
  const cursor = query.getCursor(view.state);
  let total = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    total++;
    if (r.value.from === sel.from && r.value.to === sel.to) current = total;
    if (total >= MAX) return { total, current, capped: true };
  }
  return { total, current, capped: false };
}

export function formatCount(c: ReturnType<typeof countMatches>): string {
  if (c === null) return '';
  if (c === 'invalid') return 'Invalid pattern';
  if (c.total === 0) return 'No matches';
  const total = c.capped ? `${c.total}+` : String(c.total);
  if (c.current) return `${c.current} of ${total}`;
  return c.total === 1 && !c.capped ? '1 match' : `${total} matches`;
}

export const searchCount = ViewPlugin.fromClass(
  class {
    el: HTMLElement | null = null;
    pending = false;

    constructor(readonly view: EditorView) {
      this.schedule();
    }

    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.transactions.some((t) => t.effects.length > 0)
      ) {
        this.schedule();
      }
    }

    /** The panel is mounted by another plugin in the same update; render afterwards. */
    schedule() {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.render();
      });
    }

    render() {
      const view = this.view;
      if (!searchPanelOpen(view.state)) {
        this.el = null;
        return;
      }
      const field = view.dom.querySelector<HTMLInputElement>(
        '.cm-panel.cm-search [main-field]',
      );
      if (!field) return;
      if (!this.el || !this.el.isConnected) {
        this.el = document.createElement('span');
        this.el.className = 'cm-search-count';
        this.el.setAttribute('role', 'status');
        this.el.setAttribute('aria-live', 'polite');
        field.insertAdjacentElement('afterend', this.el);
      }
      this.el.textContent = formatCount(countMatches(view));
    }

    destroy() {
      this.el?.remove();
    }
  },
);
