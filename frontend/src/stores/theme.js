import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref('light')

  const theme = computed(() => currentTheme.value)

  function loadTheme() {
    const savedTheme = localStorage.getItem('trs-theme') || 'light'
    currentTheme.value = savedTheme
    document.documentElement.setAttribute('data-theme', savedTheme)
  }

  function toggleTheme() {
    const newTheme = currentTheme.value === 'dark' ? 'light' : 'dark'
    currentTheme.value = newTheme
    localStorage.setItem('trs-theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  function setTheme(theme) {
    currentTheme.value = theme
    localStorage.setItem('trs-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }

  return { theme, loadTheme, toggleTheme, setTheme }
})
