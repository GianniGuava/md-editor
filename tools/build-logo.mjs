/**
 * Build the MD logo from EB Garamond (SIL OFL 1.1, via @fontsource/eb-garamond):
 *   assets/logo.svg      — "MD" converted to outlines, black on a white square (D-24)
 *   assets/logo-<n>.png  — rasters at 16…512 px (@resvg/resvg-js)
 *   assets/app.ico       — Windows icon (png-to-ico)
 * Run: node tools/build-logo.mjs
 * Outlining removes the runtime dependency on an installed font (PLAN.md step 8.2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');

// Pick a WOFF (opentype.js parses TTF/OTF/WOFF; not WOFF2).
const fontDir = path.join(path.dirname(require.resolve('@fontsource/eb-garamond/package.json')), 'files');
const fontFile = fs
  .readdirSync(fontDir)
  .find((f) => /^eb-garamond-latin-500-normal\.woff$/.test(f)) ??
  fs.readdirSync(fontDir).find((f) => /latin.*normal\.woff$/.test(f));
if (!fontFile) throw new Error(`no EB Garamond .woff in ${fontDir}`);
const bytes = fs.readFileSync(path.join(fontDir, fontFile));
const font = opentype.parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);

const SIZE = 512;
const FONT_SIZE = 300;
const TEXT = 'MD';
const width = font.getAdvanceWidth(TEXT, FONT_SIZE, { kerning: true });
const x = (SIZE - width) / 2;
// Vertically centre on cap height (the glyphs are capitals).
const capHeight = (font.tables.os2?.sCapHeight ?? font.ascender * 0.7) * (FONT_SIZE / font.unitsPerEm);
const y = (SIZE + capHeight) / 2;
const d = font.getPath(TEXT, x, y, FONT_SIZE, { kerning: true }).toPathData(2);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- MD logo. Glyphs: EB Garamond Medium (SIL Open Font License 1.1, see LICENSE-EB-Garamond.txt),
     converted to outlines by tools/build-logo.mjs so no font needs to be installed. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="MD">
  <rect width="${SIZE}" height="${SIZE}" fill="#FFFFFF"/>
  <path fill="#000000" d="${d}"/>
</svg>
`;
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'logo.svg'), svg);

const pngs = [];
for (const px of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
  const file = path.join(assets, `logo-${px}.png`);
  fs.writeFileSync(file, png);
  if (px <= 256) pngs.push(file);
}
const ico = await pngToIco(pngs);
fs.writeFileSync(path.join(assets, 'app.ico'), ico);

const licenseSrc = path.join(path.dirname(require.resolve('@fontsource/eb-garamond/package.json')), 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(assets, 'LICENSE-EB-Garamond.txt'));
}
console.log(`logo built from ${fontFile}: logo.svg, ${pngs.length + 1} PNGs, app.ico`);
