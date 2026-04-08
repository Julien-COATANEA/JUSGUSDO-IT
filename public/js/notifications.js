// ── Push Notifications helper ────────────────────────────────
const Notifications = (() => {
  let _vapidKey = null;
  const DEFAULT_REMINDER_TIME = '19:00';

  function _getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  function _normalizeReminderTime(value) {
    const raw = String(value || '').trim();
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : DEFAULT_REMINDER_TIME;
  }

  function _getBrowserTimeZone() {
    return Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Europe/Paris';
  }

  function _getStoredReminderTime() {
    return _normalizeReminderTime(localStorage.getItem('notifReminderTime') || DEFAULT_REMINDER_TIME);
  }

  function _setStoredReminderTime(value) {
    const normalized = _normalizeReminderTime(value);
    localStorage.setItem('notifReminderTime', normalized);
    return normalized;
  }

  async function _fetchVapidKey() {
    if (_vapidKey) return _vapidKey;
    try {
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return null;
      const { key } = await res.json();
      _vapidKey = key;
      return key;
    } catch (_) {
      return null;
    }
  }

  async function _fetchStatusFromServer() {
    const token = _getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/push/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
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
    if (!isSupported()) return { state: 'unsupported', reminderTime: _getStoredReminderTime() };
    if (Notification.permission === 'denied') return { state: 'denied', reminderTime: _getStoredReminderTime() };

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const serverStatus = await _fetchStatusFromServer();
    const reminderTime = serverStatus?.reminderTime || _getStoredReminderTime();

    if (!sub) {
      return {
        state: 'default',
        reminderTime,
        serverAvailable: serverStatus !== null,
      };
    }
    if (serverStatus?.enabled) {
      return { state: 'subscribed', reminderTime, serverAvailable: true };
    }
    if (serverStatus === null) {
      return { state: 'server-unavailable', reminderTime, serverAvailable: false };
    }
    return { state: 'sync-needed', reminderTime, serverAvailable: true };
  }

  async function subscribe(reminderTime = DEFAULT_REMINDER_TIME) {
    if (!isSupported()) return false;

    const normalizedTime = _setStoredReminderTime(reminderTime);
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const vapidKey = await _fetchVapidKey();
    if (!vapidKey) {
      throw new Error('Les notifications sont indisponibles pour le moment.');
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    const hadExistingSubscription = !!subscription;

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey),
      });
    }

    const token = _getToken();
    const res = await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription,
        reminderTime: normalizedTime,
        timeZone: _getBrowserTimeZone(),
      }),
    });

    if (!res.ok) {
      if (!hadExistingSubscription) {
        await subscription.unsubscribe().catch(() => {});
      }
      let message = 'Impossible d\'activer les notifications.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch (_) {}
      throw new Error(message);
    }

    return true;
  }

  async function unsubscribe() {
    if (!isSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const token = _getToken();
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

  async function updateReminderTime(reminderTime) {
    const normalizedTime = _setStoredReminderTime(reminderTime);
    const status = await currentStatus();
    if (status.state !== 'subscribed') {
      return { ok: true, reminderTime: normalizedTime, savedLocally: true };
    }

    const token = _getToken();
    const res = await fetch('/api/push/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        reminderTime: normalizedTime,
        timeZone: _getBrowserTimeZone(),
      }),
    });

    if (!res.ok) {
      let message = 'Impossible de sauvegarder l\'heure du rappel.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch (_) {}
      throw new Error(message);
    }

    return { ok: true, reminderTime: normalizedTime };
  }

  async function sendTest() {
    const token = _getToken();
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      let message = 'Envoi du test impossible.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch (_) {}
      throw new Error(message);
    }

    return true;
  }

  return {
    isSupported,
    currentStatus,
    subscribe,
    unsubscribe,
    updateReminderTime,
    getReminderTime: _getStoredReminderTime,
    sendTest,
  };
})();

// ── Register service worker on load ─────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('SW registration failed:', err);
  });
}
