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
          <button class="icon-btn" style="color:var(--text3)" onclick="HomePage.logout()" title="Déconnexion">🚪</button>
        </header>

        <div id="leaderboard-container" style="padding:0 0 20px;display:flex;flex-direction:column;gap:0;">
          <div style="padding:16px 16px 8px"><div class="skeleton-card"></div></div>
          <div style="padding:0 16px 8px"><div class="skeleton-card"></div></div>
          <div style="padding:0 16px 8px"><div class="skeleton-card"></div></div>
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

    // Podium (top 3)
    const podiumUsers = users.slice(0, 3);
    const listUsers   = users.slice(3);

    let podiumHtml = '';
    if (podiumUsers.length >= 1) {
      const slots = [];
      // order: p2 (2nd) left, p1 (1st) center, p3 (3rd) right
      const order = [1, 0, 2]; // index in podiumUsers
      const slotClass = ['p2', 'p1', 'p3'];
      const crowns = ['', '👑', ''];
      const posLabel = ['2', '1', '3'];

      for (let s = 0; s < 3; s++) {
        const u = podiumUsers[order[s]];
        if (!u) continue;
        const rank = Gamification.getRank(u.xp);
        const isMe = u.id === me.id;
        slots.push(`
          <div class="podium-slot ${slotClass[s]}">
            <div class="podium-avatar">
              ${crowns[s] ? `<span class="podium-crown">${crowns[s]}</span>` : ''}
              ${rank.emoji}
            </div>
            <div class="podium-name">${escapeHtml(u.username)}${isMe ? ' ✦' : ''}</div>
            <div class="podium-xp">${u.xp} XP</div>
            <div class="podium-base">${posLabel[s]}</div>
          </div>
        `);
      }
      podiumHtml = `<div class="podium">${slots.join('')}</div>`;
    }

    let listHtml = '';
    if (listUsers.length) {
      listHtml = `
        <div class="leaderboard-section-title" style="padding:0 16px 0">Autres joueurs</div>
        ${listUsers.map((u, i) => {
          const rank = Gamification.getRank(u.xp);
          const progress = Gamification.getProgress(u.xp);
          const isMe = u.id === me.id;
          return `
            <div class="leaderboard-card${isMe ? ' leaderboard-me' : ''}">
              <div class="lb-pos">#${i + 4}</div>
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

    container.innerHTML = `
      <div class="home-hero">
        <h2 style="text-align:center;font-size:16px;font-weight:800;color:var(--text2);letter-spacing:0.5px;text-transform:uppercase;">🏆 Classement</h2>
        ${podiumHtml}
      </div>
      <div class="leaderboard-list">
        ${listHtml}
      </div>
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
