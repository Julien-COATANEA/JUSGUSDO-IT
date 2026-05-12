// ── Admin / Exercises page ───────────────────────────────────
const AdminPage = (() => {
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_LABELS = {
    0: 'Dim',
    1: 'Lun',
    2: 'Mar',
    3: 'Mer',
    4: 'Jeu',
    5: 'Ven',
    6: 'Sam',
  };

  let exercises = [];
  let users = [];
  let editingId = null;
  let currentView = 'catalog';
  let currentExTab = 'home'; // 'home' | 'gym'

  function isCurrentUserAdmin() {
    const u = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    return !!u.is_admin;
  }
  let filters = {
    query: '',
    audience: 'all',
    status: 'active',
    type: 'all',
  };

  function render() {
    return `
      <div class="app-page exercises-admin-page" id="admin-page-shell">
        ${renderLoadingPageMarkup()}
      </div>
    `;
  }

  async function init() {
    await refreshData();
  }

  async function refreshData() {
    renderLoadingState();
    try {
      const [exerciseData, userData] = await Promise.all([
        API.adminGetExercises(),
        API.adminGetUsers(),
      ]);
      exercises = (exerciseData.exercises || []).map(normalizeExercise);
      users = (userData.users || []).map(normalizeUser);
      renderCurrentView();
    } catch (err) {
      renderShell(renderErrorState(err));
    }
  }

  function renderLoadingState() {
    renderShell(renderLoadingMarkup());
  }

  function renderCurrentView() {
    if (currentView === 'editor') {
      renderShell(renderEditorPage(), { editor: true });
      toggleRunningFields();
      toggleAudienceMode();
      return;
    }
    renderShell(renderCatalogPage(), { editor: false });
  }

  function renderShell(bodyHtml, { editor = false } = {}) {
    const shell = document.getElementById('admin-page-shell');
    if (!shell) return;

    const title = editor ? (editingId ? 'Modifier exercice' : 'Nouvel exercice') : 'Exercices';
      const subtitle = editor ? 'Édition plein écran' : (isCurrentUserAdmin() ? 'Catalogue admin' : 'Lecture seule');
    const actionHtml = editor
      ? `<button type="button" class="admin-secondary-btn ex-top-action" onclick="AdminPage.closeExModal()">Retour au catalogue</button>`
      : ``;

    shell.innerHTML = `
      <header class="app-header">
        ${editor ? '' : `<button class="icon-btn" onclick="Router.navigate('home')">←</button>`}
        <div class="header-info" style="flex:1">
          <span class="header-username">${title}</span>
          <span class="header-rank" style="color:var(--accent3)">${subtitle}</span>
        </div>
        ${actionHtml}
      </header>
      <div id="admin-content" class="ex-admin-shell${editor ? ' editor-mode' : ''}">
        ${bodyHtml}
      </div>
    `;
  }

  function renderLoadingPageMarkup() {
    return `
      <header class="app-header">
        <button class="icon-btn" onclick="Router.navigate('home')">←</button>
        <div class="header-info" style="flex:1">
          <span class="header-username">Exercices</span>
          <span class="header-rank" style="color:var(--accent3)">Catalogue admin</span>
        </div>
      </header>
      <div class="ex-admin-shell">
        ${renderLoadingMarkup()}
      </div>
    `;
  }

  function renderLoadingMarkup() {
    return `
      <div class="skeleton-card" style="height:130px"></div>
      <div class="skeleton-card" style="height:92px"></div>
      <div class="skeleton-card" style="height:180px"></div>
      <div class="skeleton-card" style="height:180px"></div>
    `;
  }

  function renderErrorState(err) {
    return `
      <div class="exercise-empty">
        <strong>Impossible de charger les exercices</strong>
        <span>${escapeHtml(err.message || 'Erreur serveur')}</span>
        <button type="button" class="submit-btn" onclick="AdminPage.refresh()">Réessayer</button>
      </div>
    `;
  }

  function renderCatalogPage() {
    const stats = buildStats();
    const visibleExercises = getFilteredExercises();

    return `
      <div class="admin-ex-tab-bar">
        <button class="admin-ex-tab${currentExTab === 'home' ? ' active' : ''}" onclick="AdminPage.switchExTab('home')">🏠 Maison</button>
        <button class="admin-ex-tab${currentExTab === 'gym' ? ' active' : ''}" onclick="AdminPage.switchExTab('gym')">🏋️ Salle</button>
      </div>

      <section class="ex-admin-hero">
        <div class="ex-admin-hero-top">
          <div class="ex-admin-copy">
            <span class="ex-admin-eyebrow">Pilotage</span>
            <h1 class="ex-admin-title">Bibliothèque d'exercices</h1>
            <p class="ex-admin-subtitle">Ce catalogue d'exercices est <strong>partagé entre tous les utilisateurs</strong></p>
          </div>
          ${isCurrentUserAdmin() ? `<button type="button" class="submit-btn ex-admin-primary" onclick="AdminPage.openExModal(null)">+ Ajouter un exercice</button>` : ''}
        </div>

        <div class="ex-admin-kpis">
          ${renderKpiCard(stats.total, 'Total')}
          ${renderKpiCard(stats.active, 'Actifs')}
          ${renderKpiCard(stats.mine, 'Mes exercices')}
          ${renderKpiCard(stats.running, 'Running')}
        </div>
      </section>

      <section class="ex-admin-toolbar">
        <label class="exercise-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.35-4.35"></path></svg>
          <input type="search" value="${escapeHtml(filters.query)}" placeholder="Rechercher un exercice, une cible, un format..." oninput="AdminPage.setQuery(this.value)" />
        </label>

        <div class="exercise-filter-stack">
          ${renderFilterGroup('Personne', 'audience', [
            { value: 'all', label: 'Tous' },
            ...users.map(u => ({ value: `user-${u.id}`, label: escapeHtml(u.username) })),
          ])}
          ${renderFilterGroup('État', 'status', [
            { value: 'active', label: 'Actifs' },
            { value: 'archived', label: 'Archivés' },
            { value: 'all', label: 'Tous' },
          ])}
          ${renderFilterGroup('Format', 'type', [
            { value: 'all', label: 'Tout' },
            { value: 'classic', label: 'Classiques' },
            { value: 'running', label: 'Running' },
          ])}
        </div>
      </section>

      <section class="ex-admin-list">
        <div class="ex-admin-list-header">
          <div>
            <h2>Catalogue</h2>
            <p>${visibleExercises.length} exercice${visibleExercises.length > 1 ? 's' : ''} affiché${visibleExercises.length > 1 ? 's' : ''}</p>
          </div>
          ${renderFilterSummary()}
        </div>

        ${visibleExercises.length
          ? `<div class="exercise-grid">${visibleExercises.map(renderExerciseCard).join('')}</div>`
          : renderEmptyState()}
      </section>
    `;
  }

  function renderEditorPage() {
    const exercise = getEditingExercise();
    const load = formatExerciseLoad(exercise);
    const isTargeted = isTargetedExercise(exercise);

    return `
      <section class="ex-editor">

        <div class="ex-editor-top">
          <span class="ex-editor-top-emoji">${escapeHtml(exercise.emoji || '💪')}</span>
          <div class="ex-editor-top-info">
            <h1>${editingId ? `Modifier — ${escapeHtml(exercise.name)}` : 'Nouvel exercice'}</h1>
            <div class="ex-editor-top-chips">
              <span class="ex-editor-top-chip">${exercise.is_active ? 'Actif' : 'Archivé'}</span>
              <span class="ex-editor-top-chip">${isTargeted ? 'Ciblé' : 'Global'}</span>
              <span class="ex-editor-top-chip">${exercise.is_running ? 'Running' : 'Classique'} · ${load}</span>
            </div>
          </div>
        </div>

        ${editingId ? `
        <div class="ex-impact-banner${isTargeted ? ' ex-impact-banner--targeted' : ' ex-impact-banner--global'}">
          ${isTargeted
            ? `👥 Assigné à <strong>${exercise.assignments.length} utilisateur${exercise.assignments.length !== 1 ? 's' : ''}</strong>${exercise.assignments.length > 0 ? ' : ' + exercise.assignments.slice(0, 3).map(a => escapeHtml(getUserName(a.user_id))).join(', ') + (exercise.assignments.length > 3 ? ` +${exercise.assignments.length - 3}` : '') : ''}. Archiver préserve leur historique.`
            : `👥 Ce catalogue est <strong>partagé entre tous les utilisateurs</strong>`
          }
        </div>` : ''}

        <form id="ex-form" class="ex-editor-form" onsubmit="AdminPage.saveExercise(event)">

          <section class="ex-editor-section">
            <h2 class="ex-editor-section-title">Identité</h2>
            <div class="ex-editor-id-grid">
              <div class="form-group">
                <label>Emoji</label>
                <input type="text" id="ex-emoji" value="${escapeHtml(exercise.emoji || '💪')}" maxlength="4" />
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input type="text" id="ex-name" value="${escapeHtml(editingId ? exercise.name : '')}" placeholder="Ex: Pompes inclinées" required />
              </div>
              <div class="form-group">
                <label>Ordre</label>
                <input type="number" id="ex-order" value="${exercise.order_index}" min="0" />
              </div>
            </div>
            ${currentExTab === 'gym' ? `
            <div class="form-group" style="margin-top:12px">
              <label>Séance</label>
              <select id="ex-gym-session" class="mr-input mr-select">
                <option value="Pecs Triceps"${(exercise.gymSession || '') === 'Pecs Triceps' ? ' selected' : ''}>💪 Pecs Triceps</option>
                <option value="Dos Biceps"${(exercise.gymSession || '') === 'Dos Biceps' ? ' selected' : ''}>🍋️ Dos Biceps</option>
                <option value="Jambes"${(exercise.gymSession || '') === 'Jambes' ? ' selected' : ''}>🦵 Jambes</option>
                <option value="Full"${(exercise.gymSession || '') === 'Full' ? ' selected' : ''}>⚡ Full</option>
              </select>
            </div>` : ''}
          </section>

          <section class="ex-editor-section">
            <h2 class="ex-editor-section-title">Format</h2>
            <div class="ex-format-type-row">
              <label class="ex-format-type-opt">
                <input type="radio" name="ex-format-type" id="ex-is-classic" value="classic" ${exercise.is_running ? '' : 'checked'} onchange="AdminPage.toggleRunningFields()" />
                <span><strong>💪 Classique</strong><small>Séries × répétitions</small></span>
              </label>
              <label class="ex-format-type-opt">
                <input type="radio" name="ex-format-type" id="ex-is-running" value="running" ${exercise.is_running ? 'checked' : ''} onchange="AdminPage.toggleRunningFields()" />
                <span><strong>🏃 Cardio</strong><small>Session cardio</small></span>
              </label>
            </div>

            <div id="ex-muscu-fields" class="ex-muscu-fields" style="display:${exercise.is_running ? 'none' : 'flex'};">
              <div class="ex-metrics-row">
                <div class="form-group">
                  <label>Séries</label>
                  <input type="number" id="ex-sets" value="${exercise.sets}" min="1" max="20" />
                </div>
                <div class="ex-metrics-sep">×</div>
                <div class="form-group" style="flex:2;">
                  <label>Répétitions *</label>
                  <input type="number" id="ex-reps" value="${exercise.reps}" min="1" ${exercise.is_running ? '' : 'required'} />
                </div>
                <div class="form-group" style="flex:2;">
                  <label>Unité</label>
                  <input type="text" id="ex-unit" value="${escapeHtml(exercise.unit)}" placeholder="rép. / secondes" />
                </div>
              </div>
              <div class="ex-charge-preview">
                <span class="ex-charge-label">Charge calculée</span>
                <strong>${load}</strong>
              </div>
            </div>

            <div id="ex-cardio-fields" style="display:${exercise.is_running ? 'flex' : 'none'};flex-direction:column;gap:14px;">
              <div>
                <p class="ex-editor-section-title" style="margin-bottom:8px;">Activité</p>
                <div class="ex-format-type-row">
                  <label class="ex-format-type-opt">
                    <input type="radio" name="ex-cardio-activity" value="course"
                      ${getCardioActivity(exercise) === 'course' ? 'checked' : ''}
                      onchange="AdminPage.setCardioActivity('course')" />
                    <span><strong>🏃 Course à pied</strong></span>
                  </label>
                  <label class="ex-format-type-opt">
                    <input type="radio" name="ex-cardio-activity" value="velo"
                      ${getCardioActivity(exercise) === 'velo' ? 'checked' : ''}
                      onchange="AdminPage.setCardioActivity('velo')" />
                    <span><strong>🚴 Vélo</strong></span>
                  </label>
                  <label class="ex-format-type-opt">
                    <input type="radio" name="ex-cardio-activity" value="rameur"
                      ${getCardioActivity(exercise) === 'rameur' ? 'checked' : ''}
                      onchange="AdminPage.setCardioActivity('rameur')" />
                    <span><strong>🚣 Rameur</strong></span>
                  </label>
                </div>
              </div>
              <div class="ex-metrics-row" style="align-items:flex-end;">
                <div style="flex:1;">
                  <p class="ex-editor-section-title" style="margin-bottom:8px;">Objectif</p>
                  <div class="ex-format-type-row">
                    <label class="ex-format-type-opt">
                      <input type="radio" name="ex-cardio-metric" value="km" ${exercise.unit === 'km' ? 'checked' : ''} />
                      <span><strong>📍 Distance</strong><small>km</small></span>
                    </label>
                    <label class="ex-format-type-opt">
                      <input type="radio" name="ex-cardio-metric" value="min" ${exercise.unit !== 'km' ? 'checked' : ''} />
                      <span><strong>⏱ Durée</strong><small>min</small></span>
                    </label>
                  </div>
                </div>
                <div class="form-group" style="width:96px;flex-shrink:0;">
                  <label>Cible</label>
                  <input type="number" id="ex-cardio-target" value="${exercise.is_running ? exercise.reps : 30}" min="1" max="999" />
                </div>
              </div>
            </div>
          </section>

          <section class="ex-editor-section">
            <h2 class="ex-editor-section-title">Diffusion — par personne</h2>
            <input type="checkbox" id="ex-audience-targeted" checked hidden />
            <div id="ex-targeted-users-wrap">
              <div id="ex-assign-users" class="exercise-users-list">${renderAssignmentRowsMarkup(exercise.assignments)}</div>
            </div>
          </section>

          <div class="ex-editor-footer">
            <p class="form-error" id="ex-form-error"></p>
            <div class="ex-editor-footer-actions">
              ${editingId ? `<button type="button" class="admin-secondary-btn" id="ex-archive-btn" onclick="AdminPage.toggleExerciseState(${exercise.id}, ${!exercise.is_active})">${exercise.is_active ? '🗂 Archiver' : '♻️ Réactiver'}</button>` : ''}
              <button type="button" class="admin-secondary-btn" onclick="AdminPage.closeExModal()">Annuler</button>
              <button type="submit" class="submit-btn" id="ex-submit-btn">${editingId ? 'Enregistrer' : "Créer l'exercice"}</button>
            </div>
          </div>

        </form>
      </section>
    `;
  }

  function renderKpiCard(value, label) {
    return `
      <div class="ex-admin-kpi">
        <span class="ex-admin-kpi-value">${value}</span>
        <span class="ex-admin-kpi-label">${label}</span>
      </div>
    `;
  }

  function renderFilterGroup(title, key, options) {
    return `
      <div class="exercise-filter-group">
        <span class="exercise-filter-title">${title}</span>
        <div class="exercise-filter-row">
          ${options.map(opt => `
            <button
              type="button"
              class="exercise-filter${filters[key] === opt.value ? ' active' : ''}"
              onclick="AdminPage.setFilter('${key}', '${opt.value}')"
            >
              ${opt.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderFilterSummary() {
    const summary = [];
    summary.push(filters.status === 'archived' ? 'Archivés' : (filters.status === 'all' ? 'Tous' : 'Actifs'));
    if (filters.audience !== 'all' && filters.audience.startsWith('user-')) {
      const uid = parseInt(filters.audience.slice(5), 10);
      const u = users.find(u => u.id === uid);
      if (u) summary.push(escapeHtml(u.username));
    }
    if (filters.type === 'running') summary.push('Running');
    if (filters.type === 'classic') summary.push('Classiques');
    if (filters.query.trim()) summary.push(`Recherche: ${escapeHtml(filters.query.trim())}`);
    return `<span class="exercise-filter-note exercise-filter-note-simple">${summary.join(' · ')}</span>`;
  }

  function renderExerciseCard(exercise) {
    const load = formatExerciseLoad(exercise);
    const stateLabel = exercise.is_active ? 'Actif' : 'Archivé';

    return `
      <article class="exercise-card exercise-card-simple${exercise.is_active ? '' : ' archived'}">
        <div class="exercise-card-head">
          <div class="exercise-card-identity">
            <span class="exercise-card-emoji">${escapeHtml(exercise.emoji)}</span>
            <div class="exercise-card-copy">
              <div class="exercise-card-title-row">
                <h3>${escapeHtml(exercise.name)}</h3>
                <span class="exercise-order-chip">#${exercise.order_index}</span>
                <span class="exercise-row-state${exercise.is_active ? '' : ' archived'}">${stateLabel}</span>
              </div>
              <p class="exercise-card-meta-line">${exercise.is_running ? 'Running' : 'Classique'} · ${load}</p>
              <p class="exercise-card-subline">${renderExerciseAudienceSummary(exercise)}</p>
            </div>
          </div>

          ${isCurrentUserAdmin() ? `
          <div class="ex-card-menu-wrap">
            <button type="button" class="ex-card-menu-btn" onclick="event.stopPropagation();this.closest('.ex-card-menu-wrap').classList.toggle('open')" aria-label="Actions">⋯</button>
            <div class="ex-card-menu-dropdown">
              <button type="button" onclick="AdminPage.openExModal(${exercise.id})">✏️ Modifier</button>
              <button type="button" onclick="AdminPage.toggleExerciseState(${exercise.id}, ${exercise.is_active ? 'false' : 'true'})">${exercise.is_active ? '🗂 Archiver' : '♻️ Réactiver'}</button>
            </div>
          </div>` : ''}
        </div>
      </article>
    `;
  }

  function renderExerciseAudienceSummary(exercise) {
    if (!isTargetedExercise(exercise)) {
      return `Tous les utilisateurs · ${formatSchedule(exercise.schedule)}`;
    }

    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    const people = exercise.assignments.slice(0, 2).map(assignment => {
      const name = escapeHtml(getUserName(assignment.user_id));
      const label = assignment.user_id === me.id
        ? `<strong class="me-highlight">${name}</strong>`
        : name;
      return `${label}: ${formatSchedule(assignment.schedule)}`;
    });
    const extraCount = Math.max(0, exercise.assignments.length - 2);
    return `${people.join(' · ')}${extraCount ? ` · +${extraCount}` : ''}`;
  }

  function renderAssignmentRowsMarkup(assignments) {
    const assignmentMap = new Map(assignments.map(assignment => [assignment.user_id, assignment.schedule]));

    if (!users.length) {
      return '<span class="exercise-inline-help">Aucun utilisateur chargé.</span>';
    }

    return users.map(user => {
      const checked = assignmentMap.has(user.id);
      const schedule = assignmentMap.get(user.id) || [];
      return `
        <div class="exercise-user-row">
          <label class="exercise-user-main">
            <input
              type="checkbox"
              value="${user.id}"
              ${checked ? 'checked' : ''}
              onchange="AdminPage.toggleUserAssignRow(${user.id}, this.checked)"
            />
            <span class="exercise-user-avatar">${Gamification.getRank(user.xp).emoji}</span>
            <span class="exercise-user-meta">
              <strong>${escapeHtml(user.username)}</strong>
              <small>${user.is_admin ? 'Admin' : 'Joueur'}</small>
            </span>
          </label>
          <div class="exercise-user-schedule" id="usp-${user.id}" style="${checked ? '' : 'display:none;'}">
            <div class="schedule-picker exercise-day-row">${renderDayButtons(schedule)}</div>
            <p class="exercise-inline-help">Aucun jour = tous les jours pour ${escapeHtml(user.username)}.</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderEmptyState() {
    const hasFilters = !!filters.query.trim() || filters.audience !== 'all' || filters.status !== 'active' || filters.type !== 'all';
    return `
      <div class="exercise-empty">
        <strong>${hasFilters ? 'Aucun exercice ne correspond à ces filtres' : 'Le catalogue est vide'}</strong>
        <span>${hasFilters ? 'Allège les filtres ou réinitialise la recherche.' : 'Commence par créer un premier exercice propre.'}</span>
        <button type="button" class="submit-btn" onclick="${hasFilters ? 'AdminPage.resetFilters()' : 'AdminPage.openExModal(null)'}">
          ${hasFilters ? 'Réinitialiser les filtres' : 'Créer un exercice'}
        </button>
      </div>
    `;
  }

  function buildStats() {
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    const tab = exercises.filter(exercise => exercise.type === currentExTab);
    return {
      total: tab.length,
      active: tab.filter(exercise => exercise.is_active).length,
      mine: tab.filter(exercise => exercise.is_active && (
        !isTargetedExercise(exercise) ||
        exercise.assignments.some(a => a.user_id === me.id)
      )).length,
      running: tab.filter(exercise => exercise.is_running && exercise.is_active).length,
    };
  }

  function getFilteredExercises() {
    const query = filters.query.trim().toLowerCase();

    return exercises
      .filter(exercise => {
        if (exercise.type !== currentExTab) return false;
        if (filters.status === 'active' && !exercise.is_active) return false;
        if (filters.status === 'archived' && exercise.is_active) return false;
        if (filters.audience !== 'all' && filters.audience.startsWith('user-')) {
          const uid = parseInt(filters.audience.slice(5), 10);
          const isGlobal = !isTargetedExercise(exercise);
          const isAssigned = exercise.assignments.some(a => a.user_id === uid);
          if (!isGlobal && !isAssigned) return false;
        }
        if (filters.type === 'running' && !exercise.is_running) return false;
        if (filters.type === 'classic' && exercise.is_running) return false;
        if (!query) return true;

        const searchBlob = [
          exercise.name,
          exercise.unit,
          exercise.is_running ? 'running' : 'classique',
          formatSchedule(exercise.schedule),
          ...exercise.assignments.map(assignment => `${getUserName(assignment.user_id)} ${formatSchedule(assignment.schedule)}`),
        ].join(' ').toLowerCase();
        return searchBlob.includes(query);
      })
      .sort((left, right) => {
        if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
        if (left.order_index !== right.order_index) return left.order_index - right.order_index;
        return left.name.localeCompare(right.name, 'fr');
      });
  }

  function openExModal(id) {
    if (!isCurrentUserAdmin()) return;
    editingId = id;
    // When opening editor from a card, set currentExTab to match that exercise's type
    if (id) {
      const ex = exercises.find(e => e.id === id);
      if (ex) currentExTab = ex.type || 'home';
    }
    currentView = 'editor';
    renderCurrentView();
  }

  function closeExModal() {
    currentView = 'catalog';
    editingId = null;
    renderCurrentView();
  }

  function onOverlayClick() {
    // No modal overlay anymore. Kept for compatibility.
  }

  function toggleRunningFields() {
    const isRunning = !!document.getElementById('ex-is-running')?.checked;
    const muscuFields = document.getElementById('ex-muscu-fields');
    const cardioFields = document.getElementById('ex-cardio-fields');
    const repsInput = document.getElementById('ex-reps');
    if (muscuFields) muscuFields.style.display = isRunning ? 'none' : 'flex';
    if (cardioFields) cardioFields.style.display = isRunning ? 'flex' : 'none';
    if (repsInput) repsInput.required = !isRunning;
    if (isRunning) {
      // Pre-select Course à pied if no activity is checked yet
      const anyChecked = document.querySelector('input[name="ex-cardio-activity"]:checked');
      if (!anyChecked) setCardioActivity('course');
    }
  }

  function getCardioActivity(exercise) {
    const emoji = exercise.emoji || '';
    if (['🚴', '🚵', '🛵'].includes(emoji)) return 'velo';
    if (['🚣', '🚣‍♂️', '🚣‍♀️'].includes(emoji)) return 'rameur';
    return 'course';
  }

  function setCardioActivity(type) {
    const emojis = { course: '🏃', velo: '🚴', rameur: '🚣' };
    const emojiInput = document.getElementById('ex-emoji');
    if (emojiInput) emojiInput.value = emojis[type] || '🏃';
  }

  function toggleAudienceMode() {
    const isTargeted = !!document.getElementById('ex-audience-targeted')?.checked;
    const globalWrap = document.getElementById('ex-global-schedule-wrap');
    const targetedWrap = document.getElementById('ex-targeted-users-wrap');
    if (globalWrap) globalWrap.style.display = isTargeted ? 'none' : '';
    if (targetedWrap) targetedWrap.style.display = isTargeted ? '' : 'none';
  }

  function toggleUserAssignRow(userId, checked) {
    const picker = document.getElementById(`usp-${userId}`);
    if (picker) picker.style.display = checked ? '' : 'none';
    if (checked) {
      const targeted = document.getElementById('ex-audience-targeted');
      const all = document.getElementById('ex-audience-all');
      if (targeted) targeted.checked = true;
      if (all) all.checked = false;
      toggleAudienceMode();
    }
  }

  async function saveExercise(event) {
    event.preventDefault();

    const errorEl = document.getElementById('ex-form-error');
    const submitBtn = document.getElementById('ex-submit-btn');
    const isRunning = !!document.getElementById('ex-is-running')?.checked;
    const isTargeted = !!document.getElementById('ex-audience-targeted')?.checked;
    const name = document.getElementById('ex-name')?.value.trim();
    const reps = isRunning
      ? (parseInt(document.getElementById('ex-cardio-target')?.value, 10) || 30)
      : parseInt(document.getElementById('ex-reps')?.value, 10);

    if (!name) {
      errorEl.textContent = 'Le nom est obligatoire.';
      return;
    }
    if (!isRunning && (!Number.isFinite(reps) || reps <= 0)) {
      errorEl.textContent = 'Les répétitions doivent être supérieures à 0.';
      return;
    }

    const assignmentsData = isTargeted
      ? [...document.querySelectorAll('#ex-assign-users input[type="checkbox"]:checked')].map(input => {
          const userId = parseInt(input.value, 10);
          const picker = document.getElementById(`usp-${userId}`);
          return {
            user_id: userId,
            schedule: getActiveDaysFrom(picker),
          };
        })
      : [];

    if (isTargeted && assignmentsData.length === 0) {
      errorEl.textContent = 'Sélectionne au moins une personne.';
      return;
    }

    const data = {
      emoji: document.getElementById('ex-emoji')?.value || '💪',
      name,
      sets: isRunning ? 1 : parseInt(document.getElementById('ex-sets')?.value, 10) || 1,
      reps,
      unit: isRunning
        ? (document.querySelector('input[name="ex-cardio-metric"]:checked')?.value || 'min')
        : (document.getElementById('ex-unit')?.value.trim() || 'répétitions'),
      order_index: parseInt(document.getElementById('ex-order')?.value, 10) || 0,
      schedule: isTargeted ? [] : getActiveDaysFrom(document.getElementById('ex-global-schedule')),
      is_running: isRunning,
      type: currentExTab,
      gym_session: currentExTab === 'gym' ? (document.getElementById('ex-gym-session')?.value || null) : null,
    };

    errorEl.textContent = '';
    if (submitBtn) submitBtn.disabled = true;

    try {
      let savedExercise;
      if (editingId) {
        const response = await API.adminUpdateExercise(editingId, data);
        savedExercise = response.exercise || { id: editingId };
        App.showToast('✅ Exercice mis à jour');
      } else {
        const response = await API.adminCreateExercise(data);
        savedExercise = response.exercise;
        App.showToast('✅ Exercice créé');
      }

      if (savedExercise && savedExercise.id) {
        await API.adminAssignExercise(savedExercise.id, assignmentsData);
      }

      currentView = 'catalog';
      editingId = null;
      await refreshData();
    } catch (err) {
      errorEl.textContent = err.message || 'Erreur serveur';
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function deleteCurrentExercise() {
    if (!editingId) return;
    deleteExercise(editingId);
  }

  function deleteExercise(id) {
    const exercise = exercises.find(item => item.id === id);
    const isTargeted = exercise && isTargetedExercise(exercise);
    const audienceText = !exercise
      ? 'tous les utilisateurs'
      : isTargeted
        ? `${exercise.assignments.length} utilisateur${exercise.assignments.length !== 1 ? 's' : ''}`
        : 'tous les utilisateurs';
    App.showConfirm(
      'Supprimer définitivement',
      `Supprimer « ${exercise ? escapeHtml(exercise.name) : 'cet exercice'} » ? Cet exercice est partagé avec ${audienceText}. Si des complétions existent, la suppression sera bloquée — archivez-le plutot.`,
      async ok => {
        if (!ok) return;
        try {
          await API.adminDeleteExercise(id);
          currentView = 'catalog';
          editingId = null;
          App.showToast('Exercice supprimé');
          await refreshData();
        } catch (err) {
          App.showToast(err.message || 'Erreur serveur');
        }
      }
    );
  }

  async function toggleExerciseState(id, shouldBeActive) {
    const verb = shouldBeActive ? 'réactivé' : 'archivé';
    try {
      await API.adminUpdateExercise(id, { is_active: shouldBeActive });
      App.showToast(`Exercice ${verb}`);
      await refreshData();
    } catch (err) {
      App.showToast('Erreur: ' + err.message);
    }
  }

  function switchExTab(tab) {
    currentExTab = tab;
    editingId = null;
    currentView = 'catalog';
    renderCurrentView();
  }

  function setQuery(query) {
    filters.query = query;
    renderCurrentView();
  }

  function setFilter(key, value) {
    filters[key] = value;
    renderCurrentView();
  }

  function resetFilters() {
    filters = {
      query: '',
      audience: 'all',
      status: 'active',
      type: 'all',
    };
    renderCurrentView();
  }

  function getEditingExercise() {
    if (!editingId) return createBlankExercise();
    return exercises.find(exercise => exercise.id === editingId) || createBlankExercise();
  }

  function createBlankExercise() {
    return normalizeExercise({
      id: null,
      emoji: '💪',
      name: '',
      sets: 1,
      reps: 10,
      unit: 'répétitions',
      order_index: 0,
      schedule: [],
      assignments: [],
      is_active: true,
      is_running: false,
      xp_reward: 10,
      type: currentExTab,
      gymSession: '',
    });
  }

  function normalizeExercise(exercise) {
    const assignments = Array.isArray(exercise.assignments) && exercise.assignments.length
      ? exercise.assignments
      : (Array.isArray(exercise.assigned_users) ? exercise.assigned_users.map(userId => ({ user_id: userId, schedule: [] })) : []);

    return {
      id: exercise.id,
      emoji: exercise.emoji || '💪',
      name: exercise.name || 'Sans nom',
      sets: Number(exercise.sets) || 1,
      reps: Number(exercise.reps) || 1,
      unit: exercise.unit || 'répétitions',
      order_index: Number(exercise.order_index) || 0,
      schedule: normalizeSchedule(exercise.schedule),
      assignments: assignments
        .map(assignment => ({
          user_id: Number(assignment.user_id),
          schedule: normalizeSchedule(assignment.schedule),
        }))
        .filter(assignment => assignment.user_id > 0),
      assigned_users: Array.isArray(exercise.assigned_users) ? exercise.assigned_users.map(Number).filter(Boolean) : [],
      is_active: exercise.is_active !== false,
      is_running: !!exercise.is_running,
      xp_reward: Number(exercise.xp_reward) || (exercise.is_running ? 20 : 10),
      type: exercise.type || 'home',
      gymSession: exercise.gym_session || '',
    };
  }

  function normalizeUser(user) {
    return {
      id: Number(user.id),
      username: user.username || `Utilisateur ${user.id}`,
      xp: Number(user.xp) || 0,
      is_admin: !!user.is_admin,
    };
  }

  function normalizeSchedule(schedule) {
    if (!Array.isArray(schedule)) return [];
    const numeric = schedule.map(Number);
    return DAY_ORDER.filter(day => numeric.includes(day));
  }

  function getActiveDaysFrom(container) {
    if (!container) return [];
    return [...container.querySelectorAll('.sday-btn.active')].map(button => parseInt(button.dataset.day, 10));
  }

  function renderDayButtons(schedule) {
    const activeDays = normalizeSchedule(schedule);
    return DAY_ORDER.map(day => `
      <button type="button" class="sday-btn${activeDays.includes(day) ? ' active' : ''}" data-day="${day}" onclick="this.classList.toggle('active')">
        ${DAY_LABELS[day].charAt(0)}
      </button>
    `).join('');
  }

  function isTargetedExercise(exercise) {
    return Array.isArray(exercise.assignments) && exercise.assignments.length > 0;
  }

  function getUserName(userId) {
    const user = users.find(item => item.id === Number(userId));
    return user ? user.username : `#${userId}`;
  }

  function formatExerciseLoad(exercise) {
    return exercise.is_running
      ? `${exercise.reps} ${exercise.unit || 'min'}`
      : `${exercise.sets > 1 ? `${exercise.sets} séries × ` : ''}${exercise.reps} ${escapeHtml(exercise.unit)}`;
  }

  function formatSchedule(schedule) {
    const days = normalizeSchedule(schedule);
    if (!days.length || days.length === 7) return 'Tous les jours';
    return days.map(day => DAY_LABELS[day]).join(' · ');
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    render,
    init,
    refresh: refreshData,
    switchExTab,
    setQuery,
    setFilter,
    resetFilters,
    openExModal,
    closeExModal,
    onOverlayClick,
    toggleRunningFields,
    toggleAudienceMode,
    toggleUserAssignRow,
    saveExercise,
    toggleExerciseState,
    deleteCurrentExercise,
    setCardioActivity,
  };
})();

// Close exercise card overflow menus when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.ex-card-menu-wrap')) {
    document.querySelectorAll('.ex-card-menu-wrap.open').forEach(el => el.classList.remove('open'));
  }
});