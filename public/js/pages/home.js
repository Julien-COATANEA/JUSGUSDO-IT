// ── Home / Activity page ─────────────────────────────────────
const HomePage = (() => {
  let _refreshTimer  = null;
  let _todayStatus   = null;

  // Troll message catalogue (also referenced in profile.js)
  const TROLL_MSGS = {
    lazy:   { text: "Il paraît que t'as séché l'entraînement 😅",   emoji: '😴' },
    weak:   { text: "Mon grand-père soulève plus que toi 👴",         emoji: '💪' },
    ghost:  { text: "La salle te cherche… elle t'a pas vu 👻",        emoji: '👻' },
    turtle: { text: "Ta progression est en mode tortue 🐢",           emoji: '🐢' },
    cake:   { text: "T'as mangé le gâteau au lieu de squatter 🎂",    emoji: '🎂' },
    skip:   { text: "Toujours le même exo depuis 3 mois… 🥱",         emoji: '🥱' },
    snail:  { text: "Tu bats le record mondial… de lenteur 🐌",        emoji: '🐌' },
  };

  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">JuGus Do-It 💪</span>
            <span class="header-rank">Notre progression</span>
          </div>
          <button class="home-minigame-btn" onclick="MiniGame.open()" title="Mini-jeu">🎯 Jouer</button>
          <button class="icon-btn" onclick="App.showProfileModal()" title="Mon profil"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="theme-toggle" id="theme-toggle-btn" onclick="App.toggleTheme()" title="Thème"></button>
          <button class="icon-btn" style="color:var(--text3)" onclick="HomePage.logout()" title="Déconnexion"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
        </header>

        <div id="activity-container">
          <p class="home-title">Chacun à son rythme 🌱</p>
          <div class="players-grid" id="players-grid">
            <div class="skeleton-card" style="height:220px"></div>
            <div class="skeleton-card" style="height:220px"></div>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    // Sync theme toggle icon
    App.initTheme();
    const today = new Date().toISOString().split('T')[0];
    try {
      const [{ users }, checklistData, exercisesData] = await Promise.all([
        API.getUsers(),
        API.getChecklist(today, today),
        API.getExercises(),
      ]);
      _todayStatus = {
        done:  checklistData.entries.filter(e => e.completed).length,
        total: exercisesData.exercises.length,
      };
      renderActivity(users);
    } catch (err) {
      document.getElementById('activity-container').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
    clearInterval(_refreshTimer);
    _refreshTimer = setInterval(async () => {
      if (!document.getElementById('players-grid')) { clearInterval(_refreshTimer); return; }
      try {
        const [{ users }, checklistData, exercisesData] = await Promise.all([
          API.getUsers(),
          API.getChecklist(today, today),
          API.getExercises(),
        ]);
        _todayStatus = {
          done:  checklistData.entries.filter(e => e.completed).length,
          total: exercisesData.exercises.length,
        };
        renderActivity(users);
      } catch (_) {}
    }, 60_000);
  }

  function renderActivity(users) {
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    const grid = document.getElementById('players-grid');
    if (!grid) return;

    if (!users.length) {
      grid.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Aucun joueur encore</p>`;
      return;
    }

    grid.innerHTML = users.map((u, i) => {
      const rank     = Gamification.getRank(u.xp);
      const progress = Gamification.getProgress(u.xp);
      const isMe     = u.id === me.id;
      const avatar   = u.avatar || rank.emoji;
      const name     = escapeHtml(u.username.charAt(0).toUpperCase() + u.username.slice(1));

      let dayBadge = '';
      if (isMe && _todayStatus && _todayStatus.total > 0) {
        const { done, total } = _todayStatus;
        if (done >= total) {
          dayBadge = `<div class="player-day-badge done">&#x2705; Journée complète !</div>`;
        } else if (done > 0) {
          dayBadge = `<div class="player-day-badge partial">&#x1F4AA; ${done}&thinsp;/&thinsp;${total} aujourd'hui</div>`;
        }
      }

      const trollBtn = !isMe
        ? `<button class="player-troll-btn" onclick="event.stopPropagation();HomePage.openTrollSheet(${u.id},'${name}')" title="Envoyer un troll 😜">😜</button>`
        : '';
      return `
        <div class="player-card${isMe ? ' is-me' : ''}" style="animation:fadeIn 0.3s ease both;animation-delay:${i * 0.06}s" onclick="Router.navigate('profile',{userId:${u.id}})" role="button" tabindex="0">
          <div class="player-avatar">${avatar}</div>
          <div class="player-card-body">
            <div class="player-name">${name}</div>
            <div class="player-rank-title">${rank.emoji} ${rank.title}</div>
            <div class="player-xp-bar">
              <div class="player-xp-bar-track">
                <div class="player-xp-bar-fill" style="width:${progress.pct}%"></div>
              </div>
              <div class="player-xp-labels">
                <span>${progress.inRank} / ${progress.needed} XP</span>
              </div>
            </div>
          </div>
          <div class="player-card-side">
            <div class="player-xp-badge">${u.xp} XP</div>
            ${trollBtn}
            ${dayBadge}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Troll sheet ─────────────────────────────────────────────
  function openTrollSheet(targetId, targetName) {
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    const tokens = me.tokens ?? 0;
    const existing = document.getElementById('troll-overlay');
    if (existing) existing.remove();

    const msgsHtml = Object.entries(TROLL_MSGS).map(([key, m]) =>
      `<button class="troll-msg-btn" onclick="HomePage.sendTroll(${targetId},'${key}',this)">
         <span class="troll-msg-emoji">${m.emoji}</span>
         <span class="troll-msg-text">${m.text}</span>
         <span class="troll-msg-cost">💎×1</span>
       </button>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'troll-overlay';
    overlay.className = 'troll-overlay';
    overlay.innerHTML = `
      <div class="troll-sheet" onclick="event.stopPropagation()">
        <div class="mg-handle"></div>
        <div class="troll-sheet-header">
          <div class="troll-sheet-title">😜 Troller ${targetName}</div>
          <div class="troll-sheet-balance">Tu as <strong>${tokens}</strong> 💎</div>
        </div>
        ${tokens < 1
          ? `<div class="troll-no-gems">Pas assez de gemmes 😢<br><small>Gagne des 💎 au mini-jeu !</small></div>`
          : `<div class="troll-msgs-list">${msgsHtml}</div>`
        }
        <div id="troll-feedback" class="troll-feedback" style="display:none"></div>
        <button class="troll-close-btn" onclick="HomePage.closeTrollSheet()">Fermer</button>
      </div>`;
    overlay.addEventListener('click', closeTrollSheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('troll-visible'));
  }

  async function sendTroll(targetId, key, btnEl) {
    const allBtns = document.querySelectorAll('.troll-msg-btn');
    allBtns.forEach(b => b.disabled = true);
    try {
      const res = await API.sendTroll(targetId, key);
      // Update local token count
      const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      me.tokens = res.tokens;
      const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
      storage.setItem('user', JSON.stringify(me));
      // Show feedback
      const fb = document.getElementById('troll-feedback');
      if (fb) {
        fb.style.display = 'block';
        fb.innerHTML = `✅ Troll envoyé ! Il reste <strong>${res.tokens}</strong> 💎`;
      }
      const msgList = document.querySelector('.troll-msgs-list');
      if (msgList) msgList.style.display = 'none';
      const bal = document.querySelector('.troll-sheet-balance');
      if (bal) bal.style.display = 'none';
    } catch (err) {
      const fb = document.getElementById('troll-feedback');
      if (fb) {
        fb.style.display = 'block';
        fb.className = 'troll-feedback troll-feedback--err';
        fb.textContent = err.message || 'Erreur lors de l\'envoi';
      }
      allBtns.forEach(b => b.disabled = false);
    }
  }

  function closeTrollSheet() {
    const overlay = document.getElementById('troll-overlay');
    if (!overlay) return;
    overlay.classList.remove('troll-visible');
    setTimeout(() => overlay.remove(), 280);
  }

  function logout() {
    App.showConfirm('Déconnexion', 'Tu veux vraiment te déconnecter ?', (ok) => {
      if (!ok) return;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      Router.navigate('login');
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function destroy() { clearInterval(_refreshTimer); }

  return { render, init, logout, destroy, openTrollSheet, sendTroll, closeTrollSheet, TROLL_MSGS };
})();
