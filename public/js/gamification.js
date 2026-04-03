// ── Gamification helpers ─────────────────────────────────────
const Gamification = (() => {
  const RANKS = [
    { min: 0,    title: 'Débutant',       emoji: '🌱' },
    { min: 100,  title: 'Guerrier',       emoji: '🗡️' },
    { min: 400,  title: 'Champion',       emoji: '🏆' },
    { min: 1000, title: 'Légende',        emoji: '⚡' },
    { min: 2000, title: 'Dieu du Muscle', emoji: '🔱' },
  ];

  const RANK_XP_NEEDED = [100, 300, 600, 1000, Infinity];

  function getRank(xp) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (xp >= RANKS[i].min) return { ...RANKS[i], index: i };
    }
    return { ...RANKS[0], index: 0 };
  }

  function getProgress(xp) {
    const rank = getRank(xp);
    const nextMin = rank.index < RANKS.length - 1 ? RANKS[rank.index + 1].min : null;
    if (!nextMin) return { pct: 100, inRank: xp - rank.min, needed: '∞' };
    const inRank = xp - rank.min;
    const rangeSize = nextMin - rank.min;
    return {
      pct: Math.min(100, Math.round((inRank / rangeSize) * 100)),
      inRank,
      needed: rangeSize,
      nextRank: RANKS[rank.index + 1],
    };
  }

  function spawnXPPopup(el, text) {
    const rect = el.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'xp-popup';
    popup.textContent = text;
    popup.style.left = `${rect.left + rect.width / 2 - 30}px`;
    popup.style.top = `${rect.top + window.scrollY - 10}px`;
    document.body.appendChild(popup);
    popup.addEventListener('animationend', () => popup.remove());
  }

  function launchConfetti(count = 30) {
    const colors = ['#e94560','#4ecdc4','#f5c518','#7c5cbf','#2ecc71','#ff7292'];
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = `${Math.random() * 100}vw`;
        c.style.top = `${Math.random() * 40}vh`;
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.width = `${6 + Math.random() * 8}px`;
        c.style.height = `${6 + Math.random() * 8}px`;
        c.style.animationDuration = `${1 + Math.random()}s`;
        document.body.appendChild(c);
        c.addEventListener('animationend', () => c.remove());
      }, Math.random() * 400);
    }
  }

  return { getRank, getProgress, spawnXPPopup, launchConfetti, RANKS };
})();

// ── Global App helpers ───────────────────────────────────────
const App = (() => {
  let _confirmCb = null;

  let _toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function showLevelUp(rank) {
    document.getElementById('modal-emoji').textContent = rank.emoji;
    document.getElementById('modal-title').textContent = `Rang atteint : ${rank.title} !`;
    document.getElementById('modal-desc').textContent =
      `Félicitations ! Tu as atteint le rang "${rank.title}". Continue comme ça, tu es une machine ! 💪`;
    document.getElementById('levelup-modal').style.display = 'flex';
    Gamification.launchConfetti(80);
  }

  function closeModal() {
    document.getElementById('levelup-modal').style.display = 'none';
  }

  function showConfirm(title, desc, cb) {
    _confirmCb = cb;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-desc').textContent = desc;
    document.getElementById('confirm-modal').style.display = 'flex';
  }

  function closeConfirm(ok) {
    document.getElementById('confirm-modal').style.display = 'none';
    if (_confirmCb) _confirmCb(ok);
    _confirmCb = null;
  }

  // ── Profile modal ──────────────────────────────────────────
  const AVATARS = [
    '🐯','🦁','🐻','🐼','🐨','🐸',
    '🦊','🐙','🦋','🐺','🦄','🐲',
    '🦖','🦍','🎧','👩‍💻','🧙','🥷',
    '🔥','💪','⚡','🏆','🚀','🎯',
  ];
  let _profileAvatar = null;

  function showProfileModal() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    _profileAvatar = user.avatar || '💪';
    document.getElementById('profile-username').value = user.username || '';
    document.getElementById('profile-error').textContent = '';
    document.getElementById('profile-avatar-preview').textContent = _profileAvatar;
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = AVATARS.map((a, i) =>
      `<button type="button" class="avatar-opt${a === _profileAvatar ? ' selected' : ''}" data-idx="${i}">${a}</button>`
    ).join('');
    grid.onclick = (e) => {
      const btn = e.target.closest('.avatar-opt');
      if (!btn) return;
      _profileAvatar = AVATARS[parseInt(btn.dataset.idx)];
      document.getElementById('profile-avatar-preview').textContent = _profileAvatar;
      grid.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    document.getElementById('profile-modal').style.display = 'flex';
  }

  async function saveProfile() {
    const username = document.getElementById('profile-username').value.trim().toLowerCase();
    const errEl = document.getElementById('profile-error');
    const btn = document.getElementById('profile-save-btn');
    errEl.textContent = '';
    if (!username || username.length < 3) {
      errEl.textContent = 'Pseudo trop court (min 3 caractères)';
      return;
    }
    btn.disabled = true;
    try {
      const { token, user } = await API.updateProfile({ username, avatar: _profileAvatar });
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      const usernameEl = document.getElementById('header-username');
      if (usernameEl) usernameEl.textContent = user.username;
      const avatarEl = document.getElementById('header-avatar-btn');
      if (avatarEl) avatarEl.textContent = user.avatar || '💪';
      if (document.getElementById('players-grid') && typeof HomePage !== 'undefined') HomePage.init();
      closeProfileModal();
      showToast('✅ Profil mis à jour !');
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
    }
  }

  function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
    const btn = document.getElementById('profile-save-btn');
    if (btn) btn.disabled = false;
  }

  return { showToast, showLevelUp, closeModal, showConfirm, closeConfirm, showProfileModal, saveProfile, closeProfileModal };
})();
