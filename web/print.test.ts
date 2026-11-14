import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPrintCss,
  lightTokensForPrint,
  printStandalone,
  splitStandalone,
} from './print';
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
    // Command+S saves on an Apple device (B-F4: Command only there, Control elsewhere).
    expect(acceleratorFor(key({ key: 's', metaKey: true }), true)).toEqual({
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

  it('treats only text extensions as extensions (scan finding A-F9)', () => {
    expect(cleanName('v1.2', 'x.md')).toBe('v1.2.md');
    expect(cleanName('meeting 2026.11.08', 'x.md')).toBe(
      'meeting 2026.11.08.md',
    );
    expect(cleanName('notes.', 'x.md')).toBe('notes.md');
    expect(cleanName('..', 'Untitled-1.md')).toBe('Untitled-1.md');
    expect(cleanName('Notes.MARKDOWN', 'x.md')).toBe('Notes.MARKDOWN');
    expect(cleanName('page.htm', 'doc.html')).toBe('page.htm');
  });
});

describe('printStandalone', () => {
  it('removes the print copy at the next tap or key press after printing', () => {
    const printed: string[] = [];
    window.print = () =>
      void printed.push(
        (document.getElementById('print-root')?.textContent ?? '').trim(),
      );
    printStandalone(buildStandaloneHtml('T', '<h1>Exported</h1>', ''), 'A4');
    expect(printed).toEqual(['Exported']);
    // Still there while the print sheet may be open.
    expect(document.getElementById('print-root')).not.toBeNull();
    window.dispatchEvent(new Event('pointerdown'));
    expect(document.getElementById('print-root')).toBeNull();
    expect(document.getElementById('print-style')).toBeNull();
  });
});
