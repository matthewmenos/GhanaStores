/**
 * DiDwa service worker - offline-first app shell.
 * Strategy:
 *   - Navigations & static assets: stale-while-revalidate.
 *   - /api/*: network-only (financial data must never be served stale).
 *   - Cash POS sales that fail while offline are queued by the active POS
 *     screen in localStorage and retried when the browser comes back online.
 *   - MoMo sales are never queued: an external payment may already have been
 *     accepted even when the client loses its connection, so the seller must
 *     reconcile that transaction manually before retrying.
 */
const CACHE = 'didwa-v4';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/didwa-logo.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API traffic.
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    // Network-first: always try the live HTML so a new deploy is picked up
    // immediately. The cache is only an offline fallback.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (['image', 'font'].includes(event.request.destination)) {
    // Immutable-ish content: cache first is fine and keeps the shell fast.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(event.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  if (['style', 'script'].includes(event.request.destination)) {
    // Network-first for code. Serving a cached bundle first pins the browser
    // to an older deploy until a later reload, which is exactly the "I fixed it
    // but it still shows the old behaviour" failure mode. The cache remains as
    // an offline fallback.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});
