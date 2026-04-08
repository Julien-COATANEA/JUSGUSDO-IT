const express = require('express');
const webpush = require('web-push');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DEFAULT_REMINDER_TIME = '19:00:00';
const DEFAULT_TIME_ZONE = process.env.PUSH_DEFAULT_TIMEZONE || 'Europe/Paris';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT || 'admin@jugusdo.it'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

function normalizeReminderTime(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_REMINDER_TIME;

  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;

  const [, hh, mm, ss = '00'] = match;
  return `${hh}:${mm}:${ss}`;
}

function formatReminderTime(value) {
  return typeof value === 'string' && value.length >= 5 ? value.slice(0, 5) : '19:00';
}

function normalizeTimeZone(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_TIME_ZONE;
  return /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(raw) ? raw : DEFAULT_TIME_ZONE;
}

async function sendPushToRows(rows, payload, { markSent = false } = {}) {
  const dead = [];
  const sentIds = [];
  let sentCount = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      sentCount += 1;
      if (markSent && row.id) sentIds.push(row.id);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(row.endpoint);
      } else {
        console.warn('Push send error:', err.message);
      }
    }
  }

  if (dead.length > 0) {
    await db.query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
  }

  if (markSent && sentIds.length > 0) {
    await db.query(
      `UPDATE push_subscriptions
          SET last_sent_on = (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(time_zone, $2))::date,
              updated_at = NOW()
        WHERE id = ANY($1::int[])`,
      [sentIds, DEFAULT_TIME_ZONE],
    );
  }

  return { total: rows.length, sent: sentCount, dead: dead.length };
}

// GET /api/push/vapid-public-key — public, no auth needed
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// GET /api/push/status
router.get('/status', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(MIN(reminder_time)::text, $2) AS reminder_time,
            COALESCE(MIN(time_zone), $3) AS time_zone
       FROM push_subscriptions
      WHERE user_id = $1`,
    [req.user.id, DEFAULT_REMINDER_TIME, DEFAULT_TIME_ZONE],
  );

  const row = result.rows[0] || { count: 0, reminder_time: DEFAULT_REMINDER_TIME, time_zone: DEFAULT_TIME_ZONE };
  res.json({
    enabled: row.count > 0,
    reminderTime: formatReminderTime(row.reminder_time),
    timeZone: row.time_zone || DEFAULT_TIME_ZONE,
  });
});

// POST /api/push/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  const { subscription, reminderTime, timeZone } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Souscription invalide' });
  }

  const normalizedTime = normalizeReminderTime(reminderTime);
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  if (!normalizedTime) {
    return res.status(400).json({ error: 'Heure de rappel invalide' });
  }

  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, reminder_time, time_zone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, reminder_time = $5, time_zone = $6, updated_at = NOW()`,
    [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, normalizedTime, normalizedTimeZone],
  );

  res.json({ ok: true, reminderTime: formatReminderTime(normalizedTime) });
});

// POST /api/push/preferences
router.post('/preferences', requireAuth, async (req, res) => {
  const normalizedTime = normalizeReminderTime(req.body?.reminderTime);
  const normalizedTimeZone = normalizeTimeZone(req.body?.timeZone);
  if (!normalizedTime) {
    return res.status(400).json({ error: 'Heure de rappel invalide' });
  }

  const result = await db.query(
    'UPDATE push_subscriptions SET reminder_time = $1, time_zone = $2, updated_at = NOW() WHERE user_id = $3',
    [normalizedTime, normalizedTimeZone, req.user.id],
  );

  res.json({
    ok: true,
    updatedSubscriptions: result.rowCount,
    reminderTime: formatReminderTime(normalizedTime),
  });
});

// POST /api/push/test
router.post('/test', requireAuth, async (req, res) => {
  const result = await db.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [req.user.id],
  );

  if (!result.rows.length) {
    return res.status(400).json({ error: 'Active d’abord le rappel sur cet appareil.' });
  }

  const payload = JSON.stringify({
    title: 'Test JuGus Do-It 💪',
    body: 'Les notifications fonctionnent bien sur cet appareil.',
    url: '/',
  });

  const summary = await sendPushToRows(result.rows, payload);
  if (!summary.sent) {
    return res.status(500).json({ error: 'Aucune notification de test n’a pu être envoyée.' });
  }

  res.json({ ok: true, sent: summary.sent });
});

// POST /api/push/unsubscribe
router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint manquant' });

  await db.query(
    'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, req.user.id],
  );
  res.json({ ok: true });
});

// Send daily reminders whose configured time matches the current minute
async function sendDueReminders() {
  const currentTime = new Date().toTimeString().slice(0, 5);

  let rows;
  try {
    const result = await db.query(
      `SELECT id, endpoint, p256dh, auth, reminder_time, time_zone
         FROM push_subscriptions
        WHERE COALESCE(last_sent_on, DATE '1970-01-01') < ((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(time_zone, $1))::date)
          AND TO_CHAR(COALESCE(reminder_time, TIME '19:00'), 'HH24:MI') = TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(time_zone, $1)), 'HH24:MI')`,
      [DEFAULT_TIME_ZONE],
    );
    rows = result.rows;
  } catch (err) {
    console.error('❌ Push: DB error', err.message);
    return;
  }

  if (!rows.length) return;

  const payload = JSON.stringify({
    title: 'JuGus Do-It 💪',
    body: 'Rappel : faites vos exercices du jour !',
    url: '/',
  });

  const summary = await sendPushToRows(rows, payload, { markSent: true });
  console.log(`✅ Daily push sent to ${summary.sent}/${summary.total} subscribers for ${currentTime}`);
}

module.exports = { router, sendDueReminders };
