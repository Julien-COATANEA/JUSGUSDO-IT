require('dotenv').config();

// Fail fast if required env vars are missing
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db/pool');

const authRoutes = require('./routes/auth');
const exercisesRoutes = require('./routes/exercises');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const gymRoutes = require('./routes/gym');

// Push notifications (optional — only enabled when VAPID keys are set)
let pushModule = null;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  pushModule = require('./routes/push');
} else {
  console.warn('⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled.');
}

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gym-checklist', gymRoutes);
if (pushModule) app.use('/api/push', pushModule.router);

// SPA fallback — serve index.html for all non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;

async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
  await db.query(schema);
  console.log('✅ Database schema initialized');
}

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 JuGus Do-It server running on port ${PORT}`);
      if (pushModule) _startPushScheduler();
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });

// ── Push reminder checker — every minute ────────────────────
let _pushSchedulerStarted = false;

function _startPushScheduler() {
  if (_pushSchedulerStarted) return;
  _pushSchedulerStarted = true;

  const tick = async () => {
    try {
      await pushModule.sendDueReminders();
    } catch (err) {
      console.error('❌ Push scheduler error:', err.message);
    }
  };

  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  const msUntilNextMinute = next - now;
  console.log(`⏰ Push reminder checker starts at ${next.toLocaleString('fr-FR')} then runs every minute`);

  tick().catch(() => {});
  setTimeout(() => {
    tick().catch(() => {});
    setInterval(() => {
      tick().catch(() => {});
    }, 60 * 1000);
  }, msUntilNextMinute);
}
