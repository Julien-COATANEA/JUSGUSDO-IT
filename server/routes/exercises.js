const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DAILY_XP_TARGET = 30;

async function getDayProgress(userId, entryDate) {
  const result = await db.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE ce.completed = TRUE) AS done
     FROM exercises e
     LEFT JOIN checklist_entries ce
       ON ce.exercise_id = e.id
      AND ce.user_id = $1
      AND ce.entry_date = $2
     WHERE e.is_active = TRUE
       AND (
         COALESCE(array_length(e.schedule, 1), 0) = 0
         OR EXTRACT(DOW FROM $2::date)::int = ANY(e.schedule)
       )
       AND (
         NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
         OR EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id AND user_id = $1)
       )`,
    [userId, entryDate]
  );

  return {
    totalEx: parseInt(result.rows[0].total, 10),
    doneCnt: parseInt(result.rows[0].done, 10),
  };
}

function getDailyXpSplit(totalEx) {
  if (!totalEx || totalEx <= 0) {
    return { baseXP: 0, completionBonus: 0 };
  }

  const baseXP = Math.floor(DAILY_XP_TARGET / totalEx);
  const completionBonus = DAILY_XP_TARGET - (baseXP * totalEx);

  return { baseXP, completionBonus };
}

// GET /api/exercises — list active exercises for the current user
// Returns global exercises + exercises explicitly assigned to this user
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*
       FROM exercises e
       WHERE e.is_active = TRUE
         AND (
           -- Global: no assignments defined for this exercise
           NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
           OR
           -- Or explicitly assigned to this user
           EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id AND user_id = $1)
         )
       ORDER BY e.order_index ASC, e.id ASC`,
      [req.user.id]
    );
    res.json({ exercises: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/checklist?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns checklist entries for the authenticated user in a date range
router.get('/checklist', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Paramètres start et end requis' });
  }
  // Validate date format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start) || !dateRegex.test(end)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }

  try {
    const result = await db.query(
      `SELECT ce.id, ce.exercise_id, ce.entry_date, ce.completed, ce.completed_at
       FROM checklist_entries ce
       WHERE ce.user_id = $1
         AND ce.entry_date BETWEEN $2 AND $3
       ORDER BY ce.entry_date, ce.exercise_id`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/exercises/checklist/toggle
// Toggle a single exercise entry for a given date
router.post('/checklist/toggle', requireAuth, async (req, res) => {
  const { exercise_id, entry_date } = req.body;

  if (!exercise_id || !entry_date) {
    return res.status(400).json({ error: 'exercise_id et entry_date requis' });
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(entry_date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  // Prevent future dates
  const today = new Date().toISOString().split('T')[0];
  if (entry_date > today) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    // Verify exercise exists and is active
    const exCheck = await db.query(
      'SELECT id FROM exercises WHERE id = $1 AND is_active = TRUE',
      [exercise_id]
    );
    if (!exCheck.rows[0]) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }

    // Upsert entry
    const existing = await db.query(
      'SELECT id, completed FROM checklist_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3',
      [req.user.id, exercise_id, entry_date]
    );

    let newCompleted;
    if (existing.rows[0]) {
      newCompleted = !existing.rows[0].completed;
      await db.query(
        'UPDATE checklist_entries SET completed = $1, completed_at = $2 WHERE id = $3',
        [newCompleted, newCompleted ? new Date() : null, existing.rows[0].id]
      );
    } else {
      newCompleted = true;
      await db.query(
        'INSERT INTO checklist_entries (user_id, exercise_id, entry_date, completed, completed_at) VALUES ($1, $2, $3, TRUE, NOW())',
        [req.user.id, exercise_id, entry_date]
      );
    }

    const { totalEx, doneCnt } = await getDayProgress(req.user.id, entry_date);
    const prevDoneCnt = newCompleted ? doneCnt - 1 : doneCnt + 1;
    const { baseXP, completionBonus } = getDailyXpSplit(totalEx);

    // Split XP so a full day always equals 30 XP, regardless of exercise count
    const xpDelta = newCompleted ? baseXP : -baseXP;

    let bonusXP = 0;
    if (totalEx > 0 && newCompleted && doneCnt === totalEx && prevDoneCnt < totalEx) {
      bonusXP = completionBonus;
    } else if (totalEx > 0 && !newCompleted && prevDoneCnt === totalEx && doneCnt < totalEx) {
      bonusXP = -completionBonus;
    }

    const totalXpDelta = xpDelta + bonusXP;
    const updatedUser = await db.query(
      'UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2 RETURNING xp',
      [totalXpDelta, req.user.id]
    );

    res.json({
      completed: newCompleted,
      xp: updatedUser.rows[0].xp,
      xpDelta: totalXpDelta,
      dayComplete: totalEx > 0 && doneCnt === totalEx,
      bonusXP,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/exercises/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Total completed days (all exercises done)
    const activeExCount = await db.query(
      'SELECT COUNT(*) as cnt FROM exercises WHERE is_active = TRUE'
    );
    const totalEx = parseInt(activeExCount.rows[0].cnt);

    const totalDays = await db.query(
      `SELECT entry_date FROM checklist_entries
       WHERE user_id = $1 AND completed = TRUE
       GROUP BY entry_date
       HAVING COUNT(*) >= $2
       ORDER BY entry_date DESC`,
      [userId, totalEx]
    );

    const completedDates = new Set(totalDays.rows.map(r => r.entry_date.toISOString().split('T')[0]));

    // Streak
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (completedDates.has(key)) {
        streak++;
      } else if (i === 0) {
        continue; // today not done yet is ok
      } else {
        break;
      }
    }

    res.json({
      totalCompletedDays: completedDates.size,
      streak,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
