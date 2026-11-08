/**
 * Service worker for the browser build (PLAN.md §35, D-34). Generated into sw.js by the
 * `webApp` plugin in vite.web.config.mts, which fills in the build id and asset list.
 *  - Hashed assets are precached and served cache-first: their names change per build.
 *  - Navigations go network-first so a new deploy shows up on the next open, with the
 *    cached page as the offline fallback (the app shell).
 *  - A new build takes over at once (skipWaiting + clients.claim); old caches are dropped.
 */
// The project compiles with the DOM library; these are the worker-side shapes it uses.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface WorkerScope {
  addEventListener(
    type: 'install' | 'activate',
    cb: (e: ExtendableEvent) => void,
  ): void;
  addEventListener(type: 'fetch', cb: (e: FetchEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: Location;
}
declare const self: WorkerScope;
declare const __BUILD_ID__: string;
declare const __PRECACHE__: string[];

export {};

const CACHE = `md-${__BUILD_ID__}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
