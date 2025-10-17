/**
 * TRS Tickets Bot - Panel UI Module
 * Handles panel configuration interface
 */

class PanelUI {
  constructor(apiService, stateManager) {
    this.api = apiService;
    this.state = stateManager;
    this.formElements = {};
  }

  /**
   * Initialize panel
   */
  async init() {
    try {
      this.state.setLoading(true, 'Lade Panel...');

      // Load config
      const { config } = await this.api.getConfig();
      this.state.setState({ config });

      // Populate form
      this.populateForm(config);

      // Attach event listeners
      this.attachEventListeners();

      this.state.setLoading(false);
    } catch (error) {
      console.error('Panel init error:', error);
      this.state.setError(error);
      this.state.setLoading(false);
    }
  }

  /**
   * Populate form with config data
   */
  populateForm(config) {
    // Team Role
    const teamRoleSelect = document.getElementById('teamRole');
    if (teamRoleSelect && config.teamRoleId) {
      teamRoleSelect.value = config.teamRoleId;
    }

    // Log Channel
    const logChannelSelect = document.getElementById('logChannel');
    if (logChannelSelect && config.logChannelId) {
      logChannelSelect.value = config.logChannelId;
    }

    // Ticket Category
    const categorySelect = document.getElementById('ticketCategory');
    if (categorySelect && config.ticketCategoryId) {
      categorySelect.value = config.ticketCategoryId;
    }

    // Language
    const languageSelect = document.getElementById('language');
    if (languageSelect && config.language) {
      languageSelect.value = config.language;
    }

    // Welcome Message
    const welcomeMsgInput = document.getElementById('welcomeMessage');
    if (welcomeMsgInput && config.welcomeMessage) {
      welcomeMsgInput.value = config.welcomeMessage;
    }

    // Topics
    const topicsContainer = document.getElementById('topicsContainer');
    if (topicsContainer && config.topics) {
      this.renderTopics(config.topics);
    }

    // Priority Roles
    if (config.priorityRoles) {
      this.renderPriorityRoles(config.priorityRoles);
    }

    // DM Notifications (Pro)
    const dmNotificationsInput = document.getElementById('dmNotificationUsers');
    if (dmNotificationsInput && config.dmNotificationUsers) {
      dmNotificationsInput.value = config.dmNotificationUsers.join(', ');
    }

    // Email Notifications (Pro)
    const emailInput = document.getElementById('notificationEmail');
    if (emailInput && config.notificationEmail) {
      emailInput.value = config.notificationEmail;
    }
  }

  /**
   * Render topics list
   */
  renderTopics(topics) {
    const container = document.getElementById('topicsContainer');
    if (!container) return;

    container.innerHTML = '';

    topics.forEach((topic, index) => {
      const topicEl = document.createElement('div');
      topicEl.className = 'topic-item';
      topicEl.innerHTML = `
        <input type="text" value="${topic.emoji}" placeholder="Emoji" class="topic-emoji" data-index="${index}">
        <input type="text" value="${topic.label}" placeholder="Label" class="topic-label" data-index="${index}">
        <button type="button" class="btn-remove-topic" data-index="${index}">
          <i class="fas fa-trash"></i>
        </button>
      `;
      container.appendChild(topicEl);
    });
  }

  /**
   * Render priority roles
   */
  renderPriorityRoles(priorityRoles) {
    ['0', '1', '2'].forEach(priority => {
      const select = document.getElementById(`priorityRoles${priority}`);
      if (select && priorityRoles[priority]) {
        // Select multiple roles (if multi-select)
        Array.from(select.options).forEach(option => {
          if (priorityRoles[priority].includes(option.value)) {
            option.selected = true;
          }
        });
      }
    });
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Form submission
    const form = document.getElementById('panelForm');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Add topic button
    const addTopicBtn = document.getElementById('addTopicBtn');
    if (addTopicBtn) {
      addTopicBtn.addEventListener('click', () => this.addTopic());
    }

    // Remove topic buttons (delegated)
    const topicsContainer = document.getElementById('topicsContainer');
    if (topicsContainer) {
      topicsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-topic')) {
          const index = e.target.closest('.btn-remove-topic').dataset.index;
          this.removeTopic(index);
        }
      });
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    try {
      this.state.setLoading(true, 'Speichere Konfiguration...');

      const formData = new FormData(e.target);
      const updates = {};

      // Collect form data
      for (let [key, value] of formData.entries()) {
        updates[key] = value;
      }

      // Collect topics
      const topics = this.collectTopics();
      if (topics) {
        updates.topics = topics;
      }

      // Collect priority roles
      const priorityRoles = this.collectPriorityRoles();
      if (priorityRoles) {
        updates.priorityRoles = priorityRoles;
      }

      // Update via API
      const { config } = await this.api.updateConfig(updates);

      // Update state
      this.state.setState({ config });

      // Show success message
      this.showSuccessMessage('Konfiguration gespeichert!');

      this.state.setLoading(false);
    } catch (error) {
      console.error('Form submit error:', error);
      this.state.setError(error);
      this.showErrorMessage(error.message);
      this.state.setLoading(false);
    }
  }

  /**
   * Collect topics from form
   */
  collectTopics() {
    const container = document.getElementById('topicsContainer');
    if (!container) return null;

    const topics = [];
    const topicItems = container.querySelectorAll('.topic-item');

    topicItems.forEach(item => {
      const emoji = item.querySelector('.topic-emoji')?.value;
      const label = item.querySelector('.topic-label')?.value;

      if (emoji && label) {
        topics.push({ emoji, label });
      }
    });

    return topics;
  }

  /**
   * Collect priority roles from form
   */
  collectPriorityRoles() {
    const priorityRoles = {};

    ['0', '1', '2'].forEach(priority => {
      const select = document.getElementById(`priorityRoles${priority}`);
      if (select) {
        const selectedOptions = Array.from(select.selectedOptions).map(opt => opt.value);
        priorityRoles[priority] = selectedOptions;
      }
    });

    return priorityRoles;
  }

  /**
   * Add new topic
   */
  addTopic() {
    const config = this.state.getState('config');
    if (!config) return;

    const topics = config.topics || [];
    topics.push({ emoji: '📌', label: 'Neues Thema' });

    this.renderTopics(topics);
  }

  /**
   * Remove topic
   */
  removeTopic(index) {
    const config = this.state.getState('config');
    if (!config) return;

    const topics = config.topics || [];
    topics.splice(index, 1);

    this.renderTopics(topics);
  }

  /**
   * Show success message
   */
  showSuccessMessage(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 100);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Show error message
   */
  showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 100);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PanelUI;
}
