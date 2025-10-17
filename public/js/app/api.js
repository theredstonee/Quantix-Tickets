/**
 * TRS Tickets Bot - Frontend API Service
 * Modern fetch-based API communication layer
 */

class APIService {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include' // Important for session cookies
    };

    const config = { ...defaultOptions, ...options };

    try {
      const response = await fetch(url, config);

      // Handle non-JSON responses (like HTML transcripts)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        return await response.text();
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP Error ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // ============================================================
  // USER & AUTH
  // ============================================================

  async getCurrentUser() {
    return this.get('/user');
  }

  async selectGuild(guildId) {
    return this.post('/select-guild', { guildId });
  }

  async getUserGuilds() {
    return this.get('/guilds');
  }

  // ============================================================
  // CONFIG
  // ============================================================

  async getConfig() {
    return this.get('/config');
  }

  async updateConfig(updates) {
    return this.post('/config', updates);
  }

  // ============================================================
  // TICKETS
  // ============================================================

  async getAllTickets() {
    return this.get('/tickets');
  }

  async getTicket(ticketId) {
    return this.get(`/tickets/${ticketId}`);
  }

  // ============================================================
  // ANALYTICS
  // ============================================================

  async getAnalytics() {
    return this.get('/analytics');
  }

  // ============================================================
  // PREMIUM
  // ============================================================

  async getPremiumInfo() {
    return this.get('/premium');
  }

  // ============================================================
  // TRANSCRIPT
  // ============================================================

  async getTranscript(ticketId) {
    return this.get(`/transcript/${ticketId}`);
  }
}

// Create singleton instance
const api = new APIService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
