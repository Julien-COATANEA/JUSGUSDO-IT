// ── API helper ──────────────────────────────────────────────
const API = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('token');
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Erreur ${res.status}`);
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),

    // Auth
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    register: (username, password) => request('POST', '/auth/register', { username, password }),
    me: () => request('GET', '/auth/me'),
    updateProfile: (data) => request('PATCH', '/auth/profile', data),

    // Data
    getUsers: () => request('GET', '/users'),
    getExercises: () => request('GET', '/exercises'),
    getChecklist: (start, end) => request('GET', `/exercises/checklist?start=${start}&end=${end}`),
    toggleChecklist: (exercise_id, entry_date) =>
      request('POST', '/exercises/checklist/toggle', { exercise_id, entry_date }),
    getStats: () => request('GET', '/exercises/stats'),

    // Admin
    adminGetExercises: () => request('GET', '/admin/exercises'),
    adminCreateExercise: (data) => request('POST', '/admin/exercises', data),
    adminUpdateExercise: (id, data) => request('PUT', `/admin/exercises/${id}`, data),
    adminDeleteExercise: (id) => request('DELETE', `/admin/exercises/${id}`),
    adminGetUsers: () => request('GET', '/admin/users'),
    adminPromoteUser: (id, is_admin) => request('PATCH', `/admin/users/${id}/promote`, { is_admin }),
  };
})();
