/**
 * TRS Tickets Bot - Main Application Entry Point
 * Initializes the frontend application
 */

// Global app instance
window.TRSApp = {
  api: null,
  state: null,
  panel: null,
  tickets: null,
  analytics: null,
  initialized: false
};

/**
 * Initialize the application
 */
async function initApp() {
  if (window.TRSApp.initialized) {
    console.warn('App already initialized');
    return;
  }

  try {
    console.log('Initializing TRS Tickets App...');

    // Initialize API Service
    window.TRSApp.api = new APIService('/api');

    // Initialize State Manager
    window.TRSApp.state = new StateManager();

    // Load user data
    try {
      const userData = await window.TRSApp.api.getCurrentUser();
      window.TRSApp.state.setState({ user: userData });
      console.log('User loaded:', userData);
    } catch (err) {
      console.warn('User not authenticated:', err);
    }

    // Initialize UI based on current page
    const currentPage = detectCurrentPage();
    console.log('Current page:', currentPage);

    switch (currentPage) {
      case 'panel':
        await initPanelPage();
        break;

      case 'tickets':
        await initTicketsPage();
        break;

      case 'analytics':
        await initAnalyticsPage();
        break;

      case 'select-server':
        await initServerSelectPage();
        break;

      default:
        console.log('No specific page initialization required');
    }

    window.TRSApp.initialized = true;
    console.log('TRS Tickets App initialized successfully');

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('trs-app-ready'));

  } catch (error) {
    console.error('App initialization error:', error);
    showErrorNotification('Fehler beim Laden der Anwendung: ' + error.message);
  }
}

/**
 * Detect current page
 */
function detectCurrentPage() {
  const path = window.location.pathname;

  if (path.includes('/panel')) return 'panel';
  if (path.includes('/tickets')) return 'tickets';
  if (path.includes('/analytics')) return 'analytics';
  if (path.includes('/select-server')) return 'select-server';
  if (path.includes('/premium')) return 'premium';

  return 'home';
}

/**
 * Initialize Panel Page
 */
async function initPanelPage() {
  console.log('Initializing Panel page...');

  if (!window.PanelUI) {
    console.error('PanelUI not loaded');
    return;
  }

  window.TRSApp.panel = new PanelUI(window.TRSApp.api, window.TRSApp.state);
  await window.TRSApp.panel.init();

  console.log('Panel page initialized');
}

/**
 * Initialize Tickets Page
 */
async function initTicketsPage() {
  console.log('Initializing Tickets page...');

  if (!window.TicketsUI) {
    console.error('TicketsUI not loaded');
    return;
  }

  window.TRSApp.tickets = new TicketsUI(window.TRSApp.api, window.TRSApp.state);
  await window.TRSApp.tickets.init();

  console.log('Tickets page initialized');
}

/**
 * Initialize Analytics Page
 */
async function initAnalyticsPage() {
  console.log('Initializing Analytics page...');

  // Load analytics data
  try {
    const { analytics } = await window.TRSApp.api.getAnalytics();
    window.TRSApp.state.setState({ analytics });

    // Render charts (if Chart.js is available)
    if (typeof renderAnalytics === 'function') {
      renderAnalytics(analytics);
    }
  } catch (error) {
    console.error('Analytics load error:', error);
    showErrorNotification('Fehler beim Laden der Analytics: ' + error.message);
  }

  console.log('Analytics page initialized');
}

/**
 * Initialize Server Select Page
 */
async function initServerSelectPage() {
  console.log('Initializing Server Select page...');

  try {
    const { guilds, currentGuild } = await window.TRSApp.api.getUserGuilds();
    window.TRSApp.state.setState({ guilds, currentGuild });

    console.log('Loaded guilds:', guilds);
  } catch (error) {
    console.error('Guilds load error:', error);
  }

  console.log('Server Select page initialized');
}

/**
 * Show loading indicator
 */
function showLoadingIndicator(message = 'Lädt...') {
  let loader = document.getElementById('global-loader');

  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'global-loader';
    loader.innerHTML = `
      <div class="loader-content">
        <div class="loader-spinner"></div>
        <div class="loader-text">${message}</div>
      </div>
    `;
    document.body.appendChild(loader);
  } else {
    loader.querySelector('.loader-text').textContent = message;
  }

  loader.style.display = 'flex';
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.display = 'none';
  }
}

/**
 * Show error notification
 */
function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification notification-error';
  notification.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

/**
 * Show success notification
 */
function showSuccessNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification notification-success';
  notification.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Subscribe to state changes
 */
window.TRSApp.state && window.TRSApp.state.subscribe('loading', (loading, prevLoading) => {
  if (loading) {
    const message = window.TRSApp.state.getState('loadingMessage') || 'Lädt...';
    showLoadingIndicator(message);
  } else {
    hideLoadingIndicator();
  }
});

window.TRSApp.state && window.TRSApp.state.subscribe('error', (error) => {
  if (error) {
    showErrorNotification(error);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export utilities
window.TRSApp.showLoading = showLoadingIndicator;
window.TRSApp.hideLoading = hideLoadingIndicator;
window.TRSApp.showError = showErrorNotification;
window.TRSApp.showSuccess = showSuccessNotification;
