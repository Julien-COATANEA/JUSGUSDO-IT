const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DAILY_GYM_XP = 30;
const ZONE_XP = 30;
const DEFAULT_GYM_ZONE_SETS = 3;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const GYM_DAY_ACTIVE_SQL = `
  SELECT (
    EXISTS(SELECT 1 FROM gym_checklist_entries WHERE user_id = $1 AND entry_date = $2 AND completed = TRUE)
    OR EXISTS(SELECT 1 FROM gym_zone_entries WHERE user_id = $1 AND entry_date = $2)
  ) AS is_active`;

function todayStr() {
  return new Date().toISOString().split('T')[0];
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

function normalizeZoneSetCount(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return DEFAULT_GYM_ZONE_SETS;
  return Math.min(24, Math.max(1, parsed));
}

function normalizeEntityId(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveGymExercise({ exerciseId, exerciseName, sessionName }) {
  const normalizedExerciseId = normalizeEntityId(exerciseId);
  if (normalizedExerciseId) {
    const result = await db.query(
      `SELECT id, name, gym_session
         FROM exercises
        WHERE id = $1 AND type = 'gym'
        LIMIT 1`,
      [normalizedExerciseId]
    );
    return result.rows[0] || null;
  }

  const trimmedName = String(exerciseName || '').trim();
  const normalizedSessionName = typeof sessionName === 'string' && sessionName.trim()
    ? sessionName.trim()
    : null;
  if (!trimmedName) return null;

  const result = await db.query(
    `SELECT id, name, gym_session
       FROM exercises
      WHERE type = 'gym'
        AND name = $1
        AND gym_session IS NOT DISTINCT FROM $2
      ORDER BY id
      LIMIT 2`,
    [trimmedName, normalizedSessionName]
  );

  if (result.rowCount > 1) {
    const err = new Error('Plusieurs exercices portent ce nom dans cette séance. exercise_id est requis.');
    err.status = 409;
    throw err;
  }

  return result.rows[0] || null;
}

function mapGymEntryRow(row) {
  return {
    ...row,
    exercise_id: normalizeEntityId(row.exercise_id),
    performed_reps: normalizePerformedReps(row.performed_reps),
  };
}

function mapGymZoneEntryRow(row) {
  return {
    ...row,
    set_count: normalizeZoneSetCount(row.set_count),
  };
}

async function getDayIsActive(userId, entryDate) {
  const result = await db.query(GYM_DAY_ACTIVE_SQL, [userId, entryDate]);
  return !!result.rows[0]?.is_active;
}

async function syncGymDayXp(userId, entryDate, wasActive) {
  const isActive = await getDayIsActive(userId, entryDate);
  const xpDelta = (isActive && !wasActive) ? DAILY_GYM_XP
                : (!isActive && wasActive)  ? -DAILY_GYM_XP
                : 0;

  if (xpDelta !== 0) {
    await db.query(
      `UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2`,
      [xpDelta, userId]
    );
  }

  const userRes = await db.query(`SELECT xp FROM users WHERE id = $1`, [userId]);
  return {
    xp: userRes.rows[0]?.xp ?? 0,
    xpDelta,
  };
}

async function saveGymChecklistEntry({ userId, exerciseId, exerciseName, sessionName, entryDate, completed, performedReps }) {
  const normalizedExerciseId = normalizeEntityId(exerciseId);
  if (!normalizedExerciseId) {
    const err = new Error('exercise_id requis');
    err.status = 400;
    throw err;
  }

  const nextPerformedReps = normalizePerformedReps(performedReps);
  const nextCompleted = !!completed || nextPerformedReps.length > 0;
  const wasActive = await getDayIsActive(userId, entryDate);

  const existing = await db.query(
    `SELECT id, completed_at
       FROM gym_checklist_entries
      WHERE user_id = $1 AND entry_date = $2 AND exercise_id = $3`,
    [userId, entryDate, normalizedExerciseId]
  );

  if (existing.rows[0]) {
    await db.query(
      `UPDATE gym_checklist_entries
          SET exercise_id = $1,
              exercise_name = $2,
              session_name = $3,
              completed = $4,
              completed_at = CASE
                WHEN $4 THEN COALESCE(completed_at, NOW())
                ELSE NULL
              END,
              performed_reps = $5
        WHERE id = $6`,
      [normalizedExerciseId, exerciseName, sessionName, nextCompleted, nextPerformedReps, existing.rows[0].id]
    );
  } else if (nextCompleted) {
    await db.query(
      `INSERT INTO gym_checklist_entries (
         user_id,
         entry_date,
         exercise_id,
         exercise_name,
         session_name,
         completed,
         completed_at,
         performed_reps
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, entryDate, normalizedExerciseId, exerciseName, sessionName, nextCompleted, nextCompleted ? new Date() : null, nextPerformedReps]
    );
  }

  const doneRes = await db.query(
    `SELECT COUNT(*)::int AS done
       FROM gym_checklist_entries
      WHERE user_id = $1 AND entry_date = $2 AND session_name = $3 AND completed = TRUE`,
    [userId, entryDate, sessionName]
  );

  const xpResult = await syncGymDayXp(userId, entryDate, wasActive);

  return {
    exercise_id: normalizedExerciseId,
    exercise_name: exerciseName,
    session_name: sessionName,
    completed: nextCompleted,
    performed_reps: nextPerformedReps,
    sessionDone: doneRes.rows[0]?.done || 0,
    sessionTotal: 0,
    ...xpResult,
  };
}

async function saveGymZoneEntry({ userId, zoneId, entryDate, setCount }) {
  const nextSetCount = normalizeZoneSetCount(setCount);
  const wasActive = await getDayIsActive(userId, entryDate);

  const existing = await db.query(
    `SELECT id
       FROM gym_zone_entries
      WHERE user_id = $1 AND entry_date = $2 AND zone_id = $3`,
    [userId, entryDate, zoneId]
  );

  if (existing.rows[0]) {
    await db.query(
      `UPDATE gym_zone_entries
          SET set_count = $1,
              completed_at = NOW()
        WHERE id = $2`,
      [nextSetCount, existing.rows[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO gym_zone_entries (user_id, entry_date, zone_id, set_count)
       VALUES ($1, $2, $3, $4)`,
      [userId, entryDate, zoneId, nextSetCount]
    );
  }

  const xpResult = await syncGymDayXp(userId, entryDate, wasActive);
  return {
    active: true,
    set_count: nextSetCount,
    ...xpResult,
  };
}

// ─── Gym checklist (per-exercise, inside a session) ───────────────────────

// GET /api/gym-checklist?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end || !DATE_REGEX.test(start) || !DATE_REGEX.test(end)) {
    return res.status(400).json({ error: 'Paramètres start et end requis (YYYY-MM-DD)' });
  }
  try {
    const result = await db.query(
      `SELECT id, entry_date, exercise_id, exercise_name, session_name, completed, completed_at, performed_reps
       FROM gym_checklist_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date, session_name, exercise_name`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows.map(mapGymEntryRow) });
  } catch (err) {
    console.error('[gym] GET', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/toggle
// body: { exercise_id?, exercise_name?, session_name, entry_date }
router.post('/toggle', requireAuth, async (req, res) => {
  const { exercise_id, exercise_name, session_name, entry_date } = req.body;
  if ((!exercise_id && !exercise_name) || !session_name || !entry_date) {
    return res.status(400).json({ error: 'exercise_id ou exercise_name, session_name et entry_date requis' });
  }
  if (!DATE_REGEX.test(entry_date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  if (entry_date > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const exercise = await resolveGymExercise({
      exerciseId: exercise_id,
      exerciseName: exercise_name,
      sessionName: session_name,
    });
    if (!exercise) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }

    const existing = await db.query(
      `SELECT completed, performed_reps
         FROM gym_checklist_entries
        WHERE user_id = $1 AND entry_date = $2 AND exercise_id = $3`,
      [req.user.id, entry_date, exercise.id]
    );

    const result = await saveGymChecklistEntry({
      userId: req.user.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sessionName: exercise.gym_session || session_name,
      entryDate: entry_date,
      completed: !(existing.rows[0]?.completed),
      performedReps: existing.rows[0]?.completed ? [] : existing.rows[0]?.performed_reps,
    });

    res.json(result);
  } catch (err) {
    console.error('[gym] toggle', err);
    res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/entry
// body: { exercise_id?, exercise_name?, session_name, entry_date, completed, performed_reps }
router.post('/entry', requireAuth, async (req, res) => {
  const { exercise_id, exercise_name, session_name, entry_date } = req.body;
  if ((!exercise_id && !exercise_name) || !session_name || !entry_date) {
    return res.status(400).json({ error: 'exercise_id ou exercise_name, session_name et entry_date requis' });
  }
  if (!DATE_REGEX.test(entry_date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  if (entry_date > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const exercise = await resolveGymExercise({
      exerciseId: exercise_id,
      exerciseName: exercise_name,
      sessionName: session_name,
    });
    if (!exercise) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }

    const performedReps = normalizePerformedReps(req.body.performed_reps);
    const completed = typeof req.body.completed === 'boolean'
      ? req.body.completed
      : performedReps.length > 0;

    const result = await saveGymChecklistEntry({
      userId: req.user.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sessionName: exercise.gym_session || session_name,
      entryDate: entry_date,
      completed,
      performedReps,
    });

    res.json(result);
  } catch (err) {
    console.error('[gym] entry save', err);
    res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
  }
});

// ─── Work zones (groups + sub-zones) ──────────────────────────────────────

// GET /api/gym-checklist/zones — full zone tree (any authed user can read).
router.get('/zones', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, parent_id, name, icon, color, order_index
       FROM gym_zones
       ORDER BY parent_id NULLS FIRST, order_index, id`
    );
    res.json({ zones: result.rows });
  } catch (err) {
    console.error('[gym] zones list', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/gym-checklist/zones/entries?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/zones/entries', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end || !DATE_REGEX.test(start) || !DATE_REGEX.test(end)) {
    return res.status(400).json({ error: 'Paramètres start et end requis (YYYY-MM-DD)' });
  }
  try {
    const result = await db.query(
      `SELECT id, entry_date, zone_id, completed_at, set_count
       FROM gym_zone_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date, zone_id`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows.map(mapGymZoneEntryRow) });
  } catch (err) {
    console.error('[gym] zone entries', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/zones/toggle  body: { zone_id, entry_date }
// XP for zones: +30 when the day goes inactive → active (first activity), -30 on reverse.
router.post('/zones/toggle', requireAuth, async (req, res) => {
  const zoneId = parseInt(req.body.zone_id, 10);
  const entryDate = req.body.entry_date;
  if (!zoneId || !entryDate || !DATE_REGEX.test(entryDate)) {
    return res.status(400).json({ error: 'zone_id et entry_date (YYYY-MM-DD) requis' });
  }
  if (entryDate > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const zoneRes = await db.query('SELECT id FROM gym_zones WHERE id = $1', [zoneId]);
    if (!zoneRes.rows[0]) return res.status(404).json({ error: 'Zone introuvable' });

    const existing = await db.query(
      `SELECT id, set_count FROM gym_zone_entries WHERE user_id = $1 AND entry_date = $2 AND zone_id = $3`,
      [req.user.id, entryDate, zoneId]
    );
    const wantsActive = typeof req.body.active === 'boolean' ? req.body.active : !existing.rows[0];

    if (!wantsActive) {
      const wasActive = await getDayIsActive(req.user.id, entryDate);
      if (existing.rows[0]) {
        await db.query('DELETE FROM gym_zone_entries WHERE id = $1', [existing.rows[0].id]);
      }
      const xpResult = await syncGymDayXp(req.user.id, entryDate, wasActive);
      return res.json({ active: false, set_count: 0, ...xpResult });
    }

    if (existing.rows[0]) {
      const wasActive = await getDayIsActive(req.user.id, entryDate);
      const xpResult = await syncGymDayXp(req.user.id, entryDate, wasActive);
      return res.json({
        active: true,
        set_count: normalizeZoneSetCount(existing.rows[0].set_count),
        ...xpResult,
      });
    }

    const result = await saveGymZoneEntry({
      userId: req.user.id,
      zoneId,
      entryDate,
      setCount: DEFAULT_GYM_ZONE_SETS,
    });

    res.json(result);
  } catch (err) {
    console.error('[gym] zone toggle', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/zones/entry  body: { zone_id, entry_date, set_count }
router.post('/zones/entry', requireAuth, async (req, res) => {
  const zoneId = parseInt(req.body.zone_id, 10);
  const entryDate = req.body.entry_date;
  if (!zoneId || !entryDate || !DATE_REGEX.test(entryDate)) {
    return res.status(400).json({ error: 'zone_id et entry_date (YYYY-MM-DD) requis' });
  }
  if (entryDate > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const zoneRes = await db.query('SELECT id FROM gym_zones WHERE id = $1', [zoneId]);
    if (!zoneRes.rows[0]) return res.status(404).json({ error: 'Zone introuvable' });

    const result = await saveGymZoneEntry({
      userId: req.user.id,
      zoneId,
      entryDate,
      setCount: req.body.set_count,
    });

    res.json(result);
  } catch (err) {
    console.error('[gym] zone entry save', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Rest day (Salle only) ────────────────────────────────────────────────

// GET /api/gym-checklist/rest-days?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/rest-days', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end || !DATE_REGEX.test(start) || !DATE_REGEX.test(end)) {
    return res.status(400).json({ error: 'Paramètres start et end requis (YYYY-MM-DD)' });
  }
  try {
    const result = await db.query(
      `SELECT entry_date FROM gym_rest_days
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date`,
      [req.user.id, start, end]
    );
    const dates = result.rows.map(r =>
      typeof r.entry_date === 'string'
        ? r.entry_date.split('T')[0]
        : new Date(r.entry_date).toISOString().split('T')[0]
    );
    res.json({ dates });
  } catch (err) {
    console.error('[gym] rest-days', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/rest-day/toggle  body: { entry_date }
router.post('/rest-day/toggle', requireAuth, async (req, res) => {
  const { entry_date } = req.body;
  if (!entry_date || !DATE_REGEX.test(entry_date)) {
    return res.status(400).json({ error: 'entry_date (YYYY-MM-DD) requis' });
  }
  if (entry_date > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }
  try {
    const existing = await db.query(
      `SELECT 1 FROM gym_rest_days WHERE user_id = $1 AND entry_date = $2`,
      [req.user.id, entry_date]
    );
    let active;
    if (existing.rows[0]) {
      await db.query(`DELETE FROM gym_rest_days WHERE user_id = $1 AND entry_date = $2`, [req.user.id, entry_date]);
      active = false;
    } else {
      await db.query(`INSERT INTO gym_rest_days (user_id, entry_date) VALUES ($1, $2)`, [req.user.id, entry_date]);
      active = true;
    }
    res.json({ active });
  } catch (err) {
    console.error('[gym] rest-day toggle', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Stats / calendar ─────────────────────────────────────────────────────

// GET /api/gym-checklist/stats/:id
// New model (no day-of-week assignment). Each day is one of:
//   • is_rest    → toggled rest day
//   • is_active  → at least one exercise completed OR one zone toggled
//   • inactive   → otherwise
// Streaks count consecutive (active OR rest) days; today inactive is grace.
router.get('/stats/:id', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });

  try {
    const calRes = await db.query(
      `WITH cur_monday AS (
         SELECT (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1))::date AS d
       ),
       user_first AS (
         SELECT LEAST(
           COALESCE((SELECT MIN(entry_date) FROM gym_checklist_entries WHERE user_id = $1), CURRENT_DATE),
           COALESCE((SELECT MIN(entry_date) FROM gym_zone_entries     WHERE user_id = $1), CURRENT_DATE),
           COALESCE((SELECT MIN(entry_date) FROM gym_rest_days        WHERE user_id = $1), CURRENT_DATE)
         ) AS first_date
       ),
       bounds AS (
         SELECT
           GREATEST(
             (uf.first_date - (EXTRACT(ISODOW FROM uf.first_date)::int - 1))::date,
             (cm.d - 357)::date
           ) AS start_date,
           (cm.d + 6)::date AS end_date
         FROM cur_monday cm, user_first uf
       ),
       days AS (
         SELECT generate_series(b.start_date, b.end_date, '1 day'::interval)::date AS d
         FROM bounds b
       ),
       ex_done AS (
         SELECT entry_date, COUNT(*)::int AS n
         FROM gym_checklist_entries
         WHERE user_id = $1 AND completed = TRUE
         GROUP BY entry_date
       ),
       zn_done AS (
         SELECT entry_date, COUNT(*)::int AS n
         FROM gym_zone_entries
         WHERE user_id = $1
         GROUP BY entry_date
       ),
       rest AS (
         SELECT entry_date FROM gym_rest_days WHERE user_id = $1
       )
       SELECT d.d::text AS date,
              COALESCE(e.n, 0) AS exercises_done,
              COALESCE(z.n, 0) AS zones_done,
              (r.entry_date IS NOT NULL) AS is_rest
       FROM days d
       LEFT JOIN ex_done e ON e.entry_date = d.d
       LEFT JOIN zn_done z ON z.entry_date = d.d
       LEFT JOIN rest r    ON r.entry_date = d.d
       ORDER BY d.d`,
      [userId]
    );

    const today = todayStr();
    const calendar = calRes.rows.map(r => ({
      date: r.date,
      exercises_done: r.exercises_done,
      zones_done: r.zones_done,
      is_rest: !!r.is_rest,
      is_active: r.exercises_done > 0 || r.zones_done > 0,
    }));
    const calMap = {};
    calendar.forEach(c => { calMap[c.date] = c; });

    // 180-day window for streak.
    const wideRes = await db.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - 179, CURRENT_DATE, '1 day'::interval)::date AS d
       ),
       ex_done AS (
         SELECT entry_date, COUNT(*)::int AS n
         FROM gym_checklist_entries
         WHERE user_id = $1 AND completed = TRUE AND entry_date >= CURRENT_DATE - 179
         GROUP BY entry_date
       ),
       zn_done AS (
         SELECT entry_date, COUNT(*)::int AS n
         FROM gym_zone_entries
         WHERE user_id = $1 AND entry_date >= CURRENT_DATE - 179
         GROUP BY entry_date
       ),
       rest AS (
         SELECT entry_date FROM gym_rest_days
         WHERE user_id = $1 AND entry_date >= CURRENT_DATE - 179
       )
       SELECT d.d::text AS date,
              COALESCE(e.n, 0) AS exercises_done,
              COALESCE(z.n, 0) AS zones_done,
              (r.entry_date IS NOT NULL) AS is_rest
       FROM days d
       LEFT JOIN ex_done e ON e.entry_date = d.d
       LEFT JOIN zn_done z ON z.entry_date = d.d
       LEFT JOIN rest r    ON r.entry_date = d.d
       ORDER BY d.d DESC`,
      [userId]
    );
    const wideMap = {};
    wideRes.rows.forEach(r => {
      wideMap[r.date] = {
        active: r.exercises_done > 0 || r.zones_done > 0,
        rest: !!r.is_rest,
      };
    });

    let currentStreak = 0;
    let bestStreak = 0;
    let running = 0;
    for (let i = 0; i <= 179; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const info = wideMap[key];
      const counted = info && (info.active || info.rest);
      if (counted) {
        running++;
        currentStreak = running;
      } else if (i === 0) {
        // Today inactive: grace period, don't break.
      } else {
        bestStreak = Math.max(bestStreak, running);
        running = 0;
        break;
      }
    }
    bestStreak = Math.max(bestStreak, running, currentStreak);

    const totalsRes = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM gym_checklist_entries WHERE user_id = $1 AND completed = TRUE) AS total_exercises,
         (SELECT COUNT(*)::int FROM gym_zone_entries     WHERE user_id = $1) AS total_zones,
         (SELECT COUNT(*)::int FROM gym_rest_days        WHERE user_id = $1) AS total_rest_days`,
      [userId]
    );

    const activeDaysRes = await db.query(
      `SELECT COUNT(DISTINCT entry_date)::int AS n FROM (
         SELECT entry_date FROM gym_checklist_entries WHERE user_id = $1 AND completed = TRUE
         UNION
         SELECT entry_date FROM gym_zone_entries     WHERE user_id = $1
       ) t`,
      [userId]
    );

    const todayInfo = calMap[today] || { exercises_done: 0, zones_done: 0, is_rest: false, is_active: false };

    res.json({
      stats: {
        calendar,
        total_exercises: totalsRes.rows[0].total_exercises,
        total_zones:     totalsRes.rows[0].total_zones,
        total_rest_days: totalsRes.rows[0].total_rest_days,
        active_days:     activeDaysRes.rows[0].n,
        full_days:       activeDaysRes.rows[0].n,
        best_streak:     bestStreak,
        current_streak:  currentStreak,
        today_exercises_done: todayInfo.exercises_done,
        today_zones_done:     todayInfo.zones_done,
        today_is_rest:        todayInfo.is_rest,
        today_is_active:      todayInfo.is_active,
        // Legacy fields for old callers
        total_completed: totalsRes.rows[0].total_exercises,
        today_done:  todayInfo.exercises_done,
        today_total: 0,
      },
    });
  } catch (err) {
    console.error('[gym] stats', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message, where: err.where, hint: err.hint });
  }
});

// GET /api/gym-checklist/day/:userId/:date
// Detailed activity for a single day: exercises completed, zones toggled, rest flag.
router.get('/day/:userId/:date', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const date   = String(req.params.date || '').trim();
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date invalide' });

  try {
    const [exRes, zRes, restRes] = await Promise.all([
      db.query(
        `SELECT exercise_id, exercise_name, session_name, completed_at, performed_reps
           FROM gym_checklist_entries
          WHERE user_id = $1 AND entry_date = $2 AND completed = TRUE
          ORDER BY completed_at NULLS LAST, exercise_name`,
        [userId, date]
      ),
      db.query(
        `SELECT z.id, z.name, z.icon, z.color, p.name AS parent_name, p.icon AS parent_icon, e.set_count
           FROM gym_zone_entries e
           JOIN gym_zones z ON z.id = e.zone_id
      LEFT JOIN gym_zones p ON p.id = z.parent_id
          WHERE e.user_id = $1 AND e.entry_date = $2
          ORDER BY p.name NULLS FIRST, z.name`,
        [userId, date]
      ),
      db.query(
        `SELECT 1 FROM gym_rest_days WHERE user_id = $1 AND entry_date = $2 LIMIT 1`,
        [userId, date]
      ),
    ]);

    res.json({
      date,
      is_rest: restRes.rowCount > 0,
      exercises: exRes.rows.map(mapGymEntryRow),
      zones: zRes.rows.map(row => ({
        ...row,
        set_count: normalizeZoneSetCount(row.set_count),
      })),
    });
  } catch (err) {
    console.error('[gym] day detail', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

module.exports = router;
