const express = require('express');
const db = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/exercises — all exercises with assigned user ids and per-user schedules
router.get('/exercises', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*,
              COALESCE(
                ARRAY_AGG(uea.user_id) FILTER (WHERE uea.user_id IS NOT NULL),
                '{}'::integer[]
              ) AS assigned_users,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT('user_id', uea.user_id, 'schedule', COALESCE(uea.schedule, '{}'))
                ) FILTER (WHERE uea.user_id IS NOT NULL),
                '[]'::json
              ) AS assignments
       FROM exercises e
       LEFT JOIN user_exercise_assignments uea ON uea.exercise_id = e.id
       GROUP BY e.id
       ORDER BY e.order_index ASC, e.id ASC`
    );
    res.json({ exercises: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/exercises — create exercise
router.post('/exercises', requireAdmin, async (req, res) => {
  const { name, emoji, sets, reps, unit, order_index, schedule, is_running, type, gym_session } = req.body;
  if (!name || !reps) {
    return res.status(400).json({ error: 'name et reps requis' });
  }
  const exerciseType = (type === 'gym') ? 'gym' : 'home';
  try {
    const result = await db.query(
      `INSERT INTO exercises (name, emoji, sets, reps, unit, xp_reward, order_index, schedule, is_running, type, gym_session)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        name.trim(),
        emoji || '💪',
        sets || 1,
        reps,
        unit || 'répétitions',
        10,
        order_index || 0,
        Array.isArray(schedule) ? schedule : [],
        is_running || false,
        exerciseType,
        exerciseType === 'gym' ? (gym_session || null) : null,
      ]
    );
    res.status(201).json({ exercise: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/exercises/:id — update exercise
router.put('/exercises/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, emoji, sets, reps, unit, order_index, is_active, schedule, is_running, type, gym_session } = req.body;
  const exerciseType = type === 'gym' ? 'gym' : type === 'home' ? 'home' : null;
  try {
    const result = await db.query(
      `UPDATE exercises
       SET name = COALESCE($1, name),
           emoji = COALESCE($2, emoji),
           sets = COALESCE($3, sets),
           reps = COALESCE($4, reps),
           unit = COALESCE($5, unit),
           order_index = COALESCE($6, order_index),
           is_active = COALESCE($7, is_active),
           schedule = COALESCE($8, schedule),
           is_running = COALESCE($9, is_running),
           type = COALESCE($10, type),
           gym_session = CASE WHEN $10 IS NOT NULL THEN $11 ELSE gym_session END
       WHERE id = $12 RETURNING *`,
      [name ?? null, emoji ?? null, sets ?? null, reps ?? null, unit ?? null, order_index ?? null, is_active ?? null, Array.isArray(schedule) ? schedule : null, is_running ?? null, exerciseType, gym_session ?? null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Exercice introuvable' });
    res.json({ exercise: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/exercises/:id — hard delete only if no user history
// If checklist entries exist, refuse with 409 so callers know to archive instead.
router.delete('/exercises/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const historyCheck = await db.query(
      'SELECT COUNT(*) AS cnt FROM checklist_entries WHERE exercise_id = $1',
      [id]
    );
    if (parseInt(historyCheck.rows[0].cnt, 10) > 0) {
      return res.status(409).json({
        error: 'Cet exercice a un historique utilisateur. Archivez-le plutôt que de le supprimer pour conserver les données.',
      });
    }
    await db.query('DELETE FROM exercises WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/users — all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, is_admin, xp, created_at FROM users ORDER BY xp DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/users/:id/promote — toggle admin
router.patch('/users/:id/promote', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_admin } = req.body;
  try {
    const result = await db.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, username, is_admin',
      [is_admin, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/exercises/:id/assign — set user assignments with per-user schedules
// Body: { assignments: [{ user_id, schedule }] }  (empty array = global)
router.post('/exercises/:id/assign', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { assignments } = req.body;
  const assigns = Array.isArray(assignments)
    ? assignments
        .map(a => ({ user_id: Number(a.user_id), schedule: Array.isArray(a.schedule) ? a.schedule.map(Number) : [] }))
        .filter(a => a.user_id > 0)
    : [];
  try {
    await db.query('DELETE FROM user_exercise_assignments WHERE exercise_id = $1', [id]);
    for (const a of assigns) {
      await db.query(
        `INSERT INTO user_exercise_assignments (exercise_id, user_id, schedule)
         VALUES ($1, $2, $3) ON CONFLICT (exercise_id, user_id) DO UPDATE SET schedule = EXCLUDED.schedule`,
        [id, a.user_id, a.schedule]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/exercises/:id/assign/:userId — remove one user assignment
router.delete('/exercises/:id/assign/:userId', requireAdmin, async (req, res) => {
  const { id, userId } = req.params;
  try {
    await db.query(
      'DELETE FROM user_exercise_assignments WHERE exercise_id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Gym session assignments ────────────────────────────────
const GYM_SESSION_DEFS = [
  { name: 'Pecs Triceps', icon: '💪', color: '#e94560' },
  { name: 'Dos Biceps',   icon: '🏋️', color: '#7c5cbf' },
  { name: 'Jambes',       icon: '🦵', color: '#22d18b' },
  { name: 'Full',         icon: '⚡', color: '#fbbf24' },
];

// GET /api/admin/gym-sessions — all gym sessions with their exercises and per-user assignments
router.get('/gym-sessions', requireAdmin, async (req, res) => {
  try {
    const [exResult, assignResult] = await Promise.all([
      db.query(
        `SELECT id, name, emoji, sets, reps, unit, gym_session, order_index
         FROM exercises WHERE type = 'gym' AND is_active = TRUE
         ORDER BY gym_session, order_index, id`
      ),
      db.query(
        `SELECT user_id, session_name, schedule FROM gym_session_assignments ORDER BY session_name, user_id`
      ),
    ]);

    // Group exercises by session
    const exBySession = {};
    exResult.rows.forEach(ex => {
      const key = ex.gym_session || 'Autre';
      if (!exBySession[key]) exBySession[key] = [];
      exBySession[key].push(ex);
    });

    // Group assignments by session
    const assignBySession = {};
    assignResult.rows.forEach(a => {
      if (!assignBySession[a.session_name]) assignBySession[a.session_name] = [];
      assignBySession[a.session_name].push({ user_id: a.user_id, schedule: a.schedule || [] });
    });

    const sessions = GYM_SESSION_DEFS.map(def => ({
      name: def.name,
      icon: def.icon,
      color: def.color,
      exercises: exBySession[def.name] || [],
      assignments: assignBySession[def.name] || [],
      assigned_users: (assignBySession[def.name] || []).map(a => a.user_id),
    }));

    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/gym-sessions/:name/assign — replace assignments for a session
// Body: { assignments: [{ user_id, schedule }] }
router.post('/gym-sessions/:name/assign', requireAdmin, async (req, res) => {
  const { name } = req.params;
  const { assignments } = req.body;
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments requis (tableau)' });
  }
  const assigns = assignments
    .map(a => ({ user_id: Number(a.user_id), schedule: Array.isArray(a.schedule) ? a.schedule.map(Number) : [] }))
    .filter(a => a.user_id > 0);
  try {
    await db.query('DELETE FROM gym_session_assignments WHERE session_name = $1', [name]);
    for (const a of assigns) {
      await db.query(
        `INSERT INTO gym_session_assignments (user_id, session_name, schedule) VALUES ($1, $2, $3)`,
        [a.user_id, name, a.schedule]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
