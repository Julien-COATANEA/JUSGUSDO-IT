// ── Service Worker — JuGus Do-It ─────────────────────────────
const CACHE_NAME = 'jugus-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/logo-ju.png',
  '/js/api.js',
  '/js/router.js',
  '/js/gamification.js',
  '/js/minigame.js',
  '/js/notifications.js',
  '/js/dev-mock.js',
  '/js/pages/login.js',
  '/js/pages/home.js',
  '/js/pages/app.js',
  '/js/pages/admin.js',
  '/js/pages/profile.js',
  '/js/pages/muscu.js',
];

// ── Install: pre-cache critical static assets ──────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to pre-cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// ── Fetch: smart caching strategies ────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // ── API requests: network-first, fallback to cache ────────
  if (url.pathname.startsWith('/api/')) {
    // Mutations (POST/PUT/PATCH/DELETE): network-only
    if (request.method !== 'GET') return;

    // GET: network-first with cache fallback
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a clone for offline fallback
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── Static assets: cache-first ────────────────────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      // Return cached response immediately, update cache in background
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});

// ── Push notifications ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}

  const title   = data.title || 'JuGus Do-It 💪';
  const options = {
    body:     data.body || 'Rappel : faites vos exercices du jour !',
    icon:     data.icon || '/logo-ju.png',
    badge:    data.badge || '/logo-ju.png',
    tag:      data.tag || 'jugus-notification',
    renotify: typeof data.renotify === 'boolean' ? data.renotify : true,
    vibrate:  Array.isArray(data.vibrate) ? data.vibrate : [200, 100, 200],
    data:     { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Open app when notification is tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
