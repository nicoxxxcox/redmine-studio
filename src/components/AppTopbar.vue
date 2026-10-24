<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Menu, Moon, Plus, Search, Sun, Clock3 } from 'lucide-vue-next'
import { useUiStore } from '../stores/ui.js'
import { useSettingsStore } from '../stores/settings.js'
import { useTheme } from '../lib/theme.js'
import { toIsoDate } from '../lib/format.js'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const settings = useSettingsStore()
const { resolved, toggle } = useTheme()

const title = computed(() => {
  if (route.name === 'issue') return `Ticket #${route.params.id}`
  return route.meta?.title || 'Redmine Studio'
})

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button class="menu-btn" type="button" @click="ui.toggleSidebar(true)">
        <Menu :size="18" />
        <span class="sr-only">Ouvrir le menu</span>
      </button>
      <div class="topbar-title">
        <span class="topbar-eyebrow">{{ route.name === 'issue' ? 'Détail du ticket' : 'Redmine Studio' }}</span>
        <span class="topbar-page">{{ title }}</span>
      </div>
    </div>

    <div class="topbar-actions">
      <button class="search-trigger" type="button" @click="ui.openCommand()">
        <Search :size="15" />
        <span class="search-placeholder">Rechercher un ticket…</span>
        <kbd class="kbd">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
      </button>

      <button
        class="btn btn-ghost btn-icon topbar-icon-btn"
        type="button"
        :title="resolved === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'"
        @click="toggle"
      >
        <Sun v-if="resolved === 'dark'" :size="17" />
        <Moon v-else :size="17" />
      </button>

      <button
        class="btn btn-ghost time-btn"
        type="button"
        title="Saisir du temps"
        @click="ui.openTimeEntry({ spent_on: toIsoDate() })"
      >
        <Clock3 :size="15" />
        <span class="hide-mobile">Temps</span>
      </button>

      <button class="btn btn-primary" type="button" @click="ui.openIssueComposer()">
        <Plus :size="16" />
        <span class="hide-mobile">Nouveau ticket</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--topbar-h);
  padding: 0 28px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.menu-btn {
  display: none;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
}

.topbar-title {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.topbar-eyebrow {
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--faint);
}

.topbar-page {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  height: 34px;
  padding: 0 7px 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--faint);
  font-size: 14.5px;
  text-align: left;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.search-trigger:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-xs);
}

.search-placeholder {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-trigger .kbd {
  font-size: 12px;
  height: 19px;
}

.topbar-icon-btn {
  width: 34px;
  min-height: 34px;
}

.time-btn {
  min-height: 34px;
  padding: 6px 10px;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--muted);
}

.time-btn:hover {
  background: var(--surface-3);
  border-color: transparent;
  color: var(--ink);
}

@media (max-width: 1180px) {
  .search-trigger {
    width: 190px;
  }
}

@media (max-width: 980px) {
  .topbar {
    padding: 0 16px;
  }
  .menu-btn {
    display: grid;
  }
}

@media (max-width: 860px) {
  .search-trigger {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
  .search-placeholder,
  .search-trigger .kbd {
    display: none;
  }
  .topbar-eyebrow {
    display: none;
  }
}

@media (max-width: 640px) {
  .topbar {
    height: 60px;
    padding: 0 12px;
  }
  .time-btn {
    display: none;
  }
  .topbar-title {
    display: none;
  }
  .topbar-actions {
    flex: 1;
    justify-content: flex-end;
  }
  .topbar-icon-btn {
    display: none;
  }
}
</style>
