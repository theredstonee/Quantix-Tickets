import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const selectedGuild = ref(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  async function checkAuth() {
    try {
      loading.value = true
      const response = await axios.get('/api/auth/me')
      user.value = response.data.user
      selectedGuild.value = response.data.selectedGuild
    } catch (error) {
      user.value = null
      selectedGuild.value = null
    } finally {
      loading.value = false
    }
  }

  function logout() {
    window.location.href = '/logout'
  }

  function login() {
    window.location.href = '/login'
  }

  function selectGuild(guildId) {
    selectedGuild.value = guildId
  }

  return {
    user,
    selectedGuild,
    loading,
    isAuthenticated,
    checkAuth,
    logout,
    login,
    selectGuild
  }
})
