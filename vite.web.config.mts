import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build, defineConfig, type Plugin } from 'vite';

/**
 * Browser build of the renderer (PLAN.md §35): `npm run dev:web`, `npm run build:web`.
 * Root is web/ (its index.html and main.ts); the renderer is imported from src/.
 * Output goes to web/dist, which wrangler.jsonc serves as static assets.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(here, 'package.json'), 'utf8'),
) as { version: string };

/** Serve and emit the logo files from assets/ without a second copy in the repo. */
function logoAssets(): Plugin {
  const files: Record<string, { src: string; type: string }> = {
    'favicon.svg': { src: 'assets/logo.svg', type: 'image/svg+xml' },
    'apple-touch-icon.png': { src: 'assets/logo-180.png', type: 'image/png' },
    'logo-192.png': { src: 'assets/logo-192.png', type: 'image/png' },
    'logo-512.png': { src: 'assets/logo-512.png', type: 'image/png' },
  };
  const read = (name: string) =>
    fs.readFileSync(path.join(here, files[name].src));
  return {
    name: 'md-logo-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].slice(1);
        if (!files[name]) return next();
        res.setHeader('Content-Type', files[name].type);
        res.end(read(name));
      });
    },
    generateBundle() {
      for (const name of Object.keys(files)) {
        this.emitFile({ type: 'asset', fileName: name, source: read(name) });
      }
    },
  };
}

const MANIFEST = {
  name: 'MD',
  short_name: 'MD',
  description: 'Markdown editor with live preview',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#e6e6e6',
  icons: [
    { src: '/logo-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/logo-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

/**
 * Installable web app (PLAN.md §35, D-34): emits manifest.webmanifest, links it from
 * index.html, and compiles web/sw.ts to sw.js with this build's id and asset list.
 * (Workbox was tried first; its generator crashed with SIGILL on the dev machine, and a
 * sixty-line worker is easier to own.) Dev server: no worker is registered.
 */
function webApp(): Plugin {
  return {
    name: 'md-web-app',
    // Last, so the bundle it lists is final: Vite drops CSS-only chunks in its own
    // generateBundle, and listing one made the precache name a file that does not exist
    // (scan finding B-F8).
    enforce: 'post',
    transformIndexHtml: (html) =>
      html.replace(
        '</head>',
        '    <link rel="manifest" href="/manifest.webmanifest" />\n  </head>',
      ),
    async generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(MANIFEST, null, 2),
      });
      // The page itself is cached as "/" only: a direct request for /index.html may be
      // answered with a redirect, and a redirected response cannot serve a navigation
      // (finding B-F6). Everything else in the bundle (assets, icons, manifest) is listed.
      const files = Object.keys(bundle).filter(
        (f) => f !== 'index.html' && !f.endsWith('.map'),
      );
      // The manifest emitted above is not always visible in `bundle` yet; list it anyway.
      if (!files.includes('manifest.webmanifest'))
        files.push('manifest.webmanifest');
      const precache = ['/', ...files.map((f) => `/${f}`)];
      // The id covers every file's content, so a deploy that changes only an icon or the
      // manifest still installs a new worker (check flag B).
      const hash = createHash('sha256');
      for (const f of Object.keys(bundle).sort()) {
        const out = bundle[f];
        hash.update(f).update(out.type === 'chunk' ? out.code : out.source);
      }
      hash.update(JSON.stringify(MANIFEST));
      const buildId = hash.digest('hex').slice(0, 12);
      const out = await build({
        configFile: false,
        logLevel: 'warn',
        define: {
          __BUILD_ID__: JSON.stringify(buildId),
          __PRECACHE__: JSON.stringify(precache),
        },
        build: {
          write: false,
          minify: true,
          lib: {
            entry: path.join(here, 'web/sw.ts'),
            formats: ['es'],
            fileName: () => 'sw.js',
          },
        },
      });
      const chunk = (Array.isArray(out) ? out[0] : out) as {
        output: { code?: string }[];
      };
      const code = chunk.output.find((o) => 'code' in o)?.code;
      if (!code) throw new Error('service worker build produced no code');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

export default defineConfig({
  root: 'web',
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5180, host: true },
  preview: { port: 4180 },
  plugins: [logoAssets(), webApp()],
});
