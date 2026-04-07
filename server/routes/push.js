const express   = require('express');
const webpush   = require('web-push');
const db        = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT || 'admin@jugusdo.it'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// GET /api/push/vapid-public-key — public, no auth needed
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Souscription invalide' });
  }
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, updated_at = NOW()`,
    [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
  res.json({ ok: true });
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

// Send daily reminder to all subscribers
async function sendDailyReminder() {
  let rows;
  try {
    const result = await db.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
    rows = result.rows;
  } catch (err) {
    console.error('❌ Push: DB error', err.message);
    return;
  }

  const payload = JSON.stringify({
    title: 'JuGus Do-It 💪',
    body:  'Rappel : faites vos exercices du jour !',
    url:   '/',
  });

  const dead = [];
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
    } catch (err) {
      // 404/410 = subscription expired, remove it
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(row.endpoint);
      } else {
        console.warn('Push send error:', err.message);
      }
    }
  }

  if (dead.length > 0) {
    await db.query(
      'DELETE FROM push_subscriptions WHERE endpoint = ANY($1)',
      [dead],
    );
  }

  console.log(`✅ Daily push sent to ${rows.length - dead.length}/${rows.length} subscribers`);
}

module.exports = { router, sendDailyReminder };
