// ─── HooyoFit Service Worker ─────────────────────────────────────
// Strategy: Network-first for HTML, Cache-first for assets
// Auto-updates: detects new version and notifies the app

const VERSION = 'hooyofit-v3';
const STATIC_CACHE = `${VERSION}-static`;
const DYNAMIC_CACHE = `${VERSION}-dynamic`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ─── INSTALL ──────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: delete old caches, take control ───────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => {
      self.clients.claim();
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION }))
      );
    })
  );
});

// ─── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML → network-first (always fresh)
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(networkFirst(request));
    return;
  }

  // JS/CSS/JSON → stale-while-revalidate
  if (url.pathname.match(/\.(js|css|json|webmanifest)$/)) {
    e.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Images → cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|gif)$/)) {
    e.respondWith(cacheFirst(request));
    return;
  }

  e.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(STATIC_CACHE)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) || caches.match('/index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(DYNAMIC_CACHE)).put(request, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || fetchPromise;
}

// ─── MESSAGE ──────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

