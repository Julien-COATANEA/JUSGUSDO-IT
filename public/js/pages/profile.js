// ── Profile / Stats page ─────────────────────────────────────
const ProfilePage = (() => {
  let _profileUserId  = null;
  let _isOwnProfile   = false;
  let _calendarWeeks  = [];
  let _calPage        = 0; // 0 = most recent N weeks, higher = older
  let _calPageSize     = 4; // computed dynamically from card width
  let _activeStatsTab = 'maison'; // 'maison' | 'salle'
  let _gymCalendarWeeks = [];
  let _gymCalPage       = 0;

  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')" title="Retour" style="margin-right:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div class="header-info" style="flex:1">
            <span class="header-username">Profil</span>
          </div>
        </header>
        <div id="profile-content" style="padding:16px 16px 100px">
          <div class="skeleton-card" style="height:180px;margin-bottom:16px"></div>
          <div class="skeleton-card" style="height:80px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:140px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:120px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:100px"></div>
        </div>
      </div>
    `;
  }

  async function init({ userId } = {}) {
    const container = document.getElementById('profile-content');
    if (!container) return;

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    _profileUserId = userId ? parseInt(userId, 10) : currentUser.id;
    _isOwnProfile  = _profileUserId === currentUser.id;

    try {
      const fetches = [
        API.getUserStats(_profileUserId),
        API.getGymStats(_profileUserId),
      ];
      if (_isOwnProfile) fetches.push(API.getWizz(_profileUserId));
      const results = await Promise.all(fetches);
      const { user, stats } = results[0];
      const gymStats  = results[1]?.stats || null;
      const wizzData  = _isOwnProfile ? results[2] : null;

      container.innerHTML = _renderAll(user, stats, gymStats, wizzData);
      requestAnimationFrame(_autoSizeCalendar);
      requestAnimationFrame(_autoSizeGymCalendar);
      // Mark as read silently
      if (_isOwnProfile && wizzData?.unread > 0) {
        API.markWizzRead(_profileUserId).catch(() => {});
      }
      // Initialise notification status UI
      if (_isOwnProfile) _updateNotifUI().catch(() => {});
    } catch (err) {
      console.error('[Profile] Erreur de chargement:', err);
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  // ── Main renderer ───────────────────────────────────────────
  function _renderAll(user, stats, gymStats, wizzData = null) {
    const rank     = Gamification.getRank(user.xp);
    const progress = Gamification.getProgress(user.xp);
    const avatar   = user.avatar || rank.emoji;
    const name     = _escape(user.username.charAt(0).toUpperCase() + user.username.slice(1));
    const hasUnread = wizzData?.unread > 0;

    return `
      ${_renderHero(avatar, name, rank, progress, stats, user.tokens)}

      <div class="profile-tabs">
        <button class="profile-tab active" id="ptab-stats" onclick="ProfilePage.switchTab('stats')">📊 Stats</button>
        ${wizzData !== null
          ? `<button class="profile-tab" id="ptab-wizz" onclick="ProfilePage.switchTab('wizz')">⚡ Wizz${hasUnread ? ` <span class="wizz-tab-badge">${wizzData.unread}</span>` : ''}</button>`
          : ''}
      </div>

      <div id="profile-panel-stats">
        <div class="profile-stats-tab-bar">
          <button class="profile-stats-tab${_activeStatsTab === 'maison' ? ' active' : ''}" onclick="ProfilePage.switchStatsTab('maison')">🏠 Maison</button>
          <button class="profile-stats-tab${_activeStatsTab === 'salle' ? ' active' : ''}" onclick="ProfilePage.switchStatsTab('salle')">🏋️ Salle</button>
        </div>
        <div id="profile-stats-maison" ${_activeStatsTab !== 'maison' ? 'style="display:none"' : ''}>
          ${_renderTodayBadge(stats)}
          ${_renderCalendar(stats.calendar)}
          ${_renderXpChart(stats.xp_history)}
          ${_renderChallenges(stats)}
          ${_renderTopEx(stats.top_exercises)}
          ${_isOwnProfile ? _renderNotifSection() : ''}
        </div>
        <div id="profile-stats-salle" ${_activeStatsTab !== 'salle' ? 'style="display:none"' : ''}>
          ${gymStats ? _renderGymStats(gymStats) : '<p style="color:var(--text3);text-align:center;padding:32px 0">Aucune donnée salle pour le moment.<br>Commence une séance dans l\'onglet Muscu !</p>'}
        </div>
      </div>

      ${wizzData !== null ? `<div id="profile-panel-wizz" style="display:none">${_renderWizz(wizzData.wizzes)}</div>` : ''}
    `;
  }

  // ── Tab switch ──────────────────────────────────────────────
  function switchTab(tab) {
    const panels = ['stats', 'wizz'];
    panels.forEach(p => {
      const panel = document.getElementById(`profile-panel-${p}`);
      const btn   = document.getElementById(`ptab-${p}`);
      if (panel) panel.style.display = p === tab ? 'block' : 'none';
      if (btn)   btn.classList.toggle('active', p === tab);
    });
    document.getElementById('admin-content')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }

  function switchStatsTab(tab) {
    _activeStatsTab = tab;
    const maisonPanel = document.getElementById('profile-stats-maison');
    const sallePanel  = document.getElementById('profile-stats-salle');
    if (maisonPanel) maisonPanel.style.display = tab === 'maison' ? 'block' : 'none';
    if (sallePanel)  sallePanel.style.display  = tab === 'salle'  ? 'block' : 'none';
    document.querySelectorAll('.profile-stats-tab').forEach(btn => {
      btn.classList.toggle('active',
        (btn.textContent.includes('Maison') && tab === 'maison') ||
        (btn.textContent.includes('Salle')  && tab === 'salle'));
    });
    if (tab === 'salle') requestAnimationFrame(_autoSizeGymCalendar);
  }

  // ── Gym (salle) stats renderer ─────────────────────────────
  function _renderGymStats(gymStats) {
    const simpleCards = [
      { label: 'Exercices cochés', value: gymStats.total_completed, icon: '✅' },
      { label: 'Jours complets',   value: gymStats.full_days,       icon: '🔥' },
      { label: 'Meilleure série',  value: gymStats.best_streak + '\u202fj', icon: '🏆' },
      { label: 'Série actuelle',   value: gymStats.current_streak + '\u202fj', icon: '⚡' },
      { label: 'Jours actifs',     value: gymStats.active_days,     icon: '📅' },
    ];

    const statsGridHtml = `<div class="profile-stats-grid" style="animation:fadeIn 0.3s ease 0.04s both">
      ${simpleCards.map(c => `
        <div class="profile-stat-card">
          <span class="profile-stat-icon">${c.icon}</span>
          <span class="profile-stat-value">${c.value}</span>
          <span class="profile-stat-label">${c.label}</span>
        </div>`).join('')}
    </div>`;

    return `
      ${statsGridHtml}
      ${_renderGymCalendar(gymStats.calendar)}
    `;
  }

  function _renderGymCalendar(calendar) {
    if (!calendar || !calendar.length) return '';
    const today = new Date().toISOString().split('T')[0];
    const DAY_LABELS = ['L','M','M','J','V','S','D'];

    _gymCalendarWeeks = [];
    for (let i = 0; i < calendar.length; i += 7) {
      _gymCalendarWeeks.push(calendar.slice(i, i + 7));
    }
    _gymCalPage = 0;

    const weeksSlice = _gymCalendarWeeks;
    const pagerLabel = _gymCalPagerLabel(weeksSlice);

    const dayLabelsHtml = `<div class="cal-day-labels">
      <div class="cal-month-spacer"></div>
      ${DAY_LABELS.map(l => `<div class="cal-day-lbl">${l}</div>`).join('')}
    </div>`;

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.1s both" id="gym-cal-section">
        <div class="cal-section-header">
          <div class="profile-section-title" style="margin-bottom:0">Activité salle</div>
          <div class="cal-pager">
            <button class="cal-pager-btn" id="gym-cal-prev" onclick="ProfilePage.gymCalPage(1)" title="Semaines précédentes" disabled>‹</button>
            <span class="cal-pager-label" id="gym-cal-pager-label">${pagerLabel}</span>
            <button class="cal-pager-btn" id="gym-cal-next" onclick="ProfilePage.gymCalPage(-1)" title="Semaines suivantes" disabled>›</button>
          </div>
        </div>
        <div class="cal-heatmap-wrap cal-sz-lg" id="gym-cal-heatmap-wrap">
          ${dayLabelsHtml}
          <div class="cal-weeks-row" id="gym-cal-weeks-row">
            ${_renderGymWeeks(weeksSlice, today)}
          </div>
        </div>
        <div class="cal-legend">
          <div class="cal-cell full"  style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>Séance complète</span>
          <div class="cal-cell partial" style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>En cours</span>
          <div class="cal-cell empty" style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>Aucun</span>
        </div>
      </div>`;
  }

  function _renderGymWeeks(weeks, today) {
    let lastMonth = null;
    return weeks.map(week => {
      const d = new Date(week[0].date + 'T12:00:00');
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      let monthLabel = '';
      if (monthKey !== lastMonth) {
        lastMonth = monthKey;
        monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
      }
      const cells = week.map(day => {
        const pct = day.total > 0 ? day.done / day.total : 0;
        const cls = day.date > today ? 'future'
                  : pct >= 1        ? 'full'
                  : pct > 0         ? 'partial'
                  :                   'empty';
        return `<div class="cal-cell ${cls}${day.date === today ? ' cal-today' : ''}" title="${day.date} · ${day.done}/${day.total}"></div>`;
      }).join('');
      return `<div class="cal-week-col"><div class="cal-month-label">${monthLabel}</div>${cells}</div>`;
    }).join('');
  }

  function _gymCalPagerLabel(weeks) {
    if (!weeks.length) return '';
    const firstDay = weeks[0][0].date;
    const lastWeek = weeks[weeks.length - 1];
    const lastDay  = lastWeek[lastWeek.length - 1].date;
    const opts     = { day: 'numeric', month: 'short' };
    const first    = new Date(firstDay + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    const last     = new Date(lastDay  + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    return `${first} – ${last}`;
  }

  function _autoSizeGymCalendar() {
    const wrap = document.getElementById('gym-cal-heatmap-wrap');
    if (!wrap || !_gymCalendarWeeks.length) return;
    const labels  = wrap.querySelector('.cal-day-labels');
    const labelsW = labels ? labels.offsetWidth + 4 : 32;
    const available = wrap.clientWidth - labelsW - 4;
    const cellSz = 24 + 5;
    const pageSize = Math.max(1, Math.floor(available / cellSz));
    _gymCalPage = 0;
    const today      = new Date().toISOString().split('T')[0];
    const total = _gymCalendarWeeks.length;
    const end   = total;
    const start = Math.max(0, end - pageSize);
    const weeksSlice = _gymCalendarWeeks.slice(start, end);
    const maxPage = Math.max(0, Math.ceil(_gymCalendarWeeks.length / pageSize) - 1);
    const weeksRow = document.getElementById('gym-cal-weeks-row');
    if (weeksRow) weeksRow.innerHTML = _renderGymWeeks(weeksSlice, today);
    const labelEl  = document.getElementById('gym-cal-pager-label');
    if (labelEl)  labelEl.textContent = _gymCalPagerLabel(weeksSlice);
    const prevBtn  = document.getElementById('gym-cal-prev');
    const nextBtn  = document.getElementById('gym-cal-next');
    if (prevBtn) prevBtn.disabled = maxPage === 0;
    if (nextBtn) nextBtn.disabled = true;
  }

  function gymCalPage(delta) {
    const maxPage = Math.max(0, Math.ceil(_gymCalendarWeeks.length / _calPageSize) - 1);
    _gymCalPage = Math.max(0, Math.min(maxPage, _gymCalPage + delta));
    const total = _gymCalendarWeeks.length;
    const end   = total - _gymCalPage * _calPageSize;
    const start = Math.max(0, end - _calPageSize);
    const weeksSlice = _gymCalendarWeeks.slice(start, Math.max(0, end));
    const today      = new Date().toISOString().split('T')[0];
    const weeksRow = document.getElementById('gym-cal-weeks-row');
    if (weeksRow) weeksRow.innerHTML = _renderGymWeeks(weeksSlice, today);
    const labelEl = document.getElementById('gym-cal-pager-label');
    if (labelEl)  labelEl.textContent = _gymCalPagerLabel(weeksSlice);
    const prevBtn = document.getElementById('gym-cal-prev');
    const nextBtn = document.getElementById('gym-cal-next');
    if (prevBtn) prevBtn.disabled = _gymCalPage >= maxPage;
    if (nextBtn) nextBtn.disabled = _gymCalPage <= 0;
  }

  // ── 1. Hero card ────────────────────────────────────────────
  function _renderHero(avatar, name, rank, progress, stats, tokens) {
    const simpleCards = [
      { label: 'Exercices',      value: stats.total_completed,            icon: '✅' },
      { label: 'Jours complets', value: stats.full_days,                  icon: '🔥' },
      { label: 'Meilleure série',value: stats.best_streak + '\u202fj',    icon: '🏆' },
      { label: 'Série actuelle', value: stats.current_streak + '\u202fj', icon: '⚡' },
      { label: 'Jours actifs',   value: stats.active_days,                icon: '📅' },
    ];
    const tokenCard = tokens > 0
      ? `<div class="profile-stat-card profile-stat-card--token" title="Les gemmes servent à envoyer des Wizz à tes coéquipiers">
           <span class="profile-stat-icon ptb-icon" style="filter:drop-shadow(0 0 5px rgba(100,180,255,0.9))">💎</span>
           <span class="profile-stat-value" style="color:#7dd3fc;text-shadow:0 0 10px rgba(100,180,255,0.5)">${tokens}</span>
           <span class="profile-stat-label">Gemme${tokens > 1 ? 's' : ''}</span>
           <span class="profile-stat-sublabel">Pour envoyer des Wizz ⚡</span>
         </div>`
      : '';
    return `
      <div class="profile-hero" style="animation:fadeIn 0.3s ease">
        <div class="profile-hero-avatar${_isOwnProfile ? ' profile-hero-avatar--editable' : ''}" ${_isOwnProfile ? 'onclick="ProfilePage.openAvatarPicker()" title="Changer l\'avatar"' : ''}>${avatar}${_isOwnProfile ? '<span class="profile-hero-avatar-edit">✏️</span>' : ''}</div>
        <div class="profile-hero-name">${name}</div>
        <div class="profile-hero-rank">${rank.emoji} ${rank.title}</div>
        <div class="player-xp-bar" style="margin-top:12px;width:100%;max-width:280px;">
          <div class="player-xp-bar-track">
            <div class="player-xp-bar-fill" style="width:${progress.pct}%"></div>
          </div>
          <div class="player-xp-labels">
            <span>${progress.inRank} XP</span>
            <span>${progress.needed} XP</span>
          </div>
        </div>
      </div>
      <div class="profile-stats-grid" style="animation:fadeIn 0.3s ease 0.04s both">
        ${simpleCards.map(c => `
          <div class="profile-stat-card">
            <span class="profile-stat-icon">${c.icon}</span>
            <span class="profile-stat-value">${c.value}</span>
            <span class="profile-stat-label">${c.label}</span>
          </div>`).join('')}
        ${tokenCard}
      </div>`;
  }

  // ── 2. Statut du jour ───────────────────────────────────────
  function _renderTodayBadge(stats) {
    const { today_done: done, today_total: total } = stats;
    if (!total) return '';
    let cls, icon, msg;
    if (done >= total)      { cls = 'done';    icon = '✅'; msg = `Journée complète ! (${done}/${total})`; }
    else if (done > 0)      { cls = 'partial'; icon = '💪'; msg = `${done}\u202f/\u202f${total} exercices aujourd'hui`; }
    else                    { cls = 'empty';   icon = '😴'; msg = `Pas encore commencé aujourd'hui`; }
    return `
      <div class="profile-today-badge ${cls}" style="animation:fadeIn 0.3s ease 0.07s both">
        <span class="profile-today-icon">${icon}</span>
        <span class="profile-today-msg">${msg}</span>
      </div>`;
  }

  // ── 3. Calendrier — autant de semaines que la carte peut afficher ─

  function _renderCalendar(calendar) {
    if (!calendar || !calendar.length) return '';
    const today = new Date().toISOString().split('T')[0];
    const DAY_LABELS = ['L','M','M','J','V','S','D'];

    // Group into ISO weeks of 7 (data already aligned to Monday)
    _calendarWeeks = [];
    for (let i = 0; i < calendar.length; i += 7) {
      _calendarWeeks.push(calendar.slice(i, i + 7));
    }
    _calPage = 0; // reset to most recent page

    // Initial render with all weeks; _autoSizeCalendar() will trim to fit after paint
    const weeksSlice = _calendarWeeks;
    const pagerLabel = _calPagerLabel(weeksSlice);

    const dayLabelsHtml = `<div class="cal-day-labels">
      <div class="cal-month-spacer"></div>
      ${DAY_LABELS.map(l => `<div class="cal-day-lbl">${l}</div>`).join('')}
    </div>`;

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.1s both" id="cal-section">
        <div class="cal-section-header">
          <div class="profile-section-title" style="margin-bottom:0">Activité</div>
          <div class="cal-pager">
            <button class="cal-pager-btn" id="cal-prev" onclick="ProfilePage.calPage(1)" title="Semaines précédentes" disabled>‹</button>
            <span class="cal-pager-label" id="cal-pager-label">${pagerLabel}</span>
            <button class="cal-pager-btn" id="cal-next" onclick="ProfilePage.calPage(-1)" title="Semaines suivantes" disabled>›</button>
          </div>
        </div>
        <div class="cal-heatmap-wrap cal-sz-lg" id="cal-heatmap-wrap">
          ${dayLabelsHtml}
          <div class="cal-weeks-row" id="cal-weeks-row">
            ${_renderWeeks(weeksSlice, today)}
          </div>
        </div>
        <div class="cal-legend">
          <div class="cal-cell full"  style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>Complet</span>
          <div class="cal-cell partial" style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>Partiel</span>
          <div class="cal-cell empty" style="width:14px;height:14px;border-radius:4px;flex-shrink:0"></div><span>Aucun</span>
        </div>
      </div>`;
  }

  function _calWeeksForPage(page) {
    const total = _calendarWeeks.length;
    const end   = total - page * _calPageSize;
    const start = Math.max(0, end - _calPageSize);
    return _calendarWeeks.slice(start, Math.max(0, end));
  }

  function _autoSizeCalendar() {
    const wrap = document.getElementById('cal-heatmap-wrap');
    if (!wrap || !_calendarWeeks.length) return;
    const labels  = wrap.querySelector('.cal-day-labels');
    const labelsW = labels ? labels.offsetWidth + 4 : 32;
    const available = wrap.clientWidth - labelsW - 4;
    const cellSz = 24 + 5; // --cal-sz + --cal-gap for cal-sz-lg
    _calPageSize = Math.max(1, Math.floor(available / cellSz));
    _calPage = 0;
    const today      = new Date().toISOString().split('T')[0];
    const weeksSlice = _calWeeksForPage(0);
    const maxPage    = Math.max(0, Math.ceil(_calendarWeeks.length / _calPageSize) - 1);
    const weeksRow   = document.getElementById('cal-weeks-row');
    if (weeksRow) weeksRow.innerHTML = _renderWeeks(weeksSlice, today);
    const labelEl  = document.getElementById('cal-pager-label');
    if (labelEl)  labelEl.textContent = _calPagerLabel(weeksSlice);
    const prevBtn  = document.getElementById('cal-prev');
    const nextBtn  = document.getElementById('cal-next');
    if (prevBtn) prevBtn.disabled = maxPage === 0;
    if (nextBtn) nextBtn.disabled = true;
  }

  function _calPagerLabel(weeks) {
    if (!weeks.length) return '';
    const firstDay = weeks[0][0].date;
    const lastWeek = weeks[weeks.length - 1];
    const lastDay  = lastWeek[lastWeek.length - 1].date;
    const opts     = { day: 'numeric', month: 'short' };
    const first    = new Date(firstDay + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    const last     = new Date(lastDay  + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    return `${first} – ${last}`;
  }

  function calPage(delta) {
    // delta +1 = go to older weeks (page++), delta -1 = go to newer (page--)
    const maxPage = Math.max(0, Math.ceil(_calendarWeeks.length / _calPageSize) - 1);
    _calPage = Math.max(0, Math.min(maxPage, _calPage + delta));

    const today      = new Date().toISOString().split('T')[0];
    const weeksSlice = _calWeeksForPage(_calPage);

    const weeksRow = document.getElementById('cal-weeks-row');
    if (weeksRow) weeksRow.innerHTML = _renderWeeks(weeksSlice, today);

    const labelEl = document.getElementById('cal-pager-label');
    if (labelEl) labelEl.textContent = _calPagerLabel(weeksSlice);

    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    if (prevBtn) prevBtn.disabled = _calPage >= maxPage;
    if (nextBtn) nextBtn.disabled = _calPage <= 0;
  }

  function _renderWeeks(weeks, today) {
    let lastMonth = null;
    return weeks.map(week => {
      const d = new Date(week[0].date + 'T12:00:00');
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      let monthLabel = '';
      if (monthKey !== lastMonth) {
        lastMonth = monthKey;
        monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
      }
      const cells = week.map(day => {
        const pct = day.total > 0 ? day.done / day.total : 0;
        const cls = day.date > today ? 'future'
                  : pct >= 1        ? 'full'
                  : pct > 0         ? 'partial'
                  :                   'empty';
        return `<div class="cal-cell ${cls}${day.date === today ? ' cal-today' : ''}" title="${day.date} · ${day.done}/${day.total}"></div>`;
      }).join('');
      return `<div class="cal-week-col"><div class="cal-month-label">${monthLabel}</div>${cells}</div>`;
    }).join('');
  }

  function _calSizeClass(n) {
    // kept for compatibility but no longer used by the paginated calendar
    if (n <= 4)  return 'cal-sz-lg';
    if (n <= 13) return 'cal-sz-md';
    if (n <= 26) return 'cal-sz-sm';
    return 'cal-sz-xs';
  }

  function setCalFilter(n, btn) {
    // Legacy — no longer used; pagination handled by calPage()
  }

  // ── 4. Graphique XP 30 jours (SVG inline) ──────────────────
  function _renderXpChart(xpHistory) {
    if (!xpHistory || !xpHistory.length) return '';

    // Build full 30-day array
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    const xpMap = {};
    xpHistory.forEach(r => { xpMap[r.date] = r.xp_earned; });
    const values = days.map(d => xpMap[d] || 0);
    const maxVal = Math.max(...values, 1);

    const W = 320, H = 80, PAD = 4;
    const barW = (W - PAD * 2) / 30 - 1;
    const bars = values.map((v, i) => {
      const bh   = Math.max(2, Math.round((v / maxVal) * (H - 12)));
      const x    = PAD + i * ((W - PAD * 2) / 30);
      const y    = H - bh;
      const fill = v > 0 ? 'var(--accent3)' : 'var(--border)';
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${bh}" rx="2" fill="${fill}" opacity="${v > 0 ? 0.9 : 1}"/>`;
    }).join('');

    // X-axis labels: first and last date
    const label0 = days[0].slice(5).replace('-', '/');
    const label1 = days[29].slice(5).replace('-', '/');

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.13s both">
        <div class="profile-section-title">XP — 30 derniers jours</div>
        <svg viewBox="0 0 ${W} ${H + 14}" width="100%" style="display:block;overflow:visible">
          ${bars}
          <text x="${PAD}" y="${H + 13}" font-size="9" fill="var(--text3)" font-family="Inter,sans-serif">${label0}</text>
          <text x="${W - PAD}" y="${H + 13}" font-size="9" fill="var(--text3)" font-family="Inter,sans-serif" text-anchor="end">${label1}</text>
        </svg>
      </div>`;
  }

  // ── 5. Défis motivationnels ─────────────────────────────────
  function _renderChallenges(stats) {
    const challenges = [
      {
        icon: '🔥', title: 'Série de 3 jours',
        desc: 'Compléter 3 jours consécutifs',
        current: Math.min(stats.current_streak, 3), target: 3,
      },
      {
        icon: '⚡', title: 'Série de 7 jours',
        desc: '7 jours complets d\'affilée',
        current: Math.min(stats.current_streak, 7), target: 7,
      },
      {
        icon: '💪', title: '10 exercices',
        desc: '10 exercices complétés au total',
        current: Math.min(stats.total_completed, 10), target: 10,
      },
      {
        icon: '🏆', title: '30 exercices',
        desc: '30 exercices complétés au total',
        current: Math.min(stats.total_completed, 30), target: 30,
      },
      {
        icon: '📅', title: '10 jours complets',
        desc: 'Terminer 10 journées entières',
        current: Math.min(stats.full_days, 10), target: 10,
      },
      {
        icon: '🌟', title: 'Régularité',
        desc: '20 jours actifs au total',
        current: Math.min(stats.active_days, 20), target: 20,
      },
    ];

    const items = challenges.map(c => {
      const done = c.current >= c.target;
      const pct  = Math.round((c.current / c.target) * 100);
      return `
        <div class="challenge-item${done ? ' done' : ''}">
          <span class="challenge-icon">${done ? '✅' : c.icon}</span>
          <div class="challenge-body">
            <div class="challenge-title">${c.title}</div>
            <div class="challenge-bar-track">
              <div class="challenge-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="challenge-progress">${c.current}\u202f/\u202f${c.target}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.16s both">
        <div class="profile-section-title">Défis</div>
        ${items}
      </div>`;
  }

  // ── 6. Top exercices ────────────────────────────────────────
  function _renderTopEx(topExercises) {
    if (!topExercises.length) return '';
    const rows = topExercises.map((ex, i) => `
      <div class="profile-top-ex">
        <span class="profile-top-ex-rank">#${i + 1}</span>
        <span class="profile-top-ex-name">${_escape(ex.name)}</span>
        <span class="profile-top-ex-times">${ex.times}×</span>
      </div>`).join('');
    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.19s both">
        <div class="profile-section-title">Top exercices</div>
        ${rows}
      </div>`;
  }

  function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── 7 (was Muscu) → moved to muscu.js ──────────────────────

  // ── Wizz received ─────────────────────────────────────────
  function _renderWizz(wizzes) {
    const introHtml = `<div class="wizz-intro">
      <span class="wizz-intro-icon">⚡</span>
      <p>Les <strong>Wizz</strong> sont des petites piques envoyées par tes coéquipiers pour te motiver (ou taquiner 😏). Chaque envoi coûte <strong>💎 1 gemme</strong> à l'expéditeur.</p>
    </div>`;
    // WIZZ_MSGS may be defined in home.js (same page context) or fallback inline
    const MSGS = (typeof HomePage !== 'undefined' && HomePage.WIZZ_MSGS) || {
      lazy:   { text: "Toujours en échauffement ou tu comptes vraiment t'y mettre ? 😏", emoji: '😴' },
      weak:   { text: "Même ta gourde porte plus lourd que toi aujourd'hui 🫣",           emoji: '🏋️' },
      ghost:  { text: "La salle t'a vu passer... puis plus rien 👻",                      emoji: '👻' },
      turtle: { text: "À ce rythme, même l'échauffement te distance 🐢",                  emoji: '🐢' },
      cake:   { text: "T'as pris un PR sur le buffet, pas sur la barre 🍰",               emoji: '🍰' },
      skip:   { text: "Toujours la même perf, collector mais pas menaçante 😮‍💨",         emoji: '😮‍💨' },
      snail:  { text: "Le chrono s'est endormi avant la fin de ta série 🐌",              emoji: '🐌' },
    };

    if (!wizzes || wizzes.length === 0) {
      return `<div class="profile-section" style="animation:fadeIn 0.3s ease both">
        ${introHtml}
        <div class="profile-section-title" style="margin-bottom:12px">😇 Aucun wizz reçu</div>
        <p style="color:var(--text2);font-size:14px">Aucun petit pique pour l'instant — profite-en 💪</p>
      </div>`;
    }

    const items = wizzes.map(t => {
      const msg  = t.message_key === 'custom' && t.custom_text
        ? { text: t.custom_text, emoji: '✍️' }
        : (MSGS[t.message_key] || { text: t.message_key, emoji: '⚡' });
      const date = new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `<div class="wizz-received-item${t.read ? '' : ' wizz-unread'}">
        <span class="wizz-item-emoji">${msg.emoji}</span>
        <div class="wizz-item-body">
          <div class="wizz-item-text">${_escape(msg.text)}</div>
          <div class="wizz-item-meta">De <strong>${_escape(t.sender_name)}</strong> · ${date}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="profile-section" style="animation:fadeIn 0.3s ease both">
      ${introHtml}
      <div class="profile-section-title" style="margin-bottom:12px">⚡ Wizz reçus</div>
      <div class="wizz-received-list">${items}</div>
    </div>`;
  }

  // ── 8. Notifications push ───────────────────────────────────
  function _renderNotifSection() {
    if (typeof Notifications === 'undefined' || !Notifications.isSupported()) return '';
    const reminderTime = typeof Notifications.getReminderTime === 'function'
      ? Notifications.getReminderTime()
      : '19:00';

    return `
      <div class="profile-section" id="notif-section" style="animation:fadeIn 0.3s ease 0.22s both">
        <div class="profile-section-title">🔔 Notifications</div>
        <div class="notif-row" id="notif-row" style="display:flex;align-items:center;gap:12px;margin-top:8px">
          <span class="notif-status-text" id="notif-status-text" style="flex:1;font-size:13px;color:var(--text2)">Vérification…</span>
          <button class="notif-toggle-btn" id="notif-toggle-btn" onclick="ProfilePage.toggleNotif()" style="display:none;padding:6px 14px;border-radius:20px;border:none;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent3);color:#fff">—</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">
          <label for="notif-time-input" style="font-size:13px;color:var(--text2);font-weight:600">Heure :</label>
          <input type="time" id="notif-time-input" value="${reminderTime}" onchange="ProfilePage.saveNotifTime(this.value)" style="padding:7px 10px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font:inherit">
          <button id="notif-test-btn" onclick="ProfilePage.testNotif()" style="padding:7px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer">Tester</button>
        </div>
        <p id="notif-help-text" style="font-size:12px;color:var(--text3);margin-top:6px;line-height:1.4">Active les notifications pour recevoir le rappel quotidien et les Wizz.</p>
      </div>`;
  }

  async function _updateNotifUI() {
    const statusEl = document.getElementById('notif-status-text');
    const btnEl    = document.getElementById('notif-toggle-btn');
    const timeEl   = document.getElementById('notif-time-input');
    const testBtn  = document.getElementById('notif-test-btn');
    const helpEl   = document.getElementById('notif-help-text');
    if (!statusEl || !btnEl) return;

    const info         = await Notifications.currentStatus();
    const status       = typeof info === 'string' ? info : info.state;
    const reminderTime = info?.reminderTime || (typeof Notifications.getReminderTime === 'function' ? Notifications.getReminderTime() : '19:00');

    if (timeEl) timeEl.value = reminderTime;

    if (status === 'unsupported') {
      statusEl.textContent = 'Notifications non supportées sur cet appareil.';
      btnEl.style.display = 'none';
      if (testBtn) testBtn.disabled = true;
      return;
    }
    if (status === 'denied') {
      statusEl.textContent = 'Notifications bloquées — autorisez-les dans les réglages.';
      btnEl.style.display = 'none';
      if (testBtn) testBtn.disabled = true;
      return;
    }

    if (status === 'server-unavailable') {
      statusEl.textContent = 'Le service de rappel est indisponible pour le moment.';
      btnEl.textContent    = 'Réessayer';
      btnEl.style.background = 'var(--accent3)';
      btnEl.style.color      = '#fff';
      btnEl.style.display    = 'inline-block';
      if (testBtn) testBtn.disabled = true;
      if (helpEl) helpEl.textContent = 'Vérifie que le serveur push est bien configuré, puis réessaie.';
      return;
    }

    if (status === 'sync-needed') {
      statusEl.textContent = `Abonnement incomplet — relance l’activation pour ${reminderTime}.`;
      btnEl.textContent    = 'Réactiver';
      btnEl.style.background = 'var(--accent3)';
      btnEl.style.color      = '#fff';
      btnEl.style.display    = 'inline-block';
      if (testBtn) testBtn.disabled = false;
      if (helpEl) helpEl.textContent = `Rappel prévu à ${reminderTime}. Utilise “Tester” pour vérifier immédiatement.`;
      return;
    }

    if (status === 'subscribed') {
      statusEl.textContent   = `Rappel activé ✅ à ${reminderTime}`;
      btnEl.textContent      = 'Désactiver';
      btnEl.style.background = 'var(--card2)';
      btnEl.style.color      = 'var(--text2)';
      if (testBtn) testBtn.disabled = false;
      if (helpEl) helpEl.textContent = 'Choisis l’heure souhaitée. Les rappels et les Wizz arriveront aussi en notification.';
    } else {
      statusEl.textContent   = 'Rappel désactivé';
      btnEl.textContent      = 'Activer';
      btnEl.style.background = 'var(--accent3)';
      btnEl.style.color      = '#fff';
      if (testBtn) testBtn.disabled = true;
      if (helpEl) helpEl.textContent = `Le rappel sera envoyé chaque jour à ${reminderTime} une fois activé.`;
    }

    btnEl.style.display = 'inline-block';
  }

  async function saveNotifTime(value) {
    const inputEl = document.getElementById('notif-time-input');
    if (inputEl) inputEl.disabled = true;

    try {
      const result = await Notifications.updateReminderTime(value || '19:00');
      if (result?.savedLocally) {
        App.showToast(`Heure enregistrée : ${result.reminderTime}`);
      } else {
        App.showToast(`Rappel programmé à ${result.reminderTime}`);
      }
    } catch (err) {
      App.showToast(err.message || 'Impossible de changer l\'heure du rappel');
    } finally {
      if (inputEl) inputEl.disabled = false;
      await _updateNotifUI();
    }
  }

  async function testNotif() {
    const btnEl = document.getElementById('notif-test-btn');
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Envoi…';
    }

    try {
      await Notifications.sendTest();
      App.showToast('Notification de test envoyée ✅');
    } catch (err) {
      App.showToast(err.message || 'Impossible d\'envoyer le test');
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = 'Tester';
      }
    }
  }

  async function toggleNotif() {
    const btnEl  = document.getElementById('notif-toggle-btn');
    const timeEl = document.getElementById('notif-time-input');
    const chosenTime = timeEl?.value || '19:00';

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = '…';
    }

    try {
      const info = await Notifications.currentStatus();
      const status = typeof info === 'string' ? info : info.state;
      if (status === 'subscribed') {
        await Notifications.unsubscribe();
      } else {
        await Notifications.subscribe(chosenTime);
      }
    } catch (err) {
      App.showToast(err.message || 'Impossible de modifier le rappel');
    } finally {
      await _updateNotifUI();
      if (btnEl) btnEl.disabled = false;
    }
  }

  // ── Avatar picker ───────────────────────────────────────────
  const _AVATAR_OPTIONS = [
    '💪','🔥','⚡','🏆','🌟','🦁','🐺','🦅','🏋️','🤸','🧗','🤼',
    '🚴','🏃','🧘','🤾','🎯','🥊','🏊','⛷️','🤺','🦊','🐉','🔱',
  ];

  function openAvatarPicker() {
    const existing = document.getElementById('avatar-picker-overlay');
    if (existing) existing.remove();

    const optionsHtml = _AVATAR_OPTIONS.map(e =>
      `<button class="avatar-opt" onclick="ProfilePage.selectAvatar('${e}')">${e}</button>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'avatar-picker-overlay';
    overlay.className = 'avatar-picker-overlay';
    overlay.innerHTML = `
      <div class="avatar-picker-sheet" onclick="event.stopPropagation()">
        <div class="mg-handle"></div>
        <div class="avatar-picker-title">Choisir un avatar</div>
        <div class="avatar-picker-grid">${optionsHtml}</div>
        <button class="wizz-close-btn" onclick="document.getElementById('avatar-picker-overlay').remove()">Annuler</button>
      </div>`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('avatar-picker-visible'));
  }

  async function selectAvatar(emoji) {
    const overlay = document.getElementById('avatar-picker-overlay');
    if (overlay) overlay.remove();
    try {
      const res = await API.updateProfile({ avatar: emoji });
      const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
      const u = JSON.parse(storage.getItem('user') || '{}');
      u.avatar = emoji;
      storage.setItem('user', JSON.stringify(u));
      // Update avatar on screen without full re-render
      const avatarEl = document.querySelector('.profile-hero-avatar');
      if (avatarEl) avatarEl.childNodes[0].textContent = emoji;
    } catch (err) {
      App.showToast('Erreur : ' + err.message);
    }
  }

  return { render, init, switchTab, switchStatsTab, calPage, gymCalPage, setCalFilter, toggleNotif, saveNotifTime, testNotif, openAvatarPicker, selectAvatar };
})();

