import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import translations from '../translations'

export const useLanguageStore = defineStore('language', () => {
  const currentLanguage = ref('de')

  const lang = computed(() => currentLanguage.value)
  const t = computed(() => translations[currentLanguage.value] || translations.de)
  const isRTL = computed(() => currentLanguage.value === 'he')

  function loadLanguage() {
    const savedLang = localStorage.getItem('trs-lang') || 'de'
    currentLanguage.value = savedLang
    updateHtmlAttributes()
  }

  function setLanguage(newLang) {
    if (!['de', 'en', 'he'].includes(newLang)) return
    currentLanguage.value = newLang
    localStorage.setItem('trs-lang', newLang)
    updateHtmlAttributes()
  }

  function updateHtmlAttributes() {
    document.documentElement.setAttribute('lang', currentLanguage.value)
    document.documentElement.setAttribute('dir', isRTL.value ? 'rtl' : 'ltr')
  }

  return { lang, t, isRTL, loadLanguage, setLanguage }
})
