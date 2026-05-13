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

// GET /api/admin/gym-sessions — all gym sessions with their exercises
// (assignment system removed — sessions are no longer scheduled per user)
router.get('/gym-sessions', requireAdmin, async (req, res) => {
  try {
    const [sessionDefs, exResult] = await Promise.all([
      db.query(`SELECT name, icon, color FROM gym_sessions ORDER BY order_index, name`),
      db.query(
        `SELECT id, name, emoji, sets, reps, unit, gym_session, order_index
         FROM exercises WHERE type = 'gym' AND is_active = TRUE
         ORDER BY gym_session, order_index, id`
      ),
    ]);

    const exBySession = {};
    exResult.rows.forEach(ex => {
      const key = ex.gym_session || 'Autre';
      if (!exBySession[key]) exBySession[key] = [];
      exBySession[key].push(ex);
    });

    const sessions = sessionDefs.rows.map(def => ({
      name: def.name,
      icon: def.icon,
      color: def.color,
      exercises: exBySession[def.name] || [],
      assignments: [],
      assigned_users: [],
    }));

    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/gym-sessions — create a new session
router.post('/gym-sessions', requireAdmin, async (req, res) => {
  const { name, icon, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom de la séance est requis' });
  }
  try {
    await db.query(
      `INSERT INTO gym_sessions (name, icon, color, order_index)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(order_index), 0) + 1 FROM gym_sessions))`,
      [name.trim(), icon || '💪', color || '#e94560']
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Une séance avec ce nom existe déjà' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/gym-sessions/:name — rename or update icon/color
// Renames are propagated to exercises.gym_session, gym_session_assignments
// and gym_checklist_entries (history) so past activity stays attributed to
// the renamed session. No checklist row is ever deleted, so stats are
// preserved.
router.put('/gym-sessions/:name', requireAdmin, async (req, res) => {
  const { name } = req.params;
  const { name: newNameRaw, icon, color } = req.body || {};
  const newName = typeof newNameRaw === 'string' ? newNameRaw.trim() : '';
  const renaming = newName && newName !== name;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT name FROM gym_sessions WHERE name = $1 FOR UPDATE',
      [name]
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Séance introuvable' });
    }

    if (renaming) {
      const dup = await client.query(
        'SELECT 1 FROM gym_sessions WHERE name = $1',
        [newName]
      );
      if (dup.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Une séance avec ce nom existe déjà' });
      }
      // Update the PK first, then propagate the textual references.
      await client.query(
        `UPDATE gym_sessions SET name = $1,
                icon = COALESCE($2, icon),
                color = COALESCE($3, color)
         WHERE name = $4`,
        [newName, icon ?? null, color ?? null, name]
      );
      await client.query(
        `UPDATE exercises SET gym_session = $1 WHERE gym_session = $2`,
        [newName, name]
      );
      await client.query(
        `UPDATE gym_checklist_entries SET session_name = $1 WHERE session_name = $2`,
        [newName, name]
      );
    } else {
      await client.query(
        `UPDATE gym_sessions
         SET icon = COALESCE($1, icon),
             color = COALESCE($2, color)
         WHERE name = $3`,
        [icon ?? null, color ?? null, name]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, name: renaming ? newName : name });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin] update gym-session', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// DELETE /api/admin/gym-sessions/:name — remove a gym session and unlink its
// exercises. The historical gym_checklist_entries rows are intentionally NOT
// deleted: there is no FK to gym_sessions/exercises on that table, so past
// progression and stats stay intact.
router.delete('/gym-sessions/:name', requireAdmin, async (req, res) => {
  const { name } = req.params;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT name FROM gym_sessions WHERE name = $1 FOR UPDATE',
      [name]
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Séance introuvable' });
    }

    // Detach exercises that belonged to this session: keep them in the
    // catalogue but unassigned from any session and archived so they no
    // longer appear in the gym scheduler. We do NOT delete them, so any
    // user_exercise_assignments / checklist data stay valid.
    await client.query(
      `UPDATE exercises
       SET gym_session = NULL, is_active = FALSE
       WHERE gym_session = $1 AND type = 'gym'`,
      [name]
    );
    await client.query('DELETE FROM gym_sessions WHERE name = $1', [name]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin] delete gym-session', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Gym work zones (groups + sub-zones) ──────────────────────────────────

// GET /api/admin/gym-zones — flat list ordered for tree rendering
router.get('/gym-zones', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, parent_id, name, icon, color, order_index
       FROM gym_zones
       ORDER BY parent_id NULLS FIRST, order_index, id`
    );
    res.json({ zones: result.rows });
  } catch (err) {
    console.error('[admin] list zones', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/gym-zones  body: { parent_id?, name, icon?, color?, order_index? }
router.post('/gym-zones', requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom de la zone est requis' });
  const parentId = req.body.parent_id ? parseInt(req.body.parent_id, 10) : null;
  const icon = req.body.icon || '💪';
  const color = req.body.color || '#e94560';
  const orderIndex = req.body.order_index != null ? parseInt(req.body.order_index, 10) : null;
  try {
    if (parentId) {
      const parentRes = await db.query('SELECT id FROM gym_zones WHERE id = $1', [parentId]);
      if (!parentRes.rows[0]) return res.status(400).json({ error: 'Zone parent introuvable' });
    }
    const finalOrder = orderIndex != null
      ? orderIndex
      : (await db.query(
          `SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM gym_zones WHERE COALESCE(parent_id, 0) = $1`,
          [parentId || 0]
        )).rows[0].n;
    const result = await db.query(
      `INSERT INTO gym_zones (parent_id, name, icon, color, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parent_id, name, icon, color, order_index`,
      [parentId, name, icon, color, finalOrder]
    );
    res.status(201).json({ zone: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Une zone avec ce nom existe déjà à ce niveau' });
    }
    console.error('[admin] create zone', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/gym-zones/:id  body: { name?, icon?, color?, order_index?, parent_id? }
router.put('/gym-zones/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID invalide' });
  const { name, icon, color, order_index, parent_id } = req.body || {};
  const cleanName = typeof name === 'string' ? name.trim() : null;
  const newParent = parent_id !== undefined ? (parent_id ? parseInt(parent_id, 10) : null) : undefined;
  try {
    if (newParent !== undefined && newParent === id) {
      return res.status(400).json({ error: 'Une zone ne peut pas être son propre parent' });
    }
    if (newParent) {
      const parentRes = await db.query('SELECT id FROM gym_zones WHERE id = $1', [newParent]);
      if (!parentRes.rows[0]) return res.status(400).json({ error: 'Zone parent introuvable' });
    }
    const result = await db.query(
      `UPDATE gym_zones SET
         name        = COALESCE($1, name),
         icon        = COALESCE($2, icon),
         color       = COALESCE($3, color),
         order_index = COALESCE($4, order_index),
         parent_id   = CASE WHEN $5::boolean THEN $6 ELSE parent_id END
       WHERE id = $7
       RETURNING id, parent_id, name, icon, color, order_index`,
      [
        cleanName || null,
        icon || null,
        color || null,
        order_index != null ? parseInt(order_index, 10) : null,
        newParent !== undefined,
        newParent !== undefined ? newParent : null,
        id,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Zone introuvable' });
    res.json({ zone: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Une zone avec ce nom existe déjà à ce niveau' });
    }
    console.error('[admin] update zone', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/gym-zones/:id — cascades to children + entries via FK
router.delete('/gym-zones/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID invalide' });
  try {
    const result = await db.query('DELETE FROM gym_zones WHERE id = $1 RETURNING id', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Zone introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] delete zone', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
