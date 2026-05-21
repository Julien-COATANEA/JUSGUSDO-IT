const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DAILY_XP_TARGET = 30;
const HOME_DAY_ACTIVE_SQL = `
  SELECT EXISTS(
    SELECT 1
    FROM checklist_entries ce
    JOIN exercises e ON e.id = ce.exercise_id
    WHERE ce.user_id = $1
      AND ce.entry_date = $2
      AND ce.completed = TRUE
      AND e.is_active = TRUE
      AND COALESCE(e.type, 'home') = 'home'
  ) AS is_active`;

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
       AND (e.type IS NULL OR e.type = 'home')`,
    [userId, entryDate]
  );

  return {
    totalEx: parseInt(result.rows[0].total, 10),
    doneCnt: parseInt(result.rows[0].done, 10),
  };
}

async function getHomeDayIsActive(userId, entryDate) {
  const result = await db.query(HOME_DAY_ACTIVE_SQL, [userId, entryDate]);
  return !!result.rows[0]?.is_active;
}

async function syncHomeDayXp(userId, entryDate, wasActive) {
  const isActive = await getHomeDayIsActive(userId, entryDate);
  const xpDelta = (isActive && !wasActive) ? DAILY_XP_TARGET
                : (!isActive && wasActive) ? -DAILY_XP_TARGET
                : 0;

  if (xpDelta !== 0) {
    await db.query(
      'UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2',
      [xpDelta, userId]
    );
  }

  const userRes = await db.query('SELECT xp FROM users WHERE id = $1', [userId]);
  return {
    xp: userRes.rows[0]?.xp ?? 0,
    xpDelta,
    isActive,
  };
}

// GET /api/exercises — list all active HOME exercises.
// Maison activity is no longer filtered by per-user assignment.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.name, e.emoji, e.sets, e.reps, e.unit, e.xp_reward,
              e.order_index, e.is_active, e.is_running, e.created_at,
              e.schedule
       FROM exercises e
       WHERE e.is_active = TRUE
         AND (e.type IS NULL OR e.type = 'home')
       ORDER BY e.order_index ASC, e.id ASC`,
      []
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
    const wasActive = await getHomeDayIsActive(req.user.id, entry_date);

    // Verify exercise exists and is active
    const exCheck = await db.query(
      `SELECT id FROM exercises
       WHERE id = $1 AND is_active = TRUE AND (type IS NULL OR type = 'home')`,
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

    const [progress, xpResult] = await Promise.all([
      getDayProgress(req.user.id, entry_date),
      syncHomeDayXp(req.user.id, entry_date, wasActive),
    ]);

    res.json({
      completed: newCompleted,
      xp: xpResult.xp,
      xpDelta: xpResult.xpDelta,
      dayActive: xpResult.isActive,
      dayComplete: progress.totalEx > 0 && progress.doneCnt === progress.totalEx,
      bonusXP: 0,
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

    const activeDaysRes = await db.query(
      `SELECT DISTINCT ce.entry_date
       FROM checklist_entries ce
       JOIN exercises e ON e.id = ce.exercise_id
       WHERE ce.user_id = $1
         AND ce.completed = TRUE
         AND e.is_active = TRUE
         AND COALESCE(e.type, 'home') = 'home'
       ORDER BY ce.entry_date DESC`,
      [userId]
    );

    const activeDates = new Set(activeDaysRes.rows.map(r => r.entry_date.toISOString().split('T')[0]));

    // Streak now follows days with at least one home activity.
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (activeDates.has(key)) {
        streak++;
      } else if (i === 0) {
        continue; // today not done yet is ok
      } else {
        break;
      }
    }

    res.json({
      totalCompletedDays: activeDates.size,
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
