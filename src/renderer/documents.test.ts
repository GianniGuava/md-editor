import { describe, expect, it } from 'vitest';
import type { EditorState } from '@codemirror/state';
import { DocStore } from './documents';

const fakeState = (text: string) =>
  ({
    doc: { length: text.length, toString: () => text },
  }) as unknown as EditorState;

const add = (
  store: DocStore,
  name: string,
  text = '',
  path: string | null = null,
) =>
  store.add({
    path,
    name,
    state: fakeState(text),
    savedText: path ? text : null,
    diskHash: null,
    mtimeMs: null,
  });

describe('DocStore', () => {
  it('keeps insertion order and activates new docs', () => {
    const s = new DocStore();
    const a = add(s, 'a');
    const b = add(s, 'b');
    expect(s.order).toEqual([a.id, b.id]);
    expect(s.activeId).toBe(b.id);
  });

  it('cycles with neighbour() and jumps with at()', () => {
    const s = new DocStore();
    const a = add(s, 'a');
    const b = add(s, 'b');
    const c = add(s, 'c');
    s.activate(a.id);
    expect(s.neighbour(-1)).toBe(c.id);
    expect(s.neighbour(1)).toBe(b.id);
    expect(s.at(2)).toBe(c.id);
    expect(s.at(5)).toBeNull();
  });

  it('removing the active doc activates its neighbour', () => {
    const s = new DocStore();
    const a = add(s, 'a');
    const b = add(s, 'b');
    const c = add(s, 'c');
    s.activate(b.id);
    s.remove(b.id);
    expect(s.activeId).toBe(c.id);
    s.remove(c.id);
    expect(s.activeId).toBe(a.id);
  });

  it('remembers up to ten closed docs with content and pops the latest', () => {
    const s = new DocStore();
    for (let i = 0; i < 12; i++) {
      const d = add(s, `d${i}`, `text ${i}`);
      s.remove(d.id);
    }
    expect(s.closed).toHaveLength(10);
    expect(s.popClosed()?.text).toBe('text 11');
    const blank = add(s, 'blank', '');
    s.remove(blank.id);
    expect(s.popClosed()?.name).toBe('d10'); // empty untitled docs are not remembered
  });

  it('moves docs and notifies listeners', () => {
    const s = new DocStore();
    const a = add(s, 'a');
    const b = add(s, 'b');
    const c = add(s, 'c');
    let notified = 0;
    s.onChange(() => notified++);
    s.move(c.id, 0);
    expect(s.order).toEqual([c.id, a.id, b.id]);
    expect(notified).toBe(1);
    s.patch(a.id, { dirty: true });
    expect(notified).toBe(1); // patch is silent
    s.update(a.id, { dirty: false });
    expect(notified).toBe(2);
  });
});
