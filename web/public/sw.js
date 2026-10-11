// TMTechEasy Gate service worker: keeps the Rider View usable with a weak
// or no connection. Mapbox's own map data is not cached here (its terms limit
// that); the browser's normal HTTP cache still applies to it.
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`; // pages saved at install
const STATIC = `static-${VERSION}`; // Next.js build assets (immutable)
const PAGES = `pages-${VERSION}`; // pages visited while online
const TILES = `tiles-${VERSION}`; // our building tiles
const RUNS = `runs-${VERSION}`; // a rider's run, so a reload offline still shows the stops
const KEEP = [SHELL, STATIC, PAGES, TILES, RUNS];
const MAX_TILES = 600;

const PRECACHE = ['/rider', '/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POSTs are queued by the app itself
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Mapbox etc.: browser default

  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith('/api/v1/tiles/')) return event.respondWith(staleWhileRevalidate(req, TILES, MAX_TILES));
  if (/^\/api\/v1\/runs\/[0-9a-f-]{36}$/.test(url.pathname)) return event.respondWith(networkFirst(req, RUNS));
  if (url.pathname.startsWith('/api/')) return; // live data: network only
  if (url.pathname.startsWith('/admin')) return; // private data: never saved on the device
  if (req.mode === 'navigate') return event.respondWith(page(req));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(req, res.clone());
        trim(cache, max);
      }
      return res;
    })
    .catch(() => cached);
  return cached || fresh;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || Response.json({ error: 'OFFLINE', message: 'You are offline.' }, { status: 503 });
  }
}

/**
 * Pages: fresh when online; offline, the saved copy (ignoring ?query), else a
 * redirect to the offline page. (A redirect, not the offline HTML at this URL:
 * Next.js would try to start the wrong page's code and crash.)
 */
async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
    return res;
  } catch {
    const saved = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
    if (saved) return saved;
    if (new URL(req.url).pathname !== '/offline') return Response.redirect('/offline', 302);
    return (await caches.match('/offline')) || new Response('Offline', { status: 503 });
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
