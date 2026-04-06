// ── Mini-jeu : La Barre Parfaite ─────────────────────────────
// Easter egg : taper 5x vite sur le logo
// 3 niveaux par jour (Facile / Moyen / Difficile) · 1 essai chacun · 💎×1 par niveau gagné
const MiniGame = (() => {
  let _rafId        = null;
  let _startTime    = null;
  let _resolved     = false;
  let _currentLevel = null;
  let _levelsStatus = null; // { easy: null|true|false, medium: null|true|false, hard: null|true|false }

  const LEVELS = {
    easy:   { label: 'Facile',     emoji: '🟢', greenHalf: 18, dMin: 2400, dMax: 2800, color: '#22d18b' },
    medium: { label: 'Moyen',      emoji: '🟡', greenHalf: 11, dMin: 1700, dMax: 2000, color: '#fbbf24' },
    hard:   { label: 'Difficile',  emoji: '🔴', greenHalf:  6, dMin:  950, dMax: 1250, color: '#e94560' },
  };

  function _getOverlay() { return document.getElementById('mg-overlay'); }

  // ─── Ouvrir le jeu ───────────────────────────────────────
  async function open() {
    if (_getOverlay()) return;
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (!me.id) return;
    try {
      const status = await API.getMinigameStatus(me.id);
      _levelsStatus = status.levels;
      const allPlayed = Object.values(_levelsStatus).every(v => v !== null);
      if (allPlayed) { _buildAllDoneScreen(status.tokens); return; }
      _buildLevelSelect(status.tokens);
    } catch (_) {
      _levelsStatus = { easy: null, medium: null, hard: null };
      _buildLevelSelect(0);
    }
  }

  // ─── Écran "tout joué" ────────────────────────────────────
  function _buildAllDoneScreen(tokens) {
    const wons = Object.values(_levelsStatus).filter(v => v === true).length;
    _buildOverlay(`
      <div class="mg-handle"></div>
      <div class="mg-title">🎯 La Barre Parfaite</div>
      <div class="mg-already">
        <div class="mg-already-icon">${['😅','💎','💎💎','💎💎💎'][wons]}</div>
        <div class="mg-already-text">
          ${wons > 0
            ? `${wons} gemme${wons > 1 ? 's' : ''} gagnée${wons > 1 ? 's' : ''} aujourd'hui !<br><span class="mg-token-count">${tokens} gemme${tokens > 1 ? 's' : ''} au total</span>`
            : `Tu as joué les 3 niveaux.<br>Reviens demain !`}
        </div>
        <div class="mg-level-recap">
          ${['easy','medium','hard'].map(k => {
            const lvl = LEVELS[k];
            const w = _levelsStatus[k];
            return `<span class="mg-recap-pill" style="--lvl:${lvl.color}">${lvl.emoji} ${lvl.label} ${w === true ? '💎' : w === false ? '✗' : '–'}</span>`;
          }).join('')}
        </div>
      </div>
      <button class="mg-close-btn" onclick="MiniGame.close()">Fermer</button>
    `);
  }

  // ─── Sélection de niveau ──────────────────────────────────
  function _buildLevelSelect(tokens) {
    const gemsWon = Object.values(_levelsStatus).filter(v => v === true).length;
    const gemsStr = gemsWon > 0 ? `<div class="mg-gems-today">${'💎'.repeat(gemsWon)} ${gemsWon} gemme${gemsWon > 1 ? 's' : ''} aujourd'hui</div>` : '';
    _buildOverlay(`
      <div class="mg-handle"></div>
      <div class="mg-title">🎯 La Barre Parfaite</div>
      <div class="mg-subtitle">Jusqu'à 💎×3 par jour — 1 essai par niveau</div>
      ${gemsStr}
      <div class="mg-level-grid">
        ${['easy','medium','hard'].map(key => {
          const lvl = LEVELS[key];
          const played   = _levelsStatus[key] !== null;
          const won      = _levelsStatus[key] === true;
          return `
          <div class="mg-level-card${played ? ' mg-level-done' : ' mg-level-available'}"
               style="--lvl-color:${lvl.color}"
               ${!played ? `onclick="MiniGame.startLevel('${key}')"` : ''}>
            <span class="mg-level-emoji">${lvl.emoji}</span>
            <span class="mg-level-name">${lvl.label}</span>
            ${played
              ? `<span class="mg-level-result">${won ? '💎' : '✗'}</span>`
              : `<span class="mg-level-reward">💎 ×1</span>`}
          </div>`;
        }).join('')}
      </div>
      <button class="mg-close-btn" onclick="MiniGame.close()">Fermer</button>
    `);
  }

  // ─── Construire l'overlay (shell réutilisable) ────────────
  function _buildOverlay(innerHtml) {
    const existing = _getOverlay();
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id        = 'mg-overlay';
    overlay.className = 'mg-overlay';
    overlay.innerHTML = `<div class="mg-sheet" onclick="event.stopPropagation()">${innerHtml}</div>`;
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('mg-visible'));
  }

  // ─── Lancer un niveau ────────────────────────────────────
  function startLevel(levelKey) {
    _currentLevel = levelKey;
    _resolved     = false;
    const lvl     = LEVELS[levelKey];
    const overlay = _getOverlay();
    if (!overlay) return;
    const sheet = overlay.querySelector('.mg-sheet');
    sheet.innerHTML = `
      <div class="mg-handle"></div>
      <div class="mg-title" style="color:${lvl.color}">${lvl.emoji} ${lvl.label}</div>
      <div class="mg-subtitle">Arrête la barre dans la zone verte !</div>
      <div class="mg-track-wrap">
        <div class="mg-track" id="mg-track">
          <div class="mg-zone-green" id="mg-zone"
               style="left:calc(50% - ${lvl.greenHalf}%);width:${lvl.greenHalf * 2}%;
                      background:${lvl.color}33;border-color:${lvl.color}88"></div>
          <div class="mg-bar" id="mg-bar" style="background:${lvl.color};box-shadow:0 0 12px ${lvl.color}"></div>
        </div>
      </div>
      <div class="mg-tap-hint">Tape n'importe où !</div>
      <div id="mg-result" class="mg-result" style="display:none"></div>
      <button class="mg-close-btn" id="mg-close-btn" style="display:none" onclick="MiniGame.close()">Fermer</button>
    `;
    // Tap on sheet = resolve (game mode)
    sheet.addEventListener('click', _onTap, { once: false });
    overlay.removeEventListener('click', close);
    _startAnimation(lvl);
  }

  // ─── Animation RAF ────────────────────────────────────────
  function _startAnimation(lvl) {
    _startTime = null;
    const dur  = lvl.dMin + Math.random() * (lvl.dMax - lvl.dMin);
    function frame(ts) {
      if (_resolved) return;
      if (!_startTime) _startTime = ts;
      const bar = document.getElementById('mg-bar');
      if (!bar) return;
      const raw = (Math.sin(((ts - _startTime) / dur) * Math.PI * 2) + 1) / 2;
      bar.style.left = `${4 + raw * 92}%`;
      _rafId = requestAnimationFrame(frame);
    }
    _rafId = requestAnimationFrame(frame);
  }

  // ─── Tap pour stopper ─────────────────────────────────────
  function _onTap(e) {
    if (_resolved) return;
    if (e.target.closest('#mg-close-btn') || e.target.closest('.mg-level-card') || e.target.closest('.mg-close-btn')) return;
    _resolve();
  }

  async function _resolve() {
    if (_resolved) return;
    _resolved = true;
    cancelAnimationFrame(_rafId);

    const lvl  = LEVELS[_currentLevel];
    const bar  = document.getElementById('mg-bar');
    const hint = document.querySelector('.mg-tap-hint');
    if (!bar) return;

    const pct = parseFloat(bar.style.left) || 50;
    const won = pct >= (50 - lvl.greenHalf) && pct <= (50 + lvl.greenHalf);

    if (hint) hint.style.display = 'none';
    bar.classList.add(won ? 'mg-bar-win' : 'mg-bar-lose');
    if (won) bar.style.background = '#22d18b';
    const zone = document.getElementById('mg-zone');
    if (zone) zone.classList.add(won ? 'mg-zone-flash-win' : 'mg-zone-flash-lose');

    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    let tokens = null;
    try {
      const res = await API.postMinigameResult(me.id, won, _currentLevel);
      tokens = res.tokens;
      _levelsStatus[_currentLevel] = won;
    } catch (_) { _levelsStatus[_currentLevel] = won; }

    setTimeout(() => {
      const resultEl = document.getElementById('mg-result');
      const closeBtn = document.getElementById('mg-close-btn');
      if (resultEl) {
        resultEl.style.display = 'block';
        if (won) {
          resultEl.innerHTML = `<span class="mg-result-win">💎 +1 Gemme !</span>${tokens !== null ? `<br><span class="mg-result-total">${tokens} gemme${tokens > 1 ? 's' : ''} au total</span>` : ''}`;
          Gamification.launchConfetti(20);
        } else {
          const diff = Math.abs(pct - 50).toFixed(0);
          resultEl.innerHTML = `<span class="mg-result-lose">😬 Raté de ${diff}% !</span>`;
        }
      }
      if (closeBtn) {
        const remaining = Object.keys(_levelsStatus).filter(k => _levelsStatus[k] === null);
        closeBtn.style.display = 'block';
        if (remaining.length > 0) {
          closeBtn.textContent = '↩️ Autres niveaux';
          closeBtn.onclick = () => _buildLevelSelect(tokens ?? 0);
        } else {
          closeBtn.textContent = 'Fermer';
          closeBtn.onclick = MiniGame.close;
        }
      }
    }, 600);
  }

  // ─── Fermer ───────────────────────────────────────────────
  function close() {
    cancelAnimationFrame(_rafId);
    _resolved = true;
    const overlay = _getOverlay();
    if (!overlay) return;
    overlay.classList.remove('mg-visible');
    setTimeout(() => overlay.remove(), 300);
  }

  return { open, close, startLevel };
})();
