const express = require('express');
const db = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/exercises — all exercises (including inactive)
router.get('/exercises', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM exercises ORDER BY order_index ASC, id ASC'
    );
    res.json({ exercises: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/exercises — create exercise
router.post('/exercises', requireAdmin, async (req, res) => {
  const { name, emoji, sets, reps, unit, xp_reward, order_index, schedule } = req.body;
  if (!name || !reps) {
    return res.status(400).json({ error: 'name et reps requis' });
  }
  try {
    const result = await db.query(
      `INSERT INTO exercises (name, emoji, sets, reps, unit, xp_reward, order_index, schedule)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name.trim(),
        emoji || '💪',
        sets || 1,
        reps,
        unit || 'répétitions',
        xp_reward || 10,
        order_index || 0,
        Array.isArray(schedule) ? schedule : [],
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
  const { name, emoji, sets, reps, unit, xp_reward, order_index, is_active, schedule } = req.body;
  try {
    const result = await db.query(
      `UPDATE exercises
       SET name = COALESCE($1, name),
           emoji = COALESCE($2, emoji),
           sets = COALESCE($3, sets),
           reps = COALESCE($4, reps),
           unit = COALESCE($5, unit),
           xp_reward = COALESCE($6, xp_reward),
           order_index = COALESCE($7, order_index),
           is_active = COALESCE($8, is_active),
           schedule = COALESCE($9, schedule)
       WHERE id = $10 RETURNING *`,
      [name, emoji, sets, reps, unit, xp_reward, order_index, is_active, Array.isArray(schedule) ? schedule : null, id]
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

module.exports = router;
