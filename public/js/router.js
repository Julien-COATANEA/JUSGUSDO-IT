// ── SPA Router ───────────────────────────────────────────────
const Router = (() => {
  const PAGES = {
    login:  { page: LoginPage,   requireAuth: false, requireAdmin: false },
    home:   { page: HomePage,    requireAuth: true,  requireAdmin: false },
    app:    { page: WorkoutPage, requireAuth: true,  requireAdmin: false },
    admin:  { page: AdminPage,   requireAuth: true,  requireAdmin: true  },
  };

  function isLoggedIn() {
    return !!localStorage.getItem('token');
  }

  function isAdmin() {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return !!u.is_admin;
  }

  function renderBottomNav(current) {
    const existing = document.getElementById('bottom-nav');
    if (existing) existing.remove();
    if (!isLoggedIn()) return;

    const u = JSON.parse(localStorage.getItem('user') || '{}');
    const items = [
      { route: 'home',  icon: '�', label: 'Équipe' },
      { route: 'app',   icon: '💪', label: 'Programme'  },
      ...(u.is_admin ? [{ route: 'admin', icon: '⚙️', label: 'Admin' }] : []),
    ];

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.id = 'bottom-nav';
    nav.innerHTML = items.map(item => `
      <button class="nav-item${current === item.route ? ' active' : ''}" onclick="Router.navigate('${item.route}')">
        <span class="nav-item-icon">${item.icon}</span>
        <span class="nav-item-label">${item.label}</span>
      </button>
    `).join('');
    document.body.appendChild(nav);
  }

  async function navigate(route) {
    const config = PAGES[route];
    if (!config) return navigate('login');

    if (config.requireAuth && !isLoggedIn()) return navigate('login');
    if (!config.requireAuth && isLoggedIn() && route === 'login') return navigate('home');
    if (config.requireAdmin && !isAdmin()) return navigate('home');

    const app = document.getElementById('app');
    app.innerHTML = config.page.render();

    if (config.page.init) {
      await config.page.init();
    }

    renderBottomNav(route);
  }

  // Bootstrap
  function start() {
    if (isLoggedIn()) {
      navigate('home');
    } else {
      navigate('login');
    }
  }

  return { navigate, start };
})();

// Start app
Router.start();
