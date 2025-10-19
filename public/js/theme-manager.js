// Theme Manager - Cookie-based Dark/Light Mode
(function() {
  'use strict';

  // Cookie utility functions
  function setCookie(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Lax";
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i];
      while (cookie.charAt(0) === ' ') {
        cookie = cookie.substring(1);
      }
      if (cookie.indexOf(nameEQ) === 0) {
        return cookie.substring(nameEQ.length);
      }
    }
    return null;
  }

  // Get theme from cookie or default to dark
  function getTheme() {
    const savedTheme = getCookie('theme');
    return savedTheme || 'dark';
  }

  // Apply theme to document
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // Update toggle button if exists
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      const icon = themeToggle.querySelector('i');
      if (icon) {
        if (theme === 'dark') {
          icon.className = 'fas fa-sun';
        } else {
          icon.className = 'fas fa-moon';
        }
      }
    }
  }

  // Toggle theme
  function toggleTheme() {
    const currentTheme = getTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCookie('theme', newTheme);
    applyTheme(newTheme);
  }

  // Initialize theme on page load
  function initTheme() {
    const theme = getTheme();
    applyTheme(theme);
  }

  // Apply theme immediately (before page renders)
  initTheme();

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupThemeToggle();
    });
  } else {
    setupThemeToggle();
  }

  function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function(e) {
        e.preventDefault();
        toggleTheme();
      });
    }
  }

  // Expose to global scope
  window.themeManager = {
    toggle: toggleTheme,
    get: getTheme,
    set: function(theme) {
      setCookie('theme', theme);
      applyTheme(theme);
    }
  };
})();
