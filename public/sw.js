// ── Service Worker — JuGus Do-It ─────────────────────────────

// Handle push events (server-sent notifications)
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

// Minimal install/activate — no caching strategy needed here
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
