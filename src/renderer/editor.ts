import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * CodeMirror 6 editor for Markdown source (PLAN.md step 2.1, multi-document since step 3).
 * One EditorView is shared by all tabs; each tab owns an EditorState, which carries
 * its text, selection and linear undo history (D-20). Switching tabs swaps states.
 *  - Line wrapping; monospace via --font-editor (D-6, R-4); size via --font-size (D-1).
 *  - Markup colouring is subtle and switchable (D-11): evidence for a comprehension
 *    benefit is mixed (Hannebauer 2018 vs Sarkar 2015). Colours are tokens only.
 */

const subtleMarkup = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--link)' },
  { tag: tags.url, color: 'var(--link)' },
  { tag: tags.monospace, backgroundColor: 'var(--surface)' },
  { tag: tags.quote, color: 'var(--text2)' },
  { tag: tags.processingInstruction, color: 'var(--text2)' },
  { tag: tags.meta, color: 'var(--text2)' },
  { tag: tags.contentSeparator, color: 'var(--text2)' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font-editor)',
    fontSize: 'var(--font-size)',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'var(--line-height)',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--text)',
    padding: 'var(--space-3) 0',
  },
  '.cm-line': { padding: '0 var(--space-3)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--selection)' },
  '.cm-activeLine': { backgroundColor: 'var(--surface)' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text2)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface2)' },
  '&.cm-focused': { outline: 'none' }, // focus is shown on the pane border instead
});

export interface EditorHandle {
  view: EditorView;
  /** Build a state for a new document (fresh undo history). */
  createState(text: string): EditorState;
  getState(): EditorState;
  /** Swap the displayed document; the previous state is returned for storage. */
  setState(state: EditorState): EditorState;
  getDoc(): string;
  setHighlight(on: boolean): void;
  /** 1-based number of the first line visible at the top of the editor. */
  topLine(): number;
  /** Scroll so that the given 1-based line sits at the top. */
  scrollToLine(line: number): void;
  /** 1-based line and column of the main cursor. */
  cursor(): { line: number; col: number };
  focus(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  onDocChange: (text: string) => void;
  onCursorChange?: () => void;
}

export function createEditor(opts: EditorOptions): EditorHandle {
  const highlight = new Compartment();
  let highlightOn = true;
  const highlightExt = () =>
    highlightOn ? syntaxHighlighting(subtleMarkup) : [];

  const extensions: Extension = [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    highlight.of(highlightExt()),
    editorTheme,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.contentAttributes.of({
      'aria-label': 'Markdown source',
      spellcheck: 'false',
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onDocChange(update.state.doc.toString());
      if (update.selectionSet || update.docChanged) opts.onCursorChange?.();
    }),
  ];

  const createState = (text: string) =>
    EditorState.create({ doc: text, extensions });

  const view = new EditorView({ state: createState(''), parent: opts.parent });

  return {
    view,
    createState,
    getState: () => view.state,
    setState(state) {
      const previous = view.state;
      view.setState(state);
      // The incoming state may have been created under a different preference.
      view.dispatch({ effects: highlight.reconfigure(highlightExt()) });
      return previous;
    },
    getDoc: () => view.state.doc.toString(),
    setHighlight(on) {
      highlightOn = on;
      view.dispatch({ effects: highlight.reconfigure(highlightExt()) });
    },
    topLine() {
      const block = view.lineBlockAtHeight(
        view.scrollDOM.scrollTop - view.documentPadding.top,
      );
      return view.state.doc.lineAt(block.from).number;
    },
    scrollToLine(line) {
      const n = Math.max(1, Math.min(line, view.state.doc.lines));
      const pos = view.state.doc.line(n).from;
      view.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: 'start' }),
      });
    },
    cursor() {
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      return { line: line.number, col: head - line.from + 1 };
    },
    focus: () => view.focus(),
  };
}
