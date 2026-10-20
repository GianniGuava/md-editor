import type { EditorState } from '@codemirror/state';

/**
 * Document model and store (PLAN.md step 3.1).
 * Each tab owns a CodeMirror EditorState, which carries its text, selection and
 * linear undo history (D-20). `savedText` is what is on disk as far as we know;
 * `dirty` is derived from it. `diskHash`/`mtimeMs` feed the step 4 watcher.
 */

export interface Doc {
  id: string;
  path: string | null;
  name: string;
  state: EditorState;
  savedText: string | null; // null for an untitled document that was never saved
  dirty: boolean;
  diskHash: string | null;
  mtimeMs: number | null;
  scrollTop: number;
  /** Stable id for the draft file in userData/drafts (step 6). */
  draftId: string;
  /** Line ending to write back on Save (the editor always works in LF). */
  eol: '\n' | '\r\n';
}

export interface ClosedDoc {
  path: string | null;
  name: string;
  text: string;
}

export type StoreEvent = 'change';

let nextId = 1;
let untitledCounter = 1;

export class DocStore {
  private docs = new Map<string, Doc>();
  order: string[] = [];
  activeId: string | null = null;
  closed: ClosedDoc[] = []; // most recent last, capped at 10 (D-23 reopen)
  private listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    this.listeners.forEach((cb) => cb());
  }

  get(id: string): Doc | undefined {
    return this.docs.get(id);
  }

  get active(): Doc | null {
    return this.activeId ? (this.docs.get(this.activeId) ?? null) : null;
  }

  list(): Doc[] {
    return this.order.map((id) => this.docs.get(id)!);
  }

  findByPath(p: string): Doc | undefined {
    return this.list().find((d) => d.path === p);
  }

  nextUntitledName(): string {
    return `Untitled-${untitledCounter++}`;
  }

  add(
    doc: Omit<Doc, 'id' | 'dirty' | 'scrollTop' | 'draftId' | 'eol'> & {
      dirty?: boolean;
      draftId?: string;
      eol?: '\n' | '\r\n';
    },
    activate = true,
  ): Doc {
    const full: Doc = {
      ...doc,
      id: String(nextId++),
      dirty: doc.dirty ?? false,
      scrollTop: 0,
      draftId: doc.draftId ?? crypto.randomUUID(),
      eol: doc.eol ?? '\n',
    };
    this.docs.set(full.id, full);
    this.order.push(full.id);
    if (activate || !this.activeId) this.activeId = full.id;
    this.emit();
    return full;
  }

  activate(id: string) {
    if (!this.docs.has(id) || this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  /** Update fields without emitting (used on every keystroke). */
  patch(id: string, fields: Partial<Doc>) {
    const d = this.docs.get(id);
    if (d) Object.assign(d, fields);
  }

  /** Update fields and notify tab bar / title. */
  update(id: string, fields: Partial<Doc>) {
    this.patch(id, fields);
    this.emit();
  }

  remove(id: string, remember = true): Doc | undefined {
    const d = this.docs.get(id);
    if (!d) return undefined;
    if (remember && (d.path || d.state.doc.length > 0)) {
      this.closed.push({
        path: d.path,
        name: d.name,
        text: d.state.doc.toString(),
      });
      if (this.closed.length > 10) this.closed.shift();
    }
    const idx = this.order.indexOf(id);
    this.docs.delete(id);
    this.order.splice(idx, 1);
    if (this.activeId === id) {
      this.activeId = this.order[Math.min(idx, this.order.length - 1)] ?? null;
    }
    this.emit();
    return d;
  }

  popClosed(): ClosedDoc | undefined {
    return this.closed.pop();
  }

  move(id: string, toIndex: number) {
    const from = this.order.indexOf(id);
    if (from < 0) return;
    this.order.splice(from, 1);
    this.order.splice(Math.max(0, Math.min(toIndex, this.order.length)), 0, id);
    this.emit();
  }

  /** Index-based navigation helpers for Ctrl+Tab and Ctrl+1..9. */
  neighbour(offset: 1 | -1): string | null {
    if (!this.activeId || this.order.length === 0) return null;
    const i = this.order.indexOf(this.activeId);
    return this.order[(i + offset + this.order.length) % this.order.length];
  }

  at(index: number): string | null {
    return this.order[index] ?? null;
  }
}
