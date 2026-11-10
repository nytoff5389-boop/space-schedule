// Offline support for the calculator only (scope: /calculator/). Network-first, cache fallback.
const CACHE = 'knight-calc-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameScope = url.origin === location.origin && url.pathname.startsWith(new URL('./', self.registration.scope).pathname);
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameScope && !font) return;
  e.respondWith(
    fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
