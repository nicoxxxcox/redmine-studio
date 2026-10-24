<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { useSettingsStore } from '../stores/settings.js'
import { useUiStore } from '../stores/ui.js'
import UserAvatar from './UserAvatar.vue'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
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
const ui = useUiStore()

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
    to: { name: 'issues', query: { favorites: '0' } },
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

async function logout() {
  if (!window.confirm('Se déconnecter de Redmine Studio ? Votre clé API sera oubliée.')) return
  ui.toggleSidebar(false)
  session.reset()
  settings.disconnect()
  router.push({ name: 'setup' })
}
</script>

<template>
  <aside
    id="app-sidebar"
    class="sidebar"
    :class="{ 'is-open': ui.sidebarOpen, 'is-collapsed': ui.sidebarCollapsed }"
    aria-label="Navigation principale"
  >
    <button
      class="sidebar-toggle"
      type="button"
      :title="ui.sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'"
      :aria-label="ui.sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'"
      aria-controls="app-sidebar"
      :aria-expanded="!ui.sidebarCollapsed"
      @click="ui.toggleSidebarCollapsed()"
    >
      <ChevronRight v-if="ui.sidebarCollapsed" :size="14" />
      <ChevronLeft v-else :size="14" />
    </button>

    <div class="sidebar-head">
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="brand"
        :title="ui.sidebarCollapsed ? 'Redmine Studio — Tableau de bord' : undefined"
        aria-label="Redmine Studio — Tableau de bord"
        @click="ui.toggleSidebar(false)"
      >
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
          :title="ui.sidebarCollapsed ? item.label : undefined"
          :aria-label="item.label"
          @click="go(item.to)"
        >
          <component :is="item.icon" :size="16.5" class="nav-icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </div>

    <div class="sidebar-foot">
      <button
        type="button"
        class="nav-item"
        :class="{ 'is-active': router.currentRoute.value.name === 'settings' }"
        :title="ui.sidebarCollapsed ? 'Paramètres' : undefined"
        aria-label="Paramètres"
        @click="go({ name: 'settings' })"
      >
        <Settings2 :size="16.5" class="nav-icon" />
        <span>Paramètres</span>
      </button>

      <div class="sidebar-user" :title="ui.sidebarCollapsed ? session.displayName || 'Utilisateur' : undefined">
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

      <div
        class="sidebar-status"
        :title="ui.sidebarCollapsed ? 'API Redmine connectée' : undefined"
        :aria-label="ui.sidebarCollapsed ? 'API Redmine connectée' : undefined"
      >
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
  transition: width 220ms var(--ease);
}

.sidebar-toggle {
  position: absolute;
  top: 26px;
  right: -11px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.sidebar-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface);
}

.sidebar-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.brand-name span {
  color: var(--accent);
  margin-left: 2px;
}

.brand-sub {
  font-size: 12.5px;
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

.nav-label {
  padding: 0 9px;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
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
  font-size: 15px;
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
  font-size: 14.5px;
}

.sidebar-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 9px 2px;
  font-size: 12.5px;
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

@media (min-width: 981px) {
  .sidebar.is-collapsed {
    width: var(--sidebar-w-collapsed);
  }

  .sidebar.is-collapsed .sidebar-head {
    justify-content: center;
    padding-right: 10px;
    padding-left: 10px;
  }

  .sidebar.is-collapsed .brand {
    flex: 1;
    justify-content: center;
  }

  .sidebar.is-collapsed .brand-text {
    display: none;
  }

  .sidebar.is-collapsed .sidebar-scroll {
    padding-right: 9px;
    padding-left: 9px;
  }

  .sidebar.is-collapsed .nav-label {
    display: none;
  }

  .sidebar.is-collapsed .nav-item {
    justify-content: center;
    padding-right: 0;
    padding-left: 0;
  }

  .sidebar.is-collapsed .nav-item > span {
    display: none;
  }

  .sidebar.is-collapsed .sidebar-foot {
    padding-right: 9px;
    padding-left: 9px;
  }

  .sidebar.is-collapsed .sidebar-user {
    flex-direction: column;
    gap: 5px;
    padding: 8px 4px;
  }

  .sidebar.is-collapsed .sidebar-user-text {
    display: none;
  }

  .sidebar.is-collapsed .sidebar-user .btn {
    width: 28px;
    min-height: 28px;
    height: 28px;
  }

  .sidebar.is-collapsed .sidebar-status {
    justify-content: center;
    padding: 8px 0 0;
  }

  .sidebar.is-collapsed .sidebar-status > span:not(.status-dot) {
    display: none;
  }
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
  .sidebar-toggle {
    display: none;
  }
  .sidebar-backdrop {
    display: block;
  }
}
</style>
