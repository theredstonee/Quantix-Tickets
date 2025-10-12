<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-content container">
        <div class="hero-badge fade-in">
          <i class="fas fa-ticket-alt"></i>
          <span>Beta 0.3.0</span>
        </div>
        <h1 class="slide-down">{{ t.home.title }}</h1>
        <p class="hero-subtitle slide-up">{{ t.home.subtitle }}</p>

        <div v-if="authStore.isAuthenticated" class="user-info slide-up">
          <div class="user-avatar">
            <i class="fas fa-user-circle"></i>
          </div>
          <div class="user-details">
            <span class="user-label">{{ t.home.loggedInAs }}</span>
            <span class="user-name">{{ authStore.user.username }}</span>
          </div>
        </div>

        <div class="hero-actions slide-up">
          <button
            v-if="!authStore.isAuthenticated"
            @click="authStore.login"
            class="btn btn-primary btn-lg"
          >
            <i class="fab fa-discord"></i>
            {{ t.home.loginButton }}
          </button>
          <template v-else>
            <router-link to="/select-server" class="btn btn-primary btn-lg">
              <i class="fas fa-cog"></i>
              {{ t.home.goToPanel }}
            </router-link>
            <button @click="authStore.logout" class="btn btn-secondary btn-lg">
              <i class="fas fa-sign-out-alt"></i>
              {{ t.home.logout }}
            </button>
          </template>
        </div>
      </div>

      <div class="hero-decoration">
        <div class="decoration-circle circle-1"></div>
        <div class="decoration-circle circle-2"></div>
        <div class="decoration-circle circle-3"></div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features container">
      <div class="grid grid-cols-3">
        <div
          v-for="(feature, key) in features"
          :key="key"
          class="feature-card slide-up"
        >
          <div class="feature-icon">
            <i :class="feature.icon"></i>
          </div>
          <h3>{{ t.home.features[key].title }}</h3>
          <p>{{ t.home.features[key].description }}</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer container">
      <div class="footer-links">
        <router-link to="/imprint">
          <i class="fas fa-file-alt"></i>
          {{ t.home.footer.imprint }}
        </router-link>
        <router-link to="/terms-of-service">
          <i class="fas fa-file-contract"></i>
          {{ t.home.footer.terms }}
        </router-link>
        <router-link to="/privacy-policy">
          <i class="fas fa-lock"></i>
          {{ t.home.footer.privacy }}
        </router-link>
      </div>
      <div class="footer-copyright">
        <p>TRS Tickets © {{ new Date().getFullYear() }} | {{ t.home.footer.operatedBy }} Ohev Tamerin</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useLanguageStore } from '../stores/language'
import { useAuthStore } from '../stores/auth'

const langStore = useLanguageStore()
const authStore = useAuthStore()
const t = computed(() => langStore.t)

const features = {
  multiLanguage: { icon: 'fas fa-language' },
  webManagement: { icon: 'fas fa-tools' },
  gdpr: { icon: 'fas fa-shield-alt' },
  ticketManagement: { icon: 'fas fa-tasks' },
  dynamicForms: { icon: 'fas fa-clipboard-list' },
  darkMode: { icon: 'fas fa-moon' }
}

onMounted(() => {
  document.title = 'TRS Tickets - Home'
})
</script>

<style scoped>
.home {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Hero Section */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%);
  color: white;
  overflow: hidden;
  padding: var(--spacing-3xl) var(--spacing-xl);
}

[data-theme="dark"] .hero {
  background: linear-gradient(135deg, #0f1510 0%, #1a3a2a 100%);
}

.hero-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 800px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin-bottom: var(--spacing-lg);
  backdrop-filter: blur(10px);
}

[data-theme="dark"] .hero-badge {
  background: rgba(0, 255, 136, 0.2);
  color: var(--color-primary);
}

.hero h1 {
  font-size: var(--font-size-4xl);
  font-weight: 800;
  margin-bottom: var(--spacing-md);
  color: white;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .hero h1 {
  color: var(--color-primary);
}

.hero-subtitle {
  font-size: var(--font-size-xl);
  margin-bottom: var(--spacing-2xl);
  opacity: 0.95;
  color: white;
}

[data-theme="dark"] .hero-subtitle {
  color: var(--color-text);
}

.user-info {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-xl);
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  margin-bottom: var(--spacing-xl);
  backdrop-filter: blur(10px);
}

[data-theme="dark"] .user-info {
  background: rgba(0, 255, 136, 0.15);
}

.user-avatar i {
  font-size: 2.5rem;
  opacity: 0.9;
}

.user-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.user-label {
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

.user-name {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.hero-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
  flex-wrap: wrap;
}

.hero-actions .btn {
  min-width: 200px;
  box-shadow: var(--shadow-xl);
}

.hero-actions .btn-primary {
  background: white;
  color: var(--color-primary);
}

.hero-actions .btn-primary:hover {
  background: rgba(255, 255, 255, 0.95);
  transform: translateY(-3px);
}

[data-theme="dark"] .hero-actions .btn-primary {
  background: var(--color-primary);
  color: #000;
}

.hero-actions .btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.hero-actions .btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}

[data-theme="dark"] .hero-actions .btn-secondary {
  background: rgba(0, 255, 136, 0.2);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* Hero Decoration */
.hero-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  animation: float 20s infinite ease-in-out;
}

.circle-1 {
  width: 400px;
  height: 400px;
  top: -100px;
  right: -100px;
  animation-delay: 0s;
}

.circle-2 {
  width: 300px;
  height: 300px;
  bottom: -50px;
  left: -50px;
  animation-delay: 5s;
}

.circle-3 {
  width: 200px;
  height: 200px;
  top: 50%;
  left: 10%;
  animation-delay: 10s;
}

@keyframes float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-30px) scale(1.1); }
}

/* Features Section */
.features {
  padding: var(--spacing-3xl) var(--spacing-xl);
}

.feature-card {
  padding: var(--spacing-2xl);
  background: var(--color-card-bg);
  border: 2px solid var(--color-border);
  border-left: 5px solid var(--color-primary);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
  animation-delay: calc(var(--i) * 100ms);
}

.feature-card:hover {
  transform: translateY(-5px);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary);
}

.feature-icon {
  font-size: 3rem;
  color: var(--color-primary);
  margin-bottom: var(--spacing-lg);
}

.feature-card h3 {
  color: var(--color-primary);
  margin-bottom: var(--spacing-md);
}

.feature-card p {
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0;
}

/* Footer */
.footer {
  padding: var(--spacing-3xl) var(--spacing-xl);
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: var(--spacing-2xl);
  margin-bottom: var(--spacing-xl);
  flex-wrap: wrap;
}

.footer-links a {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  transition: color var(--transition-fast);
}

.footer-links a:hover {
  color: var(--color-primary);
}

.footer-copyright {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

/* Responsive Design */
@media (max-width: 640px) {
  .hero {
    min-height: 90vh;
    padding: var(--spacing-2xl) var(--spacing-md);
  }

  .hero h1 {
    font-size: var(--font-size-3xl);
  }

  .hero-subtitle {
    font-size: var(--font-size-lg);
  }

  .hero-actions {
    flex-direction: column;
    width: 100%;
  }

  .hero-actions .btn {
    width: 100%;
  }

  .user-info {
    flex-direction: column;
    text-align: center;
  }

  .user-details {
    align-items: center;
  }

  .features {
    padding: var(--spacing-2xl) var(--spacing-md);
  }

  .footer-links {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .decoration-circle {
    display: none;
  }
}

@media (min-width: 641px) and (max-width: 1024px) {
  .grid-cols-3 {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
