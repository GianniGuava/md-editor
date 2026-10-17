// @vitest-environment node
/**
 * CI gate for the palette (PLAN.md step 5.3, D-25): every theme block in tokens.css
 * must satisfy WCAG 2.2 1.4.3 (text), 1.4.11 (UI components) and, for the
 * high-contrast theme, 1.4.6 (7:1). Mirrors tools/contrast_check.py.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const re = new RegExp(
    selector.replace(/[[\]'"=:]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
  );
  const m = css.match(re);
  if (!m) throw new Error(`block not found: ${selector}`);
  const tokens: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const t = line.match(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/);
    if (t) tokens[t[1]] = t[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const themes: [string, string, number][] = [
  [":root[data-theme='light']", 'light', 4.5],
  [":root[data-theme='dark']", 'dark', 4.5],
  [":root[data-theme='hc']", 'high contrast', 7],
];

describe.each(themes)('%s', (selector, _name, textRatio) => {
  const t = block(selector);
  const pairs: [string, string, number][] = [
    ['text', 'bg', textRatio],
    ['text', 'surface', textRatio],
    ['text', 'surface2', textRatio],
    ['text2', 'bg', textRatio],
    ['text2', 'surface', textRatio],
    ['link', 'bg', textRatio],
    ['link', 'surface', textRatio],
    ['on-accent', 'accent', textRatio],
    ['text', 'selection', textRatio],
    ['danger', 'bg', textRatio],
    ['danger', 'surface', textRatio],
    ['accent', 'bg', 3],
    ['border', 'bg', 3],
    ['border', 'surface', 3],
    ['focus', 'bg', 3],
    ['focus', 'surface', 3],
    ['disabled', 'bg', 3],
  ];
  it.each(pairs)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(t[fg], `token --${fg}`).toBeDefined();
    expect(t[bg], `token --${bg}`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
