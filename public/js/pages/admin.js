// ── Admin page ────────────────────────────────────────────────
const AdminPage = (() => {
  let exercises = [];
  let users = [];
  let editingId = null;

  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')">←</button>
          <div class="header-info" style="flex:1">
            <span class="header-username">Configuration ⚙️</span>
            <span class="header-rank" style="color:var(--accent)">Accès admin</span>
          </div>
        </header>

        <div id="admin-content" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>

        <!-- Exercise form modal -->
        <div class="modal-overlay" id="ex-modal" style="display:none;" onclick="AdminPage.onOverlayClick(event)">
          <div class="modal-card ex-modal-card" style="max-height:92vh;overflow-y:auto;text-align:left;padding:0;border-radius:20px 20px 0 0;">

            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:1;border-radius:20px 20px 0 0;">
              <h2 id="ex-modal-title" style="margin:0;font-size:18px;font-weight:800;color:var(--text);">Nouvel exercice</h2>
              <button type="button" onclick="AdminPage.closeExModal()"
                style="width:32px;height:32px;border-radius:50%;border:none;background:var(--card2);color:var(--text2);font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
            </div>

            <form id="ex-form" onsubmit="AdminPage.saveExercise(event)" style="padding:20px;display:flex;flex-direction:column;gap:20px;">

              <!-- Identité -->
              <div style="display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:end;">
                <div class="form-group">
                  <label>Emoji</label>
                  <input type="text" id="ex-emoji" value="💪" maxlength="4" style="text-align:center;font-size:22px;" />
                </div>
                <div class="form-group">
                  <label>Nom *</label>
                  <input type="text" id="ex-name" placeholder="Ex: Pompes" required />
                </div>
              </div>

              <!-- Session running toggle -->
              <label class="ex-running-toggle">
                <input type="checkbox" id="ex-is-running" onchange="AdminPage.toggleRunningFields()" />
                <span class="ex-running-pill">
                  🏃 Session running
                  <span style="font-size:11px;opacity:0.7;font-weight:500;">&nbsp;· inclus dans les 30 XP/jour</span>
                </span>
              </label>

              <!-- Champs muscu -->
              <div id="ex-muscu-fields" style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                  <div class="form-group">
                    <label>Séries</label>
                    <input type="number" id="ex-sets" value="1" min="1" max="20" />
                  </div>
                  <div class="form-group">
                    <label>Répétitions *</label>
                    <input type="number" id="ex-reps" placeholder="20" min="1" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Unité</label>
                  <input type="text" id="ex-unit" value="répétitions" placeholder="répétitions / secondes..." />
                </div>
              </div>

              <!-- Ordre -->
              <div class="form-group" style="max-width:80px;">
                <label>Ordre</label>
                <input type="number" id="ex-order" value="0" min="0" />
              </div>

              <!-- Assigné à (avec jours actifs par personne) -->
              <div class="form-group" id="ex-assign-group">
                <label>Assigné à</label>
                <div id="ex-assign-users" style="display:flex;flex-direction:column;gap:8px;margin-top:4px;"></div>
                <p style="font-size:11px;color:var(--text3);margin-top:4px;">Aucun coché = visible par tous · Les jours actifs sont définis par personne</p>
              </div>
              </div>

              <p class="form-error" id="ex-form-error"></p>

              <!-- Actions -->
              <button type="submit" class="modal-btn" id="ex-submit-btn" style="margin-top:4px;">Enregistrer</button>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    // Preload users so assignment labels render correctly on first load
    try { const d = await API.adminGetUsers(); users = d.users || []; } catch (_) {}
    await loadExercises();
  }

  async function loadExercises() {
    try {
      const data = await API.adminGetExercises();
      exercises = data.exercises;
      renderExercisesTab();
    } catch (err) {
      document.getElementById('admin-content').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur: ${err.message}</p>`;
    }
  }

  async function loadUsers() {
    try {
      const data = await API.adminGetUsers();
      users = data.users;
      renderUsersTab();
    } catch (err) {
      document.getElementById('admin-content').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur: ${err.message}</p>`;
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`atab-${tab}`).classList.add('active');
    document.getElementById('admin-content').innerHTML =
      '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
    if (tab === 'exercises') loadExercises();
    else loadUsers();
  }

  function renderExercisesTab() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    container.innerHTML = `
      <button class="submit-btn" onclick="AdminPage.openExModal(null)" style="margin-bottom:4px;">
        + Ajouter un exercice
      </button>
      ${exercises.map(ex => `
        <div class="admin-ex-card${ex.is_active ? '' : ' inactive'}">
          <div class="admin-ex-main">
            <span class="admin-ex-emoji">${ex.emoji}</span>
            <div class="admin-ex-info">
              <div class="admin-ex-name">${escapeHtml(ex.name)}</div>
              <div class="admin-ex-detail">
                ${ex.sets > 1 ? ex.sets + ' séries × ' : ''}${ex.reps} ${escapeHtml(ex.unit)}
                &nbsp;·&nbsp; XP partagé (max 30/jour)${ex.is_running ? ' 🏃' : ''}
                &nbsp;·&nbsp; <span style="color:var(--accent3)">${ex.assigned_users && ex.assigned_users.length > 0 ? '📅 Jours par personne' : formatSchedule(ex.schedule)}</span>
                ${!ex.is_active ? ' · <span style="color:var(--text3)">désactivé</span>' : ''}
              </div>
              <div class="admin-ex-assigned" style="font-size:11px;color:var(--text3);margin-top:3px;">${renderAssignedLabel(ex.assigned_users)}</div>
            </div>
          </div>
          <div class="admin-ex-actions">
            <button class="admin-btn" onclick="AdminPage.openExModal(${ex.id})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            ${ex.is_active
              ? `<button class="admin-btn danger" onclick="AdminPage.deleteExercise(${ex.id})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`
              : `<button class="admin-btn" onclick="AdminPage.restoreExercise(${ex.id})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg></button>`
            }
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderUsersTab() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    const me = JSON.parse(localStorage.getItem('user') || '{}');
    container.innerHTML = `
      ${users.map(u => {
        const rank = Gamification.getRank(u.xp);
        return `
          <div class="admin-ex-card">
            <div class="admin-ex-main">
              <span class="admin-ex-emoji">${rank.emoji}</span>
              <div class="admin-ex-info">
                <div class="admin-ex-name">${escapeHtml(u.username)} ${u.is_admin ? '⚙️' : ''}</div>
                <div class="admin-ex-detail">${rank.title} · ${u.xp} XP</div>
              </div>
            </div>
            ${u.id !== me.id ? `
              <div class="admin-ex-actions">
                <button class="admin-btn${u.is_admin ? ' danger' : ''}"
                  onclick="AdminPage.toggleAdmin(${u.id}, ${!u.is_admin})">
                  ${u.is_admin ? '👤 Révoquer' : '⚙️ Admin'}
                </button>
              </div>
            ` : '<div style="padding:8px;color:var(--text3);font-size:12px;">(vous)</div>'}
          </div>
        `;
      }).join('')}
    `;
  }

  function openExModal(id) {
    editingId = id;
    const modal = document.getElementById('ex-modal');
    document.getElementById('ex-form-error').textContent = '';
    document.getElementById('ex-submit-btn').disabled = false;

    if (id) {
      const ex = exercises.find(e => e.id === id);
      document.getElementById('ex-modal-title').textContent = 'Modifier l\'exercice';
      document.getElementById('ex-emoji').value = ex.emoji || '💪';
      document.getElementById('ex-name').value = ex.name;
      document.getElementById('ex-sets').value = ex.sets;
      document.getElementById('ex-reps').value = ex.reps;
      document.getElementById('ex-unit').value = ex.unit;
      document.getElementById('ex-order').value = ex.order_index;
      document.getElementById('ex-is-running').checked = !!ex.is_running;
      toggleRunningFields();
    } else {
      document.getElementById('ex-modal-title').textContent = 'Nouvel exercice';
      document.getElementById('ex-form').reset();
      document.getElementById('ex-emoji').value = '💪';
      document.getElementById('ex-sets').value = '1';
      document.getElementById('ex-unit').value = 'répétitions';
      document.getElementById('ex-is-running').checked = false;
      toggleRunningFields();
    }
    renderAssignmentCheckboxes(id ? (exercises.find(e => e.id === id)?.assignments || []) : []);
    modal.style.display = 'flex';
  }

  function closeExModal() {
    document.getElementById('ex-modal').style.display = 'none';
    editingId = null;
  }

  function onOverlayClick(e) {
    if (e.target === document.getElementById('ex-modal')) closeExModal();
  }

  function toggleRunningFields() {
    const isRunning = document.getElementById('ex-is-running').checked;
    const muscu = document.getElementById('ex-muscu-fields');
    const repsInput = document.getElementById('ex-reps');
    muscu.style.display = isRunning ? 'none' : '';
    repsInput.required = !isRunning;
  }

  async function saveExercise(e) {
    e.preventDefault();
    const btn = document.getElementById('ex-submit-btn');
    btn.disabled = true;
    document.getElementById('ex-form-error').textContent = '';

    const isRunning = document.getElementById('ex-is-running').checked;
    // Collect per-user assignments with individual schedules
    const assignmentsData = [...document.querySelectorAll('#ex-assign-users input[type=checkbox]:checked')].map(cb => {
      const userId = parseInt(cb.value);
      const picker = document.getElementById(`usp-${userId}`);
      const schedule = picker
        ? [...picker.querySelectorAll('.sday-btn.active')].map(b => parseInt(b.dataset.day))
        : [];
      return { user_id: userId, schedule };
    });
    const data = {
      emoji: document.getElementById('ex-emoji').value,
      name: document.getElementById('ex-name').value.trim(),
      sets: isRunning ? 1 : parseInt(document.getElementById('ex-sets').value),
      reps: isRunning ? 1 : parseInt(document.getElementById('ex-reps').value),
      unit: isRunning ? 'session' : document.getElementById('ex-unit').value.trim(),
      order_index: parseInt(document.getElementById('ex-order').value),
      schedule: [],
      is_running: isRunning,
    };

    try {
      let savedEx;
      if (editingId) {
        const res = await API.adminUpdateExercise(editingId, data);
        savedEx = res.exercise || { id: editingId };
        App.showToast('✅ Exercice mis à jour');
      } else {
        const res = await API.adminCreateExercise(data);
        savedEx = res.exercise;
        App.showToast('✅ Exercice créé');
      }
      if (savedEx?.id) {
        await API.adminAssignExercise(savedEx.id, assignmentsData);
      }
      closeExModal();
      await loadExercises();
    } catch (err) {
      document.getElementById('ex-form-error').textContent = err.message;
      btn.disabled = false;
    }
  }

  function deleteExercise(id) {
    const ex = exercises.find(e => e.id === id);
    App.showConfirm(
      'Supprimer l\'exercice',
      `Supprimer définitivement "${ex?.name}" ? Cette action est irréversible.`,
      async (ok) => {
        if (!ok) return;
        try {
          await API.adminDeleteExercise(id);
          App.showToast('Exercice supprimé');
          await loadExercises();
        } catch (err) {
          App.showToast('Erreur: ' + err.message);
        }
      }
    );
  }

  async function restoreExercise(id) {
    try {
      await API.adminUpdateExercise(id, { is_active: true });
      App.showToast('Exercice réactivé');
      await loadExercises();
    } catch (err) {
      App.showToast('Erreur: ' + err.message);
    }
  }

  async function toggleAdmin(id, makeAdmin) {
    App.showConfirm(
      makeAdmin ? 'Promouvoir admin' : 'Révoquer admin',
      makeAdmin ? 'Donner les droits admin à cet utilisateur ?' : 'Retirer les droits admin ?',
      async (ok) => {
        if (!ok) return;
        try {
          await API.adminPromoteUser(id, makeAdmin);
          App.showToast(makeAdmin ? '⚙️ Admin accordé' : '👤 Admin révoqué');
          await loadUsers();
        } catch (err) {
          App.showToast('Erreur: ' + err.message);
        }
      }
    );
  }

  function renderAssignmentCheckboxes(assignments) {
    // assignments: [{ user_id, schedule }]
    const container = document.getElementById('ex-assign-users');
    if (!container) return;
    if (users.length === 0) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text3)">Chargement...</span>';
      API.adminGetUsers().then(data => {
        users = data.users || [];
        renderAssignmentCheckboxes(assignments);
      });
      return;
    }
    const DAY_LABELS = ['L','M','M','J','V','S','D'];
    const DAY_NUMS   = [1,2,3,4,5,6,0];
    container.innerHTML = users.map(u => {
      const rank       = Gamification.getRank(u.xp);
      const assignment = assignments.find(a => a.user_id === u.id);
      const checked    = assignment ? 'checked' : '';
      const schedule   = assignment?.schedule || [];
      const dayBtns    = DAY_NUMS.map((day, i) =>
        `<button type="button" class="sday-btn${schedule.includes(day) ? ' active' : ''}" data-day="${day}" onclick="this.classList.toggle('active')">${DAY_LABELS[i]}</button>`
      ).join('');
      return `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" value="${u.id}" ${checked}
              onchange="AdminPage.toggleUserAssignRow(${u.id}, this.checked)"
              style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;" />
            <span>${rank.emoji} ${escapeHtml(u.username)}</span>
          </label>
          <div id="usp-${u.id}" style="${assignment ? '' : 'display:none;'}margin-left:24px;">
            <div class="schedule-picker">${dayBtns}</div>
            <p style="font-size:11px;color:var(--text3);margin:2px 0 0;">Aucun = tous les jours</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleUserAssignRow(userId, checked) {
    const picker = document.getElementById(`usp-${userId}`);
    if (picker) picker.style.display = checked ? '' : 'none';
  }

  function renderAssignedLabel(assignedUsers) {
    if (!assignedUsers || assignedUsers.length === 0) return '👥 Tous les utilisateurs';
    const names = assignedUsers.map(uid => {
      const u = users.find(u => u.id === uid);
      return u ? escapeHtml(u.username) : `#${uid}`;
    });
    return '🔒 ' + names.join(', ');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function formatSchedule(sch) {
    if (!sch || sch.length === 0 || sch.length === 7) return 'Tous les jours';
    const labels = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };
    return sch.map(d => labels[d]).join(' · ');
  }

  return { render, init, switchTab, openExModal, closeExModal, onOverlayClick, saveExercise, deleteExercise, restoreExercise, toggleAdmin, toggleRunningFields, toggleUserAssignRow };
})();
