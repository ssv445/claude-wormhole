// Service worker for claude-wormhole PWA
// v3 — bust after claude-bridge → claude-wormhole rebrand

// Cache app shell on install
const CACHE_NAME = 'claude-wormhole-v3';
const SHELL_URLS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge all caches and rebuild — no manual version bumps needed.
  // Any change to this file triggers a new SW install, which clears stale content.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  );
  self.clients.claim();
});

// Network-first for HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket and API requests
  if (
    event.request.url.includes('/api/') ||
    event.request.headers.get('upgrade') === 'websocket'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = { title: 'Claude Wormhole', body: 'Claude needs attention' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const tag = data.tag || 'claude-wormhole';

  event.waitUntil(
    // Check if a notification with this tag already exists
    self.registration.getNotifications({ tag }).then((existing) => {
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        data: data,
        // Re-alert when replacing an existing notification with the same tag
        renotify: existing.length > 0,
        vibrate: [200, 100, 200],
      });
    })
  );
});

// Tap notification → open app and switch to the session
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const session = event.notification.data?.session;
  const url = session ? `/?session=${encodeURIComponent(session)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // If app is already open, message it to switch sessions (no reload)
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (session) client.postMessage({ type: 'open-session', session });
          return;
        }
      }
      // Otherwise open new window with session param
      return self.clients.openWindow(url);
    })
  );
});
