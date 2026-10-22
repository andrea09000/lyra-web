/* Lyra PWA — always pull the latest app from Vercel; Home icon URL never changes. */
const CACHE = 'lyra-web-shell-v41';

self.addEventListener('install', (event) => {
  // Activate new SW immediately on every deploy
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API / audio — live from network
  if (url.pathname.startsWith('/api/') || request.destination === 'audio') return;

  // Network-first for HTML + JS so Home Screen always gets new deploys
  const isAppShell =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/sw.js' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.startsWith('/_expo/');

  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.mode === 'navigate') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => {
          // Never serve HTML as JS/CSS — that blank-screens the app
          if (request.mode === 'navigate') {
            return caches.match('/').then((hit) => hit || Response.error());
          }
          return caches.match(request).then((hit) => hit || Response.error());
        })
    );
    return;
  }

  // Icons / manifest: network-first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
