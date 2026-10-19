import { createRouter, createWebHashHistory } from 'vue-router'
import { useSettingsStore } from './stores/settings.js'
import AppShell from './components/AppShell.vue'
import SetupView from './views/SetupView.vue'
import DashboardView from './views/DashboardView.vue'
import IssuesView from './views/IssuesView.vue'
import IssueDetailView from './views/IssueDetailView.vue'
import TimeView from './views/TimeView.vue'
import ProjectsView from './views/ProjectsView.vue'
import SettingsView from './views/SettingsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: SetupView,
      meta: { public: true, title: 'Connexion' },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView,
          meta: { title: 'Tableau de bord' },
        },
        {
          path: 'issues',
          name: 'issues',
          component: IssuesView,
          meta: { title: 'Tickets' },
        },
        {
          path: 'issues/:id(\\d+)',
          name: 'issue',
          component: IssueDetailView,
          meta: { title: 'Ticket' },
        },
        {
          path: 'time',
          name: 'time',
          component: TimeView,
          meta: { title: 'Temps' },
        },
        {
          path: 'projects',
          name: 'projects',
          component: ProjectsView,
          meta: { title: 'Projets' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
          meta: { title: 'Paramètres' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const settings = useSettingsStore()
  if (!settings.configured && to.name !== 'setup') {
    return { name: 'setup' }
  }
  if (settings.configured && to.name === 'setup' && !to.query.edit) {
    return { name: 'dashboard' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · Redmine Studio` : 'Redmine Studio'
})

export default router
