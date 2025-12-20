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

    // Add decorative elements
    if (this.enabled) {
      this.addDecorations();
    }
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
    // Disable Christmas if active
    document.documentElement.removeAttribute('data-christmas');
    localStorage.setItem('christmasMode', 'false');

    document.documentElement.setAttribute('data-halloween', 'true');
    this.enabled = true;
    this.saveState(true);
    this.addDecorations();
  }

  /**
   * Disable Halloween theme
   */
  disable() {
    document.documentElement.removeAttribute('data-halloween');
    this.enabled = false;
    this.saveState(false);
    this.removeDecorations();
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

}

// Global function to set theme from panel
window.setTheme = function(theme) {
  if (theme === 'halloween') {
    if (window.halloweenManager) window.halloweenManager.enable();
  } else if (theme === 'christmas') {
    if (window.christmasManager) window.christmasManager.enable();
  } else {
    // Default - disable all themes
    if (window.halloweenManager) window.halloweenManager.disable();
    if (window.christmasManager) window.christmasManager.disable();
  }
};

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
