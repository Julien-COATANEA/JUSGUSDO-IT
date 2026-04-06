// ── Mini-jeu : La Barre Parfaite ─────────────────────────────
// Easter egg : taper 5x vite sur le logo
// 1 essai par jour — victoire = +1 jeton 🪙
const MiniGame = (() => {
  let _rafId       = null;
  let _startTime   = null;
  let _duration    = 2200;   // ms pour un aller-retour complet
  let _resolved    = false;

  // Largeur de la zone verte (en % de la piste)
  const GREEN_HALF = 12;    // ±12% autour du centre = 24% de zone verte

  function _getOverlay() { return document.getElementById('mg-overlay'); }

  // ─── Ouvrir le jeu ───────────────────────────────────────
  async function open() {
    if (_getOverlay()) return; // déjà ouvert

    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (!me.id) return;

    // Vérifier si déjà joué aujourd'hui
    try {
      const status = await API.getMinigameStatus(me.id);
      if (status.played_today) {
        _showAlreadyPlayed(status.won_today, status.tokens);
        return;
      }
    } catch (_) {}

    _build();
    _startAnimation();
  }

  function _showAlreadyPlayed(won, tokens) {
    const overlay = document.createElement('div');
    overlay.id = 'mg-overlay';
    overlay.className = 'mg-overlay';
    overlay.innerHTML = `
      <div class="mg-sheet" onclick="event.stopPropagation()">
        <div class="mg-handle"></div>
        <div class="mg-title">🎯 La Barre Parfaite</div>
        <div class="mg-already">
          <div class="mg-already-icon">${won ? '🪙' : '😅'}</div>
          <div class="mg-already-text">
            ${won
              ? `Tu as gagné aujourd'hui !<br><span class="mg-token-count">${tokens} jeton${tokens > 1 ? 's' : ''} 🪙</span>`
              : `Tu as déjà joué aujourd'hui.<br>Reviens demain !`}
          </div>
        </div>
        <button class="mg-close-btn" onclick="MiniGame.close()">Fermer</button>
      </div>`;
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('mg-visible'));
  }

  function _build() {
    _resolved = false;
    const overlay = document.createElement('div');
    overlay.id = 'mg-overlay';
    overlay.className = 'mg-overlay';
    overlay.innerHTML = `
      <div class="mg-sheet" onclick="event.stopPropagation()">
        <div class="mg-handle"></div>
        <div class="mg-title">🎯 La Barre Parfaite</div>
        <div class="mg-subtitle">Arrête la barre dans la zone verte !</div>
        <div class="mg-track-wrap">
          <div class="mg-track" id="mg-track">
            <div class="mg-zone-green" id="mg-zone"></div>
            <div class="mg-bar" id="mg-bar"></div>
          </div>
        </div>
        <div class="mg-tap-hint">Tape n'importe où !</div>
        <div id="mg-result" class="mg-result" style="display:none"></div>
        <button class="mg-close-btn" id="mg-close-btn" style="display:none" onclick="MiniGame.close()">Fermer</button>
      </div>`;
    overlay.addEventListener('click', _onTap);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('mg-visible'));
  }

  // ─── Animation RAF ────────────────────────────────────────
  function _startAnimation() {
    _startTime = null;
    // Vitesse aléatoire légèrement variable chaque partie
    _duration = 1800 + Math.random() * 800;

    function frame(ts) {
      if (_resolved) return;
      if (!_startTime) _startTime = ts;
      const bar = document.getElementById('mg-bar');
      if (!bar) return;

      const elapsed = ts - _startTime;
      // position 0→1 oscillant avec sin, centré à 0.5
      const raw = (Math.sin((elapsed / _duration) * Math.PI * 2) + 1) / 2;
      // laisser 4% de marge de chaque côté
      const pct = 4 + raw * 92;
      bar.style.left = `${pct}%`;
      _rafId = requestAnimationFrame(frame);
    }
    _rafId = requestAnimationFrame(frame);
  }

  // ─── Tap pour stopper ─────────────────────────────────────
  function _onTap(e) {
    if (_resolved) return;
    if (e.target.closest('#mg-close-btn')) return;
    _resolve();
  }

  async function _resolve() {
    if (_resolved) return;
    _resolved = true;
    cancelAnimationFrame(_rafId);

    const bar  = document.getElementById('mg-bar');
    const hint = document.querySelector('.mg-tap-hint');
    if (!bar) return;

    // Position actuelle de la barre (centre de la barre en %)
    const pct = parseFloat(bar.style.left) || 50;
    // Zone verte centrée à 50%, ±GREEN_HALF
    const won = pct >= (50 - GREEN_HALF) && pct <= (50 + GREEN_HALF);

    if (hint) hint.style.display = 'none';
    bar.classList.add(won ? 'mg-bar-win' : 'mg-bar-lose');

    const zone = document.getElementById('mg-zone');
    if (zone) zone.classList.add(won ? 'mg-zone-flash-win' : 'mg-zone-flash-lose');

    // Appel API
    const me = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    let tokens = null;
    try {
      const res = await API.postMinigameResult(me.id, won);
      tokens = res.tokens;
    } catch (_) {}

    // Afficher résultat
    setTimeout(() => {
      const resultEl = document.getElementById('mg-result');
      const closeBtn = document.getElementById('mg-close-btn');
      if (resultEl) {
        resultEl.style.display = 'block';
        if (won) {
          resultEl.innerHTML = `<span class="mg-result-win">🪙 +1 Jeton !</span>${tokens !== null ? `<br><span class="mg-result-total">${tokens} jeton${tokens > 1 ? 's' : ''} au total</span>` : ''}`;
          Gamification.launchConfetti(20);
        } else {
          const diff = Math.abs(pct - 50).toFixed(0);
          resultEl.innerHTML = `<span class="mg-result-lose">😬 Raté de ${diff}% !</span><br><span class="mg-result-total">Reviens demain !</span>`;
        }
      }
      if (closeBtn) closeBtn.style.display = 'block';
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

  return { open, close };
})();
