// ── App / Workout page ───────────────────────────────────────
const WorkoutPage = (() => {
  const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  let weekOffset = 0;
  let exercises = [];
  let entries = {}; // { 'YYYY-MM-DD_exerciseId': true/false }
  let currentUser = null;
  let stats = { streak: 0, totalCompletedDays: 0 };
  let activeSheetDate = null;

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

  function _dayCounts(dateStr) {
    const dayExercises = getExercisesForDay(_dateFromKey(dateStr));
    const doneCount = dayExercises.filter(ex => entries[`${dateStr}_${ex.id}`] === true).length;
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
        entries[`${dk}_${e.exercise_id}`] = e.completed;
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

    const ctaLabel = isToday ? (hasActivity || isRest ? '✎&nbsp;Modifier' : '+&nbsp;Enregistrer mon activité') : '';
    const ctaClass = `gym-day-cta${(hasActivity || isRest) ? ' cta-edit' : ''}${isToday ? ' cta-today' : ''}`;
    const cta = isToday ? `
      <button type="button" class="${ctaClass}" onclick="event.stopPropagation();WorkoutPage.openDayActionsSheet('${key}')">${ctaLabel}</button>` : '';

    const card = document.createElement('div');
    card.className = `day-card${hasActivity ? ' completed' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${isPast ? ' past' : ''}${(isHero || isToday) ? ' open' : ''}${isRest ? ' gym-rest-day' : ''}${isHero ? ' hero' : ''}`;
    card.dataset.key = key;
    card.id = `day-${key}`;

    card.innerHTML = `
      <div class="day-header" onclick="${isToday ? `WorkoutPage.openDayActionsSheet('${key}')` : ''}">
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
    if (dateStr !== dateKey(today)) return;

    activeSheetDate = dateStr;
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
    const sheet = document.getElementById('home-day-sheet');
    if (sheet) sheet.classList.remove('open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function _renderDayActionsSheet() {
    const sheet = document.getElementById('home-day-sheet');
    if (!sheet || !activeSheetDate) return;

    const dateObj = _dateFromKey(activeSheetDate);
    const title = `${DAYS_FR[dateObj.getDay()]} ${dateObj.getDate()} ${MONTHS_FR[dateObj.getMonth()]}`;
    const isRest = _isRestDay(activeSheetDate);

    const exercisesHtml = getExercisesForDay(dateObj).map(ex => {
      const checked = entries[`${activeSheetDate}_${ex.id}`] === true;
      const metaTag = ex.is_running
        ? `<span class="exercise-tag running sheet-tag-reps">${ex.reps}&nbsp;${escapeHtml(ex.unit || 'min')}</span>`
        : `<span class="exercise-tag sheet-tag-reps">${ex.sets}&nbsp;×&nbsp;${ex.reps}&nbsp;rép.</span>`;
      return `
        <div class="exercise-item sheet-exercise-row${checked ? ' checked' : ''}"
             onclick="WorkoutPage.toggleExercise('${activeSheetDate}', ${ex.id}, this)">
          <div class="exercise-info">
            <div class="exercise-name">${escapeHtml(ex.emoji || '💪')} ${escapeHtml(ex.name)}</div>
          </div>
          <div class="sheet-ex-right">
            ${metaTag}
            <span class="sheet-ex-check${checked ? ' on' : ''}">✓</span>
          </div>
        </div>`;
    }).join('') || '<p class="exercise-inline-help" style="padding:8px 12px">Aucun exercice disponible</p>';

    sheet.innerHTML = `
      <div class="gym-day-sheet">
        <div class="sheet-handle"></div>
        <header class="sheet-header">
          <div>
            <h3>${title}</h3>
            <p class="sheet-subtitle">Que veux-tu enregistrer pour ce jour ?</p>
          </div>
          <button type="button" class="sheet-close" onclick="WorkoutPage.closeDayActionsSheet()" aria-label="Fermer">✕</button>
        </header>
        <div class="sheet-body">
          <section class="sheet-section">
            <button type="button" class="rest-toggle-btn${isRest ? ' on' : ''}" onclick="WorkoutPage.toggleRestDay('${activeSheetDate}')">
              <span class="rest-toggle-icon">🛌</span>
              <span class="rest-toggle-text">
                <strong>${isRest ? 'Jour de repos déclaré' : 'Marquer comme jour de repos'}</strong>
                <small>${isRest ? 'Cliquer pour annuler' : 'Mémorisé localement sur Maison'}</small>
              </span>
              <span class="rest-toggle-state">${isRest ? '✓' : ''}</span>
            </button>
          </section>
          <section class="sheet-section">
            <h4 class="sheet-section-title">🏠 Exercices Maison</h4>
            <div class="sheet-acc-body">${exercisesHtml}</div>
          </section>
        </div>
      </div>
    `;
  }

  function _refreshDayUI(dateStr) {
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

  async function toggleExercise(dateStr, exerciseId, el) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (dateStr !== dateKey(today)) return;

    const key = `${dateStr}_${exerciseId}`;
    const wasChecked = entries[key] === true;

    entries[key] = !wasChecked;
    _refreshDayUI(dateStr);

    try {
      const result = await API.toggleChecklist(exerciseId, dateStr);

      entries[key] = result.completed;

      const prevXP = currentUser.xp;
      currentUser.xp = result.xp;
      (localStorage.getItem('token') ? localStorage : sessionStorage).setItem('user', JSON.stringify(currentUser));

      const prevRank = Gamification.getRank(prevXP);
      const newRank = Gamification.getRank(result.xp);

      if (result.xpDelta !== 0) {
        Gamification.spawnXPPopup(el || document.querySelector('#home-day-sheet .gym-day-sheet'), `${result.xpDelta > 0 ? '+' : ''}${result.xpDelta} XP`);
      }

      if (newRank.index > prevRank.index) {
        setTimeout(() => App.showLevelUp(newRank), 600);
      }

      const statsData = await API.getStats();
      stats = statsData;
      updateHUD();
      _refreshDayUI(dateStr);

    } catch (err) {
      entries[key] = wasChecked;
      _refreshDayUI(dateStr);
      App.showToast('Erreur : ' + err.message);
    }
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

  return { render, init, destroy, toggleDay, toggleExercise, changeWeek, renderWeekStrip, toggleRestDay, openDayActionsSheet, closeDayActionsSheet };
})();
