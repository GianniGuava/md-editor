/**
 * Map between Markdown source and the text the preview renders (character-level
 * cursor sync). Pure functions; the syntax-tree walk that produces `skips` lives in
 * editor.ts and the DOM walk in preview.ts.
 *
 * The visible text of a block is its source with markup ranges removed, escapes and
 * entities counted as one character, whitespace trimmed at line starts/ends and
 * around table-cell boundaries. This mirrors what markdown-it emits closely enough
 * for prose, headings, lists, quotes, emphasis, code spans, links and tables.
 */

export interface SkipRange {
  from: number;
  to: number;
  /** Characters this range still contributes (1 for an escape or entity). */
  keep?: number;
  /** A table-cell boundary: whitespace on both sides is trimmed. */
  boundary?: boolean;
}

export interface VisibleMap {
  /** The text the preview should contain for this block. */
  visible: string;
  /** For each visible character, its absolute source position. */
  srcIndex: number[];
  /** Absolute source position just after the block's content. */
  end: number;
}

export function buildVisibleMap(
  source: string,
  base: number,
  skips: SkipRange[],
  end: number,
): VisibleMap {
  const sorted = [...skips].sort((a, b) => a.from - b.from);
  const chars: string[] = [];
  const idx: number[] = [];
  // Trim points: whitespace is dropped backwards from `back` and forwards from `fwd`.
  const cuts: { back: number; fwd: number }[] = [];
  let k = 0;
  for (let i = 0; i < source.length; i++) {
    const pos = base + i;
    while (k < sorted.length && sorted[k].to <= pos) k++;
    const s = k < sorted.length && pos >= sorted[k].from ? sorted[k] : null;
    if (s) {
      if (s.boundary && pos === s.from)
        cuts.push({ back: chars.length - 1, fwd: chars.length });
      if (s.keep && pos === s.to - 1) {
        chars.push(source[i]);
        idx.push(pos);
      }
      continue;
    }
    if (source[i] === '\n')
      cuts.push({ back: chars.length - 1, fwd: chars.length + 1 });
    chars.push(source[i]);
    idx.push(pos);
  }
  cuts.push({ back: -1, fwd: 0 });
  cuts.push({ back: chars.length - 1, fwd: chars.length });

  const drop = new Set<number>();
  const isWs = (c: string) => c === ' ' || c === '\t';
  for (const c of cuts) {
    for (let j = c.fwd; j < chars.length && isWs(chars[j]); j++) drop.add(j);
    for (let j = c.back; j >= 0 && isWs(chars[j]); j--) drop.add(j);
  }
  let visible = '';
  const srcIndex: number[] = [];
  for (let j = 0; j < chars.length; j++) {
    if (drop.has(j)) continue;
    visible += chars[j];
    srcIndex.push(idx[j]);
  }
  return { visible, srcIndex, end };
}

/** Visible characters before a source position. */
export function visibleOffsetOf(map: VisibleMap, pos: number): number {
  let n = 0;
  while (n < map.srcIndex.length && map.srcIndex[n] < pos) n++;
  return n;
}

/** Source position for a visible offset (clamped to the block). */
export function sourcePosOf(map: VisibleMap, visibleOffset: number): number {
  if (map.srcIndex.length === 0) return map.end;
  if (visibleOffset >= map.srcIndex.length) return map.end;
  return map.srcIndex[Math.max(0, visibleOffset)];
}
