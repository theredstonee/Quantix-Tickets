<template>
  <div id="app" :data-theme="theme">
    <ThemeToggle />
    <LanguageSelector />
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { useLanguageStore } from './stores/language'
import { useAuthStore } from './stores/auth'
import ThemeToggle from './components/ThemeToggle.vue'
import LanguageSelector from './components/LanguageSelector.vue'

const themeStore = useThemeStore()
const langStore = useLanguageStore()
const authStore = useAuthStore()

const theme = themeStore.theme

onMounted(() => {
  themeStore.loadTheme()
  langStore.loadLanguage()
  authStore.checkAuth()
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
