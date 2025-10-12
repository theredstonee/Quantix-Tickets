<template>
  <div class="transcript-page container">
    <h1>Transcript #{{ $route.params.id }}</h1>
    <div v-if="loading" class="loading"><div class="spinner"></div></div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="transcript-content" v-html="content"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const content = ref('')
const loading = ref(true)
const error = ref(null)

async function loadTranscript() {
  try {
    const res = await axios.get(`/api/transcript/${route.params.id}`)
    content.value = res.data.html
  } catch (err) {
    error.value = 'Transcript not found'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTranscript()
})
</script>

<style scoped>
.transcript-page { min-height: 100vh; padding: var(--spacing-2xl); }
.transcript-content { background: var(--color-card-bg); padding: var(--spacing-xl); border-radius: var(--radius-lg); }
</style>
