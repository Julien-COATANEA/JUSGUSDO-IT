// ── SPA Router ───────────────────────────────────────────────
const Router = (() => {
  // Lazy-load page modules on first navigation
  const _pageCache = new Map();
  const PAGE_SRC = {
    login:   '/js/pages/login.js',
    home:    '/js/pages/home.js',
    app:     '/js/pages/app.js',
    muscu:   '/js/pages/muscu.js',
    admin:   '/js/pages/admin.js',
    profile: '/js/pages/profile.js',
  };
  const PAGE_GLOBALS = {
    login:   'LoginPage',
    home:    'HomePage',
    app:     'WorkoutPage',
    muscu:   'MuscuPage',
    admin:   'AdminPage',
    profile: 'ProfilePage',
  };

  function _loadPageScript(route) {
    if (_pageCache.has(route)) return Promise.resolve(_pageCache.get(route));
    const src = PAGE_SRC[route];
    if (!src) return Promise.reject(new Error(`Unknown route: ${route}`));
    // If already loaded via static script tag, use it
    const globalName = PAGE_GLOBALS[route];
    if (globalName && window[globalName]) {
      _pageCache.set(route, window[globalName]);
      return Promise.resolve(window[globalName]);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        const mod = window[globalName];
        if (mod) {
          _pageCache.set(route, mod);
          resolve(mod);
        } else {
          reject(new Error(`Module ${globalName} not found after loading ${src}`));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  const PAGE_CONFIG = {
    login:   { requireAuth: false, requireAdmin: false },
    home:    { requireAuth: true,  requireAdmin: false },
    app:     { requireAuth: true,  requireAdmin: false },
    muscu:   { requireAuth: true,  requireAdmin: false },
    admin:   { requireAuth: true,  requireAdmin: false },
    profile: { requireAuth: true,  requireAdmin: false },
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
      muscu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/><path d="M3 9.5v5"/><path d="M21 9.5v5"/><rect x="1.5" y="8" width="3" height="8" rx="1.5"/><rect x="19.5" y="8" width="3" height="8" rx="1.5"/></svg>`,
    };
    const items = [
      { route: 'home',  icon: SVG.home,  label: 'Équipe' },
      { route: 'app',   icon: SVG.app,   label: 'Maison' },
      { route: 'muscu', icon: SVG.muscu, label: 'Salle' },
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
    const config = PAGE_CONFIG[route];
    if (!config) return navigate('login');

    if (config.requireAuth && !isLoggedIn()) return navigate('login');
    if (!config.requireAuth && isLoggedIn() && route === 'login') return navigate('app');
    if (config.requireAdmin && !isAdmin()) return navigate('home');

    // Lazy-load the page module
    let page;
    try {
      page = await _loadPageScript(route);
    } catch (err) {
      console.error(`Failed to load page "${route}":`, err);
      document.getElementById('app').innerHTML =
        `<p style="color:var(--text3);text-align:center;padding:40px 0">Erreur de chargement</p>`;
      return;
    }

    // Cleanup previous page
    if (_currentRoute && _currentRoute !== route) {
      try {
        const prevPage = await _loadPageScript(_currentRoute);
        if (prevPage?.destroy) prevPage.destroy();
      } catch (_) {}
    }
    _currentRoute = route;

    const app = document.getElementById('app');
    app.innerHTML = page.render();

    if (page.init) {
      await page.init(params);
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
