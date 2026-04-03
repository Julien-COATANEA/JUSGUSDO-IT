const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — all users with avatar
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, is_admin, xp, avatar
       FROM users
       ORDER BY username ASC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
