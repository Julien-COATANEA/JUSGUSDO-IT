// ── Muscu page (personal strength records) ──────────────────
const MuscuPage = (() => {
  let _userId = null;
  let _customSessionExercises = {}; // { [sessionName]: string[] } – stored in localStorage
  let _activeTab = 'seance';  // 'records' | 'seance'
  let _gymWeekOffset = 0;          // week offset (0 = current week)
  let _gymEntries = {};            // 'YYYY-MM-DD_exnamelower' → { completed, session_name }
  let _gymWeekExercises = {};      // 'YYYY-MM-DD' → [{ name, icon, color, exercises }]

  const _DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const _MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const _DAY_LETTERS = ['D','L','M','M','J','V','S'];

  // ── Session definitions (fallback; overridden by DB data at runtime) ──────
  let _muscuSessions = [
    {
      name: 'Pecs Triceps', icon: '💪', color: '#e94560',
      exercises: [
        'Développé Couché Haltères','Développé Couché Barres','Développé Couché Incliné',
        'Écarté Poulie','Triceps Corde (extension poulie basse)',
        'Triceps Corde (extension poulie haute)','Dips',
      ],
    },
    {
      name: 'Dos Biceps', icon: '🏋️', color: '#7c5cbf',
      exercises: [
        'Tirage Bucheron','Tirage Verticale','Tirage Horizontale','Traction',
        'Curl Haltère','Curl Barre','Curl Marteau',
      ],
    },
    {
      name: 'Jambes', icon: '🦵', color: '#22d18b',
      exercises: [
        'Ischios Assis','Leg Extension','Presses','Adducteurs','Fentes','Squats','Mollets',
      ],
    },
    {
      name: 'Full', icon: '⚡', color: '#fbbf24',
      exercises: [
        'Développé Couché Barre','Traction','Triceps Corde / Élévation Latérale','Épaules','Curl Haltère',
      ],
    },
  ];

  function _getMRCategories() { return _muscuSessions.map(s => ({ name: s.name, icon: s.icon, color: s.color })); }

  function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _loadCustomExercises() {
    try {
      const stored = localStorage.getItem('muscu_custom_exercises');
      _customSessionExercises = stored ? JSON.parse(stored) : {};
    } catch { _customSessionExercises = {}; }
  }

  function _saveCustomExercises() {
    localStorage.setItem('muscu_custom_exercises', JSON.stringify(_customSessionExercises));
  }

  function _getSessionExercises(session) {
    return [...session.exercises, ...(_customSessionExercises[session.name] || [])];
  }

  // ── Render shell ─────────────────────────────────────────
  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">Salle</span>
            <span class="header-rank" id="muscu-header-sub">Chargement…</span>
          </div>
        </header>
        <div class="muscu-tab-bar">
          <button class="muscu-tab${_activeTab === 'records' ? ' active' : ''}" onclick="MuscuPage.switchMuscuTab('records')">📊 Records</button>
          <button class="muscu-tab${_activeTab === 'seance' ? ' active' : ''}" onclick="MuscuPage.switchMuscuTab('seance')">🏋️ Séance</button>
        </div>
        <div id="muscu-content" style="padding:0 0 100px">
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="skeleton-card" style="height:60px"></div>
            <div class="skeleton-card" style="height:80px"></div>
            <div class="skeleton-card" style="height:80px"></div>
            <div class="skeleton-card" style="height:80px"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    _loadCustomExercises();
    _gymWeekOffset = 0;
    _gymEntries = {};
    _gymWeekExercises = {};
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    _userId = currentUser.id;

    const container = document.getElementById('muscu-content');
    if (!container) return;

    if (_activeTab === 'seance') {
      await _initSeanceTab(container);
    } else {
      await _initRecordsTab(container);
    }
  }

  async function _initRecordsTab(container) {
    try {
      const [{ records }, histRes, sessionsRes] = await Promise.all([
        API.getMuscleRecords(_userId),
        API.getMuscleHistory(_userId, '').catch(() => ({ history: [] })),
        API.getGymSessionsAll().catch(() => ({ sessions: [] })),
      ]);
      // Load sessions from DB; normalize exercises to name strings
      if (sessionsRes.sessions && sessionsRes.sessions.length > 0) {
        _muscuSessions = sessionsRes.sessions.map(s => ({
          ...s,
          exercises: (s.exercises || []).map(ex => typeof ex === 'string' ? ex : (ex.name || ex)),
        }));
      }
      const muscleHistory = histRes.history || [];

      // Update subtitle
      const totalPRs = records.length;
      const sub = document.getElementById('muscu-header-sub');
      if (sub) sub.textContent = `${totalPRs} record${totalPRs !== 1 ? 's' : ''} enregistré${totalPRs !== 1 ? 's' : ''}`;

      container.innerHTML = _renderPage(records, muscleHistory);
      _initLongPress();
    } catch (err) {
      console.error('[Muscu]', err);
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 16px">Erreur de chargement</p>`;
    }
  }

  function _gymDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function _getGymWeekDates(offset) {
    const now = new Date();
    const dow = now.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  async function _initSeanceTab(container) {
    const sub = document.getElementById('muscu-header-sub');
    if (sub) sub.textContent = 'Séance de la semaine';
    await _loadGymWeek(container);
  }

  async function _loadGymWeek(container) {
    container.innerHTML = `<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
      <div class="skeleton-card" style="height:60px"></div>
      <div class="skeleton-card" style="height:80px"></div>
      <div class="skeleton-card" style="height:80px"></div>
      <div class="skeleton-card" style="height:80px"></div>
    </div>`;

    const dates = _getGymWeekDates(_gymWeekOffset);
    const start = _gymDateKey(dates[0]);
    const end   = _gymDateKey(dates[6]);

    try {
      const [checklistRes, ...exerciseResults] = await Promise.all([
        API.getGymChecklist(start, end),
        ...dates.map(d => API.getGymExercises(_gymDateKey(d)).catch(() => ({ sessions: [] }))),
      ]);

      // Build entry map: 'YYYY-MM-DD_exnamelower' → { completed, session_name }
      _gymEntries = {};
      (checklistRes.entries || []).forEach(e => {
        const dk = typeof e.entry_date === 'string' ? e.entry_date.split('T')[0] : new Date(e.entry_date).toISOString().split('T')[0];
        _gymEntries[`${dk}_${e.exercise_name.toLowerCase()}`] = { completed: e.completed, session_name: e.session_name };
      });

      // Build week exercises map: 'YYYY-MM-DD' → [sessions]
      _gymWeekExercises = {};
      dates.forEach((d, i) => {
        _gymWeekExercises[_gymDateKey(d)] = exerciseResults[i].sessions || [];
      });

      _renderGymWeekPage(container, dates);
    } catch (err) {
      console.error('[Gym Week]', err);
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 16px">Erreur de chargement</p>`;
    }
  }

  function _renderGymWeekPage(container, dates) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let weekLabel;
    if (_gymWeekOffset === 0) weekLabel = 'Cette semaine';
    else if (_gymWeekOffset === -1) weekLabel = 'Semaine dernière';
    else {
      const f = dates[0], l = dates[6];
      weekLabel = `${f.getDate()} ${_MONTHS_FR[f.getMonth()]} – ${l.getDate()} ${_MONTHS_FR[l.getMonth()]}`;
    }

    const stripHtml = dates.map(date => {
      const key = _gymDateKey(date);
      const isToday  = date.getTime() === today.getTime();
      const isFuture = date > today;
      const sessions  = _gymWeekExercises[key] || [];
      const allExs    = sessions.flatMap(s => s.exercises || []);
      const doneCount = allExs.filter(ex => {
        const n = typeof ex === 'string' ? ex : ex.name;
        return !!(_gymEntries[`${key}_${n.toLowerCase()}`]?.completed);
      }).length;
      const total  = allExs.length;
      const allDone = total > 0 && doneCount === total;
      const pct    = total > 0 ? Math.round(doneCount / total * 100) : 0;
      const ringC  = allDone ? '#22d18b'
                  : doneCount > 0 ? '#fbbf24'
                  : isFuture ? 'rgba(255,255,255,0.07)'
                  : total === 0 ? '#3b82f6'
                  : '#ef4444';
      const state  = total === 0 ? 'rest' : isFuture ? 'future' : allDone ? 'done' : doneCount > 0 ? 'partial' : 'missed';
      return `
        <div class="wsd ${state}${isToday ? ' today-dot' : ''}" onclick="document.getElementById('gday-${key}')?.scrollIntoView({behavior:'smooth',block:'center'})">
          <div class="wsd-ring" style="--ring-p:${total === 0 ? 100 : pct};--ring-c:${ringC}">
            <span class="wsd-inner">${total > 0 ? doneCount : '·'}</span>
          </div>
          <span class="wsd-lbl">${_DAY_LETTERS[date.getDay()]}</span>
        </div>`;
    }).join('');

    let weekDone = 0, weekTotal = 0;
    dates.forEach(date => {
      const key = _gymDateKey(date);
      if (date <= today) {
        const sessions = _gymWeekExercises[key] || [];
        const allExs   = sessions.flatMap(s => s.exercises || []);
        if (allExs.length > 0) {
          weekTotal++;
          const done = allExs.filter(ex => {
            const n = typeof ex === 'string' ? ex : ex.name;
            return !!(_gymEntries[`${key}_${n.toLowerCase()}`]?.completed);
          }).length;
          if (done === allExs.length) weekDone++;
        }
      }
    });

    container.innerHTML = `
      <div class="week-context">
        <button class="week-btn" onclick="MuscuPage.gymChangeWeek(-1)">‹</button>
        <div class="week-inner">
          <div class="week-label">${weekLabel}</div>
          <div class="week-strip">${stripHtml}</div>
        </div>
        <button class="week-btn" onclick="MuscuPage.gymChangeWeek(1)" ${_gymWeekOffset >= 0 ? 'disabled' : ''}>›</button>
      </div>
      <div class="today-stats-bar">
        <span class="tsb-pill">📅&nbsp;<b>${weekDone}/${weekTotal}</b>&nbsp;séances cette sem.</span>
      </div>
      <main class="calendar-container" id="gym-calendar-container"></main>
    `;

    const calContainer = container.querySelector('#gym-calendar-container');
    dates.forEach(d => {
      const isHero = _gymWeekOffset === 0 && d.getTime() === today.getTime();
      calContainer.appendChild(_buildGymDayCard(d, isHero, today));
    });

    if (_gymWeekOffset === 0) {
      const todayKey = _gymDateKey(today);
      setTimeout(() => document.getElementById(`gday-${todayKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
  }

  function _buildGymDayCard(date, isHero, today) {
    const key      = _gymDateKey(date);
    const isToday  = date.getTime() === today.getTime();
    const isFuture = date > today;
    const isPast   = !isToday && !isFuture;

    const sessions  = _gymWeekExercises[key] || [];
    const allExs    = sessions.flatMap(s => (s.exercises || []).map(ex => ({ ...ex, _sessionName: s.name, _sessionIcon: s.icon, _sessionColor: s.color })));
    const doneCount = allExs.filter(ex => !!(_gymEntries[`${key}_${(ex.name || ex).toLowerCase()}`]?.completed)).length;
    const allDone   = allExs.length > 0 && doneCount === allExs.length;
    const isRest    = allExs.length === 0 && !isFuture;
    const ringPct   = allExs.length > 0 ? Math.round(doneCount / allExs.length * 100) : (isRest ? 100 : 0);
    const ringColor = allDone ? '#22d18b'
                    : doneCount > 0 ? '#fbbf24'
                    : isFuture ? 'rgba(255,255,255,0.07)'
                    : isRest ? '#3b82f6'
                    : allExs.length === 0 ? 'rgba(255,255,255,0.18)'
                    : '#ef4444';

    let exercisesHTML;
    if (allExs.length === 0) {
      exercisesHTML = `<p class="gym-rest-day-msg">🛌 Jour de repos — aucune séance programmée</p>`;
    } else {
      exercisesHTML = sessions.map(session => {
        const sessionExs = session.exercises || [];
        return `<div class="gym-seance-session-group">
          <div class="gym-seance-session-label" style="color:${session.color}">${session.icon} ${_escape(session.name)}</div>
          ${sessionExs.map(ex => {
            const exName  = typeof ex === 'string' ? ex : (ex.name || '');
            const exEmoji = (typeof ex === 'object' && ex.emoji) ? ex.emoji : '💪';
            const exSets  = (typeof ex === 'object' && ex.sets)  ? ex.sets  : null;
            const exReps  = (typeof ex === 'object' && ex.reps)  ? ex.reps  : null;
            const checked = !!(_gymEntries[`${key}_${exName.toLowerCase()}`]?.completed);
            const metaTags = exSets
              ? `<span class="exercise-tag"><span class="exercise-tag-val">${exSets}</span> série${exSets > 1 ? 's' : ''}</span>
                 <span class="exercise-tag"><span class="exercise-tag-val">${exReps}</span> rép.</span>`
              : '';
            const safeEx  = _escape(exName).replace(/'/g, "\\'");
            const safeSes = _escape(session.name).replace(/'/g, "\\'");
            return `
              <div class="exercise-item${checked ? ' checked' : ''}${isPast ? ' disabled' : ''}${isFuture ? ' future-day' : ''}"
                   onclick="MuscuPage.toggleGymExercise('${safeEx}','${safeSes}','${key}',this)">
                <div class="exercise-icon">${exEmoji}</div>
                <div class="exercise-info">
                  <div class="exercise-name">${_escape(exName)}</div>
                  <div class="exercise-meta">${metaTags}</div>
                </div>
                <div class="exercise-checkbox">${checked ? '✓' : ''}</div>
              </div>`;
          }).join('')}
        </div>`;
      }).join('');
    }

    const card = document.createElement('div');
    card.className = `day-card${allDone ? ' completed' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${isPast ? ' past' : ''}${(isHero || isToday) ? ' open' : ''}${isHero ? ' hero' : ''}${isRest ? ' gym-rest-day' : ''}`;
    card.dataset.key = key;
    card.id = `gday-${key}`;
    card.innerHTML = `
      <div class="day-header" onclick="this.closest('.day-card').classList.toggle('open')">
        <div class="day-check">${allDone ? '✓' : isRest ? '🛌' : ''}</div>
        <div class="day-name-block">
          <div class="day-name">${_DAYS_FR[date.getDay()]}</div>
          <div class="day-date">${date.getDate()} ${_MONTHS_FR[date.getMonth()]}</div>
          ${isToday || isFuture || (isRest && !isFuture) ? `
          <div class="day-badges">
            ${isToday ? "<span class=\"today-badge\">Aujourd'hui</span>" : ''}
            ${isFuture ? '<span class="preview-badge">\u00c0 venir</span>' : ''}
            ${isRest && !isFuture ? '<span class="rest-badge">Repos</span>' : ''}
          </div>` : ''}
        </div>
        <div class="day-ring" style="--ring-p:${ringPct};--ring-c:${ringColor}">
          <span class="day-ring-val">${isRest ? '·' : `${doneCount}/${allExs.length}`}</span>
        </div>
        ${!isHero ? '<div class="day-toggle">▼</div>' : ''}
      </div>
      <div class="exercises-list">
        ${exercisesHTML}
        <div class="all-done-badge">🎉 Séance complète ! Bravo !</div>
      </div>
    `;
    return card;
  }

  // ── Main renderer ─────────────────────────────────────────
  function _renderPage(records, muscleHistory) {
    // Build history lookup by name
    const historyByName = {};
    muscleHistory
      .slice()
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      .forEach(h => {
        const key = h.exercise_name.toLowerCase();
        if (!historyByName[key]) historyByName[key] = [];
        historyByName[key].push(h);
      });

    // Summary stats
    const totalPRs    = records.length;
    const totalExs    = _muscuSessions.reduce((n, s) => n + _getSessionExercises(s).length, 0);
    const sessionExNames = new Set();
    _muscuSessions.forEach(s => _getSessionExercises(s).forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const customCount = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase())).length;

    return `
      <div class="muscu-pg-summary">
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${totalPRs}</span>
          <span class="muscu-pg-stat-lbl">Records</span>
        </div>
        <div class="muscu-pg-sep"></div>
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${_muscuSessions.length}</span>
          <span class="muscu-pg-stat-lbl">Séances</span>
        </div>
        <div class="muscu-pg-sep"></div>
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${totalExs > 0 ? Math.round((totalPRs - customCount) / totalExs * 100) : 0}%</span>
          <span class="muscu-pg-stat-lbl">Complété</span>
        </div>
      </div>

      <div style="padding:4px 16px 20px">
        ${_renderMuscuSessions(records, historyByName)}
      </div>

      ${_renderFormModal()}
    `;
  }

  // ── Sparkline ─────────────────────────────────────────────
  function _renderSparkline(historyPoints) {
    if (!historyPoints || historyPoints.length < 2) return '';
    const vals = historyPoints.map(h => h.weight_kg);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const W = 60, H = 18, range = maxV - minV || 1;
    const pts = vals.map((v, i) => {
      const x = Math.round((i / (vals.length - 1)) * W);
      const y = Math.round(H - ((v - minV) / range) * H);
      return `${x},${y}`;
    }).join(' ');
    const delta = vals[vals.length - 1] - vals[0];
    const color = delta > 0 ? '#22d18b' : delta < 0 ? '#ef4444' : 'var(--text3)';
    return `<span class="muscu-sparkline" title="Progression">
      <svg width="${W}" height="${H + 2}" viewBox="0 0 ${W} ${H + 2}" style="display:block">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      </svg>
      <span class="muscu-sparkline-delta" style="color:${color}">${delta > 0 ? '+' : ''}${delta}\u202fkg</span>
    </span>`;
  }

  // ── Session accordions ────────────────────────────────────
  function _renderMuscuSessions(records, historyByName) {
    const recMap = {};
    records.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!recMap[key]) recMap[key] = [];
      recMap[key].push(r);
    });

    return `
      <div class="muscu-sessions">
        ${_muscuSessions.map((session, idx) => {
          const allExercises = _getSessionExercises(session);
          const customExSet  = new Set((_customSessionExercises[session.name] || []).map(e => e.toLowerCase()));
          const recCount     = allExercises.filter(ex => (recMap[ex.toLowerCase()] || []).length > 0).length;
          return `
          <div class="muscu-session-card" id="mscard-${idx}" style="--session-color:${session.color}">
            <div class="muscu-session-header" onclick="this.closest('.muscu-session-card').classList.toggle('open')">
              <div class="muscu-session-icon-wrap">
                <span class="muscu-session-icon">${session.icon}</span>
              </div>
              <div class="muscu-session-title-block">
                <span class="muscu-session-name">${session.name}</span>
                <span class="muscu-session-sub">${allExercises.length} exercice${allExercises.length > 1 ? 's' : ''}</span>
              </div>
              ${recCount > 0
                ? `<span class="muscu-session-recs" style="color:${session.color};background:color-mix(in srgb,${session.color} 15%,transparent)">${recCount}/${allExercises.length} PR</span>`
                : `<span class="muscu-session-count">${allExercises.length}</span>`}
              <span class="muscu-session-chevron">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
            <div class="muscu-session-body">
              <div class="muscu-session-body-inner">
                ${allExercises.map(ex => {
                  const recs      = recMap[ex.toLowerCase()] || [];
                  const safeEx    = _escape(ex).replace(/'/g, "\\'");
                  const safeCat   = _escape(session.name).replace(/'/g, "\\'");
                  const isCustom  = customExSet.has(ex.toLowerCase());

                  const recordsHtml = recs.map(rec => {
                    const wFmt  = rec.weight_kg % 1 === 0 ? rec.weight_kg : rec.weight_kg.toFixed(1);
                    const dStr  = rec.updated_at
                      ? new Date(rec.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                      : null;
                    return `
                    <div class="muscu-ex-record-row">
                      <div class="muscu-ex-tags">
                        <span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.sets}</span> série${rec.sets > 1 ? 's' : ''}</span>
                        ${rec.reps != null ? `<span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.reps}</span> rép.</span>` : ''}
                        <span class="muscu-ex-tag weight"><span class="muscu-ex-tag-val">${wFmt}</span> kg</span>
                        ${dStr ? `<span class="muscu-ex-tag date">${dStr}</span>` : ''}
                      </div>
                      <div class="mr2-actions">
                        <button class="mr-btn-icon" title="Modifier" onclick="event.stopPropagation();MuscuPage.showEditRecordForm(${rec.id},'${safeEx}',${rec.sets},${rec.reps != null ? rec.reps : 'null'},${rec.weight_kg},'${safeCat}')">✏️</button>
                        <button class="mr-btn-icon mr-btn-del" title="Supprimer" onclick="event.stopPropagation();MuscuPage.deleteRecord(${rec.id})">🗑️</button>
                      </div>
                    </div>`;
                  }).join('');

                  return `
                  <div class="muscu-ex-row${recs.length > 0 ? ' has-record' : ''}"${isCustom ? ` data-custom="1" data-session-idx="${idx}" data-ex-name="${_escape(ex)}"` : ''}>
                    <div class="muscu-ex-left">
                      <div class="muscu-ex-name-row">
                        <span class="muscu-ex-name">${_escape(ex)}</span>
                        ${historyByName[ex.toLowerCase()]?.length >= 2 ? _renderSparkline(historyByName[ex.toLowerCase()]) : ''}
                        <button class="mr-btn-icon mr-btn-add" title="Ajouter un record" onclick="event.stopPropagation();MuscuPage.openSessionRecord('${safeEx}','${safeCat}')">＋</button>
                      </div>
                      ${recs.length > 0 ? recordsHtml : `<span class="muscu-ex-empty">Aucun record</span>`}
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div class="muscu-add-ex-row">
                <button class="muscu-add-ex-btn" onclick="event.stopPropagation();MuscuPage.toggleAddExerciseInput(${idx})">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Ajouter un exercice
                </button>
                <div class="muscu-add-ex-form" id="muscu-add-ex-form-${idx}" style="display:none">
                  <input id="muscu-add-ex-input-${idx}" class="muscu-add-ex-input" type="text" placeholder="Nom de l'exercice…" maxlength="100" autocomplete="off"
                    onkeydown="if(event.key==='Enter')MuscuPage.confirmAddExercise(${idx});if(event.key==='Escape')MuscuPage.cancelAddExercise(${idx})" />
                  <button class="muscu-add-ex-confirm" onclick="MuscuPage.confirmAddExercise(${idx})" title="Confirmer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button class="muscu-add-ex-cancel" onclick="MuscuPage.cancelAddExercise(${idx})" title="Annuler">✕</button>
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // ── Séance tab public actions ─────────────────────────────
  function switchMuscuTab(tab) {
    _activeTab = tab;
    // Update tab buttons
    document.querySelectorAll('.muscu-tab').forEach(btn => {
      const isActive = (btn.textContent.includes('Records') && tab === 'records') ||
                       (btn.textContent.includes('Séance')  && tab === 'seance');
      btn.classList.toggle('active', isActive);
    });
    init();
  }

  function gymChangeWeek(delta) {
    _gymWeekOffset = Math.min(0, _gymWeekOffset + delta);
    const container = document.getElementById('muscu-content');
    if (container) _loadGymWeek(container);
  }

  async function toggleGymExercise(exerciseName, sessionName, dateStr, el) {
    // Block future dates
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    if (new Date(y, m - 1, d) > today) return;

    const entryKey = `${dateStr}_${exerciseName.toLowerCase()}`;
    const wasChecked = _gymEntries[entryKey]?.completed || false;
    const card = el?.closest('.day-card');

    // Optimistic DOM update
    if (!_gymEntries[entryKey]) _gymEntries[entryKey] = { session_name: sessionName, completed: false };
    _gymEntries[entryKey].completed = !wasChecked;
    el?.classList.toggle('checked', !wasChecked);
    const cbEl = el?.querySelector('.exercise-checkbox');
    if (cbEl) cbEl.textContent = !wasChecked ? '✓' : '';
    _syncGymCardStats(card, dateStr);

    try {
      const result = await API.toggleGymChecklist(exerciseName, sessionName, dateStr);
      // Sync with server state
      _gymEntries[entryKey].completed = result.completed;
      el?.classList.toggle('checked', result.completed);
      if (cbEl) cbEl.textContent = result.completed ? '✓' : '';
      _syncGymCardStats(card, dateStr);

      if (result.xp !== undefined) {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.xp = result.xp;
        localStorage.setItem('user', JSON.stringify(stored));
      }
      if (result.xpDelta && result.xpDelta !== 0) {
        Gamification.spawnXPPopup(el, `${result.xpDelta > 0 ? '+' : ''}${result.xpDelta} XP`);
      }
      // Celebrate full session
      const sessions = _gymWeekExercises[dateStr] || [];
      const allExs   = sessions.flatMap(s => s.exercises || []);
      const doneNow  = allExs.filter(ex => {
        const n = typeof ex === 'string' ? ex : ex.name;
        return !!(_gymEntries[`${dateStr}_${n.toLowerCase()}`]?.completed);
      }).length;
      if (doneNow === allExs.length && allExs.length > 0 && result.completed) {
        App.showToast('🎉 Séance complète ! Bien joué !');
        Gamification.launchConfetti();
        const ringEl = card?.querySelector('.day-ring');
        if (ringEl) { ringEl.classList.remove('ring-bounce'); void ringEl.offsetWidth; ringEl.classList.add('ring-bounce'); }
      }
    } catch (err) {
      // Revert optimistic update
      _gymEntries[entryKey].completed = wasChecked;
      el?.classList.toggle('checked', wasChecked);
      if (cbEl) cbEl.textContent = wasChecked ? '✓' : '';
      _syncGymCardStats(card, dateStr);
      if (typeof App !== 'undefined') App.showToast('Erreur : ' + err.message);
    }
  }

  function _syncGymCardStats(card, dateStr) {
    if (!card) return;
    const sessions = _gymWeekExercises[dateStr] || [];
    const allExs   = sessions.flatMap(s => s.exercises || []);
    const doneNow  = allExs.filter(ex => {
      const n = typeof ex === 'string' ? ex : ex.name;
      return !!(_gymEntries[`${dateStr}_${n.toLowerCase()}`]?.completed);
    }).length;
    const allDone  = allExs.length > 0 && doneNow === allExs.length;
    card.classList.toggle('completed', allDone);
    const dc = card.querySelector('.day-check');
    if (dc) dc.textContent = allDone ? '✓' : '';
    const ringEl = card.querySelector('.day-ring');
    if (ringEl) {
      const pct = allExs.length > 0 ? Math.round(doneNow / allExs.length * 100) : 0;
      ringEl.style.setProperty('--ring-p', pct);
      const rv = ringEl.querySelector('.day-ring-val');
      if (rv) rv.textContent = `${doneNow}/${allExs.length}`;
    }
  }

  // ── Custom exercises section ──────────────────────────────
  function _renderCustomSection(records) {
    const sessionExNames = new Set();
    _muscuSessions.forEach(s => _getSessionExercises(s).forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const extraRecords = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase()));

    const extraByName = {};
    extraRecords.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!extraByName[key]) extraByName[key] = { name: r.exercise_name, category: r.category, records: [] };
      extraByName[key].records.push(r);
    });
    const extraGroups = Object.values(extraByName);

    const catOptions = _getMRCategories().map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    let extraHtml = '';
    if (extraGroups.length > 0) {
      const items = extraGroups.map(group => {
        const safeCategory = _escape(group.category || _getMRCategories().slice(-1)[0]?.name || '').replace(/'/g, "\\'");
        const safeName     = _escape(group.name).replace(/'/g, "\\'");
        const rowsHtml = group.records.map(r => {
          const wFmt  = r.weight_kg % 1 === 0 ? r.weight_kg : r.weight_kg.toFixed(1);
          const rCat  = _escape(r.category || _getMRCategories().slice(-1)[0]?.name || '').replace(/'/g, "\\'");
          return `
          <div class="mr2-card">
            <div class="mr2-card-left">
              <span class="mr2-badge mr2-badge-sets">🔁 ${r.sets} série${r.sets > 1 ? 's' : ''}${r.reps != null ? ` · ${r.reps} rép` : ''}</span>
              <span class="mr2-badge mr2-badge-weight">${wFmt} kg</span>
            </div>
            <div class="mr2-actions">
              <button class="mr-btn-icon" onclick="MuscuPage.showEditRecordForm(${r.id},'${safeName}',${r.sets},${r.reps != null ? r.reps : 'null'},${r.weight_kg},'${rCat}')">✏️</button>
              <button class="mr-btn-icon mr-btn-del" onclick="MuscuPage.deleteRecord(${r.id})">\uD83D\uDDD1\uFE0F</button>
            </div>
          </div>`;
        }).join('');
        return `
          <div class="mr2-exercise-group">
            <div class="mr2-exercise-name-row">
              <span class="mr2-exercise-name">${_escape(group.name)}</span>
              <button class="mr-btn-icon mr-btn-add" onclick="MuscuPage.openSessionRecord('${safeName}','${safeCategory}')">＋</button>
            </div>
            ${rowsHtml}
          </div>`;
      }).join('');

      extraHtml = `
        <div class="mr2-group" style="margin-top:8px">
          <div class="mr2-group-header" style="--cat-color:var(--text3)">
            <span class="mr2-group-icon">🎯</span>
            <span class="mr2-group-name">Personnalisés</span>
            <span class="mr2-group-count">${extraGroups.length}</span>
          </div>
          <div class="mr2-group-cards">${items}</div>
        </div>`;
    }

    return `
      <div class="muscle-records-title-row" style="margin-top:20px">
        <div class="profile-section-title" style="margin-bottom:0;font-size:11px">Exercice personnalisé</div>
        <button class="icon-btn mr-plus-btn" onclick="MuscuPage.showAddRecordForm()" title="Ajouter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      ${extraHtml}
      <input type="hidden" id="mr-cat-options-src" data-html="${_escape(catOptions)}" />`;
  }

  // ── Form modal ────────────────────────────────────────────
  function _renderFormModal() {
    const catOptions = _getMRCategories().map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    return `
      <div id="mr-modal-overlay" class="mr-modal-overlay" style="display:none" onclick="MuscuPage.cancelRecordForm()">
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
          <button class="mr-sheet-save-btn" onclick="MuscuPage.saveRecord()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Enregistrer le record
          </button>
          <button class="mr-sheet-cancel-btn" onclick="MuscuPage.cancelRecordForm()">Annuler</button>
          <input type="hidden" id="mr-editing-id" value="" />
        </div>
      </div>`;
  }

  // ── Form helpers ──────────────────────────────────────────
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
    if (catEl) { catEl.value = _getMRCategories()[0]?.name || ''; catEl.style.display = 'block'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-name')?.focus(), 300);
  }

  function showEditRecordForm(id, name, sets, reps, weight, category) {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = name;
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = name; nameEl.style.display = 'none'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = category || _getMRCategories().slice(-1)[0]?.name || ''; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = sets;
    document.getElementById('mr-reps').value   = reps != null ? reps : '';
    document.getElementById('mr-weight').value = weight;
    document.getElementById('mr-editing-id').value = id;
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets')?.focus(), 300);
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
    if (catEl) { catEl.value = category || _getMRCategories()[0]?.name || ''; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets')?.focus(), 300);
  }

  async function saveRecord() {
    const name      = (document.getElementById('mr-name').value || '').trim();
    const category  = document.getElementById('mr-category').value;
    const sets      = parseInt(document.getElementById('mr-sets').value, 10);
    const repsRaw   = document.getElementById('mr-reps').value.trim();
    const reps      = repsRaw !== '' ? parseInt(repsRaw, 10) : null;
    const weight    = parseFloat(document.getElementById('mr-weight').value);
    const errEl     = document.getElementById('mr-form-error');
    const editingId = document.getElementById('mr-editing-id').value;

    if (!name)                { errEl.textContent = "Nom de l'exercice requis"; return; }
    if (!sets || sets < 1)    { errEl.textContent = 'Nombre de séries invalide'; return; }
    if (reps !== null && (isNaN(reps) || reps < 1)) { errEl.textContent = 'Répétitions invalides'; return; }
    if (isNaN(weight) || weight < 0) { errEl.textContent = 'Poids invalide'; return; }

    const btn = document.querySelector('.mr-sheet-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    errEl.textContent = '';

    try {
      if (editingId) {
        await API.updateMuscleRecord(_userId, editingId, { sets, reps, weight_kg: weight, notes: null, category });
      } else {
        await API.saveMuscleRecord(_userId, { exercise_name: name, sets, reps, weight_kg: weight, category });
      }
      cancelRecordForm();
      await _refresh();
    } catch (err) {
      errEl.textContent = err.message || 'Erreur';
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer le record';
      }
    }
  }

  async function deleteRecord(id) {
    try {
      await API.deleteMuscleRecord(_userId, id);
      await _refresh();
    } catch (err) {
      console.error(err);
      App.showToast('Erreur lors de la suppression');
    }
  }

  async function _refresh() {
    const container = document.getElementById('muscu-content');
    if (!container) return;
    if (_activeTab === 'seance') {
      await _initSeanceTab(container);
      return;
    }
    const [{ records }, histRes] = await Promise.all([
      API.getMuscleRecords(_userId),
      API.getMuscleHistory(_userId, '').catch(() => ({ history: [] })),
    ]);
    const muscleHistory = histRes.history || [];
    const totalPRs = records.length;
    const sub = document.getElementById('muscu-header-sub');
    if (sub) sub.textContent = `${totalPRs} record${totalPRs !== 1 ? 's' : ''} enregistré${totalPRs !== 1 ? 's' : ''}`;

    container.innerHTML = _renderPage(records, muscleHistory);
    _initLongPress();
  }

  // ── Long-press delete for custom exercises ────────────────
  function _initLongPress() {
    document.querySelectorAll('.muscu-ex-row[data-custom="1"]').forEach(row => {
      let timer = null;
      let moved = false;
      let sx = 0, sy = 0;
      const onStart = (e) => {
        if (row.querySelector('.muscu-ex-delete-confirm')) return;
        const pt = e.touches ? e.touches[0] : e;
        sx = pt.clientX; sy = pt.clientY; moved = false;
        timer = setTimeout(() => { if (!moved) _showDeleteConfirm(row); }, 600);
      };
      const onMove = (e) => {
        const pt = e.touches ? e.touches[0] : e;
        if (Math.abs(pt.clientX - sx) > 8 || Math.abs(pt.clientY - sy) > 8) {
          moved = true;
          if (timer) { clearTimeout(timer); timer = null; }
        }
      };
      const onEnd = () => { if (timer) { clearTimeout(timer); timer = null; } };
      row.addEventListener('touchstart', onStart, { passive: true });
      row.addEventListener('touchmove',  onMove,  { passive: true });
      row.addEventListener('touchend',   onEnd);
      row.addEventListener('mousedown',  onStart);
      row.addEventListener('mousemove',  onMove);
      row.addEventListener('mouseup',    onEnd);
      row.addEventListener('mouseleave', onEnd);
    });
  }

  function _showDeleteConfirm(row) {
    if (row.querySelector('.muscu-ex-delete-confirm')) return;
    row.classList.add('muscu-ex-confirming');
    const el = document.createElement('div');
    el.className = 'muscu-ex-delete-confirm';
    const label  = document.createElement('span');
    label.className = 'muscu-ex-delete-confirm-label';
    label.textContent = 'Retirer cet exercice ?';
    const btnYes = document.createElement('button');
    btnYes.className = 'muscu-ex-delete-yes-btn';
    btnYes.textContent = 'Supprimer';
    const btnNo = document.createElement('button');
    btnNo.className = 'muscu-ex-delete-no-btn';
    btnNo.textContent = 'Annuler';
    el.append(label, btnYes, btnNo);
    row.appendChild(el);
    btnYes.addEventListener('click', (e) => {
      e.stopPropagation();
      MuscuPage.removeExerciseFromSession(parseInt(row.dataset.sessionIdx), row.dataset.exName);
    });
    btnNo.addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.remove('muscu-ex-confirming');
      el.remove();
    });
  }

  // ── Add / remove exercises from sessions ─────────────────
  function toggleAddExerciseInput(sessionIdx) {
    const form = document.getElementById(`muscu-add-ex-form-${sessionIdx}`);
    const btn  = form ? form.previousElementSibling : null;
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'flex';
    if (btn) btn.style.display = visible ? '' : 'none';
    if (!visible) {
      const input = document.getElementById(`muscu-add-ex-input-${sessionIdx}`);
      if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    }
  }

  function cancelAddExercise(sessionIdx) {
    const form = document.getElementById(`muscu-add-ex-form-${sessionIdx}`);
    const btn  = form ? form.previousElementSibling : null;
    if (form) form.style.display = 'none';
    if (btn) btn.style.display = '';
  }

  function confirmAddExercise(sessionIdx) {
    const input = document.getElementById(`muscu-add-ex-input-${sessionIdx}`);
    if (!input) return;
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const session = _muscuSessions[sessionIdx];
    if (!session) return;
    const existing = _getSessionExercises(session).map(e => e.toLowerCase());
    if (existing.includes(name.toLowerCase())) {
      if (typeof App !== 'undefined') App.showToast('Exercice déjà présent dans cette séance');
      return;
    }
    if (!_customSessionExercises[session.name]) _customSessionExercises[session.name] = [];
    _customSessionExercises[session.name].push(name);
    _saveCustomExercises();
    _refresh();
  }

  function removeExerciseFromSession(sessionIdx, exName) {
    const session = _muscuSessions[sessionIdx];
    if (!session) return;
    const customs = _customSessionExercises[session.name];
    if (!customs) return;
    _customSessionExercises[session.name] = customs.filter(e => e.toLowerCase() !== exName.toLowerCase());
    _saveCustomExercises();
    _refresh();
  }

  return { render, init, showAddRecordForm, showEditRecordForm, cancelRecordForm, openSessionRecord, saveRecord, deleteRecord, toggleAddExerciseInput, cancelAddExercise, confirmAddExercise, removeExerciseFromSession, switchMuscuTab, gymChangeWeek, toggleGymExercise };
})();
