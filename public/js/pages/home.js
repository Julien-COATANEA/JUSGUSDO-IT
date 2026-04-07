// ── Home / Activity page ─────────────────────────────────────
const HomePage = (() => {
  let _refreshTimer  = null;
  let _todayStatus   = null;

  // Wizz message catalogue (also referenced in profile.js)
  const WIZZ_MSGS = {
    lazy:   { text: "Toujours en échauffement ou tu comptes vraiment t'y mettre FDP ? ", emoji: '😴' },
    weak:   { text: "Même ta gourde porte plus lourd que toi !",           emoji: '🏋️' },
    ghost:  { text: "La salle t'a vu passer... puis plus rien",                      emoji: '👻' },
    turtle: { text: "À ce rythme, entraine toi pas",                  emoji: '🐢' },
    cake:   { text: "T'as pris un PR sur le buffet, pas sur la barre ",               emoji: '🍰' },
    skip:   { text: "Toujours la même perf, collector mais pas menaçante ",         emoji: '😮‍💨' },
    snail:  { text: "Le chrono s'est endormi avant la fin de ta série ",              emoji: '🐌' },
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

      const wizzBtn = !isMe
        ? `<button class="player-wizz-btn" onclick="event.stopPropagation();HomePage.openWizzSheet(${u.id},'${name}')" title="Envoyer un wizz ⚡">⚡</button>`
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
            ${wizzBtn}
            ${dayBadge}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Wizz sheet ──────────────────────────────────────────────
  async function openWizzSheet(targetId, targetName) {
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (!me.id) return;
    const existing = document.getElementById('wizz-overlay');
    if (existing) existing.remove();

    // Fetch live token count (localStorage may be stale)
    let tokens = 0;
    try {
      const status = await API.getMinigameStatus(me.id);
      tokens = status.tokens ?? 0;
    } catch (_) {}

    const msgsHtml = Object.entries(WIZZ_MSGS).map(([key, m]) =>
      `<button class="wizz-msg-btn" onclick="HomePage.sendWizz(${targetId},'${key}',this)">
         <span class="wizz-msg-emoji">${m.emoji}</span>
         <span class="wizz-msg-text">${m.text}</span>
         <span class="wizz-msg-cost">💎×1</span>
       </button>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'wizz-overlay';
    overlay.className = 'wizz-overlay';
    overlay.innerHTML = `
      <div class="wizz-sheet" onclick="event.stopPropagation()">
        <div class="mg-handle"></div>
        <div class="wizz-sheet-header">
          <div class="wizz-sheet-title">⚡ Envoyer un wizz à ${targetName}</div>
          <div class="wizz-sheet-balance">Tu as <strong>${tokens}</strong> 💎</div>
        </div>
        ${tokens < 1
          ? `<div class="wizz-no-gems">Pas assez de gemmes 😢<br><small>Gagne des 💎 au mini-jeu !</small></div>`
          : `<div class="wizz-msgs-list">${msgsHtml}</div>`
        }
        <div id="wizz-feedback" class="wizz-feedback" style="display:none"></div>
        <button class="wizz-close-btn" onclick="HomePage.closeWizzSheet()">Fermer</button>
      </div>`;
    overlay.addEventListener('click', closeWizzSheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('wizz-visible'));
  }

  async function sendWizz(targetId, key, btnEl) {
    const allBtns = document.querySelectorAll('.wizz-msg-btn');
    allBtns.forEach(b => b.disabled = true);
    try {
      const res = await API.sendWizz(targetId, key);
      // Update local token count
      const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      me.tokens = res.tokens;
      const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
      storage.setItem('user', JSON.stringify(me));
      // Show feedback
      const fb = document.getElementById('wizz-feedback');
      if (fb) {
        fb.style.display = 'block';
        fb.innerHTML = `✅ Wizz envoyé ! Il reste <strong>${res.tokens}</strong> 💎`;
      }
      const msgList = document.querySelector('.wizz-msgs-list');
      if (msgList) msgList.style.display = 'none';
      const bal = document.querySelector('.wizz-sheet-balance');
      if (bal) bal.style.display = 'none';
    } catch (err) {
      const fb = document.getElementById('wizz-feedback');
      if (fb) {
        fb.style.display = 'block';
        fb.className = 'wizz-feedback wizz-feedback--err';
        fb.textContent = err.message || 'Erreur lors de l\'envoi';
      }
      allBtns.forEach(b => b.disabled = false);
    }
  }

  function closeWizzSheet() {
    const overlay = document.getElementById('wizz-overlay');
    if (!overlay) return;
    overlay.classList.remove('wizz-visible');
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

  return { render, init, logout, destroy, openWizzSheet, sendWizz, closeWizzSheet, WIZZ_MSGS };
})();
