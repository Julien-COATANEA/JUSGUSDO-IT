const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

let pushModule = null;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    pushModule = require('./push');
  } catch (err) {
    console.warn('⚠️ Wizz push notifications unavailable:', err.message);
  }
}

// GET /api/users — all users with avatar
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, is_admin, xp, avatar, tokens
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
      'SELECT id, username, xp, avatar, COALESCE(tokens, 0) AS tokens FROM users WHERE id = $1',
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

    // Days where every exercise scheduled for that day's DOW was completed
    const fullDaysRes = await db.query(
      `WITH day_counts AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE ce.completed) AS done
         FROM checklist_entries ce
         WHERE ce.user_id = $1
         GROUP BY entry_date
       ),
       day_totals AS (
         SELECT dc.entry_date,
                dc.done,
                (SELECT COUNT(*) FROM exercises e2
                 LEFT JOIN LATERAL (
                   SELECT uea.schedule FROM user_exercise_assignments uea
                   WHERE uea.exercise_id = e2.id AND uea.user_id = $1 LIMIT 1
                 ) usch2 ON TRUE
                 WHERE e2.is_active = TRUE
                   AND (
                     COALESCE(array_length(COALESCE(usch2.schedule, e2.schedule), 1), 0) = 0
                     OR EXTRACT(DOW FROM dc.entry_date)::int = ANY(COALESCE(usch2.schedule, e2.schedule))
                   )
                   AND (
                     NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e2.id)
                     OR usch2.schedule IS NOT NULL
                   )
                ) AS total_for_day
         FROM day_counts dc
       )
       SELECT COUNT(*) AS full_days
       FROM day_totals
       WHERE total_for_day > 0 AND done >= total_for_day`,
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
       day_totals AS (
         SELECT dc.entry_date,
                dc.done,
                (SELECT COUNT(*) FROM exercises e2
                 LEFT JOIN LATERAL (
                   SELECT uea.schedule FROM user_exercise_assignments uea
                   WHERE uea.exercise_id = e2.id AND uea.user_id = $1 LIMIT 1
                 ) usch2 ON TRUE
                 WHERE e2.is_active = TRUE
                   AND (
                     COALESCE(array_length(COALESCE(usch2.schedule, e2.schedule), 1), 0) = 0
                     OR EXTRACT(DOW FROM dc.entry_date)::int = ANY(COALESCE(usch2.schedule, e2.schedule))
                   )
                   AND (
                     NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e2.id)
                     OR usch2.schedule IS NOT NULL
                   )
                ) AS total_for_day
         FROM day_counts dc
       )
       SELECT entry_date
       FROM day_totals
       WHERE total_for_day > 0 AND done >= total_for_day
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
        `SELECT COUNT(*) AS done
         FROM checklist_entries ce
         JOIN exercises e ON e.id = ce.exercise_id AND e.is_active = TRUE
         LEFT JOIN user_exercise_assignments uea ON uea.exercise_id = e.id AND uea.user_id = $1
         WHERE ce.user_id = $1
           AND ce.entry_date = CURRENT_DATE
           AND ce.completed = TRUE
           AND (
             COALESCE(array_length(COALESCE(uea.schedule, e.schedule), 1), 0) = 0
             OR EXTRACT(DOW FROM CURRENT_DATE)::int = ANY(COALESCE(uea.schedule, e.schedule))
           )
           AND (
             NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
             OR uea.user_id IS NOT NULL
           )`,
        [userId]
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM exercises e
         LEFT JOIN user_exercise_assignments uea ON uea.exercise_id = e.id AND uea.user_id = $1
         WHERE e.is_active = TRUE
           AND (
             COALESCE(array_length(COALESCE(uea.schedule, e.schedule), 1), 0) = 0
             OR EXTRACT(DOW FROM CURRENT_DATE)::int = ANY(COALESCE(uea.schedule, e.schedule))
           )
           AND (
             NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
             OR uea.user_id IS NOT NULL
           )`,
        [userId]
      ),
    ]);

    // 28-day calendar aligned to ISO weeks (Mon→Sun), 4 full weeks
    const calendarRes = await db.query(
      `WITH cur_monday AS (
         SELECT (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1))::date AS d
       ),
       user_first AS (
         SELECT COALESCE(MIN(entry_date), CURRENT_DATE) AS first_date
         FROM checklist_entries WHERE user_id = $1
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
       day_data AS (
         SELECT entry_date,
                COUNT(*) FILTER (WHERE completed) AS done
         FROM checklist_entries
         WHERE user_id = $1
           AND entry_date >= (SELECT start_date FROM bounds)
         GROUP BY entry_date
       )
  SELECT d.entry_date,
         COALESCE(dd.done, 0) AS done,
         (SELECT COUNT(*) FROM exercises e2
          LEFT JOIN LATERAL (
            SELECT uea.schedule FROM user_exercise_assignments uea
            WHERE uea.exercise_id = e2.id AND uea.user_id = $1 LIMIT 1
          ) usch2 ON TRUE
          WHERE e2.is_active = TRUE
            AND (
              COALESCE(array_length(COALESCE(usch2.schedule, e2.schedule), 1), 0) = 0
              OR EXTRACT(DOW FROM d.entry_date)::int = ANY(COALESCE(usch2.schedule, e2.schedule))
            )
            AND (
              NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e2.id)
              OR usch2.schedule IS NOT NULL
            )
         ) AS total
  FROM bounds b,
       generate_series(b.start_date, b.end_date, '1 day'::interval) AS d(entry_date)
  LEFT JOIN day_data dd ON dd.entry_date = d.entry_date
  ORDER BY d.entry_date`,
      [userId]
    );

    // Daily XP for last 30 days (capped to 30 XP/day and split across the day's exercises)
    const xpHistoryRes = await db.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date AS entry_date
       ),
       totals AS (
         SELECT d.entry_date,
                (SELECT COUNT(*) FROM exercises e
                 LEFT JOIN LATERAL (
                   SELECT uea.schedule FROM user_exercise_assignments uea
                   WHERE uea.exercise_id = e.id AND uea.user_id = $1 LIMIT 1
                 ) usch ON TRUE
                 WHERE e.is_active = TRUE
                   AND (
                     COALESCE(array_length(COALESCE(usch.schedule, e.schedule), 1), 0) = 0
                     OR EXTRACT(DOW FROM d.entry_date)::int = ANY(COALESCE(usch.schedule, e.schedule))
                   )
                   AND (
                     NOT EXISTS (SELECT 1 FROM user_exercise_assignments WHERE exercise_id = e.id)
                     OR usch.schedule IS NOT NULL
                   )
                ) AS total_ex
         FROM days d
       ),
       done_days AS (
         SELECT ce.entry_date,
                COUNT(*) FILTER (WHERE ce.completed = TRUE) AS done_ex
         FROM checklist_entries ce
         JOIN exercises e ON e.id = ce.exercise_id
         WHERE ce.user_id = $1
           AND ce.completed = TRUE
           AND ce.entry_date >= CURRENT_DATE - 29
         GROUP BY ce.entry_date
       )
       SELECT t.entry_date,
              CASE
                WHEN t.total_ex = 0 THEN 0
                ELSE (
                  COALESCE(dd.done_ex, 0) * FLOOR(30.0 / t.total_ex)::int
                  + CASE
                      WHEN COALESCE(dd.done_ex, 0) >= t.total_ex
                        THEN 30 - (FLOOR(30.0 / t.total_ex)::int * t.total_ex)
                      ELSE 0
                    END
                )
              END AS xp_earned
       FROM totals t
       LEFT JOIN done_days dd ON dd.entry_date = t.entry_date
       WHERE COALESCE(dd.done_ex, 0) > 0
       ORDER BY t.entry_date`,
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

// GET /api/users/:id/muscle-records
router.get('/:id/muscle-records', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });
  try {
    const result = await db.query(
      `SELECT id, exercise_name, category, sets, reps, weight_kg::float AS weight_kg, notes, updated_at
       FROM muscle_records WHERE user_id = $1 ORDER BY category ASC, exercise_name ASC`,
      [userId]
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users/:id/muscle-records — add a new record (multiple allowed per exercise)
router.post('/:id/muscle-records', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId && !req.user.is_admin)
    return res.status(403).json({ error: 'Interdit' });
  const { exercise_name, sets, reps, weight_kg, notes, category } = req.body;
  if (!exercise_name || !sets || weight_kg == null)
    return res.status(400).json({ error: 'Données manquantes' });
  const VALID_CATEGORIES = ['Poitrine','Dos','Épaules','Biceps','Triceps','Jambes','Abdos','Autre',
    'Pecs Triceps','Dos Biceps','Jambes','Full'];
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'Autre';
  const safeReps = reps != null && !isNaN(parseInt(reps, 10)) ? parseInt(reps, 10) : null;
  try {
    const result = await db.query(
      `INSERT INTO muscle_records (user_id, exercise_name, sets, reps, weight_kg, notes, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, exercise_name, category, sets, reps, weight_kg::float AS weight_kg, notes, updated_at`,
      [userId, exercise_name.trim(), parseInt(sets, 10), safeReps, parseFloat(weight_kg), notes || null, safeCategory]
    );
    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/users/:id/muscle-records/:recordId — update an existing record
router.put('/:id/muscle-records/:recordId', requireAuth, async (req, res) => {
  const userId   = parseInt(req.params.id, 10);
  const recordId = parseInt(req.params.recordId, 10);
  if (req.user.id !== userId && !req.user.is_admin)
    return res.status(403).json({ error: 'Interdit' });
  const { sets, reps, weight_kg, notes, category } = req.body;
  if (!sets || weight_kg == null)
    return res.status(400).json({ error: 'Données manquantes' });
  const VALID_CATEGORIES = ['Poitrine','Dos','Épaules','Biceps','Triceps','Jambes','Abdos','Autre',
    'Pecs Triceps','Dos Biceps','Jambes','Full'];
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : null;
  const safeReps = reps != null && !isNaN(parseInt(reps, 10)) ? parseInt(reps, 10) : null;
  try {
    const result = await db.query(
      `UPDATE muscle_records
       SET sets = $1, reps = $2, weight_kg = $3, notes = $4,
           category = COALESCE($5, category), updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING id, exercise_name, category, sets, reps, weight_kg::float AS weight_kg, notes, updated_at`,
      [parseInt(sets, 10), safeReps, parseFloat(weight_kg), notes || null, safeCategory, recordId, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Record introuvable' });
    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/users/:id/muscle-records/:recordId
router.delete('/:id/muscle-records/:recordId', requireAuth, async (req, res) => {
  const userId   = parseInt(req.params.id, 10);
  const recordId = parseInt(req.params.recordId, 10);
  if (req.user.id !== userId && !req.user.is_admin)
    return res.status(403).json({ error: 'Interdit' });
  try {
    await db.query(
      `DELETE FROM muscle_records WHERE id = $1 AND user_id = $2`,
      [recordId, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/:id/minigame-status
router.get('/:id/minigame-status', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: 'ID invalide' });
  try {
    const playRes = await db.query(
      `SELECT level, won FROM minigame_plays WHERE user_id = $1 AND play_date = CURRENT_DATE`,
      [userId]
    );
    const userRes = await db.query(`SELECT tokens FROM users WHERE id = $1`, [userId]);
    const levels = { easy: null, medium: null, hard: null };
    playRes.rows.forEach(r => { levels[r.level] = r.won; });
    res.json({
      levels,
      tokens: userRes.rows[0]?.tokens ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users/:id/minigame-result
router.post('/:id/minigame-result', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId) return res.status(403).json({ error: 'Interdit' });
  const { won, level } = req.body;
  const VALID_LEVELS = ['easy', 'medium', 'hard'];
  if (typeof won !== 'boolean' || !VALID_LEVELS.includes(level))
    return res.status(400).json({ error: 'Données manquantes' });
  try {
    const existing = await db.query(
      `SELECT id FROM minigame_plays WHERE user_id = $1 AND play_date = CURRENT_DATE AND level = $2`,
      [userId, level]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Déjà joué ce niveau aujourd\'hui' });

    await db.query(
      `INSERT INTO minigame_plays (user_id, play_date, won, level) VALUES ($1, CURRENT_DATE, $2, $3)`,
      [userId, won, level]
    );
    let tokens = null;
    if (won) {
      const upd = await db.query(
        `UPDATE users SET tokens = COALESCE(tokens, 0) + 1 WHERE id = $1 RETURNING tokens`,
        [userId]
      );
      tokens = upd.rows[0].tokens;
    } else {
      const sel = await db.query(`SELECT tokens FROM users WHERE id = $1`, [userId]);
      tokens = sel.rows[0]?.tokens ?? 0;
    }
    res.json({ ok: true, won, tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── WIZZ ────────────────────────────────────────────────────

const VALID_WIZZ_KEYS = ['lazy', 'weak', 'ghost', 'turtle', 'cake', 'skip', 'snail', 'custom'];
const WIZZ_PUSH_MSGS = {
  lazy:   { text: "Toujours en échauffement ou tu comptes vraiment t'y mettre ?", emoji: '😴' },
  weak:   { text: 'Même ta gourde porte plus lourd que toi !', emoji: '🏋️' },
  ghost:  { text: "La salle t'a vu passer... puis plus rien.", emoji: '👻' },
  turtle: { text: 'À ce rythme, entraîne-toi pas 😅', emoji: '🐢' },
  cake:   { text: "T'as pris un PR sur le buffet, pas sur la barre.", emoji: '🍰' },
  skip:   { text: 'Toujours la même perf, collector mais pas menaçante.', emoji: '😮‍💨' },
  snail:  { text: "Le chrono s'est endormi avant la fin de ta série.", emoji: '🐌' },
};

// POST /api/users/:id/send-wizz  (send a wizz to user :id, costs 1 gem from sender)
router.post('/:id/send-wizz', requireAuth, async (req, res) => {
  const receiverId = parseInt(req.params.id, 10);
  const senderId   = req.user.id;
  if (!receiverId || isNaN(receiverId)) return res.status(400).json({ error: 'ID invalide' });
  if (senderId === receiverId) return res.status(400).json({ error: 'Impossible de t\'envoyer un wizz à toi-même' });
  const { message_key, custom_text } = req.body;
  if (!VALID_WIZZ_KEYS.includes(message_key)) return res.status(400).json({ error: 'Message invalide' });
  if (message_key === 'custom') {
    if (!custom_text || typeof custom_text !== 'string' || !custom_text.trim())
      return res.status(400).json({ error: 'Message personnalisé requis' });
    if (custom_text.trim().length > 200)
      return res.status(400).json({ error: 'Message trop long (200 car. max)' });
  }
  const safeCustomText = message_key === 'custom' ? custom_text.trim() : null;
  try {
    const senderRes = await db.query('SELECT username, tokens FROM users WHERE id = $1', [senderId]);
    const sender = senderRes.rows[0] || {};
    const tokens = sender.tokens ?? 0;
    if (tokens < 1) return res.status(402).json({ error: 'Pas assez de gemmes (1 💎 requis)' });

    await db.query('UPDATE users SET tokens = tokens - 1 WHERE id = $1', [senderId]);
    await db.query(
      'INSERT INTO trolls (sender_id, receiver_id, message_key, custom_text) VALUES ($1, $2, $3, $4)',
      [senderId, receiverId, message_key, safeCustomText]
    );

    if (pushModule?.sendNotificationToUser) {
      const msg = message_key === 'custom'
        ? { text: safeCustomText, emoji: '✍️' }
        : (WIZZ_PUSH_MSGS[message_key] || { text: 'Tu as reçu un nouveau wizz ⚡', emoji: '⚡' });
      await pushModule.sendNotificationToUser(receiverId, {
        title: `⚡ Wizz de ${sender.username || 'quelqu’un'}`,
        body: `${msg.emoji} ${msg.text}`,
        url: '/',
        tag: `wizz-${receiverId}`,
        renotify: true,
        vibrate: [250, 120, 250, 120, 250],
      }).catch((pushErr) => {
        console.warn('Wizz push send error:', pushErr.message);
      });
    }

    const upd = await db.query('SELECT tokens FROM users WHERE id = $1', [senderId]);
    res.json({ ok: true, tokens: upd.rows[0].tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/:id/wizz — wizz received by user :id
router.get('/:id/wizz', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId) return res.status(403).json({ error: 'Interdit' });
  try {
    const result = await db.query(
      `SELECT t.id, t.message_key, t.custom_text, t.created_at, t.read, u.username AS sender_name
       FROM trolls t JOIN users u ON u.id = t.sender_id
       WHERE t.receiver_id = $1 ORDER BY t.created_at DESC LIMIT 30`,
      [userId]
    );
    const unread = result.rows.filter(r => !r.read).length;
    res.json({ wizzes: result.rows, unread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/:id/wizz/read — mark all wizz as read
router.patch('/:id/wizz/read', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId) return res.status(403).json({ error: 'Interdit' });
  try {
    await db.query('UPDATE trolls SET read = TRUE WHERE receiver_id = $1', [userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
