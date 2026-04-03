// ============================================================
//  JuGus Do-It — App Logic + Gamification
// ============================================================

// ── CONSTANTS ───────────────────────────────────────────────
const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

const EXERCISES = [
  { id: 'pompes',   name: '💪 Pompes',   detail: '20 répétitions',  xp: 10 },
  { id: 'abdos',    name: '🔥 Abdos',    detail: '30 répétitions',  xp: 10 },
  { id: 'squats',   name: '🦵 Squats',   detail: '30 répétitions',  xp: 10 },
];
const DAY_XP = 15; // bonus XP for completing all exercises in a day

const RANKS = [
  { min: 0,     title: 'Débutant',       emoji: '🌱', xpNeeded: 100  },
  { min: 100,   title: 'Apprenti',       emoji: '🔰', xpNeeded: 150  },
  { min: 250,   title: 'Guerrier',       emoji: '🗡️', xpNeeded: 250  },
  { min: 500,   title: 'Combattant',     emoji: '🥊', xpNeeded: 300  },
  { min: 800,   title: 'Vétéran',        emoji: '🛡️', xpNeeded: 400  },
  { min: 1200,  title: 'Champion',       emoji: '🏆', xpNeeded: 500  },
  { min: 1700,  title: 'Élite',          emoji: '💎', xpNeeded: 700  },
  { min: 2400,  title: 'Maître',         emoji: '🌟', xpNeeded: 800  },
  { min: 3200,  title: 'Légende',        emoji: '⚡', xpNeeded: 1000 },
  { min: 4200,  title: 'Mythique',       emoji: '🔥', xpNeeded: 1300 },
  { min: 5500,  title: 'Immortel',       emoji: '👑', xpNeeded: 1500 },
  { min: 7000,  title: 'Dieu du Muscle', emoji: '🔱', xpNeeded: Infinity },
];

// ── STATE ────────────────────────────────────────────────────
let currentUser = null;
let weekOffset = 0; // 0 = current week, -1 = last week, etc.

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = localStorage.getItem('currentUser');
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  document.body.classList.add(`user-${currentUser}`);
  document.getElementById('header-username').textContent =
    currentUser.charAt(0).toUpperCase() + currentUser.slice(1);

  updateHUD();
  renderWeek();
});

// ── NAVIGATION ───────────────────────────────────────────────
function goBack() {
  window.location.href = 'index.html';
}

function changeWeek(delta) {
  if (delta < 0 && weekOffset === 0) return; // can't go before today
  weekOffset += delta;
  renderWeek();
}

// ── WEEK RENDERING ───────────────────────────────────────────
function getWeekDates(offset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i + offset * 7);
    return d;
  });
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function renderWeek() {
  const dates = getWeekDates(weekOffset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Week label
  const first = dates[0], last = dates[6];
  const labelEl = document.getElementById('week-label');
  if (weekOffset === 0) {
    labelEl.textContent = `Cette semaine`;
  } else {
    labelEl.textContent = `${first.getDate()} ${MONTHS_FR[first.getMonth()]} – ${last.getDate()} ${MONTHS_FR[last.getMonth()]}`;
  }

  const container = document.getElementById('calendar-container');
  container.innerHTML = '';

  dates.forEach((date, idx) => {
    const key = dateKey(date);
    const isToday = date.getTime() === today.getTime();
    const isFuture = date > today;
    const dayData = getDayData(key);
    const allDone = isAllDone(dayData);

    const card = document.createElement('div');
    card.className = `day-card${allDone ? ' completed' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`;
    card.dataset.key = key;

    // Auto-open today
    if (isToday) card.classList.add('open');

    const doneCount = countDone(dayData);
    const totalEx = EXERCISES.length;

    card.innerHTML = `
      <div class="day-header" onclick="toggleDay(this)">
        <div class="day-check">${allDone ? '✓' : ''}</div>
        <div class="day-name-block">
          <div class="day-name">${DAYS_FR[date.getDay()]}</div>
          <div class="day-date">${date.getDate()} ${MONTHS_FR[date.getMonth()]}</div>
        </div>
        <div class="day-xp-lbl">${doneCount}/${totalEx} ✓</div>
        ${!isFuture ? `<div class="day-toggle">▼</div>` : ''}
      </div>
      <div class="exercises-list">
        ${EXERCISES.map(ex => {
          const checked = dayData[ex.id] === true;
          return `
            <div class="exercise-item${checked ? ' checked' : ''}" 
                 data-key="${key}" data-ex="${ex.id}"
                 onclick="toggleExercise(this, '${key}', '${ex.id}')">
              <div class="exercise-checkbox">${checked ? '✓' : ''}</div>
              <div class="exercise-info">
                <div class="exercise-name">${ex.name}</div>
                <div class="exercise-detail">${ex.detail}</div>
              </div>
            </div>
          `;
        }).join('')}
        <div class="all-done-badge">🎉 Journée complète ! +${DAY_XP} XP bonus</div>
      </div>
    `;

    container.appendChild(card);
  });

  updateWeekStats(dates, today);
}

// ── TOGGLE DAY OPEN/CLOSE ────────────────────────────────────
function toggleDay(headerEl) {
  const card = headerEl.closest('.day-card');
  if (card.classList.contains('future')) return;
  card.classList.toggle('open');
}

// ── TOGGLE EXERCISE ──────────────────────────────────────────
function toggleExercise(el, key, exId) {
  // Block past days
  const today = new Date(); today.setHours(0,0,0,0);
  const [y,m,d] = key.split('-').map(Number);
  if (new Date(y, m-1, d) < today) return;
  const dayData = getDayData(key);
  const wasChecked = dayData[exId] === true;
  const wasAllDone = isAllDone(dayData);

  dayData[exId] = !wasChecked;
  saveDayData(key, dayData);

  // Update UI
  const checked = dayData[exId];
  el.classList.toggle('checked', checked);
  el.querySelector('.exercise-checkbox').textContent = checked ? '✓' : '';

  // XP
  const ex = EXERCISES.find(e => e.id === exId);
  if (checked) {
    addXP(ex.xp);
    spawnXPPopup(el, `+${ex.xp} XP`);
  } else {
    addXP(-ex.xp);
  }

  const nowAllDone = isAllDone(dayData);

  // Day completion bonus
  if (nowAllDone && !wasAllDone) {
    addXP(DAY_XP);
    spawnXPPopup(el, `+${DAY_XP} XP BONUS ! 🎉`);
    showToast('🎉 Journée complète ! Bien joué !');
    launchConfetti();
  } else if (!nowAllDone && wasAllDone) {
    addXP(-DAY_XP);
  }

  // Update day card state
  const card = el.closest('.day-card');
  card.classList.toggle('completed', nowAllDone);
  card.querySelector('.day-check').textContent = nowAllDone ? '✓' : '';

  const doneCount = countDone(dayData);
  card.querySelector('.day-xp-lbl').textContent = `${doneCount}/${EXERCISES.length} ✓`;

  updateHUD();
  updateWeekStats(getWeekDates(weekOffset), new Date());
}

// ── DATA HELPERS ─────────────────────────────────────────────
function storageKey(dateKey) {
  return `${currentUser}_day_${dateKey}`;
}

function getDayData(key) {
  const raw = localStorage.getItem(storageKey(key));
  return raw ? JSON.parse(raw) : {};
}

function saveDayData(key, data) {
  localStorage.setItem(storageKey(key), JSON.stringify(data));
}

function isAllDone(dayData) {
  return EXERCISES.every(ex => dayData[ex.id] === true);
}

function countDone(dayData) {
  return EXERCISES.filter(ex => dayData[ex.id] === true).length;
}

// ── XP & RANK ────────────────────────────────────────────────
function getXP() {
  return parseInt(localStorage.getItem(`${currentUser}_xp`) || '0');
}

function addXP(amount) {
  const prevXP = getXP();
  const prevRank = getRank(prevXP);
  const newXP = Math.max(0, prevXP + amount);
  const newRank = getRank(newXP);

  localStorage.setItem(`${currentUser}_xp`, String(newXP));

  if (newRank.min > prevRank.min) {
    // Level up!
    setTimeout(() => showLevelUp(newRank), 600);
  }
}

function getRank(xp) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

function getRankProgress(xp) {
  const rank = getRank(xp);
  const rankIdx = RANKS.indexOf(rank);
  if (rank.xpNeeded === Infinity) return { pct: 100, current: xp, needed: '∞' };
  const xpInRank = xp - rank.min;
  const nextRank = RANKS[rankIdx + 1];
  const xpForNext = nextRank ? nextRank.min - rank.min : rank.xpNeeded;
  const pct = Math.min(100, Math.round((xpInRank / xpForNext) * 100));
  return { pct, current: xpInRank, needed: xpForNext };
}

// ── HUD UPDATE ───────────────────────────────────────────────
function updateHUD() {
  const xp = getXP();
  const rank = getRank(xp);
  const progress = getRankProgress(xp);

  document.getElementById('header-rank').textContent = `${rank.emoji} ${rank.title}`;
  document.getElementById('header-xp-val').textContent = `${xp} XP`;
  document.getElementById('xp-bar-fill').style.width = `${progress.pct}%`;
  document.getElementById('xp-current-label').textContent = `${progress.current} XP`;
  document.getElementById('xp-next-label').textContent = `${progress.needed} XP`;
  document.getElementById('xp-rank-progress').textContent = `${progress.pct}% vers ${rank.title}`;

  // Streak
  const streak = computeStreak();
  document.getElementById('stat-streak').textContent = streak;

  // Total days
  const total = computeTotalCompletedDays();
  document.getElementById('stat-total').textContent = total;
}

function updateWeekStats(dates, today) {
  const completed = dates.filter(d => {
    if (d > today) return false;
    return isAllDone(getDayData(dateKey(d)));
  }).length;
  const pastDays = dates.filter(d => d <= today).length;
  document.getElementById('stat-week').textContent = `${completed}/${pastDays}`;
}

// ── STREAK ───────────────────────────────────────────────────
function computeStreak() {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    const data = getDayData(key);
    if (isAllDone(data)) {
      streak++;
    } else {
      // Allow today to be in progress without breaking streak
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

// ── TOTAL COMPLETED DAYS ─────────────────────────────────────
function computeTotalCompletedDays() {
  let total = 0;
  const prefix = `${currentUser}_day_`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      const data = JSON.parse(localStorage.getItem(k) || '{}');
      if (isAllDone(data)) total++;
    }
  }
  return total;
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── LEVEL UP MODAL ───────────────────────────────────────────
function showLevelUp(rank) {
  document.getElementById('modal-emoji').textContent = rank.emoji;
  document.getElementById('modal-title').textContent = `Rang atteint : ${rank.title} !`;
  document.getElementById('modal-desc').textContent =
    `Félicitations ! Tu as atteint le rang "${rank.title}". Continue comme ça, tu es une machine ! 💪`;
  document.getElementById('levelup-modal').style.display = 'flex';
  launchConfetti(80);
}

function closeModal() {
  document.getElementById('levelup-modal').style.display = 'none';
}

// ── XP POPUP ─────────────────────────────────────────────────
function spawnXPPopup(el, text) {
  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.textContent = text;
  popup.style.left = `${rect.left + rect.width / 2 - 30}px`;
  popup.style.top = `${rect.top + window.scrollY - 10}px`;
  document.body.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove());
}

// ── CONFETTI ─────────────────────────────────────────────────
function launchConfetti(count = 30) {
  const colors = ['#e94560','#4ecdc4','#f5c518','#7c5cbf','#2ecc71','#ff7292'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = `${Math.random() * 100}vw`;
      c.style.top = `${Math.random() * 40}vh`;
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.width = `${6 + Math.random() * 8}px`;
      c.style.height = `${6 + Math.random() * 8}px`;
      c.style.animationDuration = `${1 + Math.random()}s`;
      document.body.appendChild(c);
      c.addEventListener('animationend', () => c.remove());
    }, Math.random() * 400);
  }
}
