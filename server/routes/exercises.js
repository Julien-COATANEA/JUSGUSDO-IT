const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DAILY_XP_TARGET = 30;
const DEFAULT_HOME_RUNNING_DISTANCE_KM = 1;
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

function normalizePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(9999, Math.max(1, parsed));
}

function normalizePerformedReps(value) {
  const rawValues = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[^0-9]+/) : []);

  return rawValues
    .map(item => parseInt(item, 10))
    .filter(item => Number.isInteger(item) && item > 0 && item <= 9999)
    .slice(0, 24);
}

function normalizePerformedDistanceKm(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999.9) return null;
  return Math.round(parsed * 10) / 10;
}

function buildDefaultHomePerformedReps(exerciseRow) {
  const sets = normalizePositiveInt(exerciseRow?.sets, 1);
  const reps = normalizePositiveInt(exerciseRow?.reps, 10);
  return Array.from({ length: Math.min(24, sets) }, () => reps);
}

function buildDefaultHomeDistanceKm(exerciseRow) {
  if (exerciseRow?.unit === 'km') {
    return normalizePerformedDistanceKm(exerciseRow?.reps) ?? DEFAULT_HOME_RUNNING_DISTANCE_KM;
  }
  return DEFAULT_HOME_RUNNING_DISTANCE_KM;
}

function mapChecklistEntryRow(row) {
  return {
    ...row,
    performed_reps: normalizePerformedReps(row.performed_reps),
    performed_distance_km: normalizePerformedDistanceKm(row.performed_distance_km),
  };
}

async function getHomeDayDetailForUser(userId, entryDate) {
  const result = await db.query(
    `SELECT ce.id,
            ce.exercise_id,
            ce.entry_date,
            ce.completed,
            ce.completed_at,
            ce.performed_reps,
            ce.performed_distance_km,
            COALESCE(e.name, 'Exercice supprimé') AS name,
            COALESCE(e.emoji, '💪') AS emoji,
            e.sets,
            e.reps,
            e.unit,
            COALESCE(e.is_running, FALSE) AS is_running,
            COALESCE(e.is_active, FALSE) AS is_active
     FROM checklist_entries ce
     LEFT JOIN exercises e ON e.id = ce.exercise_id
     WHERE ce.user_id = $1
       AND ce.entry_date = $2
       AND ce.completed = TRUE
     ORDER BY ce.completed_at NULLS LAST, ce.id`,
    [userId, entryDate]
  );

  return {
    date: entryDate,
    exercises: result.rows.map(mapChecklistEntryRow),
  };
}

function resolveHomePerformance(exerciseRow, performedReps, performedDistanceKm) {
  if (exerciseRow?.is_running) {
    return {
      performedReps: [],
      performedDistanceKm: normalizePerformedDistanceKm(performedDistanceKm) ?? buildDefaultHomeDistanceKm(exerciseRow),
    };
  }

  const nextPerformedReps = normalizePerformedReps(performedReps);
  return {
    performedReps: nextPerformedReps.length ? nextPerformedReps : buildDefaultHomePerformedReps(exerciseRow),
    performedDistanceKm: null,
  };
}

async function saveChecklistEntry({ userId, exerciseRow, entryDate, completed, performedReps, performedDistanceKm }) {
  const nextCompleted = !!completed;
  const wasActive = await getHomeDayIsActive(userId, entryDate);
  const performance = nextCompleted
    ? resolveHomePerformance(exerciseRow, performedReps, performedDistanceKm)
    : { performedReps: [], performedDistanceKm: null };

  const existing = await db.query(
    `SELECT id
       FROM checklist_entries
      WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3`,
    [userId, exerciseRow.id, entryDate]
  );

  if (existing.rows[0]) {
    await db.query(
      `UPDATE checklist_entries
          SET completed = $1,
              completed_at = CASE WHEN $1 THEN COALESCE(completed_at, NOW()) ELSE NULL END,
              performed_reps = $2,
              performed_distance_km = $3
        WHERE id = $4`,
      [nextCompleted, performance.performedReps, performance.performedDistanceKm, existing.rows[0].id]
    );
  } else if (nextCompleted) {
    await db.query(
      `INSERT INTO checklist_entries (
         user_id,
         exercise_id,
         entry_date,
         completed,
         completed_at,
         performed_reps,
         performed_distance_km
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, exerciseRow.id, entryDate, true, new Date(), performance.performedReps, performance.performedDistanceKm]
    );
  }

  const [progress, xpResult] = await Promise.all([
    getDayProgress(userId, entryDate),
    syncHomeDayXp(userId, entryDate, wasActive),
  ]);

  return {
    completed: nextCompleted,
    performed_reps: performance.performedReps,
    performed_distance_km: performance.performedDistanceKm,
    xp: xpResult.xp,
    xpDelta: xpResult.xpDelta,
    dayActive: xpResult.isActive,
    dayComplete: progress.totalEx > 0 && progress.doneCnt === progress.totalEx,
    bonusXP: 0,
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
      `SELECT ce.id, ce.exercise_id, ce.entry_date, ce.completed, ce.completed_at,
              ce.performed_reps, ce.performed_distance_km
       FROM checklist_entries ce
       WHERE ce.user_id = $1
         AND ce.entry_date BETWEEN $2 AND $3
       ORDER BY ce.entry_date, ce.exercise_id`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows.map(mapChecklistEntryRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/exercises/checklist/day/:date
// Returns the exact completed HOME activity for a given day, including archived exercises.
router.get('/checklist/day/user/:userId/:date', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const entryDate = String(req.params.date || '').trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'ID invalide' });
  }
  if (!dateRegex.test(entryDate)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }

  try {
    res.json(await getHomeDayDetailForUser(userId, entryDate));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/checklist/day/:date', requireAuth, async (req, res) => {
  const entryDate = String(req.params.date || '').trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(entryDate)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }

  try {
    res.json(await getHomeDayDetailForUser(req.user.id, entryDate));
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
      `SELECT id, sets, reps, unit, COALESCE(is_running, FALSE) AS is_running FROM exercises
       WHERE id = $1 AND is_active = TRUE AND (type IS NULL OR type = 'home')`,
      [exercise_id]
    );
    const exerciseRow = exCheck.rows[0];
    if (!exerciseRow) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }

    const existing = await db.query(
      `SELECT id, completed, performed_reps, performed_distance_km
         FROM checklist_entries
        WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3`,
      [req.user.id, exercise_id, entry_date]
    );
    const wantsActive = typeof req.body.active === 'boolean' ? req.body.active : !existing.rows[0]?.completed;

    if (!wantsActive) {
      const result = await saveChecklistEntry({
        userId: req.user.id,
        exerciseRow,
        entryDate: entry_date,
        completed: false,
        performedReps: [],
        performedDistanceKm: null,
      });
      return res.json(result);
    }

    if (existing.rows[0]?.completed) {
      const wasActive = await getHomeDayIsActive(req.user.id, entry_date);
      const [progress, xpResult] = await Promise.all([
        getDayProgress(req.user.id, entry_date),
        syncHomeDayXp(req.user.id, entry_date, wasActive),
      ]);

      return res.json({
        completed: true,
        performed_reps: normalizePerformedReps(existing.rows[0].performed_reps),
        performed_distance_km: normalizePerformedDistanceKm(existing.rows[0].performed_distance_km),
        xp: xpResult.xp,
        xpDelta: xpResult.xpDelta,
        dayActive: xpResult.isActive,
        dayComplete: progress.totalEx > 0 && progress.doneCnt === progress.totalEx,
        bonusXP: 0,
      });
    }

    const result = await saveChecklistEntry({
      userId: req.user.id,
      exerciseRow,
      entryDate: entry_date,
      completed: true,
      performedReps: buildDefaultHomePerformedReps(exerciseRow),
      performedDistanceKm: buildDefaultHomeDistanceKm(exerciseRow),
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/exercises/checklist/entry
// body: { exercise_id, entry_date, performed_reps, performed_distance_km }
router.post('/checklist/entry', requireAuth, async (req, res) => {
  const { exercise_id, entry_date } = req.body;

  if (!exercise_id || !entry_date) {
    return res.status(400).json({ error: 'exercise_id et entry_date requis' });
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(entry_date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  if (entry_date > new Date().toISOString().split('T')[0]) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const exCheck = await db.query(
      `SELECT id, sets, reps, unit, COALESCE(is_running, FALSE) AS is_running
         FROM exercises
        WHERE id = $1 AND is_active = TRUE AND (type IS NULL OR type = 'home')`,
      [exercise_id]
    );
    const exerciseRow = exCheck.rows[0];
    if (!exerciseRow) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }

    const result = await saveChecklistEntry({
      userId: req.user.id,
      exerciseRow,
      entryDate: entry_date,
      completed: true,
      performedReps: req.body.performed_reps,
      performedDistanceKm: req.body.performed_distance_km,
    });

    res.json(result);
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
