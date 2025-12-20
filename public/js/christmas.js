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

    // Add decorative elements
    if (this.enabled) {
      this.addDecorations();
    }
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
  }

  /**
   * Disable Christmas theme
   */
  disable() {
    document.documentElement.removeAttribute('data-christmas');
    this.enabled = false;
    this.saveState(false);
    this.removeDecorations();
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
