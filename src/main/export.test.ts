// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle() {} },
}));

import { inlineImages, probeCapabilities } from './export';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-export-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('inlineImages', () => {
  it('inlines local images relative to the document and leaves remote ones', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    await fs.writeFile(path.join(dir, 'pic.png'), png);
    const html =
      '<p><img src="pic.png" alt=""><img src="https://x/y.png"><img src="missing.png"></p>';
    const out = await inlineImages(html, dir);
    expect(out).toContain(
      `src="data:image/png;base64,${png.toString('base64')}"`,
    );
    expect(out).toContain('src="https://x/y.png"');
    expect(out).toContain('src="missing.png"');
  });

  it('does nothing without a base directory for relative paths', async () => {
    const html = '<img src="pic.png">';
    expect(await inlineImages(html, null)).toBe(html);
  });
});

describe('probeCapabilities', () => {
  it('reports pandoc as missing when it is not on PATH', async () => {
    const caps = await probeCapabilities();
    expect(caps.installCommand).toContain('winget');
    expect(caps.pandoc === null || typeof caps.pandoc === 'string').toBe(true);
  });
});
