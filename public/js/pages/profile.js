// ── Profile / Stats page ─────────────────────────────────────
const ProfilePage = (() => {
  let _userId = null;

  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')" title="Retour" style="margin-right:8px;">&#x2190;</button>
          <div class="header-info" style="flex:1">
            <span class="header-username">Profil</span>
          </div>
        </header>
        <div id="profile-content" style="padding:16px 16px 100px">
          <div class="skeleton-card" style="height:160px;margin-bottom:16px"></div>
          <div class="skeleton-card" style="height:120px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:120px"></div>
        </div>
      </div>
    `;
  }

  async function init({ userId } = {}) {
    _userId = userId;
    const container = document.getElementById('profile-content');
    if (!container) return;

    try {
      const { user, stats } = await API.getUserStats(userId);
      container.innerHTML = _renderStats(user, stats);
    } catch (err) {
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  function _renderStats(user, stats) {
    const rank     = Gamification.getRank(user.xp);
    const progress = Gamification.getProgress(user.xp);
    const avatar   = user.avatar || rank.emoji;

    const statCards = [
      { label: 'Exercices faits',   value: stats.total_completed,  icon: '✅' },
      { label: 'Jours actifs',      value: stats.active_days,       icon: '📅' },
      { label: 'Jours complets',    value: stats.full_days,         icon: '🔥' },
      { label: 'Série actuelle',    value: stats.current_streak + ' j', icon: '⚡' },
      { label: 'Meilleure série',   value: stats.best_streak + ' j',    icon: '🏆' },
      { label: 'XP total',          value: user.xp,                icon: '⭐' },
    ];

    const topExHtml = stats.top_exercises.length
      ? stats.top_exercises.map((ex, i) => `
          <div class="profile-top-ex">
            <span class="profile-top-ex-rank">#${i + 1}</span>
            <span class="profile-top-ex-name">${_escape(ex.name)}</span>
            <span class="profile-top-ex-times">${ex.times}×</span>
          </div>`).join('')
      : `<p style="color:var(--text3);font-size:13px;text-align:center;padding:12px 0">Aucun exercice complété</p>`;

    return `
      <div class="profile-hero" style="animation:fadeIn 0.3s ease">
        <div class="profile-hero-avatar">${avatar}</div>
        <div class="profile-hero-name">${_escape(user.username)}</div>
        <div class="profile-hero-rank">${rank.emoji} ${rank.title}</div>
        <div class="player-xp-bar" style="margin-top:12px;">
          <div class="player-xp-bar-track">
            <div class="player-xp-bar-fill" style="width:${progress.pct}%"></div>
          </div>
          <div class="player-xp-labels">
            <span>${progress.inRank} XP</span>
            <span>${progress.needed} XP</span>
          </div>
        </div>
      </div>

      <div class="profile-stats-grid" style="animation:fadeIn 0.3s ease 0.05s both">
        ${statCards.map(c => `
          <div class="profile-stat-card">
            <span class="profile-stat-icon">${c.icon}</span>
            <span class="profile-stat-value">${c.value}</span>
            <span class="profile-stat-label">${c.label}</span>
          </div>`).join('')}
      </div>

      ${stats.top_exercises.length ? `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.1s both">
        <div class="profile-section-title">Top exercices</div>
        ${topExHtml}
      </div>` : ''}
    `;
  }

  function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, init };
})();
