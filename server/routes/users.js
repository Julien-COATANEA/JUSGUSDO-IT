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

// GET /api/users/:id/stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });

  try {
    const userRes = await db.query(
      'SELECT id, username, xp, avatar FROM users WHERE id = $1',
      [userId]
    );
    if (!userRes.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Totals
    const totalsRes = await db.query(
      `SELECT COUNT(*) AS total_completed,
              COUNT(DISTINCT entry_date) AS active_days
       FROM checklist_entries
       WHERE user_id = $1 AND completed = TRUE`,
      [userId]
    );

    // Days where every active exercise was completed
    const fullDaysRes = await db.query(
      `WITH day_counts AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE ce.completed) AS done
         FROM checklist_entries ce
         WHERE ce.user_id = $1
         GROUP BY entry_date
       ),
       active_count AS (SELECT COUNT(*) AS cnt FROM exercises WHERE is_active = TRUE)
       SELECT COUNT(*) AS full_days
       FROM day_counts, active_count
       WHERE done >= active_count.cnt AND active_count.cnt > 0`,
      [userId]
    );

    // All fully-completed day dates (for streak calc)
    const datesRes = await db.query(
      `WITH day_counts AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE ce.completed) AS done
         FROM checklist_entries ce
         WHERE ce.user_id = $1
         GROUP BY entry_date
       ),
       active_count AS (SELECT COUNT(*) AS cnt FROM exercises WHERE is_active = TRUE)
       SELECT entry_date
       FROM day_counts, active_count
       WHERE done >= active_count.cnt AND active_count.cnt > 0
       ORDER BY entry_date`,
      [userId]
    );

    // Top exercises
    const topExRes = await db.query(
      `SELECT e.name, COUNT(*) AS times
       FROM checklist_entries ce
       JOIN exercises e ON e.id = ce.exercise_id
       WHERE ce.user_id = $1 AND ce.completed = TRUE
       GROUP BY e.name
       ORDER BY times DESC
       LIMIT 5`,
      [userId]
    );

    // Today's status
    const [todayDoneRes, todayTotalRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS done FROM checklist_entries
         WHERE user_id = $1 AND entry_date = CURRENT_DATE AND completed = TRUE`,
        [userId]
      ),
      db.query(`SELECT COUNT(*) AS total FROM exercises WHERE is_active = TRUE`),
    ]);

    // 28-day calendar (last 4 weeks)
    const calendarRes = await db.query(
      `WITH active_count AS (SELECT COUNT(*) AS cnt FROM exercises WHERE is_active = TRUE),
            day_data AS (
              SELECT entry_date,
                     COUNT(*) FILTER (WHERE completed) AS done
              FROM checklist_entries
              WHERE user_id = $1
                AND entry_date >= CURRENT_DATE - 27
              GROUP BY entry_date
            )
       SELECT d.entry_date,
              COALESCE(dd.done, 0) AS done,
              ac.cnt AS total
       FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE, '1 day'::interval) AS d(entry_date)
       CROSS JOIN active_count ac
       LEFT JOIN day_data dd ON dd.entry_date = d.entry_date
       ORDER BY d.entry_date`,
      [userId]
    );

    // Daily XP for last 30 days
    const xpHistoryRes = await db.query(
      `SELECT ce.entry_date,
              SUM(e.xp_reward) AS xp_earned
       FROM checklist_entries ce
       JOIN exercises e ON e.id = ce.exercise_id
       WHERE ce.user_id = $1
         AND ce.completed = TRUE
         AND ce.entry_date >= CURRENT_DATE - 29
       GROUP BY ce.entry_date
       ORDER BY ce.entry_date`,
      [userId]
    );

    // Compute streaks
    const dates = datesRes.rows.map(r => {
      const d = r.entry_date;
      return typeof d === 'string' ? d : d.toISOString().split('T')[0];
    });

    let bestStreak = 0, currentStreak = 0;
    if (dates.length) {
      let streak = 1, maxStreak = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (diff === 1) { streak++; if (streak > maxStreak) maxStreak = streak; }
        else streak = 1;
      }
      bestStreak = maxStreak;

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const lastDate = dates[dates.length - 1];
      if (lastDate === today || lastDate === yesterday) {
        let cs = 1;
        for (let i = dates.length - 2; i >= 0; i--) {
          const diff = (new Date(dates[i + 1]) - new Date(dates[i])) / 86400000;
          if (diff === 1) cs++;
          else break;
        }
        currentStreak = cs;
      }
    }

    res.json({
      user: userRes.rows[0],
      stats: {
        total_completed: parseInt(totalsRes.rows[0].total_completed),
        active_days:     parseInt(totalsRes.rows[0].active_days),
        full_days:       parseInt(fullDaysRes.rows[0].full_days),
        best_streak:     bestStreak,
        current_streak:  currentStreak,
        top_exercises:   topExRes.rows,
        today_done:      parseInt(todayDoneRes.rows[0].done),
        today_total:     parseInt(todayTotalRes.rows[0].total),
        calendar:        calendarRes.rows.map(r => ({
          date:  typeof r.entry_date === 'string' ? r.entry_date : r.entry_date.toISOString().split('T')[0],
          done:  parseInt(r.done),
          total: parseInt(r.total),
        })),
        xp_history: xpHistoryRes.rows.map(r => ({
          date:       typeof r.entry_date === 'string' ? r.entry_date : r.entry_date.toISOString().split('T')[0],
          xp_earned:  parseInt(r.xp_earned),
        })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
