// ── Push Notifications helper ────────────────────────────────
const Notifications = (() => {
  let _vapidKey = null;

  async function _fetchVapidKey() {
    if (_vapidKey) return _vapidKey;
    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) return null;
    const { key } = await res.json();
    _vapidKey = key;
    return key;
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding  = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData  = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async function currentStatus() {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'default';
  }

  async function subscribe() {
    if (!isSupported()) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const vapidKey = await _fetchVapidKey();
    if (!vapidKey) return false;

    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: _urlBase64ToUint8Array(vapidKey),
    });

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const res = await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription }),
    });
    return res.ok;
  }

  async function unsubscribe() {
    if (!isSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    await fetch('/api/push/unsubscribe', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }

  return { isSupported, currentStatus, subscribe, unsubscribe };
})();

// ── Register service worker on load ─────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('SW registration failed:', err);
  });
}
