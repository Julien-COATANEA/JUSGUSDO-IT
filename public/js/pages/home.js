// ── Home / Activity page ─────────────────────────────────────
const HomePage = (() => {
  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">JuGus Do-It 💪</span>
            <span class="header-rank">Notre progression</span>
          </div>
          <button class="icon-btn" onclick="App.showProfileModal()" title="Mon profil">✏️</button>
          <button class="icon-btn" style="color:var(--text3)" onclick="HomePage.logout()" title="Déconnexion">🚪</button>
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
    try {
      const { users } = await API.getUsers();
      renderActivity(users);
    } catch (err) {
      document.getElementById('activity-container').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  function renderActivity(users) {
    const me = JSON.parse(localStorage.getItem('user') || '{}');
    const grid = document.getElementById('players-grid');
    if (!grid) return;

    if (!users.length) {
      grid.innerHTML = `<p style="color:var(--text3);text-align:center;grid-column:1/-1;padding:40px 0">Aucun joueur encore</p>`;
      return;
    }

    if (users.length === 1) grid.classList.add('single');

    grid.innerHTML = users.map(u => {
      const rank     = Gamification.getRank(u.xp);
      const progress = Gamification.getProgress(u.xp);
      const isMe     = u.id === me.id;
      const avatar   = u.avatar || rank.emoji;
      return `
        <div class="player-card${isMe ? ' is-me' : ''}">
          <div class="player-avatar">${avatar}</div>
          <div class="player-name">${escapeHtml(u.username)}</div>
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
        </div>
      `;
    }).join('');
  }

  function logout() {
    App.showConfirm('Déconnexion', 'Tu veux vraiment te déconnecter ?', (ok) => {
      if (!ok) return;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      Router.navigate('login');
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, init, logout };
})();
