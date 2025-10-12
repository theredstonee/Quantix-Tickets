<template>
  <div class="legal-page container container-md">
    <h1>{{ t.home.footer.privacy }}</h1>
    <div class="legal-content">
      <p>Privacy Policy for TRS Tickets Bot</p>
      <router-link to="/" class="btn btn-secondary mt-4">
        <i class="fas fa-arrow-left"></i> {{ t.common.back }}
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLanguageStore } from '../stores/language'
const langStore = useLanguageStore()
const t = computed(() => langStore.t)
</script>

<style scoped>
.legal-page { min-height: 100vh; padding: var(--spacing-3xl) var(--spacing-xl); }
</style>
