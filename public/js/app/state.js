/**
 * TRS Tickets Bot - Frontend State Management
 * Simple reactive state management system
 */

class StateManager {
  constructor() {
    this.state = {
      user: null,
      guilds: [],
      currentGuild: null,
      config: null,
      tickets: [],
      analytics: null,
      premium: null,
      loading: false,
      error: null
    };

    this.listeners = {};
  }

  /**
   * Get current state
   */
  getState(key) {
    if (key) {
      return this.state[key];
    }
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  setState(updates) {
    const oldState = { ...this.state };

    Object.keys(updates).forEach(key => {
      this.state[key] = updates[key];

      // Notify specific listeners
      if (this.listeners[key]) {
        this.listeners[key].forEach(callback => {
          callback(this.state[key], oldState[key]);
        });
      }
    });

    // Notify global listeners
    if (this.listeners['*']) {
      this.listeners['*'].forEach(callback => {
        callback(this.state, oldState);
      });
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(key, callback) {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }

    this.listeners[key].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
    };
  }

  /**
   * Set loading state
   */
  setLoading(loading, message = null) {
    this.setState({ loading, loadingMessage: message });
  }

  /**
   * Set error state
   */
  setError(error) {
    this.setState({ error: error?.message || error });
  }

  /**
   * Clear error
   */
  clearError() {
    this.setState({ error: null });
  }

  /**
   * Reset state
   */
  reset() {
    this.state = {
      user: null,
      guilds: [],
      currentGuild: null,
      config: null,
      tickets: [],
      analytics: null,
      premium: null,
      loading: false,
      error: null
    };
  }
}

// Create singleton instance
const state = new StateManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = state;
}
