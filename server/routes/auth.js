const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username et mot de passe requis' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username trop court (min 3 caractères)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, is_admin, xp, avatar',
      [username.trim().toLowerCase(), hash]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.status(201).json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin, xp: user.xp, avatar: user.avatar } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username et mot de passe requis' });
  }

  try {
    const result = await db.query(
      'SELECT id, username, password_hash, is_admin, xp, avatar FROM users WHERE username = $1',
      [username.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin, xp: user.xp, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT id, username, is_admin, xp, avatar FROM users WHERE id = $1',
      [payload.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: result.rows[0] });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// PATCH /api/auth/profile — update username and/or avatar
router.patch('/profile', requireAuth, async (req, res) => {
  const { username, avatar } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ error: 'Pseudo trop court (min 3 caractères)' });
  }
  try {
    const result = await db.query(
      `UPDATE users
       SET username = $1, avatar = COALESCE($2, avatar)
       WHERE id = $3
       RETURNING id, username, is_admin, xp, avatar`,
      [username.trim().toLowerCase(), avatar || null, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = result.rows[0];
    const newToken = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token: newToken, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
