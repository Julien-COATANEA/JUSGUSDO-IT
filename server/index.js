require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db/pool');

const authRoutes = require('./routes/auth');
const exercisesRoutes = require('./routes/exercises');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

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
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });
