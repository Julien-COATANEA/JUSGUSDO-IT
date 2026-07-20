// ── Login / Register page ────────────────────────────────────
const LoginPage = (() => {
  function render() {
    return `
      <div class="login-page">
        <div class="login-container">
          <div class="login-header">
            <div class="logo">💪</div>
            <h1>JuGus Do-It</h1>
            <p class="tagline">Connecte-toi pour commencer</p>
          </div>

          <div class="auth-tabs">
            <button class="auth-tab active" id="tab-login" onclick="LoginPage.switchTab('login')">Connexion</button>
            <button class="auth-tab" id="tab-register" onclick="LoginPage.switchTab('register')">Créer un compte</button>
          </div>

          <div id="auth-form-container">
            ${renderLoginForm()}
          </div>
        </div>
      </div>
    `;
  }

  function renderLoginForm() {
    return `
      <form class="auth-form" id="auth-form" onsubmit="LoginPage.submitLogin(event)">
        <div class="form-group">
          <label>Nom d'utilisateur</label>
          <input type="text" id="f-username" placeholder="tonpseudo" autocomplete="username" required />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input type="password" id="f-password" placeholder="••••••" autocomplete="current-password" required />
        </div>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:var(--text2);font-weight:500;">
          <input type="checkbox" id="f-remember" checked style="width:17px;height:17px;accent-color:var(--accent3);cursor:pointer;" />
          Se souvenir de moi
        </label>
        <p class="form-error" id="form-error"></p>
        <button type="submit" class="submit-btn" id="submit-btn">Se connecter</button>
        <button type="button" class="auth-link-btn" onclick="LoginPage.showForgotPassword()">Mot de passe oublié ?</button>
      </form>
    `;
  }

  function renderForgotPasswordForm() {
    return `
      <div class="auth-form" id="auth-form">
        <p style="text-align:center;color:var(--text2);font-size:13px;margin-bottom:14px">
          Entre ton pseudo, le mot de passe deviendra <strong>reset123</strong>.
        </p>
        <div class="form-group">
          <label>Nom d'utilisateur</label>
          <input type="text" id="f-username" placeholder="tonpseudo" autocomplete="username" required />
        </div>
        <p class="form-error" id="form-error"></p>
        <p class="form-success" id="form-success" style="display:none"></p>
        <button type="button" class="submit-btn" id="submit-btn" onclick="LoginPage.submitForgotPassword()">Réinitialiser le mot de passe</button>
        <button type="button" class="auth-link-btn" onclick="LoginPage.switchTab('login')">← Retour à la connexion</button>
      </div>
    `;
  }

  function renderRegisterForm() {
    return `
      <form class="auth-form" id="auth-form" onsubmit="LoginPage.submitRegister(event)">
        <div class="form-group">
          <label>Nom d'utilisateur</label>
          <input type="text" id="f-username" placeholder="tonpseudo" autocomplete="username" required minlength="3" />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input type="password" id="f-password" placeholder="••••••" autocomplete="new-password" required minlength="6" />
        </div>
        <div class="form-group">
          <label>Confirmer le mot de passe</label>
          <input type="password" id="f-password2" placeholder="••••••" autocomplete="new-password" required minlength="6" />
        </div>
        <p class="form-error" id="form-error"></p>
        <button type="submit" class="submit-btn" id="submit-btn">Créer mon compte</button>
      </form>
    `;
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById('auth-form-container').innerHTML =
      tab === 'login' ? renderLoginForm() : renderRegisterForm();
  }

  function setLoading(loading) {
    const btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = loading;
    if (btn) btn.textContent = loading ? 'Chargement...' : (
      document.getElementById('tab-register')?.classList.contains('active')
        ? 'Créer mon compte' : 'Se connecter'
    );
  }

  function showError(msg) {
    const el = document.getElementById('form-error');
    if (el) el.textContent = msg;
  }

  async function submitLogin(e) {
    e.preventDefault();
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    const remember = document.getElementById('f-remember')?.checked !== false;
    setLoading(true);
    showError('');
    try {
      const data = await API.login(username, password);
      _saveSession(data, remember);
      Router.navigate('app');
    } catch (err) {
      showError(err.message);
      setLoading(false);
    }
  }

  async function submitRegister(e) {
    e.preventDefault();
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    const password2 = document.getElementById('f-password2').value;
    if (password !== password2) {
      showError('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    showError('');
    try {
      const data = await API.register(username, password);
      _saveSession(data, true); // always remember on register
      Router.navigate('app');
    } catch (err) {
      showError(err.message);
      setLoading(false);
    }
  }

  function showForgotPassword() {
    document.getElementById('auth-form-container').innerHTML = renderForgotPasswordForm();
  }

  async function submitForgotPassword() {
    const username = document.getElementById('f-username').value.trim();
    if (!username) { showError("Entre ton nom d'utilisateur"); return; }
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Réinitialisation…';
    showError('');
    try {
      const data = await API.resetPassword(username);
      const successEl = document.getElementById('form-success');
      if (successEl) {
        successEl.style.display = 'block';
        successEl.innerHTML = `✅ Mot de passe réinitialisé !<br>Connecte-toi avec <strong>${data.newPassword}</strong>`;
      }
      btn.style.display = 'none';
      const container = document.getElementById('auth-form');
      if (container) {
        const loginBtn = document.createElement('button');
        loginBtn.type = 'button';
        loginBtn.className = 'submit-btn';
        loginBtn.textContent = 'Aller à la connexion';
        loginBtn.onclick = () => LoginPage.switchTab('login');
        container.appendChild(loginBtn);
      }
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Réinitialiser le mot de passe';
    }
  }

  function _saveSession(data, remember) {
    const storage = remember ? localStorage : sessionStorage;
    if (!remember) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    storage.setItem('token', data.token);
    storage.setItem('user', JSON.stringify(data.user));
  }

  return { render, switchTab, submitLogin, submitRegister, showForgotPassword, submitForgotPassword };
})();
window.LoginPage = LoginPage;
