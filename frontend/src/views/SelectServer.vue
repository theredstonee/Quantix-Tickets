<template>
  <div class="select-server">
    <div class="container container-md">
      <div class="page-header">
        <h1>
          <i class="fas fa-server"></i>
          {{ t.serverSelection.title }}
        </h1>
        <p class="subtitle">{{ t.serverSelection.subtitle }}</p>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>{{ t.common.loading }}</p>
      </div>

      <div v-else-if="error" class="error-state card">
        <i class="fas fa-exclamation-triangle"></i>
        <p>{{ error }}</p>
        <button @click="loadServers" class="btn btn-primary">
          <i class="fas fa-redo"></i>
          {{ t.common.refresh }}
        </button>
      </div>

      <div v-else-if="servers.length === 0" class="no-servers card">
        <i class="fas fa-server"></i>
        <h3>{{ t.serverSelection.noServers }}</h3>
        <p>{{ t.serverSelection.noServersDesc }}</p>
        <router-link to="/" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i>
          {{ t.common.back }}
        </router-link>
      </div>

      <div v-else class="servers-grid">
        <div
          v-for="server in servers"
          :key="server.id"
          :class="['server-card', { selected: selectedServer === server.id }]"
          @click="selectServer(server.id)"
        >
          <div class="server-header">
            <div class="server-icon">
              <img v-if="server.icon" :src="server.icon" :alt="server.name" />
              <i v-else class="fas fa-shield-alt"></i>
            </div>
            <div class="server-info">
              <h3 class="server-name">
                {{ server.name }}
                <span v-if="currentGuild === server.id" class="current-badge">
                  {{ t.serverSelection.current }}
                </span>
              </h3>
              <p class="server-id">{{ server.id }}</p>
            </div>
          </div>
          <div class="server-check">
            <i class="fas fa-check-circle"></i>
          </div>
        </div>
      </div>

      <div v-if="servers.length > 0" class="actions">
        <button
          @click="confirmSelection"
          :disabled="!selectedServer"
          class="btn btn-primary btn-lg"
        >
          <i class="fas fa-check"></i>
          {{ t.serverSelection.select }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLanguageStore } from '../stores/language'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const router = useRouter()
const langStore = useLanguageStore()
const authStore = useAuthStore()
const t = computed(() => langStore.t)

const servers = ref([])
const selectedServer = ref(null)
const currentGuild = ref(null)
const loading = ref(true)
const error = ref(null)

async function loadServers() {
  try {
    loading.value = true
    error.value = null
    const response = await axios.get('/api/servers')
    servers.value = response.data.servers
    currentGuild.value = response.data.currentGuild
    selectedServer.value = currentGuild.value
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to load servers'
  } finally {
    loading.value = false
  }
}

function selectServer(serverId) {
  selectedServer.value = serverId
}

async function confirmSelection() {
  if (!selectedServer.value) return

  try {
    await axios.post('/api/select-server', { guildId: selectedServer.value })
    authStore.selectGuild(selectedServer.value)
    router.push('/panel')
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to select server'
  }
}

onMounted(() => {
  loadServers()
})
</script>

<style scoped>
.select-server {
  min-height: 100vh;
  padding: var(--spacing-3xl) var(--spacing-xl);
  background: var(--color-bg-secondary);
}

.page-header {
  text-align: center;
  margin-bottom: var(--spacing-3xl);
  padding-top: var(--spacing-2xl);
}

.page-header h1 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.page-header h1 i {
  color: var(--color-primary);
}

.subtitle {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  margin: 0;
}

.loading-state,
.error-state,
.no-servers {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-3xl);
  text-align: center;
}

.loading-state .spinner {
  width: 3rem;
  height: 3rem;
  border-width: 4px;
}

.error-state i,
.no-servers i {
  font-size: 4rem;
  color: var(--color-text-muted);
}

.servers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
}

.server-card {
  position: relative;
  background: var(--color-card-bg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--spacing-xl);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: var(--shadow-sm);
}

.server-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.server-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: var(--shadow-lg);
}

[data-theme="dark"] .server-card.selected {
  background: var(--color-bg-tertiary);
}

.server-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.server-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.server-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.server-icon i {
  font-size: 2rem;
  color: var(--color-text-muted);
}

.server-info {
  flex: 1;
  min-width: 0;
}

.server-name {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0 0 var(--spacing-xs) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.current-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-success);
  color: white;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

[data-theme="dark"] .current-badge {
  background: var(--color-primary);
  color: #000;
}

.server-id {
  font-size: var(--font-size-xs);
  font-family: monospace;
  color: var(--color-text-muted);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-check {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  font-size: 1.5rem;
  color: var(--color-primary);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.server-card.selected .server-check {
  opacity: 1;
}

.actions {
  display: flex;
  justify-content: center;
  padding-top: var(--spacing-xl);
}

.actions .btn {
  min-width: 250px;
}

/* Responsive */
@media (max-width: 640px) {
  .select-server {
    padding: var(--spacing-xl) var(--spacing-md);
  }

  .page-header {
    padding-top: var(--spacing-xl);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
  }

  .servers-grid {
    grid-template-columns: 1fr;
  }

  .server-card {
    padding: var(--spacing-lg);
  }

  .server-icon {
    width: 48px;
    height: 48px;
  }

  .server-name {
    font-size: var(--font-size-base);
    flex-direction: column;
    align-items: flex-start;
  }

  .actions .btn {
    width: 100%;
  }
}
</style>
