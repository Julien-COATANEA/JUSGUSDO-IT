// ── App / Workout page ───────────────────────────────────────
const WorkoutPage = (() => {
  const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  let weekOffset = 0;
  let exercises = [];
  let entries = {}; // { 'YYYY-MM-DD_exerciseId': { completed, performed_reps, performed_distance_km } }
  let activeHomeEditorKey = null;
  let homeEntryMutationQueueByKey = new Map();
  let homeEntryMutationVersionByKey = new Map();
  let currentUser = null;
  let stats = { streak: 0, totalCompletedDays: 0 };
  let activeSheetDate = null;
  const DEFAULT_HOME_RUNNING_DISTANCE_KM = 1;

  // ── Rest days (localStorage) ──────────────────────────────
  function _getRestDays() {
    try { return JSON.parse(localStorage.getItem('rest_days') || '[]'); } catch { return []; }
  }
  function _isRestDay(key) { return _getRestDays().includes(key); }
  function toggleRestDay(key) {
    const list = _getRestDays();
    const idx = list.indexOf(key);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(key);
    localStorage.setItem('rest_days', JSON.stringify(list));
    _refreshDayUI(key);
  }

  function render() {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    return `
      <div class="app-page user-${currentUser.username?.toLowerCase()}">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')" style="visibility:hidden">←</button>
          <div class="header-info">
            <span class="header-username" id="header-username">${escapeHtml(currentUser.username || '')}</span>
            <span class="header-rank" id="header-rank">Chargement...</span>
          </div>
          <button class="icon-btn" onclick="Router.navigate('admin',{exTab:'home'})" title="Réglages exercices"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        </header>

        <div class="xp-bar-container">
          <div class="xp-bar-track">
            <div class="xp-bar-fill" id="xp-bar-fill"></div>
          </div>
          <div class="xp-bar-labels">
            <span id="xp-current-label">0 XP</span>
            <span id="xp-rank-progress"></span>
            <span id="xp-next-label">100 XP</span>
          </div>
        </div>

        <div class="week-context">
          <button class="week-btn" onclick="WorkoutPage.changeWeek(-1)">‹</button>
          <div class="week-inner">
            <div class="week-label" id="week-label">Cette semaine</div>
            <div class="week-strip" id="week-strip"></div>
          </div>
          <button class="week-btn" onclick="WorkoutPage.changeWeek(1)">›</button>
        </div>

        <div class="today-stats-bar">
          <span class="tsb-pill">🔥&nbsp;<b id="stat-streak">0</b>&nbsp;jours</span>
          <span class="tsb-sep"></span>
          <span class="tsb-pill">📅&nbsp;<b id="stat-week">0/7</b>&nbsp;sem.</span>
          <span class="tsb-sep"></span>
          <span class="tsb-pill">⚡&nbsp;<b id="stat-total">0</b>&nbsp;total</span>
        </div>

        <main class="calendar-container" id="calendar-container">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </main>
      </div>
    `;
  }

  async function init() {
    try {
      const [exData, statsData, meData] = await Promise.all([
        API.getExercises(),
        API.getStats(),
        API.me(),
      ]);
      exercises = exData.exercises;
      stats = statsData;
      currentUser = meData.user;
      (localStorage.getItem('token') ? localStorage : sessionStorage).setItem('user', JSON.stringify(currentUser));

      updateHUD();
      await loadWeek();
    } catch (err) {
      console.error(err);
      App.showToast('Erreur de chargement');
    }
  }

  function getWeekDates(offset) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function getExercisesForDay(_date) {
    return exercises.filter(ex => ex.is_active !== false);
  }

  function _dateFromKey(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function _homeEntryKey(dateStr, exerciseId) {
    return `${dateStr}_${exerciseId}`;
  }

  function _clampHomeMetric(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function _normalizeHomeReps(value) {
    const rawValues = Array.isArray(value)
      ? value
      : (typeof value === 'string' ? value.split(/[^0-9]+/) : []);

    return rawValues
      .map(item => parseInt(item, 10))
      .filter(item => Number.isInteger(item) && item > 0 && item <= 9999)
      .slice(0, 24);
  }

  function _normalizeHomeDistanceKm(value) {
    if (value == null || value === '') return null;
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999.9) return null;
    return Math.round(parsed * 10) / 10;
  }

  function _formatHomeDistanceKm(value, includeUnit = true) {
    const normalized = _normalizeHomeDistanceKm(value) ?? DEFAULT_HOME_RUNNING_DISTANCE_KM;
    const text = Number.isInteger(normalized)
      ? String(normalized)
      : String(normalized).replace('.', ',');
    return includeUnit ? `${text} km` : text;
  }

  function _buildHomeDefaultReps(exercise) {
    const sets = _clampHomeMetric(exercise?.sets, 1, 24, 1);
    const reps = _clampHomeMetric(exercise?.reps, 1, 9999, 10);
    return Array.from({ length: sets }, () => reps);
  }

  function _buildHomeDefaultDistanceKm(exercise) {
    if (exercise?.unit === 'km') {
      return _normalizeHomeDistanceKm(exercise?.reps) ?? DEFAULT_HOME_RUNNING_DISTANCE_KM;
    }
    return DEFAULT_HOME_RUNNING_DISTANCE_KM;
  }

  function _getHomePerformanceState(performedReps, fallbackSets, fallbackReps) {
    const normalized = _normalizeHomeReps(performedReps);
    const plannedSets = _clampHomeMetric(fallbackSets, 1, 24, 1);
    const plannedReps = _clampHomeMetric(fallbackReps, 1, 9999, 10);
    const repsList = normalized.length ? normalized : Array.from({ length: plannedSets }, () => plannedReps);

    return {
      sets: _clampHomeMetric(repsList.length, 1, 24, plannedSets),
      reps: _clampHomeMetric(repsList[0], 1, 9999, plannedReps),
      repsList,
      isUniform: repsList.every(value => value === repsList[0]),
    };
  }

  function _formatHomePerformance(performedReps, fallbackSets, fallbackReps) {
    const perf = _getHomePerformanceState(performedReps, fallbackSets, fallbackReps);
    return perf.isUniform ? `${perf.sets} x ${perf.reps}` : perf.repsList.join(' • ');
  }

  function _changeHomePerformedSetCount(performedReps, delta, fallbackReps) {
    const next = _normalizeHomeReps(performedReps);
    const safeFallbackReps = _clampHomeMetric(fallbackReps, 1, 9999, 10);
    if (!next.length) next.push(safeFallbackReps);

    if (delta > 0) next.push(next[next.length - 1] || safeFallbackReps);
    else if (delta < 0 && next.length > 1) next.pop();

    return next.slice(0, 24);
  }

  function _changeHomePerformedSetReps(performedReps, setIndex, delta, fallbackReps) {
    const next = _normalizeHomeReps(performedReps);
    const safeFallbackReps = _clampHomeMetric(fallbackReps, 1, 9999, 10);
    if (!next.length) next.push(safeFallbackReps);
    if (setIndex < 0 || setIndex >= next.length) return next;

    next[setIndex] = _clampHomeMetric((next[setIndex] || safeFallbackReps) + delta, 1, 9999, next[setIndex] || safeFallbackReps);
    return next;
  }

  function _changeHomeDistanceKm(currentDistance, delta) {
    const base = _normalizeHomeDistanceKm(currentDistance) ?? DEFAULT_HOME_RUNNING_DISTANCE_KM;
    const next = Math.round((base + delta) * 10) / 10;
    return Math.min(999.9, Math.max(0.5, next));
  }

  function _cloneHomeEntry(entry) {
    return entry
      ? {
          ...entry,
          completed: !!entry.completed,
          performed_reps: _normalizeHomeReps(entry.performed_reps),
          performed_distance_km: _normalizeHomeDistanceKm(entry.performed_distance_km),
        }
      : null;
  }

  function _getHomeEntry(dateStr, exerciseId) {
    return _cloneHomeEntry(entries[_homeEntryKey(dateStr, exerciseId)]);
  }

  function _setHomeEntry(dateStr, exerciseId, entry) {
    const key = _homeEntryKey(dateStr, exerciseId);
    if (entry?.completed) entries[key] = _cloneHomeEntry(entry);
    else delete entries[key];
  }

  function _getHomeEditorKey(dateStr, exerciseId) {
    return `${dateStr}_home_${exerciseId}`;
  }

  function _getHomeMutationKey(dateStr, exerciseId) {
    return `${dateStr}_home_mutation_${exerciseId}`;
  }

  function _beginHomeEntryMutation(dateStr, exerciseId) {
    const key = _getHomeMutationKey(dateStr, exerciseId);
    const nextVersion = (homeEntryMutationVersionByKey.get(key) || 0) + 1;
    homeEntryMutationVersionByKey.set(key, nextVersion);
    return { key, version: nextVersion };
  }

  function _isLatestHomeEntryMutation(mutation) {
    return homeEntryMutationVersionByKey.get(mutation.key) === mutation.version;
  }

  function _queueHomeEntryMutation(dateStr, exerciseId, task) {
    const key = _getHomeMutationKey(dateStr, exerciseId);
    const previous = homeEntryMutationQueueByKey.get(key) || Promise.resolve();
    let tracked = null;
    const next = previous.catch(() => {}).then(task);
    tracked = next.finally(() => {
      if (homeEntryMutationQueueByKey.get(key) === tracked) homeEntryMutationQueueByKey.delete(key);
    });
    homeEntryMutationQueueByKey.set(key, tracked);
    return tracked;
  }

  function _syncHomeEntryResult(dateStr, exerciseId, result) {
    if (result?.completed) {
      _setHomeEntry(dateStr, exerciseId, {
        completed: true,
        performed_reps: _normalizeHomeReps(result.performed_reps),
        performed_distance_km: _normalizeHomeDistanceKm(result.performed_distance_km),
      });
    } else {
      _setHomeEntry(dateStr, exerciseId, null);
    }
  }

  function _syncHomeXp(result, anchorEl) {
    if (result?.xp !== undefined) {
      currentUser.xp = result.xp;
      (localStorage.getItem('token') ? localStorage : sessionStorage).setItem('user', JSON.stringify(currentUser));
      updateHUD();
    }
    if (result?.xpDelta) {
      Gamification.spawnXPPopup(anchorEl || document.querySelector('#home-day-sheet .gym-day-sheet'), `${result.xpDelta > 0 ? '+' : ''}${result.xpDelta} XP`);
    }
  }

  function _getHomeExercise(exerciseId) {
    return exercises.find(ex => ex.id === Number(exerciseId)) || null;
  }

  function _dayCounts(dateStr) {
    const dayExercises = getExercisesForDay(_dateFromKey(dateStr));
    const doneCount = dayExercises.filter(ex => _getHomeEntry(dateStr, ex.id)?.completed).length;
    return { doneCount, total: dayExercises.length };
  }

  function _isDayActive(dateStr) {
    return _dayCounts(dateStr).doneCount > 0;
  }

  async function loadWeek() {
    const dates = getWeekDates(weekOffset);
    const start = dateKey(dates[0]);
    const end = dateKey(dates[6]);

    try {
      const { entries: raw } = await API.getChecklist(start, end);
      entries = {};
      raw.forEach(e => {
        const dk = typeof e.entry_date === 'string'
          ? e.entry_date.split('T')[0]
          : new Date(e.entry_date).toISOString().split('T')[0];
        if (e.completed) {
          entries[_homeEntryKey(dk, e.exercise_id)] = {
            completed: true,
            performed_reps: _normalizeHomeReps(e.performed_reps),
            performed_distance_km: _normalizeHomeDistanceKm(e.performed_distance_km),
          };
        }
      });
      renderWeek(dates);
    } catch (err) {
      console.error(err);
    }
  }

  function _buildDayCard(date, isHero) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const key = dateKey(date);
    const isToday = date.getTime() === today.getTime();
    const isFuture = date > today;
    const isPast = !isToday && !isFuture;
    const canOpenDetails = !isFuture;

    const { doneCount } = _dayCounts(key);
    const hasActivity = doneCount > 0;
    const isRest = !hasActivity && _isRestDay(key);
    const ringPct = (hasActivity || isRest) ? 100 : 0;
    const ringColor = hasActivity ? '#22d18b'
      : isRest ? '#3b82f6'
      : isFuture ? 'rgba(255,255,255,0.07)'
      : 'rgba(255,255,255,0.18)';

    let summaryHtml;
    if (isFuture) {
      summaryHtml = '';
    } else if (hasActivity) {
      const pills = [
        `<span class="gym-day-pill">🏠 ${doneCount} exercice${doneCount !== 1 ? 's' : ''}</span>`,
      ];
      summaryHtml = `<div class="gym-day-summary">${pills.join('')}</div>`;
    } else if (isRest) {
      summaryHtml = `<p class="gym-rest-day-msg">🛌 Jour de repos déclaré</p>`;
    } else {
      summaryHtml = `<p class="gym-rest-day-msg">${isToday ? 'Pas encore d\'activité' : 'Aucune activité ce jour'}</p>`;
    }

    const showHistoryCta = isPast && (hasActivity || isRest);
    const ctaLabel = isToday
      ? (hasActivity || isRest ? '✎&nbsp;Modifier' : '+&nbsp;Enregistrer mon activité')
      : showHistoryCta
        ? '👁️&nbsp;Voir le détail'
        : '';
    const ctaClass = `gym-day-cta${(hasActivity || isRest) ? ' cta-edit' : ''}${isToday ? ' cta-today' : ''}${isPast ? ' cta-readonly' : ''}`;
    const cta = (isToday || showHistoryCta) ? `
      <button type="button" class="${ctaClass}" onclick="event.stopPropagation();WorkoutPage.openDayActionsSheet('${key}')">${ctaLabel}</button>` : '';

    const card = document.createElement('div');
    card.className = `day-card${hasActivity ? ' completed' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${isPast ? ' past' : ''}${(isHero || isToday) ? ' open' : ''}${isRest ? ' gym-rest-day' : ''}${isHero ? ' hero' : ''}`;
    card.dataset.key = key;
    card.id = `day-${key}`;

    card.innerHTML = `
      <div class="day-header${canOpenDetails ? ' day-header-clickable' : ''}" ${canOpenDetails ? `onclick="WorkoutPage.openDayActionsSheet('${key}')"` : ''}>
        <div class="day-check">${hasActivity ? '✓' : isRest ? '🛌' : ''}</div>
        <div class="day-name-block">
          <div class="day-name">${DAYS_FR[date.getDay()]}</div>
          <div class="day-date">${date.getDate()} ${MONTHS_FR[date.getMonth()]}</div>
          <div class="day-badges">
            ${isToday ? '<span class="today-badge">Aujourd\'hui</span>' : ''}
            ${isFuture ? '<span class="preview-badge">À venir</span>' : ''}
            ${isRest && !isFuture ? '<span class="rest-badge">Repos</span>' : ''}
          </div>
        </div>
        <div class="day-ring" style="--ring-p:${ringPct};--ring-c:${ringColor}">
          <span class="day-ring-val">${isRest ? '🛌' : doneCount}</span>
        </div>
      </div>
      <div class="exercises-list">
        ${summaryHtml}
        ${cta}
      </div>
    `;
    return card;
  }

  function renderWeek(dates) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const labelEl = document.getElementById('week-label');
    if (labelEl) {
      if (weekOffset === 0) labelEl.textContent = 'Cette semaine';
      else if (weekOffset === -1) labelEl.textContent = 'Semaine dernière';
      else {
        const f = dates[0], l = dates[6];
        labelEl.textContent = `${f.getDate()} ${MONTHS_FR[f.getMonth()]} – ${l.getDate()} ${MONTHS_FR[l.getMonth()]}`;
      }
    }

    const container = document.getElementById('calendar-container');
    if (!container) return;
    container.innerHTML = '';

    let weekDone = 0;
    let weekTotal = 0;
    dates.forEach(date => {
      const key = dateKey(date);
      const isFuture = date > today;
      if (!isFuture) {
        weekTotal++;
        if (_isDayActive(key)) weekDone++;
      }
    });

    // Render all days in chronological order (Mon→Sun)
    dates.forEach(d => {
      const isHero = weekOffset === 0 && d.getTime() === today.getTime();
      container.appendChild(_buildDayCard(d, isHero));
    });

    document.getElementById('stat-week').textContent = `${weekDone}/${weekTotal}`;
    document.getElementById('stat-streak').textContent = stats.streak;
    document.getElementById('stat-total').textContent = stats.totalCompletedDays;

    renderWeekStrip(dates);

    // Auto-scroll to today on current week
    if (weekOffset === 0) {
      const todayKey = dateKey(today);
      const todayCard = document.getElementById(`day-${todayKey}`);
      if (todayCard) setTimeout(() => todayCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
  }

  const DAY_LETTERS = ['D','L','M','M','J','V','S']; // Sun=0

  function renderWeekStrip(dates) {
    const strip = document.getElementById('week-strip');
    if (!strip) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    strip.innerHTML = dates.map(date => {
      const key = dateKey(date);
      const isToday = date.getTime() === today.getTime();
      const isFuture = date > today;
      const { doneCount } = _dayCounts(key);
      const isActive = doneCount > 0;
      const isRest = _isRestDay(key);
      const pct = (isActive || isRest) ? 100 : 0;
      const ringC = isActive ? '#22d18b' : isFuture ? 'rgba(255,255,255,0.07)' : isRest ? '#3b82f6' : '#ef4444';
      const state = isFuture ? 'future' : isActive ? 'done' : isRest ? 'rest' : 'missed';

      return `
        <div class="wsd ${state}${isToday ? ' today-dot' : ''}" onclick="document.getElementById('day-${key}')?.scrollIntoView({behavior:'smooth',block:'center'})">
          <div class="wsd-ring" style="--ring-p:${pct};--ring-c:${ringC}">
            <span class="wsd-inner">${isRest ? '🛌' : doneCount}</span>
          </div>
          <span class="wsd-lbl">${DAY_LETTERS[date.getDay()]}</span>
        </div>
      `;
    }).join('');
  }

  function toggleDay(headerEl) {
    const card = headerEl.closest('.day-card');
    const key = card?.dataset.key;
    if (!key) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (key === dateKey(today)) openDayActionsSheet(key);
  }

  function openDayActionsSheet(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (_dateFromKey(dateStr) > today) return;

    activeSheetDate = dateStr;
  activeHomeEditorKey = null;
    let sheet = document.getElementById('home-day-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'home-day-sheet';
      sheet.className = 'gym-day-sheet-backdrop';
      sheet.addEventListener('click', e => {
        if (e.target === sheet) closeDayActionsSheet();
      });
      document.body.appendChild(sheet);
    }

    _renderDayActionsSheet();
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeDayActionsSheet() {
    activeSheetDate = null;
    activeHomeEditorKey = null;
    const sheet = document.getElementById('home-day-sheet');
    if (sheet) sheet.classList.remove('open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function _renderHomeDaySheetShell(title, subtitle, bodyHtml) {
    return `
      <div class="gym-day-sheet">
        <div class="sheet-handle"></div>
        <header class="sheet-header">
          <div>
            <h3>${title}</h3>
            <p class="sheet-subtitle">${subtitle}</p>
          </div>
          <button type="button" class="sheet-close" onclick="WorkoutPage.closeDayActionsSheet()" aria-label="Fermer">✕</button>
        </header>
        <div class="sheet-body">
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  function _renderHomeReadOnlyExercises(exercises) {
    return exercises.map(exercise => {
      let metaTag = '<span class="exercise-tag sheet-tag-reps">Valide</span>';
      if (exercise.is_running) {
        metaTag = exercise.performed_distance_km != null
          ? `<span class="exercise-tag running sheet-tag-reps">${_formatHomeDistanceKm(exercise.performed_distance_km)}</span>`
          : `<span class="exercise-tag running sheet-tag-reps">${exercise.reps}&nbsp;${escapeHtml(exercise.unit || 'min')}</span>`;
      } else if (exercise.sets != null && exercise.reps != null) {
        const performedSummary = _normalizeHomeReps(exercise.performed_reps).length
          ? `${_formatHomePerformance(exercise.performed_reps, exercise.sets, exercise.reps)} rep`
          : `${exercise.sets}&nbsp;×&nbsp;${exercise.reps}&nbsp;rép.`;
        metaTag = `<span class="exercise-tag sheet-tag-reps">${performedSummary}</span>`;
      }

      return `
        <div class="exercise-item sheet-exercise-row checked readonly">
          <div class="exercise-info">
            <div class="exercise-name">${escapeHtml(exercise.emoji || '💪')} ${escapeHtml(exercise.name || 'Exercice')}</div>
          </div>
          <div class="sheet-ex-right">
            ${metaTag}
            <span class="sheet-ex-check on">✓</span>
          </div>
        </div>`;
    }).join('') || '<p class="exercise-inline-help" style="padding:8px 12px">Aucun exercice effectué ce jour.</p>';
  }

  async function _renderDayActionsSheet() {
    const sheet = document.getElementById('home-day-sheet');
    if (!sheet || !activeSheetDate) return;

    // Preserve scroll position before full re-render
    const _prevBody = sheet.querySelector('.sheet-body');
    const _savedScroll = _prevBody ? _prevBody.scrollTop : 0;

    const requestedDate = activeSheetDate;
    const dateObj = _dateFromKey(requestedDate);
    const title = `${DAYS_FR[dateObj.getDay()]} ${dateObj.getDate()} ${MONTHS_FR[dateObj.getMonth()]}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isReadOnly = requestedDate !== dateKey(today);
    const isRest = _isRestDay(requestedDate);
    const renderReadOnlyNote = (dayIsRest) => `
      <section class="sheet-section">
        <div class="sheet-readonly-note${dayIsRest ? ' is-rest' : ''}">
          <strong>${dayIsRest ? 'Jour de repos déclaré' : 'Historique de la journée'}</strong>
          <small>${dayIsRest ? 'Cette journée a été marquée comme repos. Les jours passés sont consultables uniquement.' : 'Lecture seule : tu peux consulter les exercices validés ce jour-là, sans les modifier.'}</small>
        </div>
      </section>`;

    if (isReadOnly) {
      sheet.innerHTML = _renderHomeDaySheetShell(
        title,
        'Lecture seule — historique du jour',
        `${renderReadOnlyNote(isRest)}
          <section class="sheet-section">
            <h4 class="sheet-section-title">🏠 Activité Maison</h4>
            <div class="sheet-acc-body"><p class="exercise-inline-help" style="padding:8px 12px">Chargement de l'historique…</p></div>
          </section>`
      );

      try {
        const data = await API.getHomeDayDetail(requestedDate);
        if (activeSheetDate !== requestedDate || !document.getElementById('home-day-sheet')) return;

        sheet.innerHTML = _renderHomeDaySheetShell(
          title,
          'Lecture seule — historique du jour',
          `${renderReadOnlyNote(isRest)}
            <section class="sheet-section">
              <h4 class="sheet-section-title">🏠 Activité Maison</h4>
              <div class="sheet-acc-body">${_renderHomeReadOnlyExercises(data.exercises || [])}</div>
            </section>`
        );
      } catch (err) {
        console.error('[Home day detail]', err);
        if (activeSheetDate !== requestedDate || !document.getElementById('home-day-sheet')) return;

        sheet.innerHTML = _renderHomeDaySheetShell(
          title,
          'Lecture seule — historique du jour',
          `${renderReadOnlyNote(isRest)}
            <section class="sheet-section">
              <h4 class="sheet-section-title">🏠 Activité Maison</h4>
              <div class="sheet-acc-body"><p class="exercise-inline-help" style="padding:8px 12px">Impossible de charger l'historique.</p></div>
            </section>`
        );
      }
      return;
    }

    const exercisesHtml = getExercisesForDay(dateObj).map(ex => {
      const entry = _getHomeEntry(requestedDate, ex.id);
      const checked = !!entry?.completed;
      const editorKey = _getHomeEditorKey(requestedDate, ex.id);
      const isEditorOpen = checked && activeHomeEditorKey === editorKey;
      const safeName = escapeHtml(ex.name);
      const plannedBadge = ex.is_running
        ? `<span class="exercise-tag running sheet-tag-reps">${ex.reps}&nbsp;${escapeHtml(ex.unit || 'min')}</span>`
        : `<span class="exercise-tag sheet-tag-reps">${ex.sets}&nbsp;×&nbsp;${ex.reps}&nbsp;rép.</span>`;

      let editableBadge = plannedBadge;
      let editorHtml = '';

      if (checked && ex.is_running) {
        const distanceKm = _normalizeHomeDistanceKm(entry?.performed_distance_km) ?? _buildHomeDefaultDistanceKm(ex);
        const presetDistance = ex.unit === 'km' ? (_normalizeHomeDistanceKm(ex.reps) ?? _buildHomeDefaultDistanceKm(ex)) : null;
        editableBadge = `<button type="button" class="exercise-tag running sheet-tag-reps sheet-tag-reps-btn${isEditorOpen ? ' active' : ''}"
            onclick="event.stopPropagation();WorkoutPage.toggleHomeEditor('${requestedDate}', ${ex.id})"
            aria-pressed="${isEditorOpen}">${_formatHomeDistanceKm(distanceKm)}<span class="editable-badge-icon" aria-hidden="true">✎</span></button>`;
        editorHtml = isEditorOpen ? `
          <div class="sheet-reps-editor" onclick="event.stopPropagation()">
            <div class="sheet-reps-toolbar">
              <div class="sheet-stepper-compact accent">
                <span class="sheet-stepper-mini-label">Distance</span>
                <div class="sheet-stepper-control compact">
                  <button type="button" class="sheet-stepper-btn compact"
                    onclick="event.stopPropagation();WorkoutPage.adjustHomeRunningDistance('${requestedDate}', ${ex.id}, -0.5, this)"
                    aria-label="Retirer 0,5 km">−</button>
                  <span class="sheet-stepper-value compact wide">${_formatHomeDistanceKm(distanceKm, false)}</span>
                  <button type="button" class="sheet-stepper-btn compact"
                    onclick="event.stopPropagation();WorkoutPage.adjustHomeRunningDistance('${requestedDate}', ${ex.id}, 0.5, this)"
                    aria-label="Ajouter 0,5 km">+</button>
                </div>
              </div>
              ${presetDistance != null ? `<button type="button" class="sheet-reps-preset${distanceKm === presetDistance ? ' active' : ''}"
                onclick="event.stopPropagation();WorkoutPage.setHomeRunningDistance('${requestedDate}', ${ex.id}, ${presetDistance}, this)">Objectif ${_formatHomeDistanceKm(presetDistance)}</button>` : ''}
            </div>
            <div class="sheet-reps-help">Distance parcourue sur cette séance cardio.</div>
          </div>` : '';
      } else if (checked) {
        const performedReps = _normalizeHomeReps(entry?.performed_reps);
        const performance = _getHomePerformanceState(performedReps, ex.sets, ex.reps);
        const plannedPerformance = _formatHomePerformance([], ex.sets, ex.reps);
        const perfSummary = _formatHomePerformance(performedReps, ex.sets, ex.reps);
        editableBadge = `<button type="button" class="exercise-tag sheet-tag-reps sheet-tag-reps-btn${isEditorOpen ? ' active' : ''}"
            onclick="event.stopPropagation();WorkoutPage.toggleHomeEditor('${requestedDate}', ${ex.id})"
            aria-pressed="${isEditorOpen}">${perfSummary} rep<span class="editable-badge-icon" aria-hidden="true">✎</span></button>`;
        editorHtml = isEditorOpen ? `
          <div class="sheet-reps-editor" onclick="event.stopPropagation()">
            <div class="sheet-reps-toolbar">
              <div class="sheet-stepper-compact">
                <span class="sheet-stepper-mini-label">Séries</span>
                <div class="sheet-stepper-control compact">
                  <button type="button" class="sheet-stepper-btn compact"
                    onclick="event.stopPropagation();WorkoutPage.changeHomeExerciseSetCount('${requestedDate}', ${ex.id}, -1, this)"
                    aria-label="Retirer une série">−</button>
                  <span class="sheet-stepper-value compact">${performance.sets}</span>
                  <button type="button" class="sheet-stepper-btn compact"
                    onclick="event.stopPropagation();WorkoutPage.changeHomeExerciseSetCount('${requestedDate}', ${ex.id}, 1, this)"
                    aria-label="Ajouter une série">+</button>
                </div>
              </div>
              <button type="button" class="sheet-reps-preset${perfSummary === plannedPerformance ? ' active' : ''}"
                onclick="event.stopPropagation();WorkoutPage.setHomeExercisePerformance('${requestedDate}', ${ex.id}, this)">Prévu ${plannedPerformance}</button>
            </div>
            <div class="sheet-reps-sets">
              ${performance.repsList.map((setReps, setIndex) => `
                <div class="sheet-set-pill${setIndex === performance.repsList.length - 1 ? ' accent' : ''}">
                  <span class="sheet-set-label">S${setIndex + 1}</span>
                  <div class="sheet-stepper-control compact">
                    <button type="button" class="sheet-stepper-btn compact"
                      onclick="event.stopPropagation();WorkoutPage.adjustHomeExerciseSetReps('${requestedDate}', ${ex.id}, ${setIndex}, -1, this)"
                      aria-label="Retirer une répétition sur la série ${setIndex + 1}">−</button>
                    <span class="sheet-stepper-value compact wide">${setReps}</span>
                    <button type="button" class="sheet-stepper-btn compact"
                      onclick="event.stopPropagation();WorkoutPage.adjustHomeExerciseSetReps('${requestedDate}', ${ex.id}, ${setIndex}, 1, this)"
                      aria-label="Ajouter une répétition sur la série ${setIndex + 1}">+</button>
                  </div>
                </div>`).join('')}
            </div>
            ${performance.isUniform ? '' : '<div class="sheet-reps-help">Tu peux varier les répétitions d’une série à l’autre.</div>'}
          </div>` : '';
      }

      return `
        <div class="exercise-item sheet-exercise-row${checked ? ' checked' : ''}${isEditorOpen ? ' has-reps-editor' : ''}"
             onclick="WorkoutPage.toggleExercise('${requestedDate}', ${ex.id}, this, event)">
          <div class="sheet-ex-main">
            <div class="exercise-info">
              <div class="exercise-name">${escapeHtml(ex.emoji || '💪')} ${safeName}</div>
            </div>
            <div class="sheet-ex-right">
              ${checked ? editableBadge : plannedBadge}
              <span class="sheet-ex-check${checked ? ' on' : ''}">✓</span>
            </div>
          </div>
          ${editorHtml}
        </div>`;
    }).join('') || '<p class="exercise-inline-help" style="padding:8px 12px">Aucun exercice disponible</p>';

    const introSection = `
      <section class="sheet-section">
        <button type="button" class="rest-toggle-btn${isRest ? ' on' : ''}" onclick="WorkoutPage.toggleRestDay('${requestedDate}')">
          <span class="rest-toggle-icon">🛌</span>
          <span class="rest-toggle-text">
            <strong>${isRest ? 'Jour de repos déclaré' : 'Marquer comme jour de repos'}</strong>
            <small>${isRest ? 'Cliquer pour annuler' : 'Mémorisé localement sur Maison'}</small>
          </span>
          <span class="rest-toggle-state">${isRest ? '✓' : ''}</span>
        </button>
      </section>`;

    sheet.innerHTML = _renderHomeDaySheetShell(
      title,
      'Que veux-tu enregistrer pour ce jour ?',
      `${introSection}
        <section class="sheet-section">
          <h4 class="sheet-section-title">🏠 Exercices Maison</h4>
          <div class="sheet-acc-body">${exercisesHtml}</div>
        </section>`
    );

    // Restore scroll position after DOM replacement
    const _newBody = sheet.querySelector('.sheet-body');
    if (_newBody && _savedScroll > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { _newBody.scrollTop = _savedScroll; });
      });
    }
  }
    const dates = getWeekDates(weekOffset);
    const oldCard = document.getElementById(`day-${dateStr}`);
    if (oldCard) {
      const date = _dateFromKey(dateStr);
      const isHero = oldCard.classList.contains('hero');
      const newCard = _buildDayCard(date, isHero);
      oldCard.replaceWith(newCard);
    }
    _refreshWeekStats(dates);
    renderWeekStrip(dates);
    if (activeSheetDate === dateStr) _renderDayActionsSheet();
  }

  function _refreshWeekStats(dates) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let weekDone = 0;
    let weekTotal = 0;
    dates.forEach(date => {
      if (date > today) return;
      weekTotal++;
      if (_isDayActive(dateKey(date))) weekDone++;
    });

    document.getElementById('stat-week').textContent = `${weekDone}/${weekTotal}`;
    document.getElementById('stat-streak').textContent = stats.streak;
    document.getElementById('stat-total').textContent = stats.totalCompletedDays;
  }

  function toggleHomeEditor(dateStr, exerciseId) {
    const nextKey = _getHomeEditorKey(dateStr, exerciseId);
    activeHomeEditorKey = activeHomeEditorKey === nextKey ? null : nextKey;
    if (activeSheetDate === dateStr) _renderDayActionsSheet();
  }

  async function _persistHomeExercisePerformance(dateStr, exercise, nextPerformedReps, nextDistanceKm, anchorEl, previousEntry) {
    const mutation = _beginHomeEntryMutation(dateStr, exercise.id);
    _setHomeEntry(dateStr, exercise.id, {
      completed: true,
      performed_reps: exercise.is_running ? [] : nextPerformedReps,
      performed_distance_km: exercise.is_running ? nextDistanceKm : null,
    });
    _refreshDayUI(dateStr);

    return _queueHomeEntryMutation(dateStr, exercise.id, async () => {
      try {
        const result = await API.saveChecklistEntry(
          exercise.id,
          dateStr,
          exercise.is_running ? [] : nextPerformedReps,
          exercise.is_running ? nextDistanceKm : null
        );

        if (_isLatestHomeEntryMutation(mutation)) {
          _syncHomeEntryResult(dateStr, exercise.id, result);
          _syncHomeXp(result, anchorEl?.closest('.sheet-exercise-row') || anchorEl || document.querySelector('#home-day-sheet .gym-day-sheet'));
          _refreshDayUI(dateStr);
        }
      } catch (err) {
        if (_isLatestHomeEntryMutation(mutation)) {
          _setHomeEntry(dateStr, exercise.id, previousEntry);
          _refreshDayUI(dateStr);
          App.showToast('Erreur : ' + err.message);
        }
        throw err;
      }
    }).catch(() => {});
  }

  async function changeHomeExerciseSetCount(dateStr, exerciseId, delta, anchorEl) {
    const exercise = _getHomeExercise(exerciseId);
    if (!exercise || exercise.is_running) return;
    const previousEntry = _getHomeEntry(dateStr, exerciseId) || { completed: false, performed_reps: [] };
    const currentPerformance = _getHomePerformanceState(previousEntry.performed_reps, exercise.sets, exercise.reps);
    const nextPerformedReps = _changeHomePerformedSetCount(currentPerformance.repsList, delta, exercise.reps);
    return _persistHomeExercisePerformance(dateStr, exercise, nextPerformedReps, null, anchorEl, previousEntry);
  }

  async function adjustHomeExerciseSetReps(dateStr, exerciseId, setIndex, delta, anchorEl) {
    const exercise = _getHomeExercise(exerciseId);
    if (!exercise || exercise.is_running) return;
    const previousEntry = _getHomeEntry(dateStr, exerciseId) || { completed: false, performed_reps: [] };
    const currentPerformance = _getHomePerformanceState(previousEntry.performed_reps, exercise.sets, exercise.reps);
    const nextPerformedReps = _changeHomePerformedSetReps(currentPerformance.repsList, setIndex, delta, exercise.reps);
    return _persistHomeExercisePerformance(dateStr, exercise, nextPerformedReps, null, anchorEl, previousEntry);
  }

  async function setHomeExercisePerformance(dateStr, exerciseId, anchorEl) {
    const exercise = _getHomeExercise(exerciseId);
    if (!exercise || exercise.is_running) return;
    const previousEntry = _getHomeEntry(dateStr, exerciseId) || { completed: false, performed_reps: [] };
    const nextPerformedReps = _buildHomeDefaultReps(exercise);
    return _persistHomeExercisePerformance(dateStr, exercise, nextPerformedReps, null, anchorEl, previousEntry);
  }

  async function adjustHomeRunningDistance(dateStr, exerciseId, delta, anchorEl) {
    const exercise = _getHomeExercise(exerciseId);
    if (!exercise || !exercise.is_running) return;
    const previousEntry = _getHomeEntry(dateStr, exerciseId) || { completed: false, performed_distance_km: _buildHomeDefaultDistanceKm(exercise) };
    const nextDistanceKm = _changeHomeDistanceKm(previousEntry.performed_distance_km, delta);
    return _persistHomeExercisePerformance(dateStr, exercise, [], nextDistanceKm, anchorEl, previousEntry);
  }

  async function setHomeRunningDistance(dateStr, exerciseId, distanceKm, anchorEl) {
    const exercise = _getHomeExercise(exerciseId);
    if (!exercise || !exercise.is_running) return;
    const previousEntry = _getHomeEntry(dateStr, exerciseId) || { completed: false, performed_distance_km: _buildHomeDefaultDistanceKm(exercise) };
    const nextDistanceKm = _normalizeHomeDistanceKm(distanceKm) ?? _buildHomeDefaultDistanceKm(exercise);
    return _persistHomeExercisePerformance(dateStr, exercise, [], nextDistanceKm, anchorEl, previousEntry);
  }

  async function toggleExercise(dateStr, exerciseId, el, evt) {
    if (evt?.target?.closest && evt.target.closest('.sheet-reps-editor, .sheet-tag-reps-btn')) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (dateStr !== dateKey(today)) return;

    const exercise = _getHomeExercise(exerciseId);
    if (!exercise) return;

    const previousEntry = _getHomeEntry(dateStr, exerciseId);
    const wasChecked = !!previousEntry?.completed;
    const nextActive = !wasChecked;
    const mutation = _beginHomeEntryMutation(dateStr, exerciseId);

    if (wasChecked && activeHomeEditorKey === _getHomeEditorKey(dateStr, exerciseId)) {
      activeHomeEditorKey = null;
    }

    _setHomeEntry(dateStr, exerciseId, nextActive ? {
      completed: true,
      performed_reps: exercise.is_running ? [] : _buildHomeDefaultReps(exercise),
      performed_distance_km: exercise.is_running ? _buildHomeDefaultDistanceKm(exercise) : null,
    } : null);
    _refreshDayUI(dateStr);

    return _queueHomeEntryMutation(dateStr, exerciseId, async () => {
      try {
        const prevXP = currentUser.xp || 0;
        const result = await API.toggleChecklist(exerciseId, dateStr, nextActive);
        if (!_isLatestHomeEntryMutation(mutation)) return;

        _syncHomeEntryResult(dateStr, exerciseId, result);
        _syncHomeXp(result, el || document.querySelector('#home-day-sheet .gym-day-sheet'));

        const prevRank = Gamification.getRank(prevXP);
        const newRank = Gamification.getRank(result.xp || prevXP);
        if (newRank.index > prevRank.index) {
          setTimeout(() => App.showLevelUp(newRank), 600);
        }

        const statsData = await API.getStats();
        if (_isLatestHomeEntryMutation(mutation)) {
          stats = statsData;
          updateHUD();
          _refreshDayUI(dateStr);
        }
      } catch (err) {
        if (_isLatestHomeEntryMutation(mutation)) {
          _setHomeEntry(dateStr, exerciseId, previousEntry);
          _refreshDayUI(dateStr);
          App.showToast('Erreur : ' + err.message);
        }
        throw err;
      }
    }).catch(() => {});
  }

  async function changeWeek(delta) {
    weekOffset += delta;
    closeDayActionsSheet();
    document.getElementById('calendar-container').innerHTML =
      '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
    await loadWeek();
  }

  function destroy() {
    closeDayActionsSheet();
    document.getElementById('home-day-sheet')?.remove();
  }

  function updateHUD() {
    const xp = currentUser.xp || 0;
    const rank = Gamification.getRank(xp);
    const progress = Gamification.getProgress(xp);

    const el = (id) => document.getElementById(id);
    if (el('header-rank')) el('header-rank').textContent = `${rank.emoji} ${rank.title}`;
    if (el('header-xp-val')) el('header-xp-val').textContent = `${xp} XP`;
    if (el('xp-bar-fill')) el('xp-bar-fill').style.width = `${progress.pct}%`;
    if (el('xp-current-label')) el('xp-current-label').textContent = `${progress.inRank} XP`;
    if (el('xp-next-label')) el('xp-next-label').textContent = `${progress.needed} XP`;
    if (el('xp-rank-progress')) el('xp-rank-progress').textContent = `${progress.pct}% vers prochain rang`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, init, destroy, toggleDay, toggleExercise, toggleHomeEditor, changeHomeExerciseSetCount, adjustHomeExerciseSetReps, setHomeExercisePerformance, adjustHomeRunningDistance, setHomeRunningDistance, changeWeek, renderWeekStrip, toggleRestDay, openDayActionsSheet, closeDayActionsSheet };
})();
window.WorkoutPage = WorkoutPage;
