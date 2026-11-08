import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildPrintCss, lightTokensForPrint, splitStandalone } from './print';
import { buildStandaloneHtml } from '../src/renderer/exportHtml';
import { acceleratorFor } from './commands';
import { cleanName } from './dialogs';

describe('print', () => {
  it('pulls the article and styles out of the standalone export', () => {
    const html = buildStandaloneHtml('T', '<h1>Hi</h1>', '.x{color:red}');
    const { css, body } = splitStandalone(html);
    expect(css).toContain('.x{color:red}');
    expect(body).toBe(
      '<article class="preview-body">\n<h1>Hi</h1>\n</article>',
    );
  });

  it('forces the light palette and the chosen page size, print only', () => {
    // Vitest serves CSS imports as empty strings, so read the tokens from disk here.
    const tokens = fs.readFileSync(
      path.join(__dirname, '../src/renderer/styles/tokens.css'),
      'utf8',
    );
    const light = lightTokensForPrint(tokens);
    expect(light).toMatch(/^:root\[data-theme\]\[data-theme\] \{/);
    expect(light).toContain('--bg: #ffffff');
    const css = buildPrintCss('.x{}', 'Letter', tokens);
    expect(css).toContain('--text: #1a1a1a');
    expect(css.startsWith('@media print {')).toBe(true);
    expect(css).toContain('@page { size: Letter; }');
    expect(css).toContain('#print-root { display: block !important; }');
  });
});

describe('accelerators', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
  it('maps the Electron menu accelerators', () => {
    expect(acceleratorFor(key({ key: 's', ctrlKey: true }))).toEqual({
      name: 'file:save',
    });
    expect(
      acceleratorFor(key({ key: 'S', ctrlKey: true, shiftKey: true })),
    ).toEqual({ name: 'file:saveAs' });
    expect(acceleratorFor(key({ key: 's', metaKey: true }))).toEqual({
      name: 'file:save',
    });
    expect(acceleratorFor(key({ key: 'F3' }))).toEqual({
      name: 'edit:findNext',
    });
    expect(acceleratorFor(key({ key: 'F3', shiftKey: true }))).toEqual({
      name: 'edit:findPrev',
    });
    expect(
      acceleratorFor(key({ key: '+', ctrlKey: true, shiftKey: true })),
    ).toEqual({ name: 'zoom:in' });
    expect(acceleratorFor(key({ key: '\\', ctrlKey: true }))).toEqual({
      name: 'mode:split',
    });
  });
  it('leaves everything else to the editor and the browser', () => {
    expect(acceleratorFor(key({ key: 'z', ctrlKey: true }))).toBeNull();
    expect(acceleratorFor(key({ key: 's' }))).toBeNull();
    expect(
      acceleratorFor(key({ key: 's', ctrlKey: true, altKey: true })),
    ).toBeNull();
  });
});

describe('cleanName', () => {
  it('keeps names usable and adds the suggested extension', () => {
    expect(cleanName(' notes ', 'x.md')).toBe('notes.md');
    expect(cleanName('a/b:c', 'x.md')).toBe('a-b-c.md');
    expect(cleanName('', 'Untitled-1.md')).toBe('Untitled-1.md');
    expect(cleanName('out', 'doc.html')).toBe('out.html');
    expect(cleanName('out.txt', 'doc.md')).toBe('out.txt');
  });
});
