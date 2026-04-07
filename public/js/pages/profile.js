// ── Profile / Stats page ─────────────────────────────────────
const ProfilePage = (() => {
  let _profileUserId  = null;
  let _isOwnProfile   = false;
  let _calendarWeeks  = [];

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
      if (_isOwnProfile) fetches.push(API.getTrolls(_profileUserId));
      const results = await Promise.all(fetches);
      const { user, stats } = results[0];
      const { records }     = results[1];
      const trollData       = _isOwnProfile ? results[2] : null;
      container.innerHTML = _renderAll(user, stats, records, trollData);
      // Mark as read silently
      if (_isOwnProfile && trollData?.unread > 0) {
        API.markTrollsRead(_profileUserId).catch(() => {});
      }
    } catch (err) {
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  // ── Main renderer ───────────────────────────────────────────
  function _renderAll(user, stats, records = [], trollData = null) {
    const rank     = Gamification.getRank(user.xp);
    const progress = Gamification.getProgress(user.xp);
    const avatar   = user.avatar || rank.emoji;
    const name     = _escape(user.username.charAt(0).toUpperCase() + user.username.slice(1));
    const hasUnread = trollData?.unread > 0;

    return `
      ${_renderHero(avatar, name, rank, progress, stats, user.tokens)}

      <div class="profile-tabs">
        <button class="profile-tab active" id="ptab-stats"   onclick="ProfilePage.switchTab('stats')">📊 Stats</button>
        <button class="profile-tab"        id="ptab-records" onclick="ProfilePage.switchTab('records')">🏋️ Muscu</button>
        ${trollData !== null
          ? `<button class="profile-tab" id="ptab-trolls" onclick="ProfilePage.switchTab('trolls')">😜 Trolls${hasUnread ? ` <span class="troll-tab-badge">${trollData.unread}</span>` : ''}</button>`
          : ''}
      </div>

      <div id="profile-panel-stats">
        ${_renderTodayBadge(stats)}
        ${_renderCalendar(stats.calendar)}
        ${_renderXpChart(stats.xp_history)}
        ${_renderChallenges(stats)}
        ${_renderTopEx(stats.top_exercises)}
      </div>

      <div id="profile-panel-records" style="display:none">
        ${_renderMuscleRecords(records)}
      </div>

      ${trollData !== null ? `<div id="profile-panel-trolls" style="display:none">${_renderTrolls(trollData.trolls)}</div>` : ''}
    `;
  }

  // ── Tab switch ──────────────────────────────────────────────
  function switchTab(tab) {
    const panels = ['stats', 'records', 'trolls'];
    panels.forEach(p => {
      const panel = document.getElementById(`profile-panel-${p}`);
      const btn   = document.getElementById(`ptab-${p}`);
      if (panel) panel.style.display = p === tab ? 'block' : 'none';
      if (btn)   btn.classList.toggle('active', p === tab);
    });
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
      ? `<div class="profile-stat-card profile-stat-card--token">
           <span class="profile-stat-icon ptb-icon" style="filter:drop-shadow(0 0 5px rgba(100,180,255,0.9))">💎</span>
           <span class="profile-stat-value" style="color:#7dd3fc;text-shadow:0 0 10px rgba(100,180,255,0.5)">${tokens}</span>
           <span class="profile-stat-label">Gemme${tokens > 1 ? 's' : ''}</span>
         </div>`
      : '';
    return `
      <div class="profile-hero" style="animation:fadeIn 0.3s ease">
        <div class="profile-hero-avatar">${avatar}</div>
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

  // ── 3. Calendrier 28 jours ──────────────────────────────────
  function _renderCalendar(calendar) {
    if (!calendar || !calendar.length) return '';
    const today = new Date().toISOString().split('T')[0];
    const DAY_LABELS = ['L','M','M','J','V','S','D'];

    // Group into ISO weeks of 7 (data already aligned to Monday)
    _calendarWeeks = [];
    for (let i = 0; i < calendar.length; i += 7) {
      _calendarWeeks.push(calendar.slice(i, i + 7));
    }
    const totalWeeks = _calendarWeeks.length;
    const defaultN   = Math.min(13, totalWeeks);

    const FILTERS = [
      { label: '4 sem',  n: 4  },
      { label: '13 sem', n: 13 },
      { label: '6 mois', n: 26 },
      { label: 'Tout',   n: totalWeeks },
    ];

    const filtersHtml = FILTERS.map(f =>
      `<button class="cal-filter-btn${f.n === defaultN ? ' active' : ''}" onclick="ProfilePage.setCalFilter(${f.n}, this)">${f.label}</button>`
    ).join('');

    const dayLabelsHtml = `<div class="cal-day-labels">
      <div class="cal-month-spacer"></div>
      ${DAY_LABELS.map(l => `<div class="cal-day-lbl">${l}</div>`).join('')}
    </div>`;

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.1s both" id="cal-section">
        <div class="cal-section-header">
          <div class="profile-section-title" style="margin-bottom:0">Activité</div>
          <div class="cal-filter-row">${filtersHtml}</div>
        </div>
        <div class="cal-heatmap-wrap ${_calSizeClass(defaultN)}" id="cal-heatmap-wrap">
          ${dayLabelsHtml}
          <div class="cal-scroll-inner" id="cal-scroll-inner">
            <div class="cal-weeks-row" id="cal-weeks-row">
              ${_renderWeeks(_calendarWeeks.slice(-defaultN), today)}
            </div>
          </div>
        </div>
        <div class="cal-legend">
          <div class="cal-cell full"  style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Complet</span>
          <div class="cal-cell partial" style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Partiel</span>
          <div class="cal-cell empty" style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Aucun</span>
        </div>
      </div>`;
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
    if (n <= 4)  return 'cal-sz-lg';
    if (n <= 13) return 'cal-sz-md';
    if (n <= 26) return 'cal-sz-sm';
    return 'cal-sz-xs';
  }

  function setCalFilter(n, btn) {
    document.querySelectorAll('.cal-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const weeksRow = document.getElementById('cal-weeks-row');
    if (!weeksRow) return;
    // Swap size class on wrapper
    const wrap = document.getElementById('cal-heatmap-wrap');
    if (wrap) {
      wrap.classList.remove('cal-sz-lg', 'cal-sz-md', 'cal-sz-sm', 'cal-sz-xs');
      wrap.classList.add(_calSizeClass(n));
    }
    const today = new Date().toISOString().split('T')[0];
    weeksRow.innerHTML = _renderWeeks(
      n >= _calendarWeeks.length ? _calendarWeeks : _calendarWeeks.slice(-n),
      today
    );
    // Scroll to right (most recent)
    const inner = document.getElementById('cal-scroll-inner');
    if (inner) inner.scrollLeft = inner.scrollWidth;
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

  function _renderMuscuSessions(records = []) {
    const recMap = {};
    records.forEach(r => { recMap[r.exercise_name.toLowerCase()] = r; });
    return `
      <div class="muscu-sessions-label">📋 Programme des séances</div>
      <div class="muscu-sessions">
        ${_MUSCU_SESSIONS.map((session, idx) => {
          const recCount = session.exercises.filter(ex => recMap[ex.toLowerCase()]).length;
          return `
          <div class="muscu-session-card" id="mscard-${idx}" style="--session-color:${session.color}">
            <div class="muscu-session-header" onclick="this.closest('.muscu-session-card').classList.toggle('open')">
              <span class="muscu-session-icon">${session.icon}</span>
              <span class="muscu-session-name">${session.name}</span>
              ${recCount > 0
                ? `<span class="muscu-session-recs" style="color:${session.color}">${recCount}/${session.exercises.length} PR</span>`
                : `<span class="muscu-session-count">${session.exercises.length}</span>`}
              <span class="muscu-session-chevron">▾</span>
            </div>
            <div class="muscu-session-body">
              <div class="muscu-session-body-inner">
                ${session.exercises.map(ex => {
                  const rec = recMap[ex.toLowerCase()];
                  const hasRec = !!rec;
                  const weightFmt = hasRec ? (rec.weight_kg % 1 === 0 ? rec.weight_kg : rec.weight_kg.toFixed(1)) : null;
                  const repsFmt = (hasRec && rec.reps != null) ? rec.reps : null;
                  const recDateStr = (hasRec && rec.updated_at)
                    ? new Date(rec.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : null;
                  const safeEx  = _escape(ex).replace(/'/g, "\\'");
                  const safeCat = _escape(session.name).replace(/'/g, "\\'");
                  const clickAttr = _isOwnProfile
                    ? (hasRec
                        ? `onclick="ProfilePage.showEditRecordForm(${rec.id}, '${safeEx}', ${rec.sets}, ${rec.reps != null ? rec.reps : 'null'}, ${rec.weight_kg}, '${safeCat}')"`
                        : `onclick="ProfilePage.openSessionRecord('${safeEx}', '${safeCat}')"`)
                    : '';
                  return `
                  <div class="muscu-ex-row${_isOwnProfile ? ' muscu-ex-tappable' : ''}${hasRec ? ' has-record' : ''}" ${clickAttr}>
                    <div class="muscu-ex-left">
                      <span class="muscu-ex-name">${_escape(ex)}</span>
                      ${hasRec ? `<div class="muscu-ex-tags">
                        <span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.sets}</span> série${rec.sets > 1 ? 's' : ''}</span>
                        ${repsFmt !== null ? `<span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${repsFmt}</span> rép.</span>` : ''}
                        <span class="muscu-ex-tag weight"><span class="muscu-ex-tag-val">${weightFmt}</span> kg</span>
                        ${recDateStr ? `<span class="muscu-ex-tag date">${recDateStr}</span>` : ''}
                      </div>` : `<span class="muscu-ex-empty">Aucun record</span>`}
                    </div>
                    ${_isOwnProfile ? `<span class="muscu-ex-action${hasRec ? ' has-rec' : ''}">${hasRec ? '✏️' : '＋'}</span>` : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // ── Trolls received ────────────────────────────────────────
  function _renderTrolls(trolls) {
    // TROLL_MSGS may be defined in home.js (same page context) or fallback inline
    const MSGS = (typeof HomePage !== 'undefined' && HomePage.TROLL_MSGS) || {
      lazy:   { text: "Il paraît que t'as séché l'entraînement 😅",   emoji: '😴' },
      weak:   { text: "Mon grand-père soulève plus que toi 👴",         emoji: '💪' },
      ghost:  { text: "La salle te cherche… elle t'a pas vu 👻",        emoji: '👻' },
      turtle: { text: "Ta progression est en mode tortue 🐢",           emoji: '🐢' },
      cake:   { text: "T'as mangé le gâteau au lieu de squatter 🎂",    emoji: '🎂' },
      skip:   { text: "Toujours le même exo depuis 3 mois… 🥱",         emoji: '🥱' },
      snail:  { text: "Tu bats le record mondial… de lenteur 🐌",        emoji: '🐌' },
    };

    if (!trolls || trolls.length === 0) {
      return `<div class="profile-section" style="animation:fadeIn 0.3s ease both">
        <div class="profile-section-title" style="margin-bottom:12px">😇 Aucun troll reçu</div>
        <p style="color:var(--text2);font-size:14px">Personne ne t'a encore trollé… ou c'est parce que tout le monde te respecte 💪</p>
      </div>`;
    }

    const items = trolls.map(t => {
      const msg  = MSGS[t.message_key] || { text: t.message_key, emoji: '😜' };
      const date = new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `<div class="troll-received-item${t.read ? '' : ' troll-unread'}">
        <span class="troll-item-emoji">${msg.emoji}</span>
        <div class="troll-item-body">
          <div class="troll-item-text">${_escape(msg.text)}</div>
          <div class="troll-item-meta">De <strong>${_escape(t.sender_name)}</strong> · ${date}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="profile-section" style="animation:fadeIn 0.3s ease both">
      <div class="profile-section-title" style="margin-bottom:12px">😜 Trolls reçus</div>
      <div class="troll-received-list">${items}</div>
    </div>`;
  }

  function _renderMuscleRecords(records) {
    // Find records for exercises NOT in any standard session (custom)
    const sessionExNames = new Set();
    _MUSCU_SESSIONS.forEach(s => s.exercises.forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const extraRecords = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase()));

    const catOptions = _MR_CATEGORIES.map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    let extraHtml = '';
    if (extraRecords.length > 0) {
      const items = extraRecords.map(r => {
        const weightFmt    = r.weight_kg % 1 === 0 ? r.weight_kg : r.weight_kg.toFixed(1);
        const safeCategory = _escape(r.category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name).replace(/'/g, "\\'");
        const safeName     = _escape(r.exercise_name).replace(/'/g, "\\'");
        return `
          <div class="mr2-card">
            <div class="mr2-card-left">
              <div class="mr2-exercise-name">${_escape(r.exercise_name)}</div>
            </div>
            <div class="mr2-card-right">
              <span class="mr2-badge mr2-badge-sets">🔁 ${r.sets} série${r.sets > 1 ? 's' : ''}${r.reps != null ? ` · ${r.reps} rép` : ''}</span>
              <span class="mr2-badge mr2-badge-weight">${weightFmt} kg</span>
              ${_isOwnProfile ? `
              <div class="mr2-actions">
                <button class="mr-btn-icon" title="Modifier" onclick="ProfilePage.showEditRecordForm(${r.id}, '${safeName}', ${r.sets}, ${r.reps != null ? r.reps : "''"},  ${r.weight_kg}, '${safeCategory}')">✏️</button>
                <button class="mr-btn-icon mr-btn-del" title="Supprimer" onclick="ProfilePage.deleteRecord(${r.id})">🗑️</button>
              </div>` : ''}
            </div>
          </div>`;
      }).join('');
      extraHtml = `
        <div class="mr2-group" style="margin-top:16px">
          <div class="mr2-group-header" style="--cat-color:var(--text3)">
            <span class="mr2-group-icon">🎯</span>
            <span class="mr2-group-name">Personnalisés</span>
            <span class="mr2-group-count">${extraRecords.length}</span>
          </div>
          <div class="mr2-group-cards">${items}</div>
        </div>`;
    }

    return `
      <div class="profile-section" id="muscle-records-section" style="animation:fadeIn 0.3s ease 0.22s both">
        ${_renderMuscuSessions(records)}
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

    if (!name) { errEl.textContent = 'Nom de l\'exercice requis'; return; }
    if (!sets || sets < 1) { errEl.textContent = 'Nombre de séries invalide'; return; }
    if (reps !== null && (isNaN(reps) || reps < 1)) { errEl.textContent = 'Nombre de répétitions invalide'; return; }
    if (isNaN(weight) || weight < 0) { errEl.textContent = 'Poids invalide'; return; }

    const btn = document.querySelector('.mr-sheet-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    errEl.textContent = '';
    try {
      await API.saveMuscleRecord(_profileUserId, { exercise_name: name, sets, reps, weight_kg: weight, category });
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

  return { render, init, switchTab, showAddRecordForm, showEditRecordForm, cancelRecordForm, openSessionRecord, saveRecord, deleteRecord, setCalFilter };
})();

