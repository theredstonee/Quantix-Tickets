<template>
  <div class="legal-page container container-md">
    <h1>{{ t.home.footer.imprint }}</h1>
    <div class="legal-content">
      <p><strong>Ohev Tamerin</strong></p>
      <p>TRS Tickets © 2025</p>
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
.legal-content { line-height: 1.8; }
</style>
