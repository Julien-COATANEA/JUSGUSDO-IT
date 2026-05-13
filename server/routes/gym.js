const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DAILY_GYM_XP = 30;
const ZONE_XP = 30;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayStr() {
  return new Date().toISOString().split('T')[0];
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
      `SELECT id, entry_date, exercise_name, session_name, completed, completed_at
       FROM gym_checklist_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date, session_name, exercise_name`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows });
  } catch (err) {
    console.error('[gym] GET', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/toggle
// body: { exercise_name, session_name, entry_date }
router.post('/toggle', requireAuth, async (req, res) => {
  const { exercise_name, session_name, entry_date } = req.body;
  if (!exercise_name || !session_name || !entry_date) {
    return res.status(400).json({ error: 'exercise_name, session_name et entry_date requis' });
  }
  if (!DATE_REGEX.test(entry_date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  if (entry_date > todayStr()) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    const existing = await db.query(
      `SELECT id, completed FROM gym_checklist_entries
       WHERE user_id = $1 AND entry_date = $2 AND exercise_name = $3`,
      [req.user.id, entry_date, exercise_name]
    );

    let newCompleted;
    if (existing.rows[0]) {
      newCompleted = !existing.rows[0].completed;
      await db.query(
        `UPDATE gym_checklist_entries SET completed = $1, completed_at = $2 WHERE id = $3`,
        [newCompleted, newCompleted ? new Date() : null, existing.rows[0].id]
      );
    } else {
      newCompleted = true;
      await db.query(
        `INSERT INTO gym_checklist_entries (user_id, entry_date, exercise_name, session_name, completed, completed_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())`,
        [req.user.id, entry_date, exercise_name, session_name]
      );
    }

    // Total exercises for that session = currently active gym exercises
    // attached to the session in the catalogue (assignment-free).
    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM exercises
       WHERE type = 'gym' AND is_active = TRUE AND gym_session = $1`,
      [session_name]
    );
    const sessionTotal = totalRes.rows[0]?.total || 0;

    const doneRes = await db.query(
      `SELECT COUNT(*)::int AS done
       FROM gym_checklist_entries
       WHERE user_id = $1 AND entry_date = $2 AND session_name = $3 AND completed = TRUE`,
      [req.user.id, entry_date, session_name]
    );
    const sessionDone = doneRes.rows[0]?.done || 0;

    // XP split: 30 / N per exercise + completion bonus when full.
    // Falls back to flat 30 XP if no exercises remain in the session.
    const baseXP = sessionTotal > 0 ? Math.floor(DAILY_GYM_XP / sessionTotal) : DAILY_GYM_XP;
    const completionBonus = sessionTotal > 0 ? DAILY_GYM_XP - baseXP * sessionTotal : 0;

    let xpDelta = 0;
    if (newCompleted) {
      xpDelta = baseXP;
      if (sessionTotal > 0 && sessionDone === sessionTotal) xpDelta += completionBonus;
    } else {
      xpDelta = -baseXP;
      if (sessionTotal > 0 && sessionDone + 1 === sessionTotal) xpDelta -= completionBonus;
    }

    if (xpDelta !== 0) {
      await db.query(
        `UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2`,
        [xpDelta, req.user.id]
      );
    }

    const userRes = await db.query(`SELECT xp FROM users WHERE id = $1`, [req.user.id]);

    res.json({
      completed: newCompleted,
      xp: userRes.rows[0]?.xp ?? 0,
      xpDelta,
      sessionDone,
      sessionTotal,
    });
  } catch (err) {
    console.error('[gym] toggle', err);
    res.status(500).json({ error: 'Erreur serveur' });
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
      `SELECT id, entry_date, zone_id, completed_at
       FROM gym_zone_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date, zone_id`,
      [req.user.id, start, end]
    );
    res.json({ entries: result.rows });
  } catch (err) {
    console.error('[gym] zone entries', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/gym-checklist/zones/toggle  body: { zone_id, entry_date }
// 30 XP per zone toggled (cumulable with everything else for the day).
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
      `SELECT id FROM gym_zone_entries WHERE user_id = $1 AND entry_date = $2 AND zone_id = $3`,
      [req.user.id, entryDate, zoneId]
    );

    let active;
    let xpDelta;
    if (existing.rows[0]) {
      await db.query('DELETE FROM gym_zone_entries WHERE id = $1', [existing.rows[0].id]);
      active = false;
      xpDelta = -ZONE_XP;
    } else {
      await db.query(
        `INSERT INTO gym_zone_entries (user_id, entry_date, zone_id) VALUES ($1, $2, $3)`,
        [req.user.id, entryDate, zoneId]
      );
      active = true;
      xpDelta = ZONE_XP;
    }

    await db.query(
      `UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2`,
      [xpDelta, req.user.id]
    );
    const userRes = await db.query('SELECT xp FROM users WHERE id = $1', [req.user.id]);

    res.json({ active, xp: userRes.rows[0]?.xp ?? 0, xpDelta });
  } catch (err) {
    console.error('[gym] zone toggle', err);
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

module.exports = router;
