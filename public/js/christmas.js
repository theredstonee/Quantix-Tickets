/**
 * Christmas Theme Manager
 * Manages Christmas Special Edition features with snowfall
 */

class ChristmasManager {
  constructor() {
    this.enabled = this.loadState();
    this.init();
  }

  /**
   * Initialize Christmas theme
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

    // Check if it's Christmas season
    this.checkChristmasSeason();
  }

  /**
   * Load Christmas state from localStorage
   */
  loadState() {
    const saved = localStorage.getItem('christmasMode');
    return saved === 'true';
  }

  /**
   * Save Christmas state to localStorage
   */
  saveState(enabled) {
    localStorage.setItem('christmasMode', enabled.toString());
  }

  /**
   * Enable Christmas theme
   */
  enable() {
    // Disable Halloween if active
    document.documentElement.removeAttribute('data-halloween');
    localStorage.setItem('halloweenMode', 'false');

    document.documentElement.setAttribute('data-christmas', 'true');
    this.enabled = true;
    this.saveState(true);
    this.addDecorations();
    this.updateToggleButton();
    this.showNotification('Frohe Weihnachten! Weihnachts-Modus aktiviert!', 'success');
  }

  /**
   * Disable Christmas theme
   */
  disable() {
    document.documentElement.removeAttribute('data-christmas');
    this.enabled = false;
    this.saveState(false);
    this.removeDecorations();
    this.updateToggleButton();
    this.showNotification('Weihnachts-Modus deaktiviert', 'info');
  }

  /**
   * Toggle Christmas theme
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
    if (document.querySelector('.christmas-toggle')) {
      return;
    }

    const toggle = document.createElement('div');
    toggle.className = 'christmas-toggle';
    toggle.innerHTML = `
      <span class="christmas-toggle-icon"></span>
      <span class="christmas-toggle-text">Weihnachten</span>
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

    const icon = this.toggleButton.querySelector('.christmas-toggle-icon');
    const text = this.toggleButton.querySelector('.christmas-toggle-text');

    if (this.enabled) {
      icon.textContent = '';
      text.textContent = 'Weihnachten ON';
      this.toggleButton.style.borderColor = '#ffd700';
    } else {
      icon.textContent = '';
      text.textContent = 'Weihnachten OFF';
      this.toggleButton.style.borderColor = '#666';
    }
  }

  /**
   * Add decorative Christmas elements including snowfall
   */
  addDecorations() {
    // Remove existing decorations first
    this.removeDecorations();

    const container = document.createElement('div');
    container.id = 'christmas-decorations';

    // Add snowfall container
    const snowContainer = document.createElement('div');
    snowContainer.className = 'snowfall-container';

    // Create 30 snowflakes
    for (let i = 0; i < 30; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.innerHTML = Math.random() > 0.5 ? '' : '';
      snowContainer.appendChild(snowflake);
    }
    container.appendChild(snowContainer);

    // Add Christmas lights at top
    const lights = document.createElement('div');
    lights.className = 'christmas-lights';
    container.appendChild(lights);

    // Add Christmas trees
    const treeLeft = document.createElement('div');
    treeLeft.className = 'christmas-tree left';
    treeLeft.textContent = '';
    container.appendChild(treeLeft);

    const treeRight = document.createElement('div');
    treeRight.className = 'christmas-tree right';
    treeRight.textContent = '';
    container.appendChild(treeRight);

    document.body.appendChild(container);
  }

  /**
   * Remove decorative elements
   */
  removeDecorations() {
    const existing = document.getElementById('christmas-decorations');
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Check if we're in Christmas season and show banner
   */
  checkChristmasSeason() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const day = now.getDate();

    // December 1st - January 6th (Three Kings Day)
    const isChristmasSeason = (month === 11) || (month === 0 && day <= 6);

    if (isChristmasSeason && !this.enabled) {
      this.showSeasonalBanner();
      // Auto-enable Christmas mode during season
      if (!localStorage.getItem('christmasModeDismissed')) {
        this.enable();
      }
    }
  }

  /**
   * Show seasonal banner
   */
  showSeasonalBanner() {
    // Check if banner was already dismissed
    const dismissed = sessionStorage.getItem('christmasBannerDismissed');
    if (dismissed === 'true') return;

    const banner = document.createElement('div');
    banner.className = 'christmas-banner';
    banner.innerHTML = `
      <div style="position: relative; padding: 0 50px;">
         Frohe Weihnachten! Weihnachts-Special Edition aktiviert!
        <button onclick="this.parentElement.parentElement.remove(); sessionStorage.setItem('christmasBannerDismissed', 'true');"
                style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
                       background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 10px;
                       border-radius: 5px; cursor: pointer;"></button>
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
      background: ${type === 'success' ? 'linear-gradient(135deg, #c41e3a, #165b33)' : 'rgba(13, 51, 32, 0.95)'};
      color: white;
      padding: 15px 25px;
      border-radius: 10px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      animation: slideInRight 0.3s ease;
      font-weight: bold;
      border: 2px solid ${type === 'success' ? '#ffd700' : '#666'};
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
   * Get Christmas countdown
   */
  getCountdown() {
    const now = new Date();
    const year = now.getFullYear();
    const christmas = new Date(year, 11, 25); // December 25

    if (now > christmas) {
      christmas.setFullYear(year + 1);
    }

    const diff = christmas - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    return days;
  }

  /**
   * Play Christmas sound effect
   */
  playSound(soundName) {
    if (!this.enabled) return;

    const sounds = {
      jingle: '/sounds/christmas/jingle.mp3',
      bells: '/sounds/christmas/bells.mp3',
      hohoho: '/sounds/christmas/hohoho.mp3'
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

// Initialize Christmas Manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.christmasManager = new ChristmasManager();
  });
} else {
  window.christmasManager = new ChristmasManager();
}

// Add keyframe animations
const christmasStyle = document.createElement('style');
christmasStyle.textContent = `
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
document.head.appendChild(christmasStyle);
