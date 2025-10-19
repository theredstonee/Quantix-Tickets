/**
 * Session Management mit automatischer Abmeldung um Mitternacht
 */

(function() {
  'use strict';

  const SESSION_KEY = 'quantix_session_date';

  /**
   * Initialisiere Session-Tracking
   */
  function initSession() {
    const today = getDateString();
    const savedDate = localStorage.getItem(SESSION_KEY);

    if (!savedDate) {
      // Erste Anmeldung heute
      localStorage.setItem(SESSION_KEY, today);
      console.log('📝 Session initialisiert für:', today);
    } else if (savedDate !== today) {
      // Datum hat sich geändert (Mitternacht ist vorbei)
      console.log('🕐 Mitternacht überschritten. Automatische Abmeldung...');
      autoLogout();
    } else {
      console.log('✅ Session gültig für:', today);
    }
  }

  /**
   * Hole aktuelles Datum als String (YYYY-MM-DD)
   */
  function getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Berechne verbleibende Zeit bis Mitternacht
   */
  function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
  }

  /**
   * Automatische Abmeldung
   */
  function autoLogout() {
    localStorage.removeItem(SESSION_KEY);

    // Zeige Benachrichtigung
    if (typeof showLogoutNotification === 'function') {
      showLogoutNotification('Deine Session ist abgelaufen. Du wirst um Mitternacht automatisch abgemeldet.');
    }

    // Warte kurz, dann logout
    setTimeout(() => {
      window.location.href = '/logout?reason=session-expired';
    }, 2000);
  }

  /**
   * Zeige Logout-Benachrichtigung
   */
  function showLogoutNotification(message) {
    // Erstelle Notification Element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 24px;">🕐</div>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Session abgelaufen</div>
          <div style="font-size: 0.9rem; opacity: 0.9;">${message}</div>
        </div>
      </div>
    `;

    // Animation CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);

    // Automatisch nach 3 Sekunden ausblenden
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Starte Mitternachts-Timer
   */
  function startMidnightTimer() {
    const timeUntilMidnight = getTimeUntilMidnight();

    console.log(`⏰ Automatische Abmeldung in ${Math.floor(timeUntilMidnight / 1000 / 60 / 60)}h ${Math.floor((timeUntilMidnight / 1000 / 60) % 60)}min`);

    // Timer für Mitternacht
    setTimeout(() => {
      console.log('🕐 Mitternacht erreicht. Automatische Abmeldung...');
      autoLogout();
    }, timeUntilMidnight);

    // Zusätzlich: Prüfe alle 60 Sekunden
    setInterval(() => {
      const today = getDateString();
      const savedDate = localStorage.getItem(SESSION_KEY);

      if (savedDate && savedDate !== today) {
        console.log('🕐 Datum geändert. Automatische Abmeldung...');
        autoLogout();
      }
    }, 60000); // Prüfe jede Minute
  }

  /**
   * Cleanup beim Logout
   */
  function cleanupSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // Initialisierung beim Laden der Seite
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSession();
      startMidnightTimer();
    });
  } else {
    initSession();
    startMidnightTimer();
  }

  // Cleanup beim Logout
  window.addEventListener('beforeunload', () => {
    // Prüfe ob wir auf logout-Seite sind
    if (window.location.pathname === '/logout') {
      cleanupSession();
    }
  });

  // Expose cleanup function für manuelle Logout
  window.cleanupQuantixSession = cleanupSession;

})();
