// ── Profile / Stats page ─────────────────────────────────────
const ProfilePage = (() => {
  let _profileUserId  = null;
  let _isOwnProfile   = false;
  let _calendarWeeks  = [];
  let _calPage        = 0; // 0 = most recent N weeks, higher = older
  let _calPageSize     = 4; // computed dynamically from card width

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
        API.getMuscleRecords(_profileUserId),
      ];
      if (_isOwnProfile) fetches.push(API.getWizz(_profileUserId));
      const results = await Promise.all(fetches);
      const { user, stats } = results[0];
      const { records }     = results[1];
      const wizzData        = _isOwnProfile ? results[2] : null;

      // Fetch muscle history for sparklines (best-effort, non-blocking)
      let muscleHistory = [];
      try {
        const { history } = await API.getMuscleHistory(_profileUserId, '');
        muscleHistory = history || [];
      } catch (_) {}

      container.innerHTML = _renderAll(user, stats, records, wizzData, muscleHistory);
      requestAnimationFrame(_autoSizeCalendar);
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
  function _renderAll(user, stats, records = [], wizzData = null, muscleHistory = []) {
    const rank     = Gamification.getRank(user.xp);
    const progress = Gamification.getProgress(user.xp);
    const avatar   = user.avatar || rank.emoji;
    const name     = _escape(user.username.charAt(0).toUpperCase() + user.username.slice(1));
    const hasUnread = wizzData?.unread > 0;

    return `
      ${_renderHero(avatar, name, rank, progress, stats, user.tokens)}

      <div class="profile-tabs">
        <button class="profile-tab active" id="ptab-stats"   onclick="ProfilePage.switchTab('stats')">📊 Stats</button>
        <button class="profile-tab"        id="ptab-records" onclick="ProfilePage.switchTab('records')">🏋️ Muscu</button>
        ${wizzData !== null
          ? `<button class="profile-tab" id="ptab-wizz" onclick="ProfilePage.switchTab('wizz')">⚡ Wizz${hasUnread ? ` <span class="wizz-tab-badge">${wizzData.unread}</span>` : ''}</button>`
          : ''}
      </div>

      <div id="profile-panel-stats">
        ${_renderTodayBadge(stats)}
        ${_renderCalendar(stats.calendar)}
        ${_renderXpChart(stats.xp_history)}
        ${_renderChallenges(stats)}
        ${_renderTopEx(stats.top_exercises)}
        ${_isOwnProfile ? _renderNotifSection() : ''}
      </div>

      <div id="profile-panel-records" style="display:none">
        ${_renderMuscleRecords(records, user.username, muscleHistory)}
      </div>

      ${wizzData !== null ? `<div id="profile-panel-wizz" style="display:none">${_renderWizz(wizzData.wizzes)}</div>` : ''}
    `;
  }

  // ── Tab switch ──────────────────────────────────────────────
  function switchTab(tab) {
    const panels = ['stats', 'records', 'wizz'];
    panels.forEach(p => {
      const panel = document.getElementById(`profile-panel-${p}`);
      const btn   = document.getElementById(`ptab-${p}`);
      if (panel) panel.style.display = p === tab ? 'block' : 'none';
      if (btn)   btn.classList.toggle('active', p === tab);
    });
    document.getElementById('admin-content')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
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

  // ── 7. Muscu — Séances & Records ────────────────────────────
  const _MUSCU_SESSIONS = [
    {
      name: 'Pecs Triceps', icon: '💪', color: '#e94560',
      exercises: [
        'Développé Couché Haltères',
        'Développé Couché Barres',
        'Développé Couché Incliné',
        'Écarté Poulie',
        'Triceps Corde (extension poulie basse)',
        'Triceps Corde (extension poulie haute)',
        'Dips',
      ],
    },
    {
      name: 'Dos Biceps', icon: '🏋️', color: '#7c5cbf',
      exercises: [
        'Tirage Bucheron',
        'Tirage Verticale',
        'Tirage Horizontale',
        'Traction',
        'Curl Haltère',
        'Curl Barre',
        'Curl Marteau',
      ],
    },
    {
      name: 'Jambes', icon: '🦵', color: '#22d18b',
      exercises: [
        'Ischios Assis',
        'Leg Extension',
        'Presses',
        'Adducteurs',
        'Fentes',
        'Squats',
        'Mollets',
      ],
    },
    {
      name: 'Full', icon: '⚡', color: '#fbbf24',
      exercises: [
        'Développé Couché Barre',
        'Traction',
        'Triceps Corde / Élévation Latérale',
        'Épaules',
        'Curl Haltère',
      ],
    },
  ];

  const _MR_CATEGORIES = _MUSCU_SESSIONS.map(s => ({ name: s.name, icon: s.icon, color: s.color }));

  function _catMeta(name) {
    return _MR_CATEGORIES.find(c => c.name === name) || _MR_CATEGORIES[_MR_CATEGORIES.length - 1];
  }

  // ── Sparkline SVG (progression poids) ──────────────────────
  function _renderSparkline(historyPoints) {
    if (!historyPoints || historyPoints.length < 2) return '';
    const vals = historyPoints.map(h => h.weight_kg);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const W = 60, H = 18;
    const range = maxV - minV || 1;
    const pts = vals.map((v, i) => {
      const x = Math.round((i / (vals.length - 1)) * W);
      const y = Math.round(H - ((v - minV) / range) * H);
      return `${x},${y}`;
    }).join(' ');
    const lastVal = vals[vals.length - 1];
    const delta = lastVal - vals[0];
    const color = delta > 0 ? '#22d18b' : delta < 0 ? '#ef4444' : 'var(--text3)';
    return `<span class="muscu-sparkline" title="Progression : +${delta > 0 ? '+' : ''}${delta} kg">
      <svg width="${W}" height="${H + 2}" viewBox="0 0 ${W} ${H + 2}" style="display:block">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      </svg>
      <span class="muscu-sparkline-delta" style="color:${color}">${delta > 0 ? '+' : ''}${delta}\u202fkg</span>
    </span>`;
  }

  function _renderMuscuSessions(records = [], historyByName = {}) {
    // Group records by exercise name — multiple records allowed per exercise
    const recMap = {};
    records.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!recMap[key]) recMap[key] = [];
      recMap[key].push(r);
    });

    return `
      <div class="muscu-sessions-label">📋 Programme des séances</div>
      <div class="muscu-sessions">
        ${_MUSCU_SESSIONS.map((session, idx) => {
          const recCount = session.exercises.filter(ex => (recMap[ex.toLowerCase()] || []).length > 0).length;
          return `
          <div class="muscu-session-card" id="mscard-${idx}" style="--session-color:${session.color}">
            <div class="muscu-session-header" onclick="this.closest('.muscu-session-card').classList.toggle('open')">
              <div class="muscu-session-icon-wrap">
                <span class="muscu-session-icon">${session.icon}</span>
              </div>
              <div class="muscu-session-title-block">
                <span class="muscu-session-name">${session.name}</span>
                <span class="muscu-session-sub">${session.exercises.length} exercices</span>
              </div>
              ${recCount > 0
                ? `<span class="muscu-session-recs" style="color:${session.color};background:color-mix(in srgb,${session.color} 15%,transparent)">${recCount}/${session.exercises.length} PR</span>`
                : `<span class="muscu-session-count">${session.exercises.length}</span>`}
              <span class="muscu-session-chevron">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
            <div class="muscu-session-body">
              <div class="muscu-session-body-inner">
                ${session.exercises.map(ex => {
                  const recs   = recMap[ex.toLowerCase()] || [];
                  const safeEx  = _escape(ex).replace(/'/g, "\\'");
                  const safeCat = _escape(session.name).replace(/'/g, "\\'");

                  const recordsHtml = recs.map(rec => {
                    const weightFmt  = rec.weight_kg % 1 === 0 ? rec.weight_kg : rec.weight_kg.toFixed(1);
                    const repsFmt    = rec.reps != null ? rec.reps : null;
                    const recDateStr = rec.updated_at
                      ? new Date(rec.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                      : null;
                    return `
                    <div class="muscu-ex-record-row">
                      <div class="muscu-ex-tags">
                        <span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.sets}</span> série${rec.sets > 1 ? 's' : ''}</span>
                        ${repsFmt !== null ? `<span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${repsFmt}</span> rép.</span>` : ''}
                        <span class="muscu-ex-tag weight"><span class="muscu-ex-tag-val">${weightFmt}</span> kg</span>
                        ${recDateStr ? `<span class="muscu-ex-tag date">${recDateStr}</span>` : ''}
                      </div>
                      ${_isOwnProfile ? `
                      <div class="mr2-actions">
                        <button class="mr-btn-icon" title="Modifier" onclick="event.stopPropagation();ProfilePage.showEditRecordForm(${rec.id},'${safeEx}',${rec.sets},${rec.reps != null ? rec.reps : 'null'},${rec.weight_kg},'${safeCat}')">✏️</button>
                        <button class="mr-btn-icon mr-btn-del" title="Supprimer" onclick="event.stopPropagation();ProfilePage.deleteRecord(${rec.id})">🗑️</button>
                      </div>` : ''}
                    </div>`;
                  }).join('');

                  return `
                  <div class="muscu-ex-row${recs.length > 0 ? ' has-record' : ''}">
                    <div class="muscu-ex-left">
                      <div class="muscu-ex-name-row">
                        <span class="muscu-ex-name">${_escape(ex)}</span>
                        ${historyByName[ex.toLowerCase()]?.length >= 2 ? _renderSparkline(historyByName[ex.toLowerCase()]) : ''}
                        ${_isOwnProfile ? `<button class="mr-btn-icon mr-btn-add" title="Ajouter un record" onclick="event.stopPropagation();ProfilePage.openSessionRecord('${safeEx}','${safeCat}')">＋</button>` : ''}
                      </div>
                      ${recs.length > 0 ? recordsHtml : `<span class="muscu-ex-empty">Aucun record</span>`}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

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

  function _renderMuscleRecords(records, ownerUsername, muscleHistory = []) {
    // Build history lookup by exercise name (sorted by date asc)
    const historyByName = {};
    muscleHistory
      .slice()
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      .forEach(h => {
        const key = h.exercise_name.toLowerCase();
        if (!historyByName[key]) historyByName[key] = [];
        historyByName[key].push(h);
      });
    // Friendly empty state for other users' profiles
    if (!_isOwnProfile && (!records || records.length === 0)) {
      const displayName = ownerUsername
        ? ownerUsername.charAt(0).toUpperCase() + ownerUsername.slice(1)
        : 'Cet utilisateur';
      return `<div class="profile-section" style="animation:fadeIn 0.3s ease both;text-align:center;padding:32px 16px">
        <div style="font-size:32px;margin-bottom:12px">🏋️</div>
        <p style="color:var(--text2);font-size:14px;margin:0">${_escape(displayName)} n'a pas encore enregistré de records.</p>
      </div>`;
    }
    // Find records for exercises NOT in any standard session (custom)
    const sessionExNames = new Set();
    _MUSCU_SESSIONS.forEach(s => s.exercises.forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const extraRecords = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase()));

    const catOptions = _MR_CATEGORIES.map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    // Group custom records by exercise name (multiple records per exercise allowed)
    const extraByName = {};
    extraRecords.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!extraByName[key]) extraByName[key] = { name: r.exercise_name, category: r.category, records: [] };
      extraByName[key].records.push(r);
    });
    const extraGroups = Object.values(extraByName);

    let extraHtml = '';
    if (extraGroups.length > 0) {
      const items = extraGroups.map(group => {
        const safeCategory = _escape(group.category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name).replace(/'/g, "\\'");
        const safeName     = _escape(group.name).replace(/'/g, "\\'");
        const rowsHtml = group.records.map(r => {
          const weightFmt = r.weight_kg % 1 === 0 ? r.weight_kg : r.weight_kg.toFixed(1);
          const recCat    = _escape(r.category || group.category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name).replace(/'/g, "\\'");
          return `
          <div class="mr2-card">
            <div class="mr2-card-left">
              <span class="mr2-badge mr2-badge-sets">🔁 ${r.sets} série${r.sets > 1 ? 's' : ''}${r.reps != null ? ` · ${r.reps} rép` : ''}</span>
              <span class="mr2-badge mr2-badge-weight">${weightFmt} kg</span>
            </div>
            ${_isOwnProfile ? `
            <div class="mr2-actions">
              <button class="mr-btn-icon" title="Modifier" onclick="ProfilePage.showEditRecordForm(${r.id}, '${safeName}', ${r.sets}, ${r.reps != null ? r.reps : "''"}, ${r.weight_kg}, '${recCat}')">✏️</button>
              <button class="mr-btn-icon mr-btn-del" title="Supprimer" onclick="ProfilePage.deleteRecord(${r.id})">🗑️</button>
            </div>` : ''}
          </div>`;
        }).join('');
        return `
          <div class="mr2-exercise-group">
            <div class="mr2-exercise-name-row">
              <span class="mr2-exercise-name">${_escape(group.name)}</span>
              ${_isOwnProfile ? `<button class="mr-btn-icon mr-btn-add" title="Ajouter" onclick="ProfilePage.openSessionRecord('${safeName}', '${safeCategory}')">＋</button>` : ''}
            </div>
            ${rowsHtml}
          </div>`;
      }).join('');
      extraHtml = `
        <div class="mr2-group" style="margin-top:16px">
          <div class="mr2-group-header" style="--cat-color:var(--text3)">
            <span class="mr2-group-icon">🎯</span>
            <span class="mr2-group-name">Personnalisés</span>
            <span class="mr2-group-count">${extraGroups.length}</span>
          </div>
          <div class="mr2-group-cards">${items}</div>
        </div>`;
    }

    return `
      <div class="profile-section" id="muscle-records-section" style="animation:fadeIn 0.3s ease 0.22s both">
        ${_renderMuscuSessions(records, historyByName)}
        ${_isOwnProfile ? `
        <div class="muscle-records-title-row" style="margin-top:20px">
          <div class="profile-section-title" style="margin-bottom:0;font-size:11px">Exercice personnalisé</div>
          <button class="icon-btn mr-plus-btn" onclick="ProfilePage.showAddRecordForm()" title="Ajouter un record">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>` : ''}

        ${extraHtml}
      </div>

      <div id="mr-modal-overlay" class="mr-modal-overlay" style="display:none" onclick="ProfilePage.cancelRecordForm()">
        <div class="mr-sheet" onclick="event.stopPropagation()">
          <div class="mr-sheet-handle"></div>
          <div class="mr-sheet-header">
            <div class="mr-sheet-exercise" id="mr-form-context">Record</div>
            <div class="mr-sheet-date" id="mr-form-date"></div>
          </div>
          <input id="mr-name" type="text" class="mr-input mr-name-input" placeholder="Nom de l'exercice" autocomplete="off" maxlength="100" />
          <select id="mr-category" class="mr-input mr-select">${catOptions}</select>
          <div class="mr-big-row">
            <div class="mr-big-group">
              <div class="mr-big-label">Séries</div>
              <input id="mr-sets" class="mr-big-input" type="number" min="1" max="100" placeholder="4" inputmode="numeric" />
            </div>
            <div class="mr-big-divider"></div>
            <div class="mr-big-group">
              <div class="mr-big-label">Répétitions</div>
              <input id="mr-reps" class="mr-big-input" type="number" min="1" max="9999" placeholder="10" inputmode="numeric" />
            </div>
            <div class="mr-big-divider"></div>
            <div class="mr-big-group">
              <div class="mr-big-label">Poids</div>
              <div class="mr-big-input-wrap">
                <input id="mr-weight" class="mr-big-input" type="number" min="0" step="0.5" placeholder="80" inputmode="decimal" />
                <span class="mr-big-unit">kg</span>
              </div>
            </div>
          </div>
          <div id="mr-form-error" class="mr-form-error"></div>
          <button class="mr-sheet-save-btn" onclick="ProfilePage.saveRecord()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Enregistrer le record
          </button>
          <button class="mr-sheet-cancel-btn" onclick="ProfilePage.cancelRecordForm()">Annuler</button>
          <input type="hidden" id="mr-editing-id" value="" />
        </div>
      </div>`;
  }

  function _todayLabel() {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function _openSheet() {
    const overlay = document.getElementById('mr-modal-overlay');
    if (!overlay) return;
    document.getElementById('mr-form-date').textContent = _todayLabel();
    document.getElementById('mr-form-error').textContent = '';
    const btn = overlay.querySelector('.mr-sheet-save-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer le record';
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function showAddRecordForm() {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = '+ Exercice personnalisé';
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = ''; nameEl.style.display = 'block'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = _MR_CATEGORIES[0].name; catEl.style.display = 'block'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-name').focus(), 300);
  }

  function showEditRecordForm(id, name, sets, reps, weight, category) {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = name;
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = name; nameEl.style.display = 'none'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = sets;
    document.getElementById('mr-reps').value   = reps != null ? reps : '';
    document.getElementById('mr-weight').value = weight;
    document.getElementById('mr-editing-id').value = id;
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets').focus(), 300);
  }

  function cancelRecordForm() {
    const overlay = document.getElementById('mr-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function openSessionRecord(exerciseName, category) {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = exerciseName;
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = exerciseName; nameEl.style.display = 'none'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = category || _MR_CATEGORIES[0].name; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets').focus(), 300);
  }

  async function saveRecord() {
    const name     = (document.getElementById('mr-name').value || '').trim();
    const category = document.getElementById('mr-category').value;
    const sets     = parseInt(document.getElementById('mr-sets').value, 10);
    const repsRaw  = document.getElementById('mr-reps').value.trim();
    const reps     = repsRaw !== '' ? parseInt(repsRaw, 10) : null;
    const weight   = parseFloat(document.getElementById('mr-weight').value);
    const errEl    = document.getElementById('mr-form-error');
    const editingId = document.getElementById('mr-editing-id').value;

    if (!name) { errEl.textContent = 'Nom de l\'exercice requis'; return; }
    if (!sets || sets < 1) { errEl.textContent = 'Nombre de séries invalide'; return; }
    if (reps !== null && (isNaN(reps) || reps < 1)) { errEl.textContent = 'Nombre de répétitions invalide'; return; }
    if (isNaN(weight) || weight < 0) { errEl.textContent = 'Poids invalide'; return; }

    const btn = document.querySelector('.mr-sheet-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    errEl.textContent = '';
    try {
      if (editingId) {
        await API.updateMuscleRecord(_profileUserId, editingId, { sets, reps, weight_kg: weight, notes: null, category });
      } else {
        await API.saveMuscleRecord(_profileUserId, { exercise_name: name, sets, reps, weight_kg: weight, category });
      }
      cancelRecordForm();
      await _refreshMuscleRecords();
    } catch (err) {
      errEl.textContent = err.message || 'Erreur lors de la sauvegarde';
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer le record'; }
    }
  }

  async function deleteRecord(id) {
    try {
      await API.deleteMuscleRecord(_profileUserId, id);
      await _refreshMuscleRecords();
    } catch (err) {
      console.error(err);
    }
  }

  async function _refreshMuscleRecords() {
    const { records } = await API.getMuscleRecords(_profileUserId);
    const section = document.getElementById('muscle-records-section');
    if (!section) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _renderMuscleRecords(records);
    section.replaceWith(tmp.firstElementChild);
    // Stay on the records tab after refresh
    switchTab('records');
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

  return { render, init, switchTab, showAddRecordForm, showEditRecordForm, cancelRecordForm, openSessionRecord, saveRecord, deleteRecord, calPage, setCalFilter, toggleNotif, saveNotifTime, testNotif, openAvatarPicker, selectAvatar };
})();

