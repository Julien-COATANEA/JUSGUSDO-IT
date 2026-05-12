// ── SPA Router ───────────────────────────────────────────────
const Router = (() => {
  const PAGES = {
    login:   { page: LoginPage,   requireAuth: false, requireAdmin: false },
    home:    { page: HomePage,    requireAuth: true,  requireAdmin: false },
    app:     { page: WorkoutPage, requireAuth: true,  requireAdmin: false },
    admin:   { page: AdminPage,   requireAuth: true,  requireAdmin: false },
    profile: { page: ProfilePage, requireAuth: true,  requireAdmin: false },
  };

  function isLoggedIn() {
    return !!(localStorage.getItem('token') || sessionStorage.getItem('token'));
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
    const SVG = {
      home:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      app:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      admin: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    };
    const items = [
      { route: 'home',  icon: SVG.home,  label: 'Équipe' },
      { route: 'app',   icon: SVG.app,   label: 'Programme' },
      { route: 'admin', icon: SVG.admin, label: 'Exercices' },
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

  let _currentRoute = null;

  async function navigate(route, params = {}) {
    const config = PAGES[route];
    if (!config) return navigate('login');

    if (config.requireAuth && !isLoggedIn()) return navigate('login');
    if (!config.requireAuth && isLoggedIn() && route === 'login') return navigate('app');
    if (config.requireAdmin && !isAdmin()) return navigate('home');

    // Cleanup previous page
    if (_currentRoute && _currentRoute !== route) {
      const prev = PAGES[_currentRoute];
      if (prev?.page?.destroy) prev.page.destroy();
    }
    _currentRoute = route;

    const app = document.getElementById('app');
    app.innerHTML = config.page.render();

    if (config.page.init) {
      await config.page.init(params);
    }

    renderBottomNav(route);
  }

  // Bootstrap
  function start() {
    if (isLoggedIn()) {
      navigate('app');
    } else {
      navigate('login');
    }
  }

  return { navigate, start };
})();

// Start app
Router.start();
