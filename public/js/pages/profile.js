// ── Profile / Stats page ─────────────────────────────────────
const ProfilePage = (() => {
  let _profileUserId = null;
  let _isOwnProfile  = false;

  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <button class="icon-btn" onclick="Router.navigate('home')" title="Retour" style="margin-right:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div class="header-info" style="flex:1">
            <span class="header-username">Profil</span>
          </div>
        </header>
        <div id="profile-content" style="padding:16px 16px 100px">
          <div class="skeleton-card" style="height:180px;margin-bottom:16px"></div>
          <div class="skeleton-card" style="height:80px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:140px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:120px;margin-bottom:12px"></div>
          <div class="skeleton-card" style="height:100px"></div>
        </div>
      </div>
    `;
  }

  async function init({ userId } = {}) {
    const container = document.getElementById('profile-content');
    if (!container) return;

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    _profileUserId = userId ? parseInt(userId, 10) : currentUser.id;
    _isOwnProfile  = _profileUserId === currentUser.id;

    try {
      const [{ user, stats }, { records }] = await Promise.all([
        API.getUserStats(_profileUserId),
        API.getMuscleRecords(_profileUserId),
      ]);
      container.innerHTML = _renderAll(user, stats, records);
    } catch (err) {
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
    }
  }

  // ── Main renderer ───────────────────────────────────────────
  function _renderAll(user, stats, records = []) {
    const rank     = Gamification.getRank(user.xp);
    const progress = Gamification.getProgress(user.xp);
    const avatar   = user.avatar || rank.emoji;
    const name     = _escape(user.username.charAt(0).toUpperCase() + user.username.slice(1));

    return `
      ${_renderHero(avatar, name, rank, progress, stats)}

      <div class="profile-tabs">
        <button class="profile-tab active" id="ptab-stats"   onclick="ProfilePage.switchTab('stats')">📊 Stats</button>
        <button class="profile-tab"        id="ptab-records" onclick="ProfilePage.switchTab('records')">🏋️ Records</button>
      </div>

      <div id="profile-panel-stats">
        ${_renderTodayBadge(stats)}
        ${_renderCalendar(stats.calendar)}
        ${_renderXpChart(stats.xp_history)}
        ${_renderChallenges(stats)}
        ${_renderTopEx(stats.top_exercises)}
      </div>

      <div id="profile-panel-records" style="display:none">
        ${_renderMuscleRecords(records)}
      </div>
    `;
  }

  // ── Tab switch ──────────────────────────────────────────────
  function switchTab(tab) {
    const isRecords = tab === 'records';
    document.getElementById('profile-panel-stats').style.display   = isRecords ? 'none' : 'block';
    document.getElementById('profile-panel-records').style.display = isRecords ? 'block' : 'none';
    document.getElementById('ptab-stats').classList.toggle('active',   !isRecords);
    document.getElementById('ptab-records').classList.toggle('active',  isRecords);
  }

  // ── 1. Hero card ────────────────────────────────────────────
  function _renderHero(avatar, name, rank, progress, stats) {
    const simpleCards = [
      { label: 'Exercices',      value: stats.total_completed,            icon: '✅' },
      { label: 'Jours complets', value: stats.full_days,                  icon: '🔥' },
      { label: 'Meilleure série',value: stats.best_streak + '\u202fj',    icon: '🏆' },
      { label: 'Série actuelle', value: stats.current_streak + '\u202fj', icon: '⚡' },
      { label: 'Jours actifs',   value: stats.active_days,                icon: '📅' },
    ];
    return `
      <div class="profile-hero" style="animation:fadeIn 0.3s ease">
        <div class="profile-hero-avatar">${avatar}</div>
        <div class="profile-hero-name">${name}</div>
        <div class="profile-hero-rank">${rank.emoji} ${rank.title}</div>
        <div class="player-xp-bar" style="margin-top:12px;width:100%;max-width:280px;">
          <div class="player-xp-bar-track">
            <div class="player-xp-bar-fill" style="width:${progress.pct}%"></div>
          </div>
          <div class="player-xp-labels">
            <span>${progress.inRank} XP</span>
            <span>${progress.needed} XP</span>
          </div>
        </div>
      </div>
      <div class="profile-stats-grid" style="animation:fadeIn 0.3s ease 0.04s both">
        ${simpleCards.map(c => `
          <div class="profile-stat-card">
            <span class="profile-stat-icon">${c.icon}</span>
            <span class="profile-stat-value">${c.value}</span>
            <span class="profile-stat-label">${c.label}</span>
          </div>`).join('')}
      </div>`;
  }

  // ── 2. Statut du jour ───────────────────────────────────────
  function _renderTodayBadge(stats) {
    const { today_done: done, today_total: total } = stats;
    if (!total) return '';
    let cls, icon, msg;
    if (done >= total)      { cls = 'done';    icon = '✅'; msg = `Journée complète ! (${done}/${total})`; }
    else if (done > 0)      { cls = 'partial'; icon = '💪'; msg = `${done}\u202f/\u202f${total} exercices aujourd'hui`; }
    else                    { cls = 'empty';   icon = '😴'; msg = `Pas encore commencé aujourd'hui`; }
    return `
      <div class="profile-today-badge ${cls}" style="animation:fadeIn 0.3s ease 0.07s both">
        <span class="profile-today-icon">${icon}</span>
        <span class="profile-today-msg">${msg}</span>
      </div>`;
  }

  // ── 3. Calendrier 28 jours ──────────────────────────────────
  function _renderCalendar(calendar) {
    if (!calendar || !calendar.length) return '';
    const today = new Date().toISOString().split('T')[0];
    const DAY_LABELS = ['L','M','M','J','V','S','D'];

    const cells = calendar.map(d => {
      const pct  = d.total > 0 ? d.done / d.total : 0;
      const cls  = d.date > today ? 'future'
                 : pct >= 1       ? 'full'
                 : pct > 0        ? 'partial'
                 :                  'empty';
      const isToday = d.date === today;
      return `<div class="cal-cell ${cls}${isToday ? ' cal-today' : ''}" title="${d.date} · ${d.done}/${d.total}"></div>`;
    });

    // Calendar always starts on Monday (ISO-aligned), so headers are fixed
    const headerLabels = DAY_LABELS.map(l => `<div class="cal-label">${l}</div>`);

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.1s both">
        <div class="profile-section-title">Activité — 4 semaines</div>
        <div class="cal-grid">
          ${headerLabels.join('')}
          ${cells.join('')}
        </div>
        <div class="cal-legend">
          <div class="cal-cell full"  style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Complet</span>
          <div class="cal-cell partial" style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Partiel</span>
          <div class="cal-cell empty" style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></div><span>Aucun</span>
        </div>
      </div>`;
  }

  // ── 4. Graphique XP 30 jours (SVG inline) ──────────────────
  function _renderXpChart(xpHistory) {
    if (!xpHistory || !xpHistory.length) return '';

    // Build full 30-day array
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    const xpMap = {};
    xpHistory.forEach(r => { xpMap[r.date] = r.xp_earned; });
    const values = days.map(d => xpMap[d] || 0);
    const maxVal = Math.max(...values, 1);

    const W = 320, H = 80, PAD = 4;
    const barW = (W - PAD * 2) / 30 - 1;
    const bars = values.map((v, i) => {
      const bh   = Math.max(2, Math.round((v / maxVal) * (H - 12)));
      const x    = PAD + i * ((W - PAD * 2) / 30);
      const y    = H - bh;
      const fill = v > 0 ? 'var(--accent3)' : 'var(--border)';
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${bh}" rx="2" fill="${fill}" opacity="${v > 0 ? 0.9 : 1}"/>`;
    }).join('');

    // X-axis labels: first and last date
    const label0 = days[0].slice(5).replace('-', '/');
    const label1 = days[29].slice(5).replace('-', '/');

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.13s both">
        <div class="profile-section-title">XP — 30 derniers jours</div>
        <svg viewBox="0 0 ${W} ${H + 14}" width="100%" style="display:block;overflow:visible">
          ${bars}
          <text x="${PAD}" y="${H + 13}" font-size="9" fill="var(--text3)" font-family="Inter,sans-serif">${label0}</text>
          <text x="${W - PAD}" y="${H + 13}" font-size="9" fill="var(--text3)" font-family="Inter,sans-serif" text-anchor="end">${label1}</text>
        </svg>
      </div>`;
  }

  // ── 5. Défis motivationnels ─────────────────────────────────
  function _renderChallenges(stats) {
    const challenges = [
      {
        icon: '🔥', title: 'Série de 3 jours',
        desc: 'Compléter 3 jours consécutifs',
        current: Math.min(stats.current_streak, 3), target: 3,
      },
      {
        icon: '⚡', title: 'Série de 7 jours',
        desc: '7 jours complets d\'affilée',
        current: Math.min(stats.current_streak, 7), target: 7,
      },
      {
        icon: '💪', title: '10 exercices',
        desc: '10 exercices complétés au total',
        current: Math.min(stats.total_completed, 10), target: 10,
      },
      {
        icon: '🏆', title: '30 exercices',
        desc: '30 exercices complétés au total',
        current: Math.min(stats.total_completed, 30), target: 30,
      },
      {
        icon: '📅', title: '10 jours complets',
        desc: 'Terminer 10 journées entières',
        current: Math.min(stats.full_days, 10), target: 10,
      },
      {
        icon: '🌟', title: 'Régularité',
        desc: '20 jours actifs au total',
        current: Math.min(stats.active_days, 20), target: 20,
      },
    ];

    const items = challenges.map(c => {
      const done = c.current >= c.target;
      const pct  = Math.round((c.current / c.target) * 100);
      return `
        <div class="challenge-item${done ? ' done' : ''}">
          <span class="challenge-icon">${done ? '✅' : c.icon}</span>
          <div class="challenge-body">
            <div class="challenge-title">${c.title}</div>
            <div class="challenge-bar-track">
              <div class="challenge-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="challenge-progress">${c.current}\u202f/\u202f${c.target}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.16s both">
        <div class="profile-section-title">Défis</div>
        ${items}
      </div>`;
  }

  // ── 6. Top exercices ────────────────────────────────────────
  function _renderTopEx(topExercises) {
    if (!topExercises.length) return '';
    const rows = topExercises.map((ex, i) => `
      <div class="profile-top-ex">
        <span class="profile-top-ex-rank">#${i + 1}</span>
        <span class="profile-top-ex-name">${_escape(ex.name)}</span>
        <span class="profile-top-ex-times">${ex.times}×</span>
      </div>`).join('');
    return `
      <div class="profile-section" style="animation:fadeIn 0.3s ease 0.19s both">
        <div class="profile-section-title">Top exercices</div>
        ${rows}
      </div>`;
  }

  function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── 7. Records Muscu ────────────────────────────────────────
  const _MR_CATEGORIES = [
    { name: 'Poitrine',  icon: '🫸', color: '#e94560' },
    { name: 'Dos',       icon: '🏋️', color: '#7c5cbf' },
    { name: 'Épaules',   icon: '🔺', color: '#f97316' },
    { name: 'Biceps',    icon: '💪', color: '#4ecdc4' },
    { name: 'Triceps',   icon: '⚡', color: '#38b2ac' },
    { name: 'Jambes',    icon: '🦵', color: '#22d18b' },
    { name: 'Abdos',     icon: '🔥', color: '#fbbf24' },
    { name: 'Autre',     icon: '🎯', color: '#7878aa' },
  ];

  function _catMeta(name) {
    return _MR_CATEGORIES.find(c => c.name === name) || _MR_CATEGORIES[_MR_CATEGORIES.length - 1];
  }

  function _renderMuscleRecords(records) {
    // Group by category, respecting the predefined order
    const groups = {};
    _MR_CATEGORIES.forEach(c => { groups[c.name] = []; });
    records.forEach(r => {
      const cat = (r.category && groups[r.category] !== undefined) ? r.category : 'Autre';
      groups[cat].push(r);
    });

    const categoryBlocks = _MR_CATEGORIES.map(cat => {
      const list = groups[cat.name];
      if (!list.length) return '';

      const cards = list.map(r => {
        const dateStr = r.updated_at
          ? new Date(r.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
          : '';
        const safeCategory = _escape(r.category || 'Autre').replace(/'/g, "\\'");
        const safeName     = _escape(r.exercise_name).replace(/'/g, "\\'");
        const editAttrs = _isOwnProfile
          ? `onclick="ProfilePage.showEditRecordForm(${r.id}, '${safeName}', ${r.sets}, ${r.weight_kg}, '${safeCategory}')"`
          : '';
        const delAttrs = _isOwnProfile
          ? `onclick="ProfilePage.deleteRecord(${r.id})"`
          : '';
        const weightFmt = r.weight_kg % 1 === 0 ? r.weight_kg : r.weight_kg.toFixed(1);
        return `
          <div class="mr2-card">
            <div class="mr2-card-left">
              <div class="mr2-exercise-name">${_escape(r.exercise_name)}</div>
              ${dateStr ? `<div class="mr2-date">${dateStr}</div>` : ''}
            </div>
            <div class="mr2-card-right">
              <span class="mr2-badge mr2-badge-sets">🔁 ${r.sets} série${r.sets > 1 ? 's' : ''}</span>
              <span class="mr2-badge mr2-badge-weight">${weightFmt} kg</span>
              ${_isOwnProfile ? `
              <div class="mr2-actions">
                <button class="mr-btn-icon" title="Modifier" ${editAttrs}>✏️</button>
                <button class="mr-btn-icon mr-btn-del" title="Supprimer" ${delAttrs}>🗑️</button>
              </div>` : ''}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="mr2-group">
          <div class="mr2-group-header" style="--cat-color:${cat.color}">
            <span class="mr2-group-icon">${cat.icon}</span>
            <span class="mr2-group-name">${cat.name}</span>
            <span class="mr2-group-count">${list.length}</span>
          </div>
          <div class="mr2-group-cards">${cards}</div>
        </div>`;
    }).join('');

    const empty = records.length === 0
      ? `<p class="muscle-records-empty">Aucun record pour l'instant 💪<br><span style="font-size:12px;color:var(--text3)">Clique sur + pour en ajouter</span></p>`
      : '';

    const catOptions = _MR_CATEGORIES.map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    return `
      <div class="profile-section" id="muscle-records-section" style="animation:fadeIn 0.3s ease 0.22s both">
        <div class="muscle-records-title-row">
          <div class="profile-section-title" style="margin-bottom:0">🏋️ Records Muscu</div>
          ${_isOwnProfile ? `<button class="icon-btn mr-plus-btn" onclick="ProfilePage.showAddRecordForm()" title="Ajouter un record">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>` : ''}
        </div>

        <div id="muscle-record-form" style="display:none" class="muscle-record-form">
          <input id="mr-name" class="mr-input" type="text" placeholder="Exercice (ex: Développé couché haltères)" autocomplete="off" maxlength="100" />
          <select id="mr-category" class="mr-input mr-select">${catOptions}</select>
          <div class="mr-row">
            <div class="mr-field">
              <label class="mr-label">Séries</label>
              <input id="mr-sets" class="mr-input" type="number" min="1" max="100" placeholder="7" />
            </div>
            <div class="mr-field">
              <label class="mr-label">Poids (kg)</label>
              <input id="mr-weight" class="mr-input" type="number" min="0" step="0.5" placeholder="36" />
            </div>
          </div>
          <div id="mr-form-error" class="mr-form-error"></div>
          <div class="mr-form-actions">
            <button class="mr-save-btn" onclick="ProfilePage.saveRecord()">Enregistrer</button>
            <button class="mr-cancel-btn" onclick="ProfilePage.cancelRecordForm()">Annuler</button>
          </div>
          <input type="hidden" id="mr-editing-id" value="" />
        </div>

        ${empty}
        <div id="muscle-records-list">
          ${categoryBlocks}
        </div>
      </div>`;
  }

  // ── Muscle records interaction ───────────────────────────────
  function showAddRecordForm() {
    const form = document.getElementById('muscle-record-form');
    if (!form) return;
    document.getElementById('mr-name').value             = '';
    document.getElementById('mr-category').value         = 'Poitrine';
    document.getElementById('mr-sets').value             = '';
    document.getElementById('mr-weight').value           = '';
    document.getElementById('mr-editing-id').value       = '';
    document.getElementById('mr-form-error').textContent = '';
    form.style.display = 'block';
    setTimeout(() => document.getElementById('mr-name').focus(), 50);
  }

  function showEditRecordForm(id, name, sets, weight, category) {
    const form = document.getElementById('muscle-record-form');
    if (!form) return;
    document.getElementById('mr-name').value             = name;
    document.getElementById('mr-category').value         = category || 'Autre';
    document.getElementById('mr-sets').value             = sets;
    document.getElementById('mr-weight').value           = weight;
    document.getElementById('mr-editing-id').value       = id;
    document.getElementById('mr-form-error').textContent = '';
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelRecordForm() {
    const form = document.getElementById('muscle-record-form');
    if (form) form.style.display = 'none';
  }

  async function saveRecord() {
    const name     = (document.getElementById('mr-name').value || '').trim();
    const category = document.getElementById('mr-category').value;
    const sets     = parseInt(document.getElementById('mr-sets').value, 10);
    const weight   = parseFloat(document.getElementById('mr-weight').value);
    const errEl    = document.getElementById('mr-form-error');

    if (!name) { errEl.textContent = 'Nom de l\'exercice requis'; return; }
    if (!sets || sets < 1) { errEl.textContent = 'Nombre de séries invalide'; return; }
    if (isNaN(weight) || weight < 0) { errEl.textContent = 'Poids invalide'; return; }

    const btn = document.querySelector('.mr-save-btn');
    if (btn) btn.disabled = true;
    errEl.textContent = '';
    try {
      await API.saveMuscleRecord(_profileUserId, { exercise_name: name, sets, weight_kg: weight, category });
      await _refreshMuscleRecords();
    } catch (err) {
      errEl.textContent = err.message || 'Erreur lors de la sauvegarde';
      if (btn) btn.disabled = false;
    }
  }

  async function deleteRecord(id) {
    try {
      await API.deleteMuscleRecord(_profileUserId, id);
      await _refreshMuscleRecords();
    } catch (err) {
      console.error(err);
    }
  }

  async function _refreshMuscleRecords() {
    const { records } = await API.getMuscleRecords(_profileUserId);
    const section = document.getElementById('muscle-records-section');
    if (!section) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _renderMuscleRecords(records);
    section.replaceWith(tmp.firstElementChild);
    // Stay on the records tab after refresh
    switchTab('records');
  }

  return { render, init, switchTab, showAddRecordForm, showEditRecordForm, cancelRecordForm, saveRecord, deleteRecord };
})();

