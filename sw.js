// HooyoFit Service Worker
// Deliberately does NOT cache app content — index.html is fetched fresh from
// the network every time, so there's no risk of anyone seeing a stale version
// of the app. This worker exists purely to enable two things the client
// already expects: (1) the update-available lifecycle, and (2) push notifications.

const VERSION = 'hooyofit-sw-v1';

self.addEventListener('install', () => {
  // Don't auto-activate — wait for the client to explicitly say SKIP_WAITING
  // (this is what makes the "Update available" banner + Refresh button work)
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Pass every request straight to the network — no caching layer at all
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', (event) => {
  let data = { title: 'HooyoFit', body: 'Time for your workout! 💪' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // if the payload isn't JSON, fall back to the default text above
  }
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'hooyofit-reminder', // replaces any earlier un-clicked reminder instead of stacking
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
