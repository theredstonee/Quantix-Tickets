<template>
  <div class="tickets-page">
    <div class="container">
      <h1><i class="fas fa-ticket-alt"></i> {{ t.tickets.title }}</h1>
      <div class="controls">
        <input v-model="search" :placeholder="t.common.search" class="search-input" />
        <select v-model="statusFilter">
          <option value="all">{{ t.tickets.all }}</option>
          <option value="offen">{{ t.tickets.statusOpen }}</option>
          <option value="geschlossen">{{ t.tickets.statusClosed }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading"><div class="spinner"></div></div>

      <table v-else class="tickets-table">
        <thead>
          <tr>
            <th>{{ t.tickets.id }}</th>
            <th>{{ t.tickets.status }}</th>
            <th>{{ t.tickets.topic }}</th>
            <th>{{ t.tickets.user }}</th>
            <th>{{ t.tickets.created }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ticket in filteredTickets" :key="ticket.id">
            <td>{{ ticket.id }}</td>
            <td>{{ ticket.status }}</td>
            <td>{{ ticket.topic }}</td>
            <td>{{ ticket.userId }}</td>
            <td>{{ new Date(ticket.timestamp).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLanguageStore } from '../stores/language'
import axios from 'axios'

const langStore = useLanguageStore()
const t = computed(() => langStore.t)

const tickets = ref([])
const search = ref('')
const statusFilter = ref('all')
const loading = ref(true)

const filteredTickets = computed(() => {
  let filtered = tickets.value
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(t => t.status === statusFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    filtered = filtered.filter(t =>
      t.id.toString().includes(q) ||
      t.topic.toLowerCase().includes(q) ||
      t.userId.includes(q)
    )
  }
  return filtered
})

async function loadTickets() {
  try {
    const res = await axios.get('/api/tickets')
    tickets.value = res.data.tickets
  } catch (err) {
    console.error('Failed to load tickets', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTickets()
})
</script>

<style scoped>
.tickets-page { min-height: 100vh; padding: var(--spacing-2xl); }
h1 { display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-xl); }
.controls { display: flex; gap: var(--spacing-md); margin-bottom: var(--spacing-xl); }
.search-input { flex: 1; }
.tickets-table { width: 100%; border-collapse: collapse; }
.tickets-table thead { background: var(--color-bg-secondary); }
.tickets-table th, .tickets-table td { padding: var(--spacing-md); text-align: left; border-bottom: 1px solid var(--color-border); }
.tickets-table tbody tr:hover { background: var(--color-bg-secondary); }
</style>
