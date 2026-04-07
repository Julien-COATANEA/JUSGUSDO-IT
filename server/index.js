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
      if (pushModule) _scheduleDailyPush();
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });

// ── Daily push notification at 00:53 ────────────────────────
function _scheduleDailyPush() {
  const now    = new Date();
  const next   = new Date();
  next.setHours(0, 53, 0, 0);
  if (now >= next) next.setDate(next.getDate() + 1); // already past 00h53 today → schedule tomorrow

  const msUntil = next - now;
  console.log(`⏰ Next exercise reminder scheduled for ${next.toLocaleString('fr-FR')}`);

  setTimeout(async () => {
    await pushModule.sendDailyReminder();
    _scheduleDailyPush(); // reschedule for next day
  }, msUntil);
}
