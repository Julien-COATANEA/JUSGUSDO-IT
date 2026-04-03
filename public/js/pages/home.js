// ── Home / Leaderboard page ───────────────────────────────────
const HomePage = (() => {
  function render() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">JuGus Do-It 💪</span>
            <span class="header-rank">Classement</span>
          </div>
          ${user.is_admin ? `<button class="icon-btn" onclick="Router.navigate('admin')" title="Admin">⚙️</button>` : ''}
          <button class="icon-btn" onclick="Router.navigate('app')" title="Mon programme">📅</button>
          <button class="icon-btn" style="color:var(--text3)" onclick="HomePage.logout()" title="Déconnexion">🚪</button>
        </header>

        <div id="leaderboard-container" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      </div>
    `;
  }

  async function init() {
    try {
      const { users } = await API.getUsers();
      renderLeaderboard(users);
    } catch (err) {
      document.getElementById('leaderboard-container').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  function renderLeaderboard(users) {
    const me = JSON.parse(localStorage.getItem('user') || '{}');
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    if (!users.length) {
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Aucun joueur encore</p>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    container.innerHTML = `
      <h2 style="text-align:center;font-size:18px;color:var(--text2);margin-bottom:4px;">🏆 Classement</h2>
      ${users.map((u, i) => {
        const rank = Gamification.getRank(u.xp);
        const progress = Gamification.getProgress(u.xp);
        const isMe = u.id === me.id;
        return `
          <div class="leaderboard-card${isMe ? ' leaderboard-me' : ''}" onclick="Router.navigate('app')">
            <div class="lb-rank">${medals[i] || `#${i+1}`}</div>
            <div class="lb-avatar">${rank.emoji}</div>
            <div class="lb-info">
              <div class="lb-name">${escapeHtml(u.username)}${isMe ? ' <span style="color:var(--accent3);font-size:11px;">(moi)</span>' : ''}</div>
              <div class="lb-rank-name">${rank.title}</div>
              <div class="lb-xp-bar-track">
                <div class="lb-xp-bar-fill" style="width:${progress.pct}%"></div>
              </div>
            </div>
            <div class="lb-xp">${u.xp} XP</div>
          </div>
        `;
      }).join('')}
    `;
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
