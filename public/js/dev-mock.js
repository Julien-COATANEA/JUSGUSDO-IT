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
};

const DEV_FAKE_USERS = [
  DEV_FAKE_USER,
  { id: 2, username: 'Gustave', avatar_emoji: '🔥', xp: 800, level: 4, is_admin: false },
  { id: 3, username: 'Jules',   avatar_emoji: '🏋️', xp: 400, level: 2, is_admin: false },
];

const DEV_FAKE_EXERCISES = [
  { id: 1, emoji: '💪', name: 'Pompes',                    sets: 3, reps: 20, unit: 'répétitions', order_index: 1, schedule: [1, 3, 5], xp_reward: 10, is_active: true,  is_running: false, assignments: [], assigned_users: [] },
  { id: 2, emoji: '🦵', name: 'Squats',                    sets: 4, reps: 15, unit: 'répétitions', order_index: 2, schedule: [],         xp_reward: 10, is_active: true,  is_running: false, assignments: [{ user_id: 2, schedule: [2, 4] }, { user_id: 3, schedule: [6] }], assigned_users: [2, 3] },
  { id: 3, emoji: '🧱', name: 'Gainage',                   sets: 3, reps: 45, unit: 'secondes',    order_index: 3, schedule: [1, 2, 4], xp_reward: 10, is_active: true,  is_running: false, assignments: [], assigned_users: [] },
  { id: 4, emoji: '🏃', name: 'Session cardio',            sets: 1, reps: 1,  unit: 'session',     order_index: 4, schedule: [],         xp_reward: 20, is_active: true,  is_running: true,  assignments: [], assigned_users: [] },
  { id: 5, emoji: '🏋️', name: 'Tractions pronation',       sets: 4, reps: 8,  unit: 'répétitions', order_index: 5, schedule: [0, 6],    xp_reward: 10, is_active: false, is_running: false, assignments: [], assigned_users: [] },
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
  };
}

function findDevExercise(id) {
  return DEV_FAKE_EXERCISES.find(exercise => exercise.id === Number(id));
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
    // Generate fake 28-day calendar (4 semaines)
    const calendar = [];
    const today = new Date();
    // Start on a Monday 27 days ago
    const start = new Date(today);
    start.setDate(today.getDate() - 27);
    const dayOfWeek = start.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + diffToMonday);
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const date = d.toISOString().split('T')[0];
      const isPast = d <= today;
      calendar.push({ date, done: isPast ? Math.floor(Math.random() * 3) : 0, total: isPast ? 4 : 0 });
    }
    // XP history 30 days
    const xp_history = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      xp_history.push({ date: d.toISOString().split('T')[0], xp_earned: Math.random() > 0.4 ? Math.floor(Math.random() * 120) : 0 });
    }
    return {
      user: { ...u },
      stats: {
        calendar,
        xp_history,
        top_exercises: [
          { name: 'Pompes', times: 18 },
          { name: 'Squats', times: 14 },
          { name: 'Gainage', times: 10 },
        ],
        total_completed: 42,
        full_days: 10,
        best_streak: 7,
        current_streak: 3,
        active_days: 15,
        today_done: 2,
        today_total: 4,
      },
    };
  };

  // Exercises / checklist
  API.getExercises  = async () => ({ exercises: DEV_FAKE_EXERCISES.map(cloneDevExercise) });
  API.getChecklist  = async () => ({
    entries: DEV_FAKE_EXERCISES.map(e => ({
      exercise_id: e.id,
      entry_date: new Date().toISOString().split('T')[0],
      completed: Math.random() > 0.5,
    })),
  });
  API.toggleChecklist = async () => ({ ok: true });
  API.getStats      = async () => ({ streak: 7, totalCompletedDays: 42, this_week: 5, xp_total: 1500 });

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

    return { exercise: cloneDevExercise(exercise) };
  };
  API.adminDeleteExercise  = async (id) => {
    const index = DEV_FAKE_EXERCISES.findIndex(exercise => exercise.id === Number(id));
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
  API.getMuscleRecords  = async () => ({
    records: [
      { id: 1, exercise_name: 'Développé Couché Haltères', category: 'Pecs Triceps', sets: 4, reps: 10, weight_kg: 30, updated_at: new Date().toISOString() },
      { id: 2, exercise_name: 'Tirage Bucheron',            category: 'Dos Biceps',   sets: 3, reps: 12, weight_kg: 25, updated_at: new Date().toISOString() },
    ],
  });
  API.saveMuscleRecord   = async (uid, data) => ({ record: { id: Date.now(), ...data } });
  API.deleteMuscleRecord = async () => ({ ok: true });

  // Mini-game
  API.getMinigameStatus  = async () => ({ eligible: true, last_played: null, level: 3 });
  API.postMinigameResult = async () => ({ xp_earned: 50, new_level: 9 });

  // Wizz
  API.sendWizz    = async () => ({ ok: true });
  API.getWizz     = async () => ({ wizzes: [], unread: 0 });
  API.markWizzRead = async () => ({ ok: true });

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
