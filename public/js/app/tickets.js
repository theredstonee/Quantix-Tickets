/**
 * Quantix Tickets Bot - Tickets UI Module
 * Handles tickets display and filtering
 */

class TicketsUI {
  constructor(apiService, stateManager) {
    this.api = apiService;
    this.state = stateManager;
    this.currentView = localStorage.getItem('trs-tickets-view') || 'table';
    this.filters = {
      status: 'all',
      topic: 'all',
      priority: 'all',
      search: ''
    };
  }

  /**
   * Initialize tickets page
   */
  async init() {
    try {
      this.state.setLoading(true, 'Lade Tickets...');

      // Load tickets
      const { tickets } = await this.api.getAllTickets();
      this.state.setState({ tickets });

      // Render tickets
      this.render();

      // Attach event listeners
      this.attachEventListeners();

      this.state.setLoading(false);
    } catch (error) {
      console.error('Tickets init error:', error);
      this.state.setError(error);
      this.state.setLoading(false);
    }
  }

  /**
   * Render tickets
   */
  render() {
    const tickets = this.state.getState('tickets') || [];
    const filteredTickets = this.filterTickets(tickets);

    if (this.currentView === 'table') {
      this.renderTableView(filteredTickets);
    } else {
      this.renderCardView(filteredTickets);
    }

    this.updateStats(tickets);
  }

  /**
   * Filter tickets based on current filters
   */
  filterTickets(tickets) {
    return tickets.filter(ticket => {
      // Status filter
      if (this.filters.status !== 'all') {
        if (this.filters.status === 'open' && ticket.closedAt) return false;
        if (this.filters.status === 'closed' && !ticket.closedAt) return false;
        if (this.filters.status === 'claimed' && !ticket.claimerId) return false;
      }

      // Topic filter
      if (this.filters.topic !== 'all' && ticket.topic !== this.filters.topic) {
        return false;
      }

      // Priority filter
      if (this.filters.priority !== 'all' && ticket.priority !== parseInt(this.filters.priority)) {
        return false;
      }

      // Search filter
      if (this.filters.search) {
        const searchLower = this.filters.search.toLowerCase();
        const matchesId = ticket.id.toLowerCase().includes(searchLower);
        const matchesCreator = ticket.creatorName?.toLowerCase().includes(searchLower);
        const matchesTopic = ticket.topic?.toLowerCase().includes(searchLower);

        if (!matchesId && !matchesCreator && !matchesTopic) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Render table view
   */
  renderTableView(tickets) {
    const container = document.getElementById('ticketsTableBody');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; opacity: 0.6;">
            <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <div>Keine Tickets gefunden</div>
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = tickets.map(ticket => `
      <tr>
        <td><strong>${ticket.id}</strong></td>
        <td>${ticket.topic || 'N/A'}</td>
        <td>${ticket.creatorName || ticket.creatorId}</td>
        <td>${this.formatDate(ticket.createdAt)}</td>
        <td>${ticket.closedAt ? this.formatDate(ticket.closedAt) : '<span style="opacity: 0.6;">—</span>'}</td>
        <td>${this.renderStatusBadge(ticket)}</td>
        <td>
          <button class="btn-view-transcript" data-ticket-id="${ticket.id}" title="Transcript anzeigen">
            <i class="fas fa-file-alt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Render card view
   */
  renderCardView(tickets) {
    const container = document.getElementById('ticketsCardsContainer');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = `
        <div class="no-tickets">
          <i class="fas fa-inbox" style="font-size: 4rem; margin-bottom: 1rem;"></i>
          <div style="font-size: 1.2rem;">Keine Tickets gefunden</div>
        </div>
      `;
      return;
    }

    container.innerHTML = tickets.map(ticket => `
      <div class="ticket-card">
        <div class="ticket-card-header">
          <div class="ticket-id">#${ticket.id}</div>
          ${this.renderStatusBadge(ticket)}
        </div>
        <div class="ticket-card-body">
          <div class="ticket-info-row">
            <span class="label">Thema:</span>
            <span class="value">${ticket.topic || 'N/A'}</span>
          </div>
          <div class="ticket-info-row">
            <span class="label">Ersteller:</span>
            <span class="value">${ticket.creatorName || ticket.creatorId}</span>
          </div>
          <div class="ticket-info-row">
            <span class="label">Erstellt:</span>
            <span class="value">${this.formatDate(ticket.createdAt)}</span>
          </div>
          ${ticket.closedAt ? `
            <div class="ticket-info-row">
              <span class="label">Geschlossen:</span>
              <span class="value">${this.formatDate(ticket.closedAt)}</span>
            </div>
          ` : ''}
          ${ticket.claimerId ? `
            <div class="ticket-info-row">
              <span class="label">Bearbeiter:</span>
              <span class="value">${ticket.claimerName || ticket.claimerId}</span>
            </div>
          ` : ''}
        </div>
        <div class="ticket-card-footer">
          <button class="btn-view-transcript" data-ticket-id="${ticket.id}">
            <i class="fas fa-file-alt"></i> Transcript
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render status badge
   */
  renderStatusBadge(ticket) {
    if (ticket.closedAt) {
      return '<span class="status-badge status-closed">Geschlossen</span>';
    }

    if (ticket.claimerId) {
      return '<span class="status-badge status-claimed">In Bearbeitung</span>';
    }

    return '<span class="status-badge status-open">Offen</span>';
  }

  /**
   * Update statistics
   */
  updateStats(tickets) {
    const stats = {
      total: tickets.length,
      open: tickets.filter(t => !t.closedAt).length,
      closed: tickets.filter(t => t.closedAt).length,
      claimed: tickets.filter(t => t.claimerId).length
    };

    // Update stat elements
    const totalEl = document.getElementById('statTotal');
    const openEl = document.getElementById('statOpen');
    const closedEl = document.getElementById('statClosed');
    const claimedEl = document.getElementById('statClaimed');

    if (totalEl) totalEl.textContent = stats.total;
    if (openEl) openEl.textContent = stats.open;
    if (closedEl) closedEl.textContent = stats.closed;
    if (claimedEl) claimedEl.textContent = stats.claimed;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // View toggle
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', () => this.toggleView());
    }

    // Filters
    const statusFilter = document.getElementById('filterStatus');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.filters.status = e.target.value;
        this.render();
      });
    }

    const topicFilter = document.getElementById('filterTopic');
    if (topicFilter) {
      topicFilter.addEventListener('change', (e) => {
        this.filters.topic = e.target.value;
        this.render();
      });
    }

    const priorityFilter = document.getElementById('filterPriority');
    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        this.filters.priority = e.target.value;
        this.render();
      });
    }

    const searchInput = document.getElementById('searchTickets');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value;
        this.render();
      });
    }

    // Transcript buttons (delegated)
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-view-transcript');
      if (btn) {
        const ticketId = btn.dataset.ticketId;
        await this.viewTranscript(ticketId);
      }
    });
  }

  /**
   * Toggle view mode
   */
  toggleView() {
    this.currentView = this.currentView === 'table' ? 'card' : 'table';
    localStorage.setItem('trs-tickets-view', this.currentView);

    // Update UI
    const tableView = document.getElementById('tableView');
    const cardView = document.getElementById('cardView');
    const toggleBtn = document.getElementById('viewToggle');

    if (tableView && cardView) {
      if (this.currentView === 'table') {
        tableView.style.display = 'block';
        cardView.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-th"></i> Kartenansicht';
      } else {
        tableView.style.display = 'none';
        cardView.style.display = 'block';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-table"></i> Tabellenansicht';
      }
    }

    this.render();
  }

  /**
   * View transcript
   */
  async viewTranscript(ticketId) {
    try {
      this.state.setLoading(true, 'Lade Transcript...');

      const html = await this.api.getTranscript(ticketId);

      // Open in new window or modal
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();

      this.state.setLoading(false);
    } catch (error) {
      console.error('Transcript error:', error);
      this.state.setError(error);
      alert('Fehler beim Laden des Transcripts: ' + error.message);
      this.state.setLoading(false);
    }
  }

  /**
   * Format date
   */
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 24 hours ago
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      if (hours === 0) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `vor ${minutes} Min.`;
      }
      return `vor ${hours} Std.`;
    }

    // Format as date
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TicketsUI;
}
