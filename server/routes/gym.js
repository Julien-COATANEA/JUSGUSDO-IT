const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DAILY_GYM_XP = 30;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
  const today = new Date().toISOString().split('T')[0];
  if (entry_date > today) {
    return res.status(400).json({ error: 'Impossible de cocher une date future' });
  }

  try {
    // Get existing entry
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

    // Count exercises in this session for the day to compute XP
    const countRes = await db.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE completed = TRUE) AS done
       FROM gym_checklist_entries
       WHERE user_id = $1 AND entry_date = $2 AND session_name = $3`,
      [req.user.id, entry_date, session_name]
    );
    const totalEx = parseInt(countRes.rows[0].total, 10);
    const doneNow = parseInt(countRes.rows[0].done, 10);

    const baseXP = totalEx > 0 ? Math.floor(DAILY_GYM_XP / totalEx) : 0;
    const completionBonus = DAILY_GYM_XP - baseXP * totalEx;

    let xpDelta = 0;
    if (newCompleted) {
      xpDelta = baseXP;
      if (doneNow === totalEx) xpDelta += completionBonus; // whole session done
    } else {
      xpDelta = -baseXP;
      if (doneNow + 1 === totalEx) xpDelta -= completionBonus; // was full, now partial
    }

    if (xpDelta !== 0) {
      await db.query(
        `UPDATE users SET xp = GREATEST(0, xp + $1) WHERE id = $2`,
        [xpDelta, req.user.id]
      );
    }

    const userRes = await db.query(
      `SELECT xp FROM users WHERE id = $1`,
      [req.user.id]
    );

    res.json({
      completed: newCompleted,
      xp: userRes.rows[0]?.xp ?? 0,
      xpDelta,
      sessionDone: doneNow,
      sessionTotal: totalEx,
    });
  } catch (err) {
    console.error('[gym] toggle', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/:id/gym-stats
router.get('/stats/:id', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });

  try {
    // 28-day calendar aligned to ISO weeks (Mon→Sun), 4 full weeks ending at
    // the Sunday of the current week. Same scheme as the home calendar so the
    // frontend can simply chunk by 7.
    const calRes = await db.query(
      `WITH cur_monday AS (
         SELECT (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1))::date AS d
       ),
       user_first AS (
         SELECT COALESCE(MIN(entry_date), CURRENT_DATE) AS first_date
         FROM gym_checklist_entries WHERE user_id = $1
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
       scheduled AS (
         SELECT d.d AS entry_date,
                (
                  SELECT COUNT(*)::int FROM exercises e
                  JOIN gym_session_assignments gsa
                    ON gsa.session_name = e.gym_session
                   AND gsa.user_id = $1
                  WHERE e.is_active = TRUE
                    AND e.type = 'gym'
                    AND (
                      COALESCE(array_length(gsa.schedule, 1), 0) = 0
                      OR EXTRACT(DOW FROM d.d)::int = ANY(gsa.schedule)
                    )
                ) AS total
         FROM days d
       ),
       done AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE completed = TRUE)::int AS done
         FROM gym_checklist_entries
         WHERE user_id = $1
           AND entry_date >= (SELECT start_date FROM bounds)
           AND entry_date <= (SELECT end_date   FROM bounds)
         GROUP BY entry_date
       )
       SELECT s.entry_date::text AS date,
              s.total,
              COALESCE(d.done, 0) AS done
       FROM scheduled s
       LEFT JOIN done d ON d.entry_date = s.entry_date
       ORDER BY s.entry_date`,
      [userId]
    );

    const today = new Date().toISOString().split('T')[0];
    const calendar = calRes.rows; // already 28 days, Mon-Sun aligned
    const calMap = {};
    calendar.forEach(r => { calMap[r.date] = { done: r.done, total: r.total }; });

    // Wider window (last 180 days) for streak/full-days computation, with
    // per-day scheduled total + done so streaks can correctly skip rest days.
    const streakRes = await db.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - 179, CURRENT_DATE, '1 day'::interval)::date AS d
       ),
       scheduled AS (
         SELECT d.d AS entry_date,
                (
                  SELECT COUNT(*)::int FROM exercises e
                  JOIN gym_session_assignments gsa
                    ON gsa.session_name = e.gym_session
                   AND gsa.user_id = $1
                  WHERE e.is_active = TRUE
                    AND e.type = 'gym'
                    AND (
                      COALESCE(array_length(gsa.schedule, 1), 0) = 0
                      OR EXTRACT(DOW FROM d.d)::int = ANY(gsa.schedule)
                    )
                ) AS total
         FROM days d
       ),
       done AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE completed = TRUE)::int AS done
         FROM gym_checklist_entries
         WHERE user_id = $1
           AND entry_date >= CURRENT_DATE - 179
         GROUP BY entry_date
       )
       SELECT s.entry_date::text AS date, s.total, COALESCE(d.done, 0) AS done
       FROM scheduled s LEFT JOIN done d ON d.entry_date = s.entry_date
       ORDER BY s.entry_date DESC`,
      [userId]
    );

    const streakMap = {};
    streakRes.rows.forEach(r => { streakMap[r.date] = { done: r.done, total: r.total }; });

    // Aggregate totals (over all-time done entries — kept simple)
    const totalsRes = await db.query(
      `SELECT COUNT(*) FILTER (WHERE completed = TRUE)::int AS total_completed,
              COUNT(DISTINCT entry_date) FILTER (WHERE completed = TRUE)::int AS active_days
       FROM gym_checklist_entries
       WHERE user_id = $1`,
      [userId]
    );

    // Full days (in last 180 days) = days where done >= total > 0
    const completedDates = new Set(
      streakRes.rows.filter(r => r.total > 0 && r.done >= r.total).map(r => r.date)
    );
    const fullDaysCount = completedDates.size;

    // Streaks (using 180-day streakMap so rest-day skipping is reliable)
    let currentStreak = 0;
    let bestStreak = 0;
    let running = 0;
    for (let i = 0; i <= 179; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayInfo = streakMap[key];
      const wasScheduled = dayInfo ? dayInfo.total > 0 : false;
      const wasFull = completedDates.has(key);

      if (wasFull) {
        running++;
        if (i === 0 || (i === 1 && !completedDates.has(today))) currentStreak = running;
      } else if (!wasScheduled) {
        // Rest day: streak passes through unchanged
      } else {
        // Scheduled but not completed -> break
        if (i > 0) { bestStreak = Math.max(bestStreak, running); running = 0; }
        if (i === 0) currentStreak = 0;
      }
    }
    bestStreak = Math.max(bestStreak, running);
    if (completedDates.has(today)) currentStreak = Math.max(currentStreak, running);

    res.json({
      stats: {
        calendar,
        total_completed: totalsRes.rows[0].total_completed,
        active_days:     totalsRes.rows[0].active_days,
        full_days:       fullDaysCount,
        best_streak:     bestStreak,
        current_streak:  currentStreak,
        today_done:      calMap[today]?.done  ?? 0,
        today_total:     calMap[today]?.total ?? 0,
      },
    });
  } catch (err) {
    console.error('[gym] stats', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message, where: err.where, hint: err.hint });
  }
});

module.exports = router;
