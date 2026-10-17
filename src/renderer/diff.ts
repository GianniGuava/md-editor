/**
 * Minimal line diff for the "Show differences" banner action (PLAN.md step 4.3).
 * Classic LCS table; capped so a huge file cannot allocate a huge table (ENGINEERING).
 * Returns null when the inputs are too large to diff.
 */
export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

const MAX_LINES = 4000;

export function diffLines(a: string, b: string): DiffLine[] | null {
  const A = a.split('\n');
  const B = b.split('\n');
  if (A.length > MAX_LINES || B.length > MAX_LINES) return null;

  // Trim common prefix and suffix first; the table only covers the middle.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = A.slice(start, endA);
  const midB = B.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const table = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] =
        midA[i] === midB[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const out: DiffLine[] = A.slice(0, start).map((text) => ({
    kind: 'same',
    text,
  }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ kind: 'same', text: midA[i] });
      i++;
      j++;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      out.push({ kind: 'del', text: midA[i++] });
    } else {
      out.push({ kind: 'add', text: midB[j++] });
    }
  }
  while (i < n) out.push({ kind: 'del', text: midA[i++] });
  while (j < m) out.push({ kind: 'add', text: midB[j++] });
  A.slice(endA).forEach((text) => out.push({ kind: 'same', text }));
  return out;
}
