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
      const precache = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/logo-192.png',
        '/logo-512.png',
        ...Object.keys(bundle)
          .filter((f) => f.startsWith('assets/'))
          .map((f) => `/${f}`),
      ];
      const buildId = createHash('sha256')
        .update(precache.join('\n'))
        .digest('hex')
        .slice(0, 12);
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
