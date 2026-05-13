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
     LEFT JOIN user_exercise_assignments uea
       ON uea.exercise_id = e.id AND uea.user_id = $1
     LEFT JOIN checklist_entries ce
       ON ce.exercise_id = e.id
      AND ce.user_id = $1
      AND ce.entry_date = $2
     WHERE e.is_active = TRUE
       AND (e.type IS NULL OR e.type = 'home')
       AND (
         COALESCE(array_length(COALESCE(uea.schedule, e.schedule), 1), 0) = 0
         OR EXTRACT(DOW FROM $2::date)::int = ANY(COALESCE(uea.schedule, e.schedule))
       )
       AND (
         NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
         OR uea.user_id IS NOT NULL
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

// GET /api/exercises — list active HOME exercises for the current user
// Returns global exercises + exercises explicitly assigned to this user
// The schedule field reflects the user's personal schedule (uea.schedule) when assigned,
// or the exercise's global schedule otherwise.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.name, e.emoji, e.sets, e.reps, e.unit, e.xp_reward,
              e.order_index, e.is_active, e.is_running, e.created_at,
              COALESCE(uea.schedule, e.schedule) AS schedule
       FROM exercises e
       LEFT JOIN user_exercise_assignments uea
         ON uea.exercise_id = e.id AND uea.user_id = $1
       WHERE e.is_active = TRUE
         AND (e.type IS NULL OR e.type = 'home')
         AND (
           NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
           OR uea.user_id IS NOT NULL
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

// NOTE: GET /exercises/gym-assigned was removed in the May 2026 Salle refactor.
// Day-of-week assignment of sessions is gone; the Salle UI now reads
// /exercises/gym-sessions-all for the full session catalogue and lets the
// user pick what they did on a given day (no scheduled "todo" anymore).

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

    // Total completed days: all exercises scheduled for that day's DOW were done
    const totalDays = await db.query(
      `WITH day_counts AS (
         SELECT ce.entry_date,
                COUNT(*) FILTER (WHERE ce.completed) AS done
         FROM checklist_entries ce
         WHERE ce.user_id = $1
         GROUP BY ce.entry_date
       ),
       day_totals AS (
         SELECT dc.entry_date,
                dc.done,
                (SELECT COUNT(*) FROM exercises e2
                 LEFT JOIN LATERAL (
                   SELECT uea.schedule
                   FROM user_exercise_assignments uea
                   WHERE uea.exercise_id = e2.id AND uea.user_id = $1
                   LIMIT 1
                 ) usch ON TRUE
                 WHERE e2.is_active = TRUE
                   AND (
                     COALESCE(array_length(COALESCE(usch.schedule, e2.schedule), 1), 0) = 0
                     OR EXTRACT(DOW FROM dc.entry_date)::int = ANY(COALESCE(usch.schedule, e2.schedule))
                   )
                   AND (
                     NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e2.id)
                     OR usch.schedule IS NOT NULL
                   )
                ) AS total_for_day
         FROM day_counts dc
       )
       SELECT entry_date
       FROM day_totals
       WHERE total_for_day > 0 AND done >= total_for_day
       ORDER BY entry_date DESC`,
      [userId]
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

// GET /api/exercises/gym-sessions-all
// Returns all gym sessions from the DB with their active exercises (no schedule filtering).
// Used by the Records tab to show dynamic session sections.
router.get('/gym-sessions-all', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gs.name, gs.icon, gs.color, gs.order_index,
              COALESCE(
                json_agg(
                  json_build_object('id', e.id, 'name', e.name, 'emoji', e.emoji, 'sets', e.sets, 'reps', e.reps)
                  ORDER BY e.order_index, e.id
                ) FILTER (WHERE e.id IS NOT NULL),
                '[]'::json
              ) AS exercises
       FROM gym_sessions gs
       LEFT JOIN exercises e ON e.gym_session = gs.name AND e.is_active = TRUE AND e.type = 'gym'
       GROUP BY gs.name, gs.icon, gs.color, gs.order_index
       ORDER BY gs.order_index`
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('[exercises] gym-sessions-all', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
