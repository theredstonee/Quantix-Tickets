import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: { title: 'TRS Tickets - Home' }
  },
  {
    path: '/select-server',
    name: 'SelectServer',
    component: () => import('../views/SelectServer.vue'),
    meta: { requiresAuth: true, title: 'Server Selection' }
  },
  {
    path: '/panel',
    name: 'Panel',
    component: () => import('../views/Panel.vue'),
    meta: { requiresAuth: true, requiresServer: true, title: 'Admin Panel' }
  },
  {
    path: '/tickets',
    name: 'Tickets',
    component: () => import('../views/Tickets.vue'),
    meta: { requiresAuth: true, requiresServer: true, title: 'Tickets Overview' }
  },
  {
    path: '/transcript/:id',
    name: 'Transcript',
    component: () => import('../views/Transcript.vue'),
    meta: { requiresAuth: true, title: 'Transcript' }
  },
  {
    path: '/imprint',
    name: 'Imprint',
    component: () => import('../views/Imprint.vue'),
    meta: { title: 'Legal Notice' }
  },
  {
    path: '/privacy-policy',
    name: 'Privacy',
    component: () => import('../views/Privacy.vue'),
    meta: { title: 'Privacy Policy' }
  },
  {
    path: '/terms-of-service',
    name: 'Terms',
    component: () => import('../views/Terms.vue'),
    meta: { title: 'Terms of Service' }
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Update page title
  document.title = to.meta.title || 'TRS Tickets'

  // Check authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    window.location.href = '/login'
    return
  }

  // Check server selection
  if (to.meta.requiresServer && !authStore.selectedGuild) {
    next({ name: 'SelectServer' })
    return
  }

  next()
})

export default router
