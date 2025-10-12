<template>
  <div class="language-selector">
    <button
      v-for="language in languages"
      :key="language.code"
      :class="['lang-btn', { active: lang === language.code }]"
      @click="setLanguage(language.code)"
      :title="language.name"
      :aria-label="`Switch to ${language.name}`"
    >
      <span class="lang-flag">{{ language.flag }}</span>
      <span class="lang-code">{{ language.code.toUpperCase() }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLanguageStore } from '../stores/language'

const langStore = useLanguageStore()
const lang = computed(() => langStore.lang)

const languages = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'he', name: 'עברית', flag: '🇮🇱' }
]

function setLanguage(code) {
  langStore.setLanguage(code)
}
</script>

<style scoped>
.language-selector {
  position: fixed;
  top: 1.5rem;
  left: 1.5rem;
  display: flex;
  gap: var(--spacing-sm);
  z-index: var(--z-fixed);
}

.lang-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-card-bg);
  color: var(--color-text);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 600;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
  min-width: 4rem;
}

.lang-btn:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.lang-btn.active {
  background: var(--color-primary);
  color: #000;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.lang-flag {
  font-size: 1.25rem;
  line-height: 1;
}

.lang-code {
  font-size: var(--font-size-xs);
  letter-spacing: 0.5px;
}

@media (max-width: 640px) {
  .language-selector {
    top: 1rem;
    left: 1rem;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .lang-btn {
    min-width: 3rem;
    padding: var(--spacing-sm);
  }

  .lang-code {
    display: none;
  }
}
</style>
