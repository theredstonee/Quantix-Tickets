<template>
  <button
    class="theme-toggle"
    @click="toggleTheme"
    :title="t.common.darkMode"
    aria-label="Toggle dark mode"
  >
    <i :class="themeIcon"></i>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../stores/theme'
import { useLanguageStore } from '../stores/language'

const themeStore = useThemeStore()
const langStore = useLanguageStore()

const t = langStore.t
const themeIcon = computed(() =>
  themeStore.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'
)

function toggleTheme() {
  themeStore.toggleTheme()
}
</script>

<style scoped>
.theme-toggle {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  background: var(--color-primary);
  color: #000;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-fixed);
}

.theme-toggle:hover {
  transform: scale(1.1) rotate(10deg);
  box-shadow: var(--shadow-xl);
}

.theme-toggle:active {
  transform: scale(0.95);
}

@media (max-width: 640px) {
  .theme-toggle {
    width: 3rem;
    height: 3rem;
    top: 1rem;
    right: 1rem;
    font-size: 1.25rem;
  }
}
</style>
