const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — leaderboard (public)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, is_admin, xp,
        (SELECT COUNT(*) FROM checklist_entries ce
          WHERE ce.user_id = users.id
          AND ce.completed = TRUE
          AND ce.entry_date = (
            SELECT entry_date FROM checklist_entries ce2
            WHERE ce2.user_id = users.id AND ce2.completed = TRUE
            GROUP BY entry_date
            HAVING COUNT(*) = (SELECT COUNT(*) FROM exercises WHERE is_active = TRUE)
            ORDER BY entry_date DESC LIMIT 1
          )
        ) as last_full_day_exercises
       FROM users
       ORDER BY xp DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
