// ── Muscu page (personal strength records) ──────────────────
const MuscuPage = (() => {
  let _userId = null;

  // ── Session definitions ──────────────────────────────────
  const _MUSCU_SESSIONS = [
    {
      name: 'Pecs Triceps', icon: '💪', color: '#e94560',
      exercises: [
        'Développé Couché Haltères','Développé Couché Barres','Développé Couché Incliné',
        'Écarté Poulie','Triceps Corde (extension poulie basse)',
        'Triceps Corde (extension poulie haute)','Dips',
      ],
    },
    {
      name: 'Dos Biceps', icon: '🏋️', color: '#7c5cbf',
      exercises: [
        'Tirage Bucheron','Tirage Verticale','Tirage Horizontale','Traction',
        'Curl Haltère','Curl Barre','Curl Marteau',
      ],
    },
    {
      name: 'Jambes', icon: '🦵', color: '#22d18b',
      exercises: [
        'Ischios Assis','Leg Extension','Presses','Adducteurs','Fentes','Squats','Mollets',
      ],
    },
    {
      name: 'Full', icon: '⚡', color: '#fbbf24',
      exercises: [
        'Développé Couché Barre','Traction','Triceps Corde / Élévation Latérale','Épaules','Curl Haltère',
      ],
    },
  ];

  const _MR_CATEGORIES = _MUSCU_SESSIONS.map(s => ({ name: s.name, icon: s.icon, color: s.color }));

  function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Render shell ─────────────────────────────────────────
  function render() {
    return `
      <div class="app-page">
        <header class="app-header">
          <div class="header-info" style="flex:1">
            <span class="header-username">Muscu</span>
            <span class="header-rank" id="muscu-header-sub">Chargement…</span>
          </div>
          <button class="icon-btn muscu-add-top-btn" onclick="MuscuPage.showAddRecordForm()" title="Ajouter un record">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </header>
        <div id="muscu-content" style="padding:0 0 100px">
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="skeleton-card" style="height:60px"></div>
            <div class="skeleton-card" style="height:80px"></div>
            <div class="skeleton-card" style="height:80px"></div>
            <div class="skeleton-card" style="height:80px"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    _userId = currentUser.id;

    const container = document.getElementById('muscu-content');
    if (!container) return;

    try {
      const [{ records }, histRes] = await Promise.all([
        API.getMuscleRecords(_userId),
        API.getMuscleHistory(_userId, '').catch(() => ({ history: [] })),
      ]);
      const muscleHistory = histRes.history || [];

      // Update subtitle
      const totalPRs = records.length;
      const sub = document.getElementById('muscu-header-sub');
      if (sub) sub.textContent = `${totalPRs} record${totalPRs !== 1 ? 's' : ''} enregistré${totalPRs !== 1 ? 's' : ''}`;

      container.innerHTML = _renderPage(records, muscleHistory);
    } catch (err) {
      console.error('[Muscu]', err);
      container.innerHTML = `<p style="color:var(--text3);text-align:center;padding:40px 16px">Erreur de chargement</p>`;
    }
  }

  // ── Main renderer ─────────────────────────────────────────
  function _renderPage(records, muscleHistory) {
    // Build history lookup by name
    const historyByName = {};
    muscleHistory
      .slice()
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      .forEach(h => {
        const key = h.exercise_name.toLowerCase();
        if (!historyByName[key]) historyByName[key] = [];
        historyByName[key].push(h);
      });

    // Summary stats
    const totalPRs    = records.length;
    const totalExs    = _MUSCU_SESSIONS.reduce((n, s) => n + s.exercises.length, 0);
    const sessionExNames = new Set();
    _MUSCU_SESSIONS.forEach(s => s.exercises.forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const customCount = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase())).length;

    return `
      <div class="muscu-pg-summary">
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${totalPRs}</span>
          <span class="muscu-pg-stat-lbl">Records</span>
        </div>
        <div class="muscu-pg-sep"></div>
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${_MUSCU_SESSIONS.length}</span>
          <span class="muscu-pg-stat-lbl">Séances</span>
        </div>
        <div class="muscu-pg-sep"></div>
        <div class="muscu-pg-stat">
          <span class="muscu-pg-stat-val">${totalExs > 0 ? Math.round((totalPRs - customCount) / totalExs * 100) : 0}%</span>
          <span class="muscu-pg-stat-lbl">Complété</span>
        </div>
      </div>

      <div style="padding:4px 16px 20px">
        ${_renderMuscuSessions(records, historyByName)}
        ${_renderCustomSection(records)}
      </div>

      ${_renderFormModal()}
    `;
  }

  // ── Sparkline ─────────────────────────────────────────────
  function _renderSparkline(historyPoints) {
    if (!historyPoints || historyPoints.length < 2) return '';
    const vals = historyPoints.map(h => h.weight_kg);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const W = 60, H = 18, range = maxV - minV || 1;
    const pts = vals.map((v, i) => {
      const x = Math.round((i / (vals.length - 1)) * W);
      const y = Math.round(H - ((v - minV) / range) * H);
      return `${x},${y}`;
    }).join(' ');
    const delta = vals[vals.length - 1] - vals[0];
    const color = delta > 0 ? '#22d18b' : delta < 0 ? '#ef4444' : 'var(--text3)';
    return `<span class="muscu-sparkline" title="Progression">
      <svg width="${W}" height="${H + 2}" viewBox="0 0 ${W} ${H + 2}" style="display:block">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      </svg>
      <span class="muscu-sparkline-delta" style="color:${color}">${delta > 0 ? '+' : ''}${delta}\u202fkg</span>
    </span>`;
  }

  // ── Session accordions ────────────────────────────────────
  function _renderMuscuSessions(records, historyByName) {
    const recMap = {};
    records.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!recMap[key]) recMap[key] = [];
      recMap[key].push(r);
    });

    return `
      <div class="muscu-sessions-label">📋 Programme des séances</div>
      <div class="muscu-sessions">
        ${_MUSCU_SESSIONS.map((session, idx) => {
          const recCount = session.exercises.filter(ex => (recMap[ex.toLowerCase()] || []).length > 0).length;
          return `
          <div class="muscu-session-card" id="mscard-${idx}" style="--session-color:${session.color}">
            <div class="muscu-session-header" onclick="this.closest('.muscu-session-card').classList.toggle('open')">
              <div class="muscu-session-icon-wrap">
                <span class="muscu-session-icon">${session.icon}</span>
              </div>
              <div class="muscu-session-title-block">
                <span class="muscu-session-name">${session.name}</span>
                <span class="muscu-session-sub">${session.exercises.length} exercices</span>
              </div>
              ${recCount > 0
                ? `<span class="muscu-session-recs" style="color:${session.color};background:color-mix(in srgb,${session.color} 15%,transparent)">${recCount}/${session.exercises.length} PR</span>`
                : `<span class="muscu-session-count">${session.exercises.length}</span>`}
              <span class="muscu-session-chevron">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
            <div class="muscu-session-body">
              <div class="muscu-session-body-inner">
                ${session.exercises.map(ex => {
                  const recs    = recMap[ex.toLowerCase()] || [];
                  const safeEx  = _escape(ex).replace(/'/g, "\\'");
                  const safeCat = _escape(session.name).replace(/'/g, "\\'");

                  const recordsHtml = recs.map(rec => {
                    const wFmt  = rec.weight_kg % 1 === 0 ? rec.weight_kg : rec.weight_kg.toFixed(1);
                    const dStr  = rec.updated_at
                      ? new Date(rec.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                      : null;
                    return `
                    <div class="muscu-ex-record-row">
                      <div class="muscu-ex-tags">
                        <span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.sets}</span> série${rec.sets > 1 ? 's' : ''}</span>
                        ${rec.reps != null ? `<span class="muscu-ex-tag"><span class="muscu-ex-tag-val">${rec.reps}</span> rép.</span>` : ''}
                        <span class="muscu-ex-tag weight"><span class="muscu-ex-tag-val">${wFmt}</span> kg</span>
                        ${dStr ? `<span class="muscu-ex-tag date">${dStr}</span>` : ''}
                      </div>
                      <div class="mr2-actions">
                        <button class="mr-btn-icon" title="Modifier" onclick="event.stopPropagation();MuscuPage.showEditRecordForm(${rec.id},'${safeEx}',${rec.sets},${rec.reps != null ? rec.reps : 'null'},${rec.weight_kg},'${safeCat}')">✏️</button>
                        <button class="mr-btn-icon mr-btn-del" title="Supprimer" onclick="event.stopPropagation();MuscuPage.deleteRecord(${rec.id})">🗑️</button>
                      </div>
                    </div>`;
                  }).join('');

                  return `
                  <div class="muscu-ex-row${recs.length > 0 ? ' has-record' : ''}">
                    <div class="muscu-ex-left">
                      <div class="muscu-ex-name-row">
                        <span class="muscu-ex-name">${_escape(ex)}</span>
                        ${historyByName[ex.toLowerCase()]?.length >= 2 ? _renderSparkline(historyByName[ex.toLowerCase()]) : ''}
                        <button class="mr-btn-icon mr-btn-add" title="Ajouter un record" onclick="event.stopPropagation();MuscuPage.openSessionRecord('${safeEx}','${safeCat}')">＋</button>
                      </div>
                      ${recs.length > 0 ? recordsHtml : `<span class="muscu-ex-empty">Aucun record</span>`}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // ── Custom exercises section ──────────────────────────────
  function _renderCustomSection(records) {
    const sessionExNames = new Set();
    _MUSCU_SESSIONS.forEach(s => s.exercises.forEach(ex => sessionExNames.add(ex.toLowerCase())));
    const extraRecords = records.filter(r => !sessionExNames.has(r.exercise_name.toLowerCase()));

    const extraByName = {};
    extraRecords.forEach(r => {
      const key = r.exercise_name.toLowerCase();
      if (!extraByName[key]) extraByName[key] = { name: r.exercise_name, category: r.category, records: [] };
      extraByName[key].records.push(r);
    });
    const extraGroups = Object.values(extraByName);

    const catOptions = _MR_CATEGORIES.map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    let extraHtml = '';
    if (extraGroups.length > 0) {
      const items = extraGroups.map(group => {
        const safeCategory = _escape(group.category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name).replace(/'/g, "\\'");
        const safeName     = _escape(group.name).replace(/'/g, "\\'");
        const rowsHtml = group.records.map(r => {
          const wFmt  = r.weight_kg % 1 === 0 ? r.weight_kg : r.weight_kg.toFixed(1);
          const rCat  = _escape(r.category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name).replace(/'/g, "\\'");
          return `
          <div class="mr2-card">
            <div class="mr2-card-left">
              <span class="mr2-badge mr2-badge-sets">🔁 ${r.sets} série${r.sets > 1 ? 's' : ''}${r.reps != null ? ` · ${r.reps} rép` : ''}</span>
              <span class="mr2-badge mr2-badge-weight">${wFmt} kg</span>
            </div>
            <div class="mr2-actions">
              <button class="mr-btn-icon" onclick="MuscuPage.showEditRecordForm(${r.id},'${safeName}',${r.sets},${r.reps != null ? r.reps : 'null'},${r.weight_kg},'${rCat}')">✏️</button>
              <button class="mr-btn-icon mr-btn-del" onclick="MuscuPage.deleteRecord(${r.id})">🗑️</button>
            </div>
          </div>`;
        }).join('');
        return `
          <div class="mr2-exercise-group">
            <div class="mr2-exercise-name-row">
              <span class="mr2-exercise-name">${_escape(group.name)}</span>
              <button class="mr-btn-icon mr-btn-add" onclick="MuscuPage.openSessionRecord('${safeName}','${safeCategory}')">＋</button>
            </div>
            ${rowsHtml}
          </div>`;
      }).join('');

      extraHtml = `
        <div class="mr2-group" style="margin-top:8px">
          <div class="mr2-group-header" style="--cat-color:var(--text3)">
            <span class="mr2-group-icon">🎯</span>
            <span class="mr2-group-name">Personnalisés</span>
            <span class="mr2-group-count">${extraGroups.length}</span>
          </div>
          <div class="mr2-group-cards">${items}</div>
        </div>`;
    }

    return `
      <div class="muscle-records-title-row" style="margin-top:20px">
        <div class="profile-section-title" style="margin-bottom:0;font-size:11px">Exercice personnalisé</div>
        <button class="icon-btn mr-plus-btn" onclick="MuscuPage.showAddRecordForm()" title="Ajouter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      ${extraHtml}
      <input type="hidden" id="mr-cat-options-src" data-html="${_escape(catOptions)}" />`;
  }

  // ── Form modal ────────────────────────────────────────────
  function _renderFormModal() {
    const catOptions = _MR_CATEGORIES.map(c =>
      `<option value="${c.name}">${c.icon} ${c.name}</option>`
    ).join('');

    return `
      <div id="mr-modal-overlay" class="mr-modal-overlay" style="display:none" onclick="MuscuPage.cancelRecordForm()">
        <div class="mr-sheet" onclick="event.stopPropagation()">
          <div class="mr-sheet-handle"></div>
          <div class="mr-sheet-header">
            <div class="mr-sheet-exercise" id="mr-form-context">Record</div>
            <div class="mr-sheet-date" id="mr-form-date"></div>
          </div>
          <input id="mr-name" type="text" class="mr-input mr-name-input" placeholder="Nom de l'exercice" autocomplete="off" maxlength="100" />
          <select id="mr-category" class="mr-input mr-select">${catOptions}</select>
          <div class="mr-big-row">
            <div class="mr-big-group">
              <div class="mr-big-label">Séries</div>
              <input id="mr-sets" class="mr-big-input" type="number" min="1" max="100" placeholder="4" inputmode="numeric" />
            </div>
            <div class="mr-big-divider"></div>
            <div class="mr-big-group">
              <div class="mr-big-label">Répétitions</div>
              <input id="mr-reps" class="mr-big-input" type="number" min="1" max="9999" placeholder="10" inputmode="numeric" />
            </div>
            <div class="mr-big-divider"></div>
            <div class="mr-big-group">
              <div class="mr-big-label">Poids</div>
              <div class="mr-big-input-wrap">
                <input id="mr-weight" class="mr-big-input" type="number" min="0" step="0.5" placeholder="80" inputmode="decimal" />
                <span class="mr-big-unit">kg</span>
              </div>
            </div>
          </div>
          <div id="mr-form-error" class="mr-form-error"></div>
          <button class="mr-sheet-save-btn" onclick="MuscuPage.saveRecord()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Enregistrer le record
          </button>
          <button class="mr-sheet-cancel-btn" onclick="MuscuPage.cancelRecordForm()">Annuler</button>
          <input type="hidden" id="mr-editing-id" value="" />
        </div>
      </div>`;
  }

  // ── Form helpers ──────────────────────────────────────────
  function _todayLabel() {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function _openSheet() {
    const overlay = document.getElementById('mr-modal-overlay');
    if (!overlay) return;
    document.getElementById('mr-form-date').textContent = _todayLabel();
    document.getElementById('mr-form-error').textContent = '';
    const btn = overlay.querySelector('.mr-sheet-save-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer le record';
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function showAddRecordForm() {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = '+ Exercice personnalisé';
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = ''; nameEl.style.display = 'block'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = _MR_CATEGORIES[0].name; catEl.style.display = 'block'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-name')?.focus(), 300);
  }

  function showEditRecordForm(id, name, sets, reps, weight, category) {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = name;
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = name; nameEl.style.display = 'none'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = category || _MR_CATEGORIES[_MR_CATEGORIES.length - 1].name; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = sets;
    document.getElementById('mr-reps').value   = reps != null ? reps : '';
    document.getElementById('mr-weight').value = weight;
    document.getElementById('mr-editing-id').value = id;
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets')?.focus(), 300);
  }

  function cancelRecordForm() {
    const overlay = document.getElementById('mr-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function openSessionRecord(exerciseName, category) {
    const ctxEl = document.getElementById('mr-form-context');
    if (ctxEl) ctxEl.textContent = exerciseName;
    const nameEl = document.getElementById('mr-name');
    if (nameEl) { nameEl.value = exerciseName; nameEl.style.display = 'none'; }
    const catEl = document.getElementById('mr-category');
    if (catEl) { catEl.value = category || _MR_CATEGORIES[0].name; catEl.style.display = 'none'; }
    document.getElementById('mr-sets').value   = '';
    document.getElementById('mr-reps').value   = '';
    document.getElementById('mr-weight').value = '';
    document.getElementById('mr-editing-id').value = '';
    _openSheet();
    setTimeout(() => document.getElementById('mr-sets')?.focus(), 300);
  }

  async function saveRecord() {
    const name      = (document.getElementById('mr-name').value || '').trim();
    const category  = document.getElementById('mr-category').value;
    const sets      = parseInt(document.getElementById('mr-sets').value, 10);
    const repsRaw   = document.getElementById('mr-reps').value.trim();
    const reps      = repsRaw !== '' ? parseInt(repsRaw, 10) : null;
    const weight    = parseFloat(document.getElementById('mr-weight').value);
    const errEl     = document.getElementById('mr-form-error');
    const editingId = document.getElementById('mr-editing-id').value;

    if (!name)                { errEl.textContent = "Nom de l'exercice requis"; return; }
    if (!sets || sets < 1)    { errEl.textContent = 'Nombre de séries invalide'; return; }
    if (reps !== null && (isNaN(reps) || reps < 1)) { errEl.textContent = 'Répétitions invalides'; return; }
    if (isNaN(weight) || weight < 0) { errEl.textContent = 'Poids invalide'; return; }

    const btn = document.querySelector('.mr-sheet-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    errEl.textContent = '';

    try {
      if (editingId) {
        await API.updateMuscleRecord(_userId, editingId, { sets, reps, weight_kg: weight, notes: null, category });
      } else {
        await API.saveMuscleRecord(_userId, { exercise_name: name, sets, reps, weight_kg: weight, category });
      }
      cancelRecordForm();
      await _refresh();
    } catch (err) {
      errEl.textContent = err.message || 'Erreur';
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer le record';
      }
    }
  }

  async function deleteRecord(id) {
    try {
      await API.deleteMuscleRecord(_userId, id);
      await _refresh();
    } catch (err) {
      console.error(err);
      App.showToast('Erreur lors de la suppression');
    }
  }

  async function _refresh() {
    const [{ records }, histRes] = await Promise.all([
      API.getMuscleRecords(_userId),
      API.getMuscleHistory(_userId, '').catch(() => ({ history: [] })),
    ]);
    const muscleHistory = histRes.history || [];
    const container = document.getElementById('muscu-content');
    if (!container) return;

    const totalPRs = records.length;
    const sub = document.getElementById('muscu-header-sub');
    if (sub) sub.textContent = `${totalPRs} record${totalPRs !== 1 ? 's' : ''} enregistré${totalPRs !== 1 ? 's' : ''}`;

    container.innerHTML = _renderPage(records, muscleHistory);
  }

  return { render, init, showAddRecordForm, showEditRecordForm, cancelRecordForm, openSessionRecord, saveRecord, deleteRecord };
})();
