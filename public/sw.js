// Service worker for claude-wormhole PWA
// v4 — no caching, push notifications only
// Why: stale cached JS caused input-breaking bugs on iOS PWA.
// Next.js handles its own asset caching via hashed filenames.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ALL existing caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// No fetch handler — let all requests go to network directly

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
