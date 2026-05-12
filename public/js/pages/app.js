// ── App / Workout page ───────────────────────────────────────
const WorkoutPage = (() => {
  const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  let weekOffset = 0;
  let exercises = [];
  let entries = {}; // { 'YYYY-MM-DD_exerciseId': true/false }
  let currentUser = null;
  let stats = { streak: 0, totalCompletedDays: 0 };

  function render() {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    return `
      <div class="app-page user-${currentUser.username?.toLowerCase()}">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')">←</button>
          <div class="header-info">
            <span class="header-username" id="header-username">${escapeHtml(currentUser.username || '')}</span>
            <span class="header-rank" id="header-rank">Chargement...</span>
          </div>
          <button class="header-avatar-btn" id="header-avatar-btn" onclick="App.showProfileModal()">${escapeHtml(currentUser.avatar || '💪')}</button>
          <div class="header-xp" id="header-xp-val">0 XP</div>
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

        <div class="week-nav">
          <button class="week-btn" onclick="WorkoutPage.changeWeek(-1)">‹</button>
          <div class="week-label" id="week-label">Cette semaine</div>
          <button class="week-btn" onclick="WorkoutPage.changeWeek(1)">›</button>
        </div>

        <div class="week-strip" id="week-strip"></div>

        <div class="stats-band">
          <div class="stat-pill">
            <span class="stat-val" id="stat-streak">0</span>
            <span class="stat-lbl">🔥 Série</span>
          </div>
          <div class="stat-pill">
            <span class="stat-val" id="stat-week">0/7</span>
            <span class="stat-lbl">📅 Cette sem.</span>
          </div>
          <div class="stat-pill">
            <span class="stat-val" id="stat-total">0</span>
            <span class="stat-lbl">⚡ Total jours</span>
          </div>
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

  function getExercisesForDay(date) {
    const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    return exercises.filter(ex => !ex.schedule || ex.schedule.length === 0 || ex.schedule.includes(day));
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
      const isToday = date.getTime() === today.getTime();
      const isFuture = date > today;
      const isPast = !isToday && !isFuture;

      const dayExercises = getExercisesForDay(date);
      const doneCount = dayExercises.filter(ex => entries[`${key}_${ex.id}`] === true).length;
      const allDone = dayExercises.length > 0 && doneCount === dayExercises.length;

      if (!isFuture) {
        weekTotal++;
        if (allDone) weekDone++;
      }

      const ringPct = dayExercises.length > 0 ? Math.round(doneCount / dayExercises.length * 100) : 0;
      const ringColor = allDone ? '#22d18b' : doneCount > 0 ? '#fbbf24' : isFuture ? 'rgba(255,255,255,0.07)' : '#ef4444';

      const card = document.createElement('div');
      card.className = `day-card${allDone ? ' completed' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${isPast ? ' past' : ''}${isToday ? ' open' : ''}`;
      card.dataset.key = key;
      card.id = `day-${key}`;

      card.innerHTML = `
        <div class="day-header" onclick="WorkoutPage.toggleDay(this)">
          <div class="day-check">${allDone ? '✓' : ''}</div>
          <div class="day-name-block">
            <div class="day-name">${DAYS_FR[date.getDay()]}</div>
            <div class="day-date">${date.getDate()} ${MONTHS_FR[date.getMonth()]}</div>
          </div>
          ${isToday ? '<span class="today-badge">Aujourd\'hui</span>' : ''}
          ${isFuture ? '<span class="preview-badge">À venir</span>' : ''}
          <div class="day-ring" style="--ring-p:${ringPct};--ring-c:${ringColor}">
            <span class="day-ring-val">${doneCount}/${dayExercises.length}</span>
          </div>
          <div class="day-toggle">▼</div>
        </div>
        <div class="exercises-list">
          ${dayExercises.length === 0
            ? `<p style="color:var(--text3);font-size:13px;text-align:center;padding:12px 0;">Repos 🙌</p>`
            : dayExercises.map(ex => {
            const checked = entries[`${key}_${ex.id}`] === true;
            const metaTags = ex.is_running
              ? `<span class="exercise-tag running">${escapeHtml(ex.emoji)} ${ex.reps}\u00a0${escapeHtml(ex.unit || 'min')}</span>`
              : `<span class="exercise-tag"><span class="exercise-tag-val">${ex.sets}</span> série${ex.sets > 1 ? 's' : ''}</span>
                 <span class="exercise-tag"><span class="exercise-tag-val">${ex.reps}</span> rép.</span>`;
            return `
              <div class="exercise-item${checked ? ' checked' : ''}${isPast ? ' disabled' : ''}${isFuture ? ' future-day' : ''}"
                   id="ex-${key}-${ex.id}"
                   onclick="WorkoutPage.toggleExercise('${key}', ${ex.id}, this)">
                <div class="exercise-icon">${escapeHtml(ex.emoji)}</div>
                <div class="exercise-info">
                  <div class="exercise-name">${escapeHtml(ex.name)}</div>
                  <div class="exercise-meta">${metaTags}</div>
                </div>
                <div class="exercise-checkbox">${checked ? '✓' : ''}</div>
              </div>
            `;
          }).join('')}
          <div class="all-done-badge">🎉 Journée complète ! Bravo !</div>
        </div>
      `;

      container.appendChild(card);
    });

    document.getElementById('stat-week').textContent = `${weekDone}/${weekTotal}`;
    document.getElementById('stat-streak').textContent = stats.streak;
    document.getElementById('stat-total').textContent = stats.totalCompletedDays;

    renderWeekStrip(dates);
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
      const dayExercises = getExercisesForDay(date);
      const doneCount = dayExercises.filter(ex => entries[`${key}_${ex.id}`] === true).length;
      const total = dayExercises.length;
      const allDone = total > 0 && doneCount === total;
      const pct = total > 0 ? Math.round(doneCount / total * 100) : 0;
      const ringC = allDone ? '#22d18b' : doneCount > 0 ? '#fbbf24' : isFuture ? 'rgba(255,255,255,0.07)' : '#ef4444';
      const state = isFuture ? 'future' : allDone ? 'done' : doneCount > 0 ? 'partial' : 'missed';

      return `
        <div class="wsd ${state}${isToday ? ' today-dot' : ''}" onclick="document.getElementById('day-${key}')?.scrollIntoView({behavior:'smooth',block:'center'})">
          <div class="wsd-ring" style="--ring-p:${pct};--ring-c:${ringC}">
            <span class="wsd-inner">${doneCount}</span>
          </div>
          <span class="wsd-lbl">${DAY_LETTERS[date.getDay()]}</span>
        </div>
      `;
    }).join('');
  }

  function toggleDay(headerEl) {
    const card = headerEl.closest('.day-card');
    card.classList.toggle('open');
  }

  async function toggleExercise(dateStr, exerciseId, el) {
    // Block past and future days — only today is interactive
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    if (target.getTime() !== today.getTime()) return;

    const key = `${dateStr}_${exerciseId}`;
    const wasChecked = entries[key] === true;
    const card = el.closest('.day-card');
    const dayExercises = getExercisesForDay(new Date(dateStr + 'T00:00:00'));
    const wasAllDone = dayExercises.every(ex => entries[`${dateStr}_${ex.id}`] === true);

    // Optimistic update
    entries[key] = !wasChecked;
    el.classList.toggle('checked', !wasChecked);
    el.querySelector('.exercise-checkbox').textContent = !wasChecked ? '✓' : '';

    const doneCount = dayExercises.filter(ex => entries[`${dateStr}_${ex.id}`] === true).length;
    const allDone = doneCount === dayExercises.length;
    card.classList.toggle('completed', allDone);
    card.querySelector('.day-check').textContent = allDone ? '✓' : '';
    const ringEl = card.querySelector('.day-ring');
    if (ringEl) {
      const pct = dayExercises.length > 0 ? Math.round(doneCount / dayExercises.length * 100) : 0;
      ringEl.style.setProperty('--ring-p', pct);
      ringEl.querySelector('.day-ring-val').textContent = `${doneCount}/${dayExercises.length}`;
    }

    try {
      const result = await API.toggleChecklist(exerciseId, dateStr);

      // Sync actual server state
      entries[key] = result.completed;
      el.classList.toggle('checked', result.completed);
      el.querySelector('.exercise-checkbox').textContent = result.completed ? '✓' : '';

      const prevXP = currentUser.xp;
      currentUser.xp = result.xp;
      (localStorage.getItem('token') ? localStorage : sessionStorage).setItem('user', JSON.stringify(currentUser));

      const prevRank = Gamification.getRank(prevXP);
      const newRank = Gamification.getRank(result.xp);

      if (result.xpDelta !== 0) {
        Gamification.spawnXPPopup(el, `${result.xpDelta > 0 ? '+' : ''}${result.xpDelta} XP`);
      }

      if (result.dayComplete && !wasAllDone) {
        App.showToast('🎉 Journée complète ! Bien joué !');
        Gamification.launchConfetti();
        const ringEl = card.querySelector('.day-ring');
        if (ringEl) {
          ringEl.classList.remove('ring-bounce');
          void ringEl.offsetWidth; // reflow to restart animation
          ringEl.classList.add('ring-bounce');
        }
      }

      if (newRank.index > prevRank.index) {
        setTimeout(() => App.showLevelUp(newRank), 600);
      }

      // Refresh stats
      const statsData = await API.getStats();
      stats = statsData;
      updateHUD();
      renderWeek(getWeekDates(weekOffset));

    } catch (err) {
      // Revert optimistic update
      entries[key] = wasChecked;
      el.classList.toggle('checked', wasChecked);
      el.querySelector('.exercise-checkbox').textContent = wasChecked ? '✓' : '';
      card.classList.toggle('completed', wasAllDone);
      card.querySelector('.day-check').textContent = wasAllDone ? '✓' : '';
      const revertDone = dayExercises.filter(ex => entries[`${dateStr}_${ex.id}`] === true).length;
      const revertRingEl = card.querySelector('.day-ring');
      if (revertRingEl) {
        const pct = dayExercises.length > 0 ? Math.round(revertDone / dayExercises.length * 100) : 0;
        revertRingEl.style.setProperty('--ring-p', pct);
        revertRingEl.querySelector('.day-ring-val').textContent = `${revertDone}/${dayExercises.length}`;
      }
      App.showToast('Erreur : ' + err.message);
    }
  }

  async function changeWeek(delta) {
    weekOffset += delta;
    document.getElementById('calendar-container').innerHTML =
      '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
    await loadWeek();
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

  return { render, init, toggleDay, toggleExercise, changeWeek, renderWeekStrip };
})();
