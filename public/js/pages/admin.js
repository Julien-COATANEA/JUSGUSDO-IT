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
            <span class="header-username">Administration ⚙️</span>
            <span class="header-rank" style="color:var(--accent)">Accès admin</span>
          </div>
        </header>

        <div class="admin-tabs">
          <button class="admin-tab active" id="atab-exercises" onclick="AdminPage.switchTab('exercises')">Exercices</button>
          <button class="admin-tab" id="atab-users" onclick="AdminPage.switchTab('users')">Utilisateurs</button>
        </div>

        <div id="admin-content" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>

        <!-- Exercise form modal -->
        <div class="modal-overlay" id="ex-modal" style="display:none;">
          <div class="modal-card" style="max-height:90vh;overflow-y:auto;">
            <h2 id="ex-modal-title" style="margin-bottom:16px;color:var(--text)">Nouvel exercice</h2>
            <form id="ex-form" onsubmit="AdminPage.saveExercise(event)">
              <div class="form-group">
                <label>Emoji</label>
                <input type="text" id="ex-emoji" value="💪" maxlength="4" />
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input type="text" id="ex-name" placeholder="Ex: Pompes" required />
              </div>
              <div class="form-group">
                <label>Séries</label>
                <input type="number" id="ex-sets" value="1" min="1" max="20" />
              </div>
              <div class="form-group">
                <label>Répétitions *</label>
                <input type="number" id="ex-reps" placeholder="20" required min="1" />
              </div>
              <div class="form-group">
                <label>Unité</label>
                <input type="text" id="ex-unit" value="répétitions" placeholder="répétitions / secondes..." />
              </div>
              <div class="form-group">
                <label>XP par complétion</label>
                <input type="number" id="ex-xp" value="10" min="1" max="100" />
              </div>
              <div class="form-group">
                <label>Ordre d'affichage</label>
                <input type="number" id="ex-order" value="0" min="0" />
              </div>
              <div class="form-group">
                <label>Jours actifs</label>
                <div class="schedule-picker" id="ex-schedule">
                  <button type="button" class="sday-btn" data-day="1" onclick="this.classList.toggle('active')">L</button>
                  <button type="button" class="sday-btn" data-day="2" onclick="this.classList.toggle('active')">M</button>
                  <button type="button" class="sday-btn" data-day="3" onclick="this.classList.toggle('active')">M</button>
                  <button type="button" class="sday-btn" data-day="4" onclick="this.classList.toggle('active')">J</button>
                  <button type="button" class="sday-btn" data-day="5" onclick="this.classList.toggle('active')">V</button>
                  <button type="button" class="sday-btn" data-day="6" onclick="this.classList.toggle('active')">S</button>
                  <button type="button" class="sday-btn" data-day="0" onclick="this.classList.toggle('active')">D</button>
                </div>
                <p style="font-size:11px;color:var(--text3);margin-top:6px;">Aucun sélectionné = tous les jours</p>
              </div>
              <p class="form-error" id="ex-form-error"></p>
              <div style="display:flex;gap:10px;margin-top:8px;">
                <button type="button" class="modal-btn" style="background:var(--card2);color:var(--text2);box-shadow:none;" onclick="AdminPage.closeExModal()">Annuler</button>
                <button type="submit" class="modal-btn" id="ex-submit-btn">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
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
                &nbsp;·&nbsp; ${ex.xp_reward} XP
                &nbsp;·&nbsp; <span style="color:var(--accent3)">${formatSchedule(ex.schedule)}</span>
                ${!ex.is_active ? ' · <span style="color:var(--text3)">désactivé</span>' : ''}
              </div>
            </div>
          </div>
          <div class="admin-ex-actions">
            <button class="admin-btn" onclick="AdminPage.openExModal(${ex.id})">✏️</button>
            ${ex.is_active
              ? `<button class="admin-btn danger" onclick="AdminPage.deleteExercise(${ex.id})">🗑️</button>`
              : `<button class="admin-btn" onclick="AdminPage.restoreExercise(${ex.id})">↩️</button>`
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

    if (id) {
      const ex = exercises.find(e => e.id === id);
      document.getElementById('ex-modal-title').textContent = 'Modifier l\'exercice';
      document.getElementById('ex-emoji').value = ex.emoji || '💪';
      document.getElementById('ex-name').value = ex.name;
      document.getElementById('ex-sets').value = ex.sets;
      document.getElementById('ex-reps').value = ex.reps;
      document.getElementById('ex-unit').value = ex.unit;
      document.getElementById('ex-xp').value = ex.xp_reward;
      document.getElementById('ex-order').value = ex.order_index;
      const schedule = ex.schedule || [];
      document.querySelectorAll('#ex-schedule .sday-btn').forEach(btn => {
        btn.classList.toggle('active', schedule.includes(parseInt(btn.dataset.day)));
      });
    } else {
      document.getElementById('ex-modal-title').textContent = 'Nouvel exercice';
      document.getElementById('ex-form').reset();
      document.getElementById('ex-emoji').value = '💪';
      document.getElementById('ex-xp').value = '10';
      document.getElementById('ex-sets').value = '1';
      document.getElementById('ex-unit').value = 'répétitions';
      document.querySelectorAll('#ex-schedule .sday-btn').forEach(btn => btn.classList.remove('active'));
    }
    modal.style.display = 'flex';
  }

  function closeExModal() {
    document.getElementById('ex-modal').style.display = 'none';
    editingId = null;
  }

  async function saveExercise(e) {
    e.preventDefault();
    const btn = document.getElementById('ex-submit-btn');
    btn.disabled = true;
    document.getElementById('ex-form-error').textContent = '';

    const data = {
      emoji: document.getElementById('ex-emoji').value,
      name: document.getElementById('ex-name').value.trim(),
      sets: parseInt(document.getElementById('ex-sets').value),
      reps: parseInt(document.getElementById('ex-reps').value),
      unit: document.getElementById('ex-unit').value.trim(),
      xp_reward: parseInt(document.getElementById('ex-xp').value),
      order_index: parseInt(document.getElementById('ex-order').value),
      schedule: [...document.querySelectorAll('#ex-schedule .sday-btn.active')].map(b => parseInt(b.dataset.day)),
    };

    try {
      if (editingId) {
        await API.adminUpdateExercise(editingId, data);
        App.showToast('✅ Exercice mis à jour');
      } else {
        await API.adminCreateExercise(data);
        App.showToast('✅ Exercice créé');
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function formatSchedule(sch) {
    if (!sch || sch.length === 0 || sch.length === 7) return 'Tous les jours';
    const labels = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };
    return sch.map(d => labels[d]).join(' · ');
  }

  return { render, init, switchTab, openExModal, closeExModal, saveExercise, deleteExercise, restoreExercise, toggleAdmin };
})();
