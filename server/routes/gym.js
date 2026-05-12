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
    // Total completed exercises
    const totalsRes = await db.query(
      `SELECT COUNT(*) AS total_completed,
              COUNT(DISTINCT entry_date) AS active_days
       FROM gym_checklist_entries
       WHERE user_id = $1 AND completed = TRUE`,
      [userId]
    );

    // "Full" days: at least one session where all exercises were done
    // Simplified: days where done >= 1 (any gym work)
    // Real full-day: days where every exercise of at least one session is completed
    const fullDaysRes = await db.query(
      `WITH session_day AS (
         SELECT entry_date, session_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE completed = TRUE) AS done
         FROM gym_checklist_entries
         WHERE user_id = $1
         GROUP BY entry_date, session_name
       )
       SELECT COUNT(DISTINCT entry_date) AS full_days
       FROM session_day
       WHERE done >= total AND total > 0`,
      [userId]
    );

    // All fully-completed days (for streak calc)
    const datesRes = await db.query(
      `WITH session_day AS (
         SELECT entry_date, session_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE completed = TRUE) AS done
         FROM gym_checklist_entries
         WHERE user_id = $1
         GROUP BY entry_date, session_name
       )
       SELECT DISTINCT entry_date::text AS date
       FROM session_day
       WHERE done >= total AND total > 0
       ORDER BY entry_date DESC`,
      [userId]
    );

    const completedDates = new Set(datesRes.rows.map(r => r.date));
    const today = new Date().toISOString().split('T')[0];

    // Streaks
    let currentStreak = 0;
    let bestStreak = 0;
    let running = 0;
    for (let i = 0; i <= 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (completedDates.has(key)) {
        running++;
        if (i === 0 || (i === 1 && !completedDates.has(today))) {
          currentStreak = running;
        }
      } else {
        if (i > 0) { bestStreak = Math.max(bestStreak, running); running = 0; }
        if (i === 0) currentStreak = 0;
      }
    }
    bestStreak = Math.max(bestStreak, running);
    if (completedDates.has(today)) currentStreak = running;

    // 28-day calendar for heatmap
    const calRes = await db.query(
      `WITH day_session AS (
         SELECT entry_date, session_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE completed = TRUE) AS done
         FROM gym_checklist_entries
         WHERE user_id = $1
           AND entry_date >= (CURRENT_DATE - INTERVAL '31 days')
         GROUP BY entry_date, session_name
       )
       SELECT entry_date::text AS date,
              SUM(done)::int AS done,
              SUM(total)::int AS total
       FROM day_session
       GROUP BY entry_date
       ORDER BY entry_date`,
      [userId]
    );
    const calMap = {};
    calRes.rows.forEach(r => { calMap[r.date] = { done: r.done, total: r.total }; });

    // Build 28-day calendar starting from Monday 27 days ago
    const startD = new Date();
    startD.setDate(startD.getDate() - 27);
    const dow = startD.getDay();
    startD.setDate(startD.getDate() + (dow === 0 ? -6 : 1 - dow));
    const calendar = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(startD);
      d.setDate(startD.getDate() + i);
      const date = d.toISOString().split('T')[0];
      calendar.push({ date, done: calMap[date]?.done ?? 0, total: calMap[date]?.total ?? 0 });
    }

    res.json({
      stats: {
        calendar,
        total_completed: parseInt(totalsRes.rows[0].total_completed, 10),
        active_days:     parseInt(totalsRes.rows[0].active_days, 10),
        full_days:       parseInt(fullDaysRes.rows[0].full_days, 10),
        best_streak:     bestStreak,
        current_streak:  currentStreak,
        today_done:      calMap[today]?.done ?? 0,
        today_total:     calMap[today]?.total ?? 0,
      },
    });
  } catch (err) {
    console.error('[gym] stats', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
