const express = require('express');
const db = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/exercises — all exercises with assigned user ids
router.get('/exercises', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*,
              COALESCE(
                ARRAY_AGG(uea.user_id) FILTER (WHERE uea.user_id IS NOT NULL),
                '{}'::integer[]
              ) AS assigned_users
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
  const { name, emoji, sets, reps, unit, xp_reward, order_index, schedule, is_running } = req.body;
  if (!name || !reps) {
    return res.status(400).json({ error: 'name et reps requis' });
  }
  // is_running sessions get 20 XP, others always 10
  const xp = is_running ? 20 : 10;
  try {
    const result = await db.query(
      `INSERT INTO exercises (name, emoji, sets, reps, unit, xp_reward, order_index, schedule, is_running)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        name.trim(),
        emoji || '💪',
        sets || 1,
        reps,
        unit || 'répétitions',
        xp,
        order_index || 0,
        Array.isArray(schedule) ? schedule : [],
        is_running || false,
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
  const { name, emoji, sets, reps, unit, order_index, is_active, schedule, is_running } = req.body;
  // Recompute XP based on is_running if provided, otherwise keep existing
  const xpExpr = typeof is_running === 'boolean' ? (is_running ? 20 : 10) : null;
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
           xp_reward = COALESCE($10, xp_reward)
       WHERE id = $11 RETURNING *`,
      [name ?? null, emoji ?? null, sets ?? null, reps ?? null, unit ?? null, order_index ?? null, is_active ?? null, Array.isArray(schedule) ? schedule : null, is_running ?? null, xpExpr, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Exercice introuvable' });
    res.json({ exercise: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/exercises/:id — hard delete
router.delete('/exercises/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM checklist_entries WHERE exercise_id = $1', [id]);
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

// POST /api/admin/exercises/:id/assign — set user assignments (empty array = global)
router.post('/exercises/:id/assign', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { user_ids } = req.body; // array of integers
  const ids = Array.isArray(user_ids) ? user_ids.map(Number).filter(Boolean) : [];
  try {
    await db.query('DELETE FROM user_exercise_assignments WHERE exercise_id = $1', [id]);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO user_exercise_assignments (exercise_id, user_id) VALUES ${placeholders}
         ON CONFLICT DO NOTHING`,
        [id, ...ids]
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

module.exports = router;
