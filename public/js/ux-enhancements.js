// UX Enhancements for Quantix Tickets Panel
(function() {
  'use strict';

  // 1. Form Validation
  function validateForm() {
    const form = document.getElementById('panelForm');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      let isValid = true;
      let errors = [];

      // Validate Discord IDs
      const discordIdFields = [
        'ticketCategoryId',
        'logChannelId',
        'transcriptChannelId',
        'teamRoleId',
        'githubWebhookChannelId'
      ];

      discordIdFields.forEach(fieldName => {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (field && field.value && field.value.trim()) {
          const value = field.value.trim();
          if (!/^\d{17,20}$/.test(value) && value !== '') {
            isValid = false;
            errors.push(`${fieldName}: Ungültige Discord ID (muss 17-20 Ziffern sein)`);
            field.style.borderColor = '#ef4444';
          } else {
            field.style.borderColor = '';
          }
        }
      });

      // Validate Email
      const emailField = form.querySelector('[name="notificationEmail"]');
      if (emailField && emailField.value && emailField.value.trim()) {
        const email = emailField.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          isValid = false;
          errors.push('Email: Ungültige E-Mail-Adresse');
          emailField.style.borderColor = '#ef4444';
        } else {
          emailField.style.borderColor = '';
        }
      }

      // Validate URL
      const urlField = form.querySelector('[name="customAvatarUrl"]');
      if (urlField && urlField.value && urlField.value.trim()) {
        const url = urlField.value.trim();
        if (!/^https?:\/\/.+/.test(url)) {
          isValid = false;
          errors.push('Avatar URL: Muss mit http:// oder https:// beginnen');
          urlField.style.borderColor = '#ef4444';
        } else {
          urlField.style.borderColor = '';
        }
      }

      // Validate Color Codes
      const colorFields = form.querySelectorAll('[name="embedColor"], [name="panelColor"]');
      colorFields.forEach(field => {
        if (field.value && field.value.trim()) {
          const color = field.value.trim();
          if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
            isValid = false;
            errors.push(`${field.name}: Ungültiger Farbcode (z.B. #RRGGBB)`);
            field.style.borderColor = '#ef4444';
          } else {
            field.style.borderColor = '';
          }
        }
      });

      if (!isValid) {
        e.preventDefault();
        alert('Bitte korrigiere folgende Fehler:\n\n' + errors.join('\n'));
        return false;
      }
    });
  }

  // 2. Delete Confirmation
  function addDeleteConfirmations() {
    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList.contains('del-btn')) {
        const confirmed = confirm('Möchtest du diesen Eintrag wirklich löschen?');
        if (!confirmed) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    });
  }

  // 3. Tooltips for complex fields
  function addTooltips() {
    const tooltips = {
      'priorityRoles_0': 'Wähle Rollen, die Zugriff auf grüne (niedrige Priorität) Tickets haben',
      'priorityRoles_1': 'Wähle Rollen, die Zugriff auf orange (mittlere Priorität) Tickets haben',
      'priorityRoles_2': 'Wähle Rollen, die Zugriff auf rote (hohe Priorität) Tickets haben',
      'notificationEmail': 'E-Mail für Benachrichtigungen bei neuen Tickets (nur Pro)',
      'autoCloseDays': 'Anzahl der Tage nach denen inaktive Tickets automatisch geschlossen werden (1-365)',
      'dmNotificationUsers': 'Discord User IDs (eine pro Zeile), die bei neuen Tickets eine DM erhalten',
      'customAvatarUrl': 'URL zu einem benutzerdefinierten Bot-Avatar (Basic+)'
    };

    Object.keys(tooltips).forEach(fieldName => {
      const field = document.querySelector(`[name="${fieldName}"]`);
      if (field && !field.title) {
        field.title = tooltips[fieldName];
        field.setAttribute('data-tooltip', tooltips[fieldName]);

        // Add visual indicator
        const parent = field.parentElement;
        if (parent && parent.tagName === 'LABEL' && !parent.querySelector('.tooltip-icon')) {
          const icon = document.createElement('span');
          icon.className = 'tooltip-icon';
          icon.innerHTML = ' ℹ️';
          icon.style.cursor = 'help';
          icon.style.fontSize = '0.9rem';
          icon.title = tooltips[fieldName];
          parent.querySelector('label, strong')?.appendChild(icon);
        }
      }
    });
  }

  // 4. Auto-save Draft (localStorage)
  function enableAutoSaveDraft() {
    const form = document.getElementById('panelForm');
    if (!form) return;

    const STORAGE_KEY = 'quantix-panel-draft';
    const SAVE_INTERVAL = 30000; // 30 seconds

    // Load draft
    function loadDraft() {
      try {
        const draft = localStorage.getItem(STORAGE_KEY);
        if (!draft) return;

        const data = JSON.parse(draft);
        const timestamp = data.timestamp;

        // Only load if draft is less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          if (confirm('Es wurde ein Entwurf gefunden. Möchtest du ihn laden?')) {
            Object.keys(data.fields).forEach(name => {
              const field = form.querySelector(`[name="${name}"]`);
              if (field && field.type !== 'submit') {
                if (field.type === 'checkbox') {
                  field.checked = data.fields[name];
                } else {
                  field.value = data.fields[name];
                }
              }
            });
          }
        }
      } catch (err) {
        console.error('Error loading draft:', err);
      }
    }

    // Save draft
    function saveDraft() {
      try {
        const formData = new FormData(form);
        const fields = {};

        for (let [name, value] of formData.entries()) {
          const field = form.querySelector(`[name="${name}"]`);
          if (field && field.type === 'checkbox') {
            fields[name] = field.checked;
          } else {
            fields[name] = value;
          }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          timestamp: Date.now(),
          fields: fields
        }));

        console.log('Draft saved');
      } catch (err) {
        console.error('Error saving draft:', err);
      }
    }

    // Clear draft on successful submit
    form.addEventListener('submit', function() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        console.error('Error clearing draft:', err);
      }
    });

    // Load draft on page load
    loadDraft();

    // Auto-save every 30 seconds
    setInterval(saveDraft, SAVE_INTERVAL);
  }

  // 5. Keyboard Shortcuts
  function enableKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl+S or Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const form = document.getElementById('panelForm');
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }

      // Escape to close dropdowns/modals
      if (e.key === 'Escape') {
        const langMenu = document.getElementById('langDropdownMenu');
        if (langMenu) {
          langMenu.classList.remove('show');
        }
      }
    });
  }

  // 6. Real-time Character Counter
  function addCharacterCounters() {
    const fields = [
      { name: 'embedTitle', max: 256 },
      { name: 'embedDescription', max: 4096 },
      { name: 'embedFooter', max: 2048 },
      { name: 'panelTitle', max: 256 },
      { name: 'panelDescription', max: 4096 },
      { name: 'panelFooter', max: 2048 }
    ];

    fields.forEach(({ name, max }) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (!field) return;

      const counter = document.createElement('small');
      counter.style.display = 'block';
      counter.style.marginTop = '0.25rem';
      counter.style.opacity = '0.7';
      counter.style.fontSize = '0.85rem';

      function updateCounter() {
        const length = field.value.length;
        const remaining = max - length;
        counter.textContent = `${length} / ${max} Zeichen`;

        if (remaining < 50) {
          counter.style.color = '#ef4444';
        } else if (remaining < 200) {
          counter.style.color = '#f59e0b';
        } else {
          counter.style.color = '';
        }
      }

      field.addEventListener('input', updateCounter);
      field.parentElement.appendChild(counter);
      updateCounter();
    });
  }

  // 7. Improved Error Messages
  function enhanceErrorMessages() {
    const urlParams = new URLSearchParams(window.location.search);
    const msg = urlParams.get('msg');

    const messages = {
      'saved': '✅ Einstellungen erfolgreich gespeichert!',
      'sent': '✅ Panel erfolgreich gesendet!',
      'edited': '✅ Panel erfolgreich bearbeitet!',
      'error': '❌ Es ist ein Fehler aufgetreten. Bitte versuche es erneut.',
      'nopanel': '⚠️ Es wurde noch kein Panel gesendet. Bitte sende zuerst ein Panel.',
      'invalid-email': '❌ Die eingegebene E-Mail-Adresse ist ungültig.',
      'invalid-url': '❌ Die eingegebene URL ist ungültig.',
      'requires-pro': '💎 Diese Funktion erfordert ein Pro-Abo.'
    };

    if (msg && messages[msg]) {
      const existingGood = document.querySelector('.good');
      const existingBad = document.querySelector('.bad');

      if (!existingGood && !existingBad) {
        const isError = msg === 'error' || msg === 'nopanel' || msg.startsWith('invalid-') || msg.startsWith('requires-');
        const messageDiv = document.createElement('div');
        messageDiv.className = isError ? 'bad' : 'good';
        messageDiv.textContent = messages[msg];
        messageDiv.style.animation = 'fadeIn 0.3s ease-in-out';

        const main = document.querySelector('main') || document.querySelector('h1');
        if (main) {
          main.insertAdjacentElement('afterend', messageDiv);

          // Auto-hide after 5 seconds
          setTimeout(() => {
            messageDiv.style.animation = 'fadeOut 0.3s ease-in-out';
            setTimeout(() => messageDiv.remove(), 300);
          }, 5000);
        }
      }
    }
  }

  // Initialize all enhancements
  document.addEventListener('DOMContentLoaded', function() {
    validateForm();
    addDeleteConfirmations();
    addTooltips();
    // enableAutoSaveDraft(); // Deaktiviert auf Wunsch
    enableKeyboardShortcuts();
    addCharacterCounters();
    enhanceErrorMessages();

    console.log('✅ UX Enhancements loaded');
  });

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-10px); }
    }

    .tooltip-icon {
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    .tooltip-icon:hover {
      opacity: 1;
    }

    input:invalid, textarea:invalid, select:invalid {
      border-color: #ef4444 !important;
    }

    input:valid, textarea:valid, select:valid {
      border-color: #0ea5e9 !important;
    }
  `;
  document.head.appendChild(style);
})();
