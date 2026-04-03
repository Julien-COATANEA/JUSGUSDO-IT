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
