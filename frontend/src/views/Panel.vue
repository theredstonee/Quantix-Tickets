<template>
  <div class="panel-page">
    <div class="container">
      <div class="page-header">
        <h1><i class="fas fa-cog"></i> {{ t.panel.title }}</h1>
        <router-link to="/tickets" class="btn btn-secondary">
          <i class="fas fa-ticket-alt"></i> {{ t.panel.ticketHistory }}
        </router-link>
      </div>

      <div v-if="loading" class="loading"><div class="spinner"></div></div>

      <div v-else class="panel-content">
        <div class="message-bar" v-if="message">
          <div :class="['message', messageType]">{{ message }}</div>
        </div>

        <form @submit.prevent="saveConfig" class="config-form">
          <div class="grid grid-cols-2">
            <!-- Server Settings -->
            <div class="card">
              <h3><i class="fas fa-server"></i> {{ t.panel.serverSettings }}</h3>
              <div class="form-group">
                <label>{{ t.panel.ticketCategory }}</label>
                <select v-model="config.ticketCategoryId">
                  <option value="">Select Category</option>
                  <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                    📁 {{ cat.name }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>{{ t.panel.logChannel }}</label>
                <select v-model="config.logChannelId">
                  <option value="">Select Channel</option>
                  <option v-for="ch in channels" :key="ch.id" :value="ch.id">
                    # {{ ch.name }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Topics -->
            <div class="card">
              <h3><i class="fas fa-list"></i> {{ t.panel.topics }}</h3>
              <div v-for="(topic, idx) in config.topics" :key="idx" class="topic-row">
                <input v-model="topic.label" placeholder="Label" />
                <input v-model="topic.emoji" placeholder="Emoji" style="width:60px" />
                <button type="button" @click="config.topics.splice(idx, 1)" class="btn-danger btn-sm">✖</button>
              </div>
              <button type="button" @click="addTopic" class="btn btn-secondary btn-sm">+ Add Topic</button>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> {{ t.common.save }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLanguageStore } from '../stores/language'
import axios from 'axios'

const langStore = useLanguageStore()
const t = computed(() => langStore.t)

const config = ref({ topics: [], ticketCategoryId: '', logChannelId: '' })
const channels = ref([])
const categories = ref([])
const loading = ref(true)
const message = ref('')
const messageType = ref('success')

async function loadConfig() {
  try {
    const res = await axios.get('/api/config')
    config.value = res.data.config
    channels.value = res.data.channels
    categories.value = res.data.categories
  } catch (err) {
    message.value = 'Failed to load config'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  try {
    await axios.post('/api/config', config.value)
    message.value = t.value.panel.saved
    messageType.value = 'success'
  } catch (err) {
    message.value = t.value.panel.error
    messageType.value = 'error'
  }
}

function addTopic() {
  config.value.topics.push({ label: '', value: '', emoji: '' })
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.panel-page { min-height: 100vh; padding: var(--spacing-2xl); background: var(--color-bg-secondary); }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-2xl); }
.loading { text-align: center; padding: var(--spacing-3xl); }
.card { padding: var(--spacing-xl); margin-bottom: var(--spacing-xl); }
.card h3 { margin-bottom: var(--spacing-lg); display: flex; align-items: center; gap: var(--spacing-sm); }
.form-group { margin-bottom: var(--spacing-md); }
.topic-row { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
.form-actions { display: flex; justify-content: center; padding-top: var(--spacing-xl); }
.message { padding: var(--spacing-md); border-radius: var(--radius-md); margin-bottom: var(--spacing-lg); }
.message.success { background: var(--color-primary-light); color: var(--color-success); }
.message.error { background: #fee; color: var(--color-danger); }
@media (max-width: 768px) { .grid-cols-2 { grid-template-columns: 1fr; } }
</style>
