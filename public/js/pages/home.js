// ── Home / Activity page ─────────────────────────────────────
const HomePage = (() => {
  let _refreshTimer = null;
  let _todayStatus  = null;
  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">JuGus Do-It 💪</span>
            <span class="header-rank">Notre progression</span>
          </div>
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
      grid.innerHTML = `<p style="color:var(--text3);text-align:center;grid-column:1/-1;padding:40px 0">Aucun joueur encore</p>`;
      return;
    }

    if (users.length === 1) grid.classList.add('single');

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
        } else {
          dayBadge = `<div class="player-day-badge empty">&#x1F634; Pas encore commencé</div>`;
        }
      }

      return `
        <div class="player-card${isMe ? ' is-me' : ''}" style="animation:fadeIn 0.3s ease both;animation-delay:${i * 0.06}s" onclick="Router.navigate('profile',{userId:${u.id}})" role="button" tabindex="0">
          <div class="player-avatar">${avatar}</div>
          <div class="player-name">${name}</div>
          <div class="player-rank-title">${rank.title}</div>
          <div class="player-xp-bar">
            <div class="player-xp-bar-track">
              <div class="player-xp-bar-fill" style="width:${progress.pct}%"></div>
            </div>
            <div class="player-xp-labels">
              <span>${progress.inRank} XP</span>
              <span>${progress.needed} XP</span>
            </div>
          </div>
          <div class="player-xp-badge">${u.xp} XP</div>
          ${dayBadge}
        </div>
      `;
    }).join('');
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

  return { render, init, logout, destroy };
})();
