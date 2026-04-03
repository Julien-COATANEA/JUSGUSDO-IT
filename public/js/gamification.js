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

  return { showToast, showLevelUp, closeModal, showConfirm, closeConfirm };
})();
