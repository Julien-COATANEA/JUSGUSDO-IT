// ── DEV MODE — données fictives, pas de backend ──────────────
// Chargé uniquement si DEV_MODE = true dans index.html
// NE PAS embarquer en production

const DEV_FAKE_USER = {
  id: 1,
  username: 'DevUser',
  is_admin: true,
  avatar_emoji: '💪',
  xp: 1500,
  level: 8,
  tokens: 3,
};

const DEV_FAKE_USERS = [
  DEV_FAKE_USER,
  { id: 2, username: 'Gustave', avatar_emoji: '🔥', xp: 800, level: 4, is_admin: false },
  { id: 3, username: 'Jules',   avatar_emoji: '🏋️', xp: 400, level: 2, is_admin: false },
];

const DEV_FAKE_EXERCISES = [
  { id: 1, emoji: '💪', name: 'Pompes',                    sets: 3, reps: 20, unit: 'répétitions', order_index: 1, schedule: [1, 3, 5], xp_reward: 10, is_active: true,  is_running: false, type: 'home', gym_session: null, assignments: [], assigned_users: [] },
  { id: 2, emoji: '🦵', name: 'Squats',                    sets: 4, reps: 15, unit: 'répétitions', order_index: 2, schedule: [],         xp_reward: 10, is_active: true,  is_running: false, type: 'home', gym_session: null, assignments: [{ user_id: 2, schedule: [2, 4] }, { user_id: 3, schedule: [6] }], assigned_users: [2, 3] },
  { id: 3, emoji: '🧱', name: 'Gainage',                   sets: 3, reps: 45, unit: 'secondes',    order_index: 3, schedule: [1, 2, 4], xp_reward: 10, is_active: true,  is_running: false, type: 'home', gym_session: null, assignments: [], assigned_users: [] },
  { id: 4, emoji: '🏃', name: 'Session cardio',            sets: 1, reps: 1,  unit: 'session',     order_index: 4, schedule: [],         xp_reward: 20, is_active: true,  is_running: true,  type: 'home', gym_session: null, assignments: [], assigned_users: [] },
  { id: 5, emoji: '🏋️', name: 'Tractions pronation',       sets: 4, reps: 8,  unit: 'répétitions', order_index: 5, schedule: [0, 6],    xp_reward: 10, is_active: false, is_running: false, type: 'home', gym_session: null, assignments: [], assigned_users: [] },
  // Gym exercises
  { id: 100, emoji: '💪', name: 'Développé Couché Haltères',             sets: 3, reps: 10, unit: 'répétitions', order_index: 100, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Pecs Triceps', assignments: [{ user_id: 1, schedule: [1, 4] }, { user_id: 2, schedule: [1, 4] }], assigned_users: [1, 2] },
  { id: 101, emoji: '💪', name: 'Développé Couché Barres',               sets: 3, reps: 10, unit: 'répétitions', order_index: 101, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Pecs Triceps', assignments: [], assigned_users: [] },
  { id: 102, emoji: '💪', name: 'Dips',                                  sets: 3, reps: 10, unit: 'répétitions', order_index: 102, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Pecs Triceps', assignments: [], assigned_users: [] },
  { id: 110, emoji: '🏋️', name: 'Tirage Bucheron',                       sets: 3, reps: 12, unit: 'répétitions', order_index: 110, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Dos Biceps',   assignments: [{ user_id: 1, schedule: [2, 5] }, { user_id: 2, schedule: [2, 5] }], assigned_users: [1, 2] },
  { id: 111, emoji: '🏋️', name: 'Tirage Verticale',                      sets: 3, reps: 12, unit: 'répétitions', order_index: 111, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Dos Biceps',   assignments: [], assigned_users: [] },
  { id: 112, emoji: '💪', name: 'Curl Haltère',                          sets: 3, reps: 12, unit: 'répétitions', order_index: 112, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Dos Biceps',   assignments: [], assigned_users: [] },
  { id: 120, emoji: '🦵', name: 'Leg Extension',                         sets: 3, reps: 12, unit: 'répétitions', order_index: 120, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Jambes',        assignments: [], assigned_users: [] },
  { id: 121, emoji: '🦵', name: 'Squats Salle',                          sets: 4, reps: 10, unit: 'répétitions', order_index: 121, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Jambes',        assignments: [], assigned_users: [] },
  { id: 130, emoji: '💪', name: 'Développé Couché Barre',                sets: 3, reps: 10, unit: 'répétitions', order_index: 130, schedule: [], xp_reward: 10, is_active: true, is_running: false, type: 'gym', gym_session: 'Full',          assignments: [], assigned_users: [] },
];

function cloneDevExercise(exercise) {
  return {
    ...exercise,
    schedule: Array.isArray(exercise.schedule) ? [...exercise.schedule] : [],
    assignments: Array.isArray(exercise.assignments)
      ? exercise.assignments.map(assignment => ({
          ...assignment,
          schedule: Array.isArray(assignment.schedule) ? [...assignment.schedule] : [],
        }))
      : [],
    assigned_users: Array.isArray(exercise.assigned_users) ? [...exercise.assigned_users] : [],
    type: exercise.type || 'home',
    gym_session: exercise.gym_session || null,
  };
}

function findDevExercise(id) {
  return DEV_FAKE_EXERCISES.find(exercise => exercise.id === Number(id));
}

function _devTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function _devDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

let _devChecklistEntries = [
  { id: 1, exercise_id: 1, entry_date: _devTodayStr(),      completed: true,  completed_at: new Date().toISOString() },
  { id: 2, exercise_id: 2, entry_date: _devTodayStr(),      completed: false, completed_at: null },
  { id: 3, exercise_id: 3, entry_date: _devTodayStr(),      completed: true,  completed_at: new Date().toISOString() },
  { id: 4, exercise_id: 4, entry_date: _devTodayStr(),      completed: false, completed_at: null },
  { id: 5, exercise_id: 1, entry_date: _devDateDaysAgo(1),  completed: true,  completed_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 6, exercise_id: 2, entry_date: _devDateDaysAgo(1),  completed: true,  completed_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 7, exercise_id: 3, entry_date: _devDateDaysAgo(1),  completed: true,  completed_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 8, exercise_id: 4, entry_date: _devDateDaysAgo(1),  completed: true,  completed_at: new Date(Date.now() - 86400000).toISOString() },
];

function _devActiveHomeExercises() {
  return DEV_FAKE_EXERCISES.filter(exercise => exercise.is_active !== false && (exercise.type || 'home') === 'home');
}

function _devHomeTotalCount() {
  return _devActiveHomeExercises().length;
}

function _devHomeCompletedExerciseIds(entryDate) {
  const activeExerciseIds = new Set(_devActiveHomeExercises().map(exercise => exercise.id));
  return new Set(
    _devChecklistEntries
      .filter(entry => entry.entry_date === entryDate && entry.completed && activeExerciseIds.has(entry.exercise_id))
      .map(entry => entry.exercise_id)
  );
}

function _devHomeDoneCount(entryDate) {
  return _devHomeCompletedExerciseIds(entryDate).size;
}

function _devIsHomeComplete(entryDate) {
  const total = _devHomeTotalCount();
  return total > 0 && _devHomeDoneCount(entryDate) >= total;
}

function _devHomeFullDates() {
  const dates = Array.from(new Set(_devChecklistEntries.filter(entry => entry.completed).map(entry => entry.entry_date))).sort();
  return dates.filter(_devIsHomeComplete);
}

function _devHomeStreaks() {
  const dates = _devHomeFullDates();
  let bestStreak = 0;
  let currentStreak = 0;

  if (dates.length) {
    let streak = 1;
    let maxStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
      if (diff === 1) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 1;
      }
    }
    bestStreak = maxStreak;

    const today = _devTodayStr();
    const yesterday = _devDateDaysAgo(1);
    const lastDate = dates[dates.length - 1];
    if (lastDate === today || lastDate === yesterday) {
      let running = 1;
      for (let i = dates.length - 2; i >= 0; i--) {
        const diff = (new Date(dates[i + 1]) - new Date(dates[i])) / 86400000;
        if (diff === 1) running++;
        else break;
      }
      currentStreak = running;
    }
  }

  return { bestStreak, currentStreak };
}

function _devHomeTopExercises() {
  const counts = new Map();
  const namesById = new Map(_devActiveHomeExercises().map(exercise => [exercise.id, exercise.name]));
  _devChecklistEntries.forEach(entry => {
    if (!entry.completed || !namesById.has(entry.exercise_id)) return;
    counts.set(entry.exercise_id, (counts.get(entry.exercise_id) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([exerciseId, times]) => ({ name: namesById.get(exerciseId), times }))
    .sort((left, right) => right.times - left.times)
    .slice(0, 5);
}

function _devHomeCalendar() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 27);
  const dayOfWeek = start.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + diffToMonday);

  const total = _devHomeTotalCount();
  const calendar = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().split('T')[0];
    const isPast = key <= _devTodayStr();
    calendar.push({
      date: key,
      done: isPast ? _devHomeDoneCount(key) : 0,
      total: isPast ? total : 0,
    });
  }
  return calendar;
}

function _devHomeXpHistory() {
  const total = _devHomeTotalCount();
  const baseXP = total ? Math.floor(30 / total) : 0;
  const completionBonus = total ? 30 - (baseXP * total) : 0;
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const key = _devDateDaysAgo(i);
    const done = _devHomeDoneCount(key);
    const xpEarned = done === 0
      ? 0
      : (done * baseXP) + (_devIsHomeComplete(key) ? completionBonus : 0);
    history.push({ date: key, xp_earned: xpEarned });
  }
  return history;
}

function _devHomeStatsSnapshot() {
  const today = _devTodayStr();
  const completedEntries = _devChecklistEntries.filter(entry => entry.completed);
  const activeDays = new Set(completedEntries.map(entry => entry.entry_date)).size;
  const fullDays = _devHomeFullDates().length;
  const { bestStreak, currentStreak } = _devHomeStreaks();
  return {
    calendar: _devHomeCalendar(),
    xp_history: _devHomeXpHistory(),
    top_exercises: _devHomeTopExercises(),
    total_completed: completedEntries.length,
    full_days: fullDays,
    best_streak: bestStreak,
    current_streak: currentStreak,
    active_days: activeDays,
    today_done: _devHomeDoneCount(today),
    today_total: _devHomeTotalCount(),
  };
}

// Injecter le token et l'utilisateur dans localStorage
localStorage.setItem('token', 'dev-fake-token-123');
localStorage.setItem('user', JSON.stringify(DEV_FAKE_USER));

// Overrider l'objet API — exécuté après api.js (même chargement synchrone)
// On attend que le DOM soit prêt pour être sûr que API est défini
function _applyDevMock() {
  // Auth
  API.me           = async () => ({ user: { ...DEV_FAKE_USER } });
  API.login        = async () => ({ token: 'dev-fake-token-123', user: { ...DEV_FAKE_USER } });
  API.register     = async () => ({ token: 'dev-fake-token-123', user: { ...DEV_FAKE_USER } });
  API.updateProfile = async (data) => { Object.assign(DEV_FAKE_USER, data); return { user: { ...DEV_FAKE_USER } }; };

  // Users
  API.getUsers     = async () => ({ users: [...DEV_FAKE_USERS] });
  API.getUserStats = async (userId) => {
    const u = DEV_FAKE_USERS.find(u => u.id === userId) || DEV_FAKE_USER;
    const homeStats = _devHomeStatsSnapshot();
    return {
      user: { ...u },
      stats: {
        calendar: homeStats.calendar,
        xp_history: homeStats.xp_history,
        top_exercises: homeStats.top_exercises,
        total_completed: homeStats.total_completed,
        full_days: homeStats.full_days,
        best_streak: homeStats.best_streak,
        current_streak: homeStats.current_streak,
        active_days: homeStats.active_days,
        today_done: homeStats.today_done,
        today_total: homeStats.today_total,
      },
    };
  };

  // Exercises / checklist
  API.getExercises  = async () => ({ exercises: _devActiveHomeExercises().map(cloneDevExercise) });
  API.getChecklist  = async (start, end) => ({
    entries: _devChecklistEntries
      .filter(entry => (!start || entry.entry_date >= start) && (!end || entry.entry_date <= end))
      .map(entry => ({ ...entry })),
  });
  API.toggleChecklist = async (exercise_id, entry_date) => {
    const today = _devTodayStr();
    if (entry_date > today) throw new Error('Impossible de cocher une date future');

    const exercise = _devActiveHomeExercises().find(item => item.id === Number(exercise_id));
    if (!exercise) throw new Error('Exercice introuvable');

    const totalEx = _devHomeTotalCount();
    const doneBefore = _devHomeDoneCount(entry_date);
    const wasComplete = _devIsHomeComplete(entry_date);
    const idx = _devChecklistEntries.findIndex(entry => entry.entry_date === entry_date && entry.exercise_id === Number(exercise_id));

    let completed;
    if (idx >= 0) {
      completed = !_devChecklistEntries[idx].completed;
      _devChecklistEntries[idx].completed = completed;
      _devChecklistEntries[idx].completed_at = completed ? new Date().toISOString() : null;
    } else {
      completed = true;
      _devChecklistEntries.push({
        id: Date.now(),
        exercise_id: Number(exercise_id),
        entry_date,
        completed: true,
        completed_at: new Date().toISOString(),
      });
    }

    const doneAfter = _devHomeDoneCount(entry_date);
    const isComplete = _devIsHomeComplete(entry_date);
    const baseXP = totalEx ? Math.floor(30 / totalEx) : 0;
    const completionBonus = totalEx ? 30 - (baseXP * totalEx) : 0;
    let xpDelta = completed ? baseXP : -baseXP;
    if (!wasComplete && isComplete) xpDelta += completionBonus;
    if (wasComplete && !isComplete) xpDelta -= completionBonus;

    DEV_FAKE_USER.xp = Math.max(0, DEV_FAKE_USER.xp + xpDelta);

    return {
      completed,
      xp: DEV_FAKE_USER.xp,
      xpDelta,
      dayComplete: isComplete,
      bonusXP: (!wasComplete && isComplete) ? completionBonus : (wasComplete && !isComplete) ? -completionBonus : 0,
      doneBefore,
      doneAfter,
    };
  };
  API.getStats = async () => {
    const homeStats = _devHomeStatsSnapshot();
    return {
      streak: homeStats.current_streak,
      totalCompletedDays: homeStats.full_days,
      this_week: 0,
      xp_total: DEV_FAKE_USER.xp,
    };
  };

  // Admin
  API.adminGetExercises    = async () => ({ exercises: DEV_FAKE_EXERCISES.map(cloneDevExercise) });
  API.adminCreateExercise  = async (data) => {
    const exercise = {
      id: Date.now(),
      emoji: data.emoji || '💪',
      name: data.name || 'Nouvel exercice',
      sets: data.sets || 1,
      reps: data.reps || 1,
      unit: data.unit || 'répétitions',
      order_index: data.order_index || 0,
      schedule: Array.isArray(data.schedule) ? [...data.schedule] : [],
      xp_reward: data.is_running ? 20 : 10,
      is_active: true,
      is_running: !!data.is_running,
      type: data.type || 'home',
      gym_session: data.gym_session || null,
      assignments: [],
      assigned_users: [],
    };
    DEV_FAKE_EXERCISES.push(exercise);
    return { exercise: cloneDevExercise(exercise) };
  };
  API.adminUpdateExercise  = async (id, data) => {
    const exercise = findDevExercise(id);
    if (!exercise) throw new Error('Exercice introuvable');

    if (Object.prototype.hasOwnProperty.call(data, 'emoji')) exercise.emoji = data.emoji || exercise.emoji;
    if (Object.prototype.hasOwnProperty.call(data, 'name')) exercise.name = data.name || exercise.name;
    if (Object.prototype.hasOwnProperty.call(data, 'sets')) exercise.sets = data.sets || 1;
    if (Object.prototype.hasOwnProperty.call(data, 'reps')) exercise.reps = data.reps || 1;
    if (Object.prototype.hasOwnProperty.call(data, 'unit')) exercise.unit = data.unit || exercise.unit;
    if (Object.prototype.hasOwnProperty.call(data, 'order_index')) exercise.order_index = data.order_index || 0;
    if (Object.prototype.hasOwnProperty.call(data, 'schedule')) exercise.schedule = Array.isArray(data.schedule) ? [...data.schedule] : [];
    if (Object.prototype.hasOwnProperty.call(data, 'is_active')) exercise.is_active = !!data.is_active;
    if (Object.prototype.hasOwnProperty.call(data, 'is_running')) {
      exercise.is_running = !!data.is_running;
      exercise.xp_reward = exercise.is_running ? 20 : 10;
      if (exercise.is_running) {
        exercise.sets = 1;
        exercise.reps = 1;
        exercise.unit = 'session';
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'type')) exercise.type = data.type || 'home';
    if (Object.prototype.hasOwnProperty.call(data, 'gym_session')) exercise.gym_session = data.gym_session || null;

    return { exercise: cloneDevExercise(exercise) };
  };
  API.adminDeleteExercise  = async (id) => {
    const exercise = DEV_FAKE_EXERCISES.find(e => e.id === Number(id));
    if (!exercise) throw new Error('Exercice introuvable');
    // In dev mode, any exercise with assignments is treated as having history
    if (exercise.assignments && exercise.assignments.length > 0) {
      const err = new Error('Cet exercice a un historique utilisateur. Archivez-le plutôt que de le supprimer pour conserver les données.');
      err.status = 409;
      throw err;
    }
    const index = DEV_FAKE_EXERCISES.findIndex(e => e.id === Number(id));
    if (index >= 0) DEV_FAKE_EXERCISES.splice(index, 1);
    return { ok: true };
  };
  API.adminGetUsers        = async () => ({ users: [...DEV_FAKE_USERS] });
  API.adminPromoteUser     = async (id, is_admin) => {
    const user = DEV_FAKE_USERS.find(item => item.id === Number(id));
    if (user) user.is_admin = !!is_admin;
    return { user: user ? { ...user } : { id, is_admin } };
  };
  API.adminAssignExercise  = async (id, assignments) => {
    const exercise = findDevExercise(id);
    if (!exercise) throw new Error('Exercice introuvable');
    const normalized = Array.isArray(assignments)
      ? assignments
          .map(assignment => ({
            user_id: Number(assignment.user_id),
            schedule: Array.isArray(assignment.schedule) ? assignment.schedule.map(Number) : [],
          }))
          .filter(assignment => assignment.user_id > 0)
      : [];
    exercise.assignments = normalized;
    exercise.assigned_users = normalized.map(assignment => assignment.user_id);
    return { ok: true };
  };
  API.adminUnassignExercise = async (id, userId) => {
    const exercise = findDevExercise(id);
    if (!exercise) throw new Error('Exercice introuvable');
    exercise.assignments = exercise.assignments.filter(assignment => assignment.user_id !== Number(userId));
    exercise.assigned_users = exercise.assigned_users.filter(assignedUserId => assignedUserId !== Number(userId));
    return { ok: true };
  };

  // Muscle records
  let _devMuscleRecords = [
    { id: 1, exercise_name: 'Développé Couché Haltères', category: 'Pecs Triceps', sets: 4, reps: 10, weight_kg: 30, updated_at: new Date(Date.now() - 20 * 86400000).toISOString() },
    { id: 2, exercise_name: 'Développé Couché Haltères', category: 'Pecs Triceps', sets: 5, reps: 5,  weight_kg: 40, updated_at: new Date(Date.now() - 5  * 86400000).toISOString() },
    { id: 3, exercise_name: 'Tirage Bucheron',            category: 'Dos Biceps',   sets: 3, reps: 12, weight_kg: 25, updated_at: new Date(Date.now() - 14 * 86400000).toISOString() },
  ];
  // Fake history for sparkline demo
  let _devMuscleHistory = [
    { exercise_name: 'Développé Couché Haltères', weight_kg: 25, recorded_at: new Date(Date.now() - 40 * 86400000).toISOString() },
    { exercise_name: 'Développé Couché Haltères', weight_kg: 28, recorded_at: new Date(Date.now() - 30 * 86400000).toISOString() },
    { exercise_name: 'Développé Couché Haltères', weight_kg: 30, recorded_at: new Date(Date.now() - 20 * 86400000).toISOString() },
    { exercise_name: 'Développé Couché Haltères', weight_kg: 35, recorded_at: new Date(Date.now() - 10 * 86400000).toISOString() },
    { exercise_name: 'Développé Couché Haltères', weight_kg: 40, recorded_at: new Date(Date.now() -  5 * 86400000).toISOString() },
    { exercise_name: 'Tirage Bucheron', weight_kg: 20, recorded_at: new Date(Date.now() - 30 * 86400000).toISOString() },
    { exercise_name: 'Tirage Bucheron', weight_kg: 22, recorded_at: new Date(Date.now() - 20 * 86400000).toISOString() },
    { exercise_name: 'Tirage Bucheron', weight_kg: 25, recorded_at: new Date(Date.now() - 14 * 86400000).toISOString() },
  ];
  API.getMuscleRecords  = async () => ({ records: _devMuscleRecords.map(r => ({ ...r })) });
  API.getMuscleHistory  = async (uid, exName) => ({
    history: _devMuscleHistory.filter(h => !exName || h.exercise_name.toLowerCase() === exName.toLowerCase()),
  });
  API.saveMuscleRecord  = async (uid, data) => {
    const rec = { id: Date.now(), ...data, updated_at: new Date().toISOString() };
    _devMuscleRecords.push(rec);
    _devMuscleHistory.push({ exercise_name: data.exercise_name, weight_kg: data.weight_kg, recorded_at: new Date().toISOString() });
    return { record: rec };
  };
  API.updateMuscleRecord = async (uid, recordId, data) => {
    const idx = _devMuscleRecords.findIndex(r => r.id === Number(recordId));
    if (idx >= 0) {
      const prev = _devMuscleRecords[idx];
      _devMuscleRecords[idx] = { ...prev, ...data, updated_at: new Date().toISOString() };
      if (data.weight_kg && data.weight_kg !== prev.weight_kg) {
        _devMuscleHistory.push({ exercise_name: prev.exercise_name, weight_kg: data.weight_kg, recorded_at: new Date().toISOString() });
      }
    }
    return { record: _devMuscleRecords[idx] || {} };
  };
  API.deleteMuscleRecord = async (uid, recordId) => {
    _devMuscleRecords = _devMuscleRecords.filter(r => r.id !== Number(recordId));
    return { ok: true };
  };

  // Mini-game
  API.getMinigameStatus  = async () => ({
    eligible: true,
    last_played: null,
    tokens: DEV_FAKE_USER.tokens,
    levels: { easy: null, medium: null, hard: null },
  });
  API.postMinigameResult = async (uid, levelKey, won) => {
    if (won) DEV_FAKE_USER.tokens += 1;
    return { xp_earned: won ? 50 : 0, tokens: DEV_FAKE_USER.tokens };
  };

  // Wizz
  API.sendWizz    = async (targetId, key, customText) => ({ ok: true, tokens: 4 });
  API.getWizz     = async () => ({ wizzes: [], unread: 0 });
  API.markWizzRead = async () => ({ ok: true });

  // Gym checklist (salle de sport)
  let _devGymEntries = [
    { id: 1, entry_date: new Date().toISOString().split('T')[0], exercise_name: 'Tirage Bucheron', session_name: 'Dos Biceps', completed: true, completed_at: new Date().toISOString(), performed_reps: [12, 10, 8] },
    { id: 2, entry_date: new Date().toISOString().split('T')[0], exercise_name: 'Tirage Verticale', session_name: 'Dos Biceps', completed: false, completed_at: null, performed_reps: [] },
  ];
  const _normalizeDevGymReps = (value) => (Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[^0-9]+/) : []))
    .map(v => parseInt(v, 10))
    .filter(v => Number.isInteger(v) && v > 0 && v <= 9999)
    .slice(0, 24);
  API.getGymChecklist = async (start, end) => ({
    entries: _devGymEntries.filter(e => e.entry_date >= start && e.entry_date <= end),
  });
  const _devDayIsActive = (date) =>
    _devGymEntries.some(e => e.entry_date === date && e.completed) ||
    _devGymZoneEntries.some(e => e.entry_date === date);

  API.toggleGymChecklist = async (exercise_name, session_name, entry_date) => {
    const today = new Date().toISOString().split('T')[0];
    if (entry_date > today) throw new Error('Impossible de cocher une date future');
    const wasActive = _devDayIsActive(entry_date);
    const idx = _devGymEntries.findIndex(e => e.entry_date === entry_date && e.exercise_name === exercise_name);
    let newCompleted;
    if (idx >= 0) {
      newCompleted = !_devGymEntries[idx].completed;
      _devGymEntries[idx].completed = newCompleted;
      _devGymEntries[idx].completed_at = newCompleted ? (_devGymEntries[idx].completed_at || new Date().toISOString()) : null;
      _devGymEntries[idx].performed_reps = newCompleted ? _normalizeDevGymReps(_devGymEntries[idx].performed_reps) : [];
    } else {
      newCompleted = true;
      _devGymEntries.push({ id: Date.now(), entry_date, exercise_name, session_name, completed: true, completed_at: new Date().toISOString(), performed_reps: [] });
    }
    const isActive = _devDayIsActive(entry_date);
    const xpDelta = (isActive && !wasActive) ? 30 : (!isActive && wasActive) ? -30 : 0;
    DEV_FAKE_USER.xp = Math.max(0, DEV_FAKE_USER.xp + xpDelta);
    const sessionEntries = _devGymEntries.filter(e => e.entry_date === entry_date && e.session_name === session_name);
    const doneNow = sessionEntries.filter(e => e.completed).length;
    return {
      completed: newCompleted,
      performed_reps: idx >= 0 ? _normalizeDevGymReps(_devGymEntries[idx].performed_reps) : [],
      xp: DEV_FAKE_USER.xp,
      xpDelta,
      sessionDone: doneNow,
      sessionTotal: 0,
    };
  };
  API.saveGymChecklistEntry = async (exercise_name, session_name, entry_date, completed, performed_reps) => {
    const today = new Date().toISOString().split('T')[0];
    if (entry_date > today) throw new Error('Impossible de cocher une date future');
    const reps = _normalizeDevGymReps(performed_reps);
    const nextCompleted = !!completed || reps.length > 0;
    const wasActive = _devDayIsActive(entry_date);
    const idx = _devGymEntries.findIndex(e => e.entry_date === entry_date && e.exercise_name === exercise_name);

    if (idx >= 0) {
      _devGymEntries[idx].session_name = session_name;
      _devGymEntries[idx].completed = nextCompleted;
      _devGymEntries[idx].completed_at = nextCompleted ? (_devGymEntries[idx].completed_at || new Date().toISOString()) : null;
      _devGymEntries[idx].performed_reps = reps;
    } else if (nextCompleted) {
      _devGymEntries.push({
        id: Date.now(),
        entry_date,
        exercise_name,
        session_name,
        completed: true,
        completed_at: new Date().toISOString(),
        performed_reps: reps,
      });
    }

    const isActive = _devDayIsActive(entry_date);
    const xpDelta = (isActive && !wasActive) ? 30 : (!isActive && wasActive) ? -30 : 0;
    DEV_FAKE_USER.xp = Math.max(0, DEV_FAKE_USER.xp + xpDelta);
    const sessionEntries = _devGymEntries.filter(e => e.entry_date === entry_date && e.session_name === session_name);
    const doneNow = sessionEntries.filter(e => e.completed).length;

    return {
      completed: nextCompleted,
      performed_reps: reps,
      xp: DEV_FAKE_USER.xp,
      xpDelta,
      sessionDone: doneNow,
      sessionTotal: 0,
    };
  };
  API.getGymStats = async (userId) => {
    const today = new Date().toISOString().split('T')[0];
    const calendar = [];
    const startD = new Date();
    startD.setDate(startD.getDate() - 27);
    const dow = startD.getDay();
    startD.setDate(startD.getDate() + (dow === 0 ? -6 : 1 - dow));
    for (let i = 0; i < 28; i++) {
      const d = new Date(startD);
      d.setDate(startD.getDate() + i);
      const date = d.toISOString().split('T')[0];
      const exercises_done = _devGymEntries.filter(e => e.entry_date === date && e.completed).length;
      const zones_done    = _devGymZoneEntries.filter(z => z.entry_date === date).length;
      const is_rest       = _devGymRestDays.has(date);
      calendar.push({ date, exercises_done, zones_done, is_rest, is_active: exercises_done > 0 || zones_done > 0 });
    }
    const todayInfo = calendar.find(c => c.date === today) || { exercises_done: 0, zones_done: 0, is_rest: false, is_active: false };
    const activeDays = new Set([
      ..._devGymEntries.filter(e => e.completed).map(e => e.entry_date),
      ..._devGymZoneEntries.map(z => z.entry_date),
    ]).size;
    return { stats: {
      calendar,
      total_exercises: _devGymEntries.filter(e => e.completed).length,
      total_zones: _devGymZoneEntries.length,
      total_rest_days: _devGymRestDays.size,
      active_days: activeDays,
      full_days: activeDays,
      best_streak: 2,
      current_streak: todayInfo.is_active || todayInfo.is_rest ? 1 : 0,
      today_exercises_done: todayInfo.exercises_done,
      today_zones_done: todayInfo.zones_done,
      today_is_rest: todayInfo.is_rest,
      today_is_active: todayInfo.is_active,
      total_completed: _devGymEntries.filter(e => e.completed).length,
      today_done: todayInfo.exercises_done,
      today_total: 0,
    } };
  };

  API.getGymDayDetail = async (_userId, date) => {
    const exercises = _devGymEntries
      .filter(e => e.entry_date === date && e.completed)
      .map(e => ({
        exercise_name: e.exercise_name,
        session_name: e.session_name,
        completed_at: e.completed_at || null,
        performed_reps: _normalizeDevGymReps(e.performed_reps),
      }));
    const zones = _devGymZoneEntries
      .filter(z => z.entry_date === date)
      .map(z => {
        const zone = _devGymZones.find(g => g.id === z.zone_id);
        const parent = zone && zone.parent_id ? _devGymZones.find(g => g.id === zone.parent_id) : null;
        return zone ? {
          id: zone.id, name: zone.name, icon: zone.icon, color: zone.color,
          parent_name: parent ? parent.name : null,
          parent_icon: parent ? parent.icon : null,
        } : null;
      })
      .filter(Boolean);
    return { date, is_rest: _devGymRestDays.has(date), exercises, zones };
  };

  // Gym work zones (groups + sub-zones)
  let _devGymZones = [
    { id: 1, parent_id: null, name: 'PECS',           icon: '💪', color: '#e94560', order_index: 1 },
    { id: 2, parent_id: null, name: 'DOS / Lombaire', icon: '🏋️', color: '#7c5cbf', order_index: 2 },
    { id: 3, parent_id: null, name: 'ÉPAULES',        icon: '🤸', color: '#3b82f6', order_index: 3 },
    { id: 4, parent_id: null, name: 'BRAS',           icon: '💪', color: '#fbbf24', order_index: 4 },
    { id: 5, parent_id: null, name: 'JAMBES',         icon: '🦵', color: '#22d18b', order_index: 5 },
    { id: 6, parent_id: 4, name: 'Biceps',     icon: '💪', color: '#fbbf24', order_index: 1 },
    { id: 7, parent_id: 4, name: 'Triceps',    icon: '💪', color: '#fbbf24', order_index: 2 },
    { id: 8, parent_id: 4, name: 'Avant-bras', icon: '💪', color: '#fbbf24', order_index: 3 },
    { id: 9,  parent_id: 5, name: 'Ischio',     icon: '🦵', color: '#22d18b', order_index: 1 },
    { id: 10, parent_id: 5, name: 'Quadriceps', icon: '🦵', color: '#22d18b', order_index: 2 },
    { id: 11, parent_id: 5, name: 'Adducteur',  icon: '🦵', color: '#22d18b', order_index: 3 },
    { id: 12, parent_id: 5, name: 'Abducteur',  icon: '🦵', color: '#22d18b', order_index: 4 },
    { id: 13, parent_id: 5, name: 'Fesses',     icon: '🍑', color: '#22d18b', order_index: 5 },
    { id: 14, parent_id: 5, name: 'Mollets',    icon: '🦵', color: '#22d18b', order_index: 6 },
  ];
  let _devGymZoneEntries = []; // { id, entry_date, zone_id }
  let _devGymRestDays = new Set();
  let _devNextZoneId = 100;
  let _devNextZoneEntryId = 1;

  API.getGymZones = async () => ({ zones: _devGymZones.slice() });

  API.getGymZoneEntries = async (start, end) => ({
    entries: _devGymZoneEntries.filter(e => e.entry_date >= start && e.entry_date <= end),
  });

  API.toggleGymZone = async (zone_id, entry_date) => {
    const today = new Date().toISOString().split('T')[0];
    if (entry_date > today) throw new Error('Impossible de cocher une date future');
    const zid = parseInt(zone_id, 10);
    if (!_devGymZones.some(z => z.id === zid)) throw new Error('Zone introuvable');
    const wasActive = _devDayIsActive(entry_date);
    const idx = _devGymZoneEntries.findIndex(e => e.entry_date === entry_date && e.zone_id === zid);
    let active;
    if (idx >= 0) {
      _devGymZoneEntries.splice(idx, 1);
      active = false;
    } else {
      _devGymZoneEntries.push({ id: _devNextZoneEntryId++, entry_date, zone_id: zid });
      active = true;
    }
    const isActive = _devDayIsActive(entry_date);
    const xpDelta = (isActive && !wasActive) ? 30 : (!isActive && wasActive) ? -30 : 0;
    DEV_FAKE_USER.xp = Math.max(0, DEV_FAKE_USER.xp + xpDelta);
    return { active, xp: DEV_FAKE_USER.xp, xpDelta };
  };

  API.getGymRestDays = async (start, end) => ({
    dates: Array.from(_devGymRestDays).filter(d => d >= start && d <= end).sort(),
  });

  API.toggleGymRestDay = async (entry_date) => {
    const today = new Date().toISOString().split('T')[0];
    if (entry_date > today) throw new Error('Impossible de cocher une date future');
    if (_devGymRestDays.has(entry_date)) {
      _devGymRestDays.delete(entry_date);
      return { active: false };
    }
    _devGymRestDays.add(entry_date);
    return { active: true };
  };

  // Admin gym zones CRUD
  API.adminGetGymZones = async () => ({ zones: _devGymZones.slice() });
  API.adminCreateGymZone = async (data) => {
    const name = (data.name || '').trim();
    if (!name) throw new Error('Nom requis');
    const parentId = data.parent_id ? parseInt(data.parent_id, 10) : null;
    if (_devGymZones.some(z => (z.parent_id || 0) === (parentId || 0) && z.name === name)) {
      throw new Error('Une zone avec ce nom existe déjà à ce niveau');
    }
    const orderIndex = data.order_index != null
      ? parseInt(data.order_index, 10)
      : Math.max(0, ..._devGymZones.filter(z => (z.parent_id || 0) === (parentId || 0)).map(z => z.order_index)) + 1;
    const zone = { id: _devNextZoneId++, parent_id: parentId, name, icon: data.icon || '💪', color: data.color || '#e94560', order_index: orderIndex };
    _devGymZones.push(zone);
    return { zone };
  };
  API.adminUpdateGymZone = async (id, data) => {
    const z = _devGymZones.find(x => x.id === parseInt(id, 10));
    if (!z) throw new Error('Zone introuvable');
    if (data.name != null)        z.name = String(data.name).trim() || z.name;
    if (data.icon != null)        z.icon = data.icon;
    if (data.color != null)       z.color = data.color;
    if (data.order_index != null) z.order_index = parseInt(data.order_index, 10);
    if (data.parent_id !== undefined) z.parent_id = data.parent_id ? parseInt(data.parent_id, 10) : null;
    return { zone: z };
  };
  API.adminDeleteGymZone = async (id) => {
    const numId = parseInt(id, 10);
    const collect = (rootId) => {
      const ids = [rootId];
      _devGymZones.filter(z => z.parent_id === rootId).forEach(c => ids.push(...collect(c.id)));
      return ids;
    };
    const idsToDelete = new Set(collect(numId));
    _devGymZones = _devGymZones.filter(z => !idsToDelete.has(z.id));
    _devGymZoneEntries = _devGymZoneEntries.filter(e => !idsToDelete.has(e.zone_id));
    return { ok: true };
  };

  // Gym session catalogue (used by Records tab + Salle day-actions sheet).
  // No more day-of-week assignment per user: every session is available
  // every day, the user picks what they actually did.
  const _DEV_GYM_SESSION_META = {
    'Pecs Triceps': { icon: '💪', color: '#e94560' },
    'Dos Biceps':   { icon: '🏋️', color: '#7c5cbf' },
    'Jambes':       { icon: '🦵', color: '#22d18b' },
    'Full':         { icon: '⚡', color: '#fbbf24' },
  };
  let _DEV_GYM_SESSION_ORDER = ['Pecs Triceps', 'Dos Biceps', 'Jambes', 'Full'];

  API.adminGetGymSessions = async () => {
    const gymExs = DEV_FAKE_EXERCISES.filter(e => e.type === 'gym' && e.is_active);
    const exBySession = {};
    gymExs.forEach(ex => {
      const key = ex.gym_session || 'Autre';
      if (!exBySession[key]) exBySession[key] = [];
      exBySession[key].push({ id: ex.id, name: ex.name, emoji: ex.emoji, sets: ex.sets, reps: ex.reps, unit: ex.unit, gym_session: ex.gym_session, order_index: ex.order_index });
    });
    const sessions = _DEV_GYM_SESSION_ORDER.map(name => ({
      name,
      ...(_DEV_GYM_SESSION_META[name] || { icon: '🏋️', color: '#888' }),
      exercises: exBySession[name] || [],
      assignments: [],
      assigned_users: [],
    }));
    return { sessions };
  };

  API.adminCreateGymSession = async ({ name, icon, color }) => {
    if (!name || !name.trim()) throw new Error('Le nom est requis');
    if (_DEV_GYM_SESSION_ORDER.includes(name.trim())) throw new Error('Une séance avec ce nom existe déjà');
    const n = name.trim();
    _DEV_GYM_SESSION_META[n] = { icon: icon || '💪', color: color || '#e94560' };
    _DEV_GYM_SESSION_ORDER.push(n);
    return { ok: true };
  };

  API.adminReorderGymSessions = async (names) => {
    const nextOrder = Array.isArray(names)
      ? names.map(name => typeof name === 'string' ? name.trim() : '').filter(Boolean)
      : [];
    if (!nextOrder.length || new Set(nextOrder).size !== nextOrder.length) {
      throw new Error('Ordre de séances invalide');
    }
    const sameMembers = nextOrder.length === _DEV_GYM_SESSION_ORDER.length
      && nextOrder.every(name => _DEV_GYM_SESSION_ORDER.includes(name));
    if (!sameMembers) {
      throw new Error('La liste des séances ne correspond pas au catalogue');
    }
    _DEV_GYM_SESSION_ORDER = [...nextOrder];
    return { ok: true };
  };

  API.adminUpdateGymSession = async (name, data) => {
    if (!_DEV_GYM_SESSION_ORDER.includes(name)) throw new Error('Séance introuvable');
    const newName = (data && typeof data.name === 'string') ? data.name.trim() : '';
    const renaming = newName && newName !== name;
    if (renaming && _DEV_GYM_SESSION_ORDER.includes(newName)) {
      throw new Error('Une séance avec ce nom existe déjà');
    }
    const meta = _DEV_GYM_SESSION_META[name] || { icon: '💪', color: '#e94560' };
    if (data && data.icon)  meta.icon  = data.icon;
    if (data && data.color) meta.color = data.color;
    if (renaming) {
      _DEV_GYM_SESSION_META[newName] = meta;
      delete _DEV_GYM_SESSION_META[name];
      const idx = _DEV_GYM_SESSION_ORDER.indexOf(name);
      if (idx >= 0) _DEV_GYM_SESSION_ORDER[idx] = newName;
      DEV_FAKE_EXERCISES.forEach(ex => { if (ex.gym_session === name) ex.gym_session = newName; });
    } else {
      _DEV_GYM_SESSION_META[name] = meta;
    }
    return { ok: true, name: renaming ? newName : name };
  };

  API.adminDeleteGymSession = async (name) => {
    if (!_DEV_GYM_SESSION_ORDER.includes(name)) throw new Error('Séance introuvable');
    _DEV_GYM_SESSION_ORDER = _DEV_GYM_SESSION_ORDER.filter(n => n !== name);
    delete _DEV_GYM_SESSION_META[name];
    DEV_FAKE_EXERCISES.forEach(ex => {
      if (ex.gym_session === name) { ex.gym_session = null; ex.is_active = false; }
    });
    return { ok: true };
  };

  API.getGymSessionsAll = async () => {
    const sessions = _DEV_GYM_SESSION_ORDER.map((name, idx) => ({
      name,
      ...(_DEV_GYM_SESSION_META[name] || { icon: '🏋️', color: '#888' }),
      order_index: idx,
      exercises: DEV_FAKE_EXERCISES
        .filter(e => e.gym_session === name && e.is_active !== false && e.type === 'gym')
        .map(e => ({ id: e.id, name: e.name, emoji: e.emoji || '💪', sets: e.sets, reps: e.reps })),
    }));
    return { sessions };
  };

  // Push
  API.post = async (path, body) => {
    if (path.includes('push')) return { ok: true };
    return {};
  };

  console.log('%c[DEV MODE] API mockée — aucun backend nécessaire', 'color:#7c3aed;font-weight:bold;font-size:13px');
}

// S'exécute juste avant router.js grâce à l'ordre des scripts dans index.html
if (typeof API !== 'undefined') {
  _applyDevMock();
} else {
  document.addEventListener('DOMContentLoaded', _applyDevMock);
}
