/**
 * Halloween Theme Manager
 * 🎃 Manages Halloween Special Edition features
 */

class HalloweenManager {
  constructor() {
    this.enabled = this.loadState();
    this.init();
  }

  /**
   * Initialize Halloween theme
   */
  init() {
    // Apply saved state
    if (this.enabled) {
      this.enable();
    }

    // Create toggle button
    this.createToggleButton();

    // Add decorative elements
    if (this.enabled) {
      this.addDecorations();
    }

    // Check if it's Halloween season
    this.checkHalloweenSeason();
  }

  /**
   * Load Halloween state from localStorage
   */
  loadState() {
    const saved = localStorage.getItem('halloweenMode');
    return saved === 'true';
  }

  /**
   * Save Halloween state to localStorage
   */
  saveState(enabled) {
    localStorage.setItem('halloweenMode', enabled.toString());
  }

  /**
   * Enable Halloween theme
   */
  enable() {
    document.documentElement.setAttribute('data-halloween', 'true');
    this.enabled = true;
    this.saveState(true);
    this.addDecorations();
    this.updateToggleButton();
    this.showNotification('🎃 Halloween-Modus aktiviert!', 'success');
  }

  /**
   * Disable Halloween theme
   */
  disable() {
    document.documentElement.removeAttribute('data-halloween');
    this.enabled = false;
    this.saveState(false);
    this.removeDecorations();
    this.updateToggleButton();
    this.showNotification('👻 Halloween-Modus deaktiviert', 'info');
  }

  /**
   * Toggle Halloween theme
   */
  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Create toggle button in UI
   */
  createToggleButton() {
    // Check if button already exists
    if (document.querySelector('.halloween-toggle')) {
      return;
    }

    const toggle = document.createElement('div');
    toggle.className = 'halloween-toggle';
    toggle.innerHTML = `
      <span class="halloween-toggle-icon">🎃</span>
      <span class="halloween-toggle-text">Halloween</span>
    `;

    toggle.addEventListener('click', () => this.toggle());
    document.body.appendChild(toggle);

    this.toggleButton = toggle;
    this.updateToggleButton();
  }

  /**
   * Update toggle button appearance
   */
  updateToggleButton() {
    if (!this.toggleButton) return;

    const icon = this.toggleButton.querySelector('.halloween-toggle-icon');
    const text = this.toggleButton.querySelector('.halloween-toggle-text');

    if (this.enabled) {
      icon.textContent = '🎃';
      text.textContent = 'Halloween ON';
      this.toggleButton.style.borderColor = 'var(--halloween-orange)';
    } else {
      icon.textContent = '👻';
      text.textContent = 'Halloween OFF';
      this.toggleButton.style.borderColor = '#666';
    }
  }

  /**
   * Add decorative Halloween elements
   */
  addDecorations() {
    // Remove existing decorations first
    this.removeDecorations();

    const container = document.createElement('div');
    container.id = 'halloween-decorations';
    container.style.pointerEvents = 'none';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9998';

    // Add ghosts
    for (let i = 0; i < 3; i++) {
      const ghost = document.createElement('div');
      ghost.className = 'halloween-ghost';
      ghost.textContent = '👻';
      ghost.style.left = `${Math.random() * 80 + 10}%`;
      ghost.style.top = `${Math.random() * 80 + 10}%`;
      ghost.style.animationDelay = `${i * 5}s`;
      container.appendChild(ghost);
    }

    // Add bats
    for (let i = 0; i < 3; i++) {
      const bat = document.createElement('div');
      bat.className = 'halloween-bat';
      bat.textContent = '🦇';
      bat.style.top = `${Math.random() * 80 + 10}%`;
      bat.style.animationDelay = `${i * 4}s`;
      container.appendChild(bat);
    }

    // Add spiderwebs
    const webTopLeft = document.createElement('div');
    webTopLeft.className = 'halloween-spiderweb top-left';
    webTopLeft.innerHTML = `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,0 L100,100 M0,50 L100,100 M0,100 L100,100 M50,0 L100,100 M100,0 L100,100"
              stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
        <circle cx="100" cy="100" r="3" fill="white" opacity="0.5"/>
        <circle cx="20" cy="80" r="5" fill="#333" opacity="0.7"/>
      </svg>
    `;
    container.appendChild(webTopLeft);

    const webTopRight = document.createElement('div');
    webTopRight.className = 'halloween-spiderweb top-right';
    webTopRight.innerHTML = webTopLeft.innerHTML;
    container.appendChild(webTopRight);

    document.body.appendChild(container);
  }

  /**
   * Remove decorative elements
   */
  removeDecorations() {
    const existing = document.getElementById('halloween-decorations');
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Check if we're in Halloween season and show banner
   */
  checkHalloweenSeason() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const day = now.getDate();

    // October or early November
    const isHalloweenSeason = (month === 9) || (month === 10 && day <= 2);

    if (isHalloweenSeason && !this.enabled) {
      this.showSeasonalBanner();
    }
  }

  /**
   * Show seasonal banner
   */
  showSeasonalBanner() {
    // Check if banner was already dismissed
    const dismissed = sessionStorage.getItem('halloweenBannerDismissed');
    if (dismissed === 'true') return;

    const banner = document.createElement('div');
    banner.className = 'halloween-banner';
    banner.innerHTML = `
      <div style="position: relative; padding: 0 50px;">
        🎃 Halloween Special Edition verfügbar! Klicke auf den Button oben rechts, um es zu aktivieren! 👻
        <button onclick="this.parentElement.parentElement.remove(); sessionStorage.setItem('halloweenBannerDismissed', 'true');"
                style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
                       background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 10px;
                       border-radius: 5px; cursor: pointer;">✕</button>
      </div>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (banner.parentElement) {
        banner.style.transition = 'opacity 0.5s';
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 500);
      }
    }, 10000);
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: ${type === 'success' ? 'linear-gradient(135deg, #FF6B35, #8B4789)' : 'rgba(26, 26, 26, 0.95)'};
      color: white;
      padding: 15px 25px;
      border-radius: 10px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      animation: slideInRight 0.3s ease;
      font-weight: bold;
      border: 2px solid ${type === 'success' ? '#FF6B35' : '#666'};
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s, transform 0.3s';
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Get Halloween countdown
   */
  getCountdown() {
    const now = new Date();
    const year = now.getFullYear();
    const halloween = new Date(year, 9, 31); // October 31

    if (now > halloween) {
      halloween.setFullYear(year + 1);
    }

    const diff = halloween - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    return days;
  }

  /**
   * Play Halloween sound effect
   */
  playSound(soundName) {
    // Optional: Add sound effects
    if (!this.enabled) return;

    const sounds = {
      ghost: '/sounds/halloween/ghost.mp3',
      witch: '/sounds/halloween/witch.mp3',
      scream: '/sounds/halloween/scream.mp3'
    };

    if (sounds[soundName]) {
      const audio = new Audio(sounds[soundName]);
      audio.volume = 0.3;
      audio.play().catch(() => {
        // User interaction required for audio
      });
    }
  }
}

// Initialize Halloween Manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.halloweenManager = new HalloweenManager();
  });
} else {
  window.halloweenManager = new HalloweenManager();
}

// Add keyframe animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);
