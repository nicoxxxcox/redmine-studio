<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { useSettingsStore } from '../stores/settings.js'
import { useTimerStore } from '../stores/timer.js'
import { useUiStore } from '../stores/ui.js'
import UserAvatar from './UserAvatar.vue'
import {
  BarChart3,
  Clock3,
  FolderKanban,
  Inbox,
  LogOut,
  Settings2,
  Ticket,
  X,
} from 'lucide-vue-next'

const router = useRouter()
const session = useSessionStore()
const settings = useSettingsStore()
const timer = useTimerStore()
const ui = useUiStore()

const showcaseProjects = computed(() => session.projects.slice(0, 7))

const navItems = computed(() => [
  {
    label: 'Tableau de bord',
    icon: BarChart3,
    to: { name: 'dashboard' },
    active: (route) => route.name === 'dashboard',
  },
  {
    label: 'Mes tickets',
    icon: Inbox,
    to: { name: 'issues', query: { assigned_to_id: 'me', status_id: 'open' } },
    active: (route) =>
      route.name === 'issues' && route.query.assigned_to_id === 'me' && route.query.status_id === 'open',
  },
  {
    label: 'Tous les tickets',
    icon: Ticket,
    to: { name: 'issues' },
    active: (route) => route.name === 'issues' && route.query.assigned_to_id !== 'me',
  },
  {
    label: 'Temps',
    icon: Clock3,
    to: { name: 'time' },
    active: (route) => route.name === 'time',
  },
  {
    label: 'Projets',
    icon: FolderKanban,
    to: { name: 'projects' },
    active: (route) => route.name === 'projects',
  },
])

function isActive(item) {
  return item.active(router.currentRoute.value)
}

function go(to) {
  ui.toggleSidebar(false)
  router.push(to)
}

function projectLink(project) {
  return { name: 'issues', query: { project_id: project.id, status_id: 'open' } }
}

function isProjectActive(project) {
  const route = router.currentRoute.value
  return route.name === 'issues' && String(route.query.project_id) === String(project.id)
}

async function logout() {
  if (!window.confirm('Se déconnecter de Redmine Studio ? Votre clé API sera oubliée.')) return
  ui.toggleSidebar(false)
  timer.cancel()
  session.reset()
  settings.disconnect()
  router.push({ name: 'setup' })
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': ui.sidebarOpen }" aria-label="Navigation principale">
    <div class="sidebar-head">
      <RouterLink :to="{ name: 'dashboard' }" class="brand" @click="ui.toggleSidebar(false)">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="26" height="26">
            <rect width="64" height="64" rx="17" fill="currentColor" opacity=".16" />
            <path
              d="M23 25h18M23 32h18M23 39h11"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
            />
            <circle cx="46" cy="46" r="8.5" fill="var(--surface)" stroke="currentColor" stroke-width="3.4" />
            <path d="M46 42.6v3.6l2.7 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">Redmine<span>Studio</span></span>
          <span class="brand-sub">Espace de travail</span>
        </span>
      </RouterLink>
      <button class="sidebar-close" type="button" @click="ui.toggleSidebar(false)">
        <X :size="17" />
        <span class="sr-only">Fermer le menu</span>
      </button>
    </div>

    <div class="sidebar-scroll">
      <nav class="nav-section" aria-label="Espace de travail">
        <p class="nav-label">Espace de travail</p>
        <button
          v-for="item in navItems"
          :key="item.label"
          type="button"
          class="nav-item"
          :class="{ 'is-active': isActive(item) }"
          @click="go(item.to)"
        >
          <component :is="item.icon" :size="16.5" class="nav-icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <nav v-if="showcaseProjects.length" class="nav-section" aria-label="Projets">
        <div class="nav-label-row">
          <p class="nav-label">Projets</p>
          <button class="nav-mini-link" type="button" @click="go({ name: 'projects' })">
            Tout voir
          </button>
        </div>
        <button
          v-for="project in showcaseProjects"
          :key="project.id"
          type="button"
          class="nav-item nav-project"
          :class="{ 'is-active': isProjectActive(project) }"
          @click="go(projectLink(project))"
        >
          <span
            class="project-dot"
            :style="{ background: `hsl(${(project.id * 47) % 360} 62% 52%)` }"
          ></span>
          <span class="truncate">{{ project.name }}</span>
        </button>
      </nav>
    </div>

    <div class="sidebar-foot">
      <button
        type="button"
        class="nav-item"
        :class="{ 'is-active': router.currentRoute.value.name === 'settings' }"
        @click="go({ name: 'settings' })"
      >
        <Settings2 :size="16.5" class="nav-icon" />
        <span>Paramètres</span>
      </button>

      <div class="sidebar-user">
        <UserAvatar :name="session.displayName" :size="32" />
        <div class="sidebar-user-text">
          <span class="strong truncate">{{ session.displayName || 'Utilisateur' }}</span>
          <span class="text-xs muted truncate">
            {{ session.user?.login ? `@${session.user.login}` : 'Connecté' }}
          </span>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Se déconnecter" @click="logout">
          <LogOut :size="14" />
          <span class="sr-only">Se déconnecter</span>
        </button>
      </div>

      <div class="sidebar-status">
        <span class="status-dot"></span>
        <span class="truncate">API Redmine connectée</span>
        <span class="text-xs faint">3.4+</span>
      </div>
    </div>
  </aside>

  <Transition name="fade">
    <div v-if="ui.sidebarOpen" class="sidebar-backdrop" @click="ui.toggleSidebar(false)"></div>
  </Transition>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  background: var(--surface);
  border-right: 1px solid var(--line);
}

.sidebar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 17px 16px 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  color: var(--ink);
  text-decoration: none;
}

.brand:hover {
  text-decoration: none;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: var(--accent);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.55), transparent 55%),
    var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-name {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.brand-name span {
  color: var(--accent);
  margin-left: 2px;
}

.brand-sub {
  font-size: 10px;
  color: var(--faint);
  letter-spacing: 0.02em;
}

.sidebar-close {
  display: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 14px;
  overscroll-behavior: contain;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 20px;
}

.nav-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 9px;
  margin-bottom: 4px;
}

.nav-label {
  padding: 0 9px;
  margin-bottom: 4px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
}

.nav-label-row .nav-label {
  padding: 0;
  margin: 0;
}

.nav-mini-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--faint);
  font-size: 10px;
  font-weight: 550;
}

.nav-mini-link:hover {
  color: var(--accent);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  transition: background var(--transition), color var(--transition);
}

.nav-item:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.nav-icon {
  flex: none;
  opacity: 0.9;
}

.nav-project {
  padding-left: 11px;
  gap: 9px;
}

.project-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex: none;
  opacity: 0.82;
}

.nav-item.is-active .project-dot {
  opacity: 1;
}

.sidebar-foot {
  padding: 8px 10px 12px;
  border-top: 1px solid var(--line);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 6px 9px 8px;
  margin-top: 4px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.sidebar-user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.3;
}

.sidebar-user-text .strong {
  font-size: 12px;
}

.sidebar-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 9px 2px;
  font-size: 10px;
  color: var(--faint);
  letter-spacing: 0.01em;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 16%, transparent);
  flex: none;
}

.sidebar-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(13, 15, 18, 0.42);
  backdrop-filter: blur(2px);
}

@media (max-width: 980px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 240ms var(--ease);
    box-shadow: var(--shadow-lg);
  }
  .sidebar.is-open {
    transform: none;
  }
  .sidebar-close {
    display: grid;
  }
  .sidebar-backdrop {
    display: block;
  }
}
</style>
