<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarChart3,
  Clock3,
  CornerDownLeft,
  Loader2,
  Plus,
  Search,
  Settings2,
  Ticket,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useUiStore } from '../stores/ui.js'
import { toIsoDate } from '../lib/format.js'
import StatusBadge from './StatusBadge.vue'

const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()

const input = ref(null)
const query = ref('')
const results = ref([])
const loading = ref(false)
const activeIndex = ref(0)
let debounceTimer = null
let sequence = 0

const quickActions = computed(() => [
  {
    id: 'new-issue',
    label: 'Créer un nouveau ticket',
    hint: 'N',
    icon: Plus,
    run: () => ui.openIssueComposer(),
  },
  {
    id: 'time',
    label: 'Saisir du temps',
    hint: 'T',
    icon: Clock3,
    run: () => ui.openTimeEntry({ spent_on: toIsoDate() }),
  },
  {
    id: 'dashboard',
    label: 'Aller au tableau de bord',
    hint: 'G D',
    icon: BarChart3,
    run: () => router.push({ name: 'dashboard' }),
  },
  {
    id: 'issues',
    label: 'Voir tous les tickets',
    hint: 'G I',
    icon: Ticket,
    run: () => router.push({ name: 'issues' }),
  },
  {
    id: 'settings',
    label: 'Ouvrir les paramètres',
    hint: 'G S',
    icon: Settings2,
    run: () => router.push({ name: 'settings' }),
  },
])

const visibleActions = computed(() =>
  query.value
    ? quickActions.value.filter((action) =>
        action.label.toLowerCase().includes(query.value.trim().toLowerCase()),
      )
    : quickActions.value,
)

const total = computed(() => (query.value ? results.value.length : visibleActions.value.length))

watch(
  () => ui.commandOpen,
  async (open) => {
    if (!open) return
    query.value = ''
    results.value = []
    activeIndex.value = 0
    await nextTick()
    input.value?.focus()
  },
)

watch(query, (value) => {
  activeIndex.value = 0
  window.clearTimeout(debounceTimer)
  if (!value.trim()) {
    results.value = []
    loading.value = false
    return
  }
  debounceTimer = window.setTimeout(() => search(value), 260)
})

async function search(term) {
  const current = ++sequence
  const clean = term.trim()
  if (!clean) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const idMatch = /^#?(\d+)$/.exec(clean)
    if (idMatch) {
      // Un numéro saisi doit retrouver le ticket même s'il est fermé.
      // On garde aussi la recherche par sujet pour les numéros présents
      // dans un libellé.
      const [byId, bySubject] = await Promise.allSettled([
        settings.api.issues({
          issue_id: idMatch[1],
          status_id: '*',
          limit: 8,
          sort: 'updated_on:desc',
        }),
        settings.api.issues({
          subject: `~${clean.replace(/^#/, '')}`,
          status_id: '*',
          limit: 8,
          sort: 'updated_on:desc',
        }),
      ])
      if (current !== sequence) return
      const merged = []
      const seen = new Set()
      for (const result of [byId, bySubject]) {
        if (result.status !== 'fulfilled') continue
        for (const issue of result.value?.issues || []) {
          if (seen.has(issue.id)) continue
          seen.add(issue.id)
          merged.push(issue)
        }
      }
      results.value = merged.slice(0, 8)
    } else {
      const data = await settings.api.issues({
        subject: `~${clean}`,
        status_id: '*',
        limit: 8,
        sort: 'updated_on:desc',
      })
      if (current === sequence) results.value = data?.issues || []
    }
  } catch {
    if (current === sequence) results.value = []
  } finally {
    if (current === sequence) loading.value = false
  }
}

function close() {
  ui.closeCommand()
}

function activate(index = activeIndex.value) {
  if (query.value) {
    const issue = results.value[index]
    if (issue) {
      close()
      router.push({ name: 'issue', params: { id: issue.id } })
    }
  } else {
    const action = visibleActions.value[index]
    if (action) {
      close()
      action.run()
    }
  }
}

function onKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % Math.max(total.value, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + Math.max(total.value, 1)) % Math.max(total.value, 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    activate()
  } else if (event.key === 'Escape') {
    close()
  }
}

onBeforeUnmount(() => window.clearTimeout(debounceTimer))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.commandOpen" class="command-root" @mousedown.self="close">
        <div class="command-panel" role="dialog" aria-modal="true" aria-label="Recherche globale">
          <div class="command-search">
            <Search :size="18" class="command-search-icon" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="Rechercher un ticket (sujet ou n°), ou naviguer…"
              autocomplete="off"
              @keydown="onKeydown"
            />
            <Loader2 v-if="loading" :size="16" class="spin" />
            <span v-else class="kbd">esc</span>
          </div>

          <div class="command-body">
            <template v-if="query && results.length">
              <p class="command-label">Tickets</p>
              <button
                v-for="(issue, index) in results"
                :key="issue.id"
                type="button"
                class="command-item"
                :class="{ 'is-active': index === activeIndex }"
                @mouseenter="activeIndex = index"
                @click="activate(index)"
              >
                <span class="command-item-icon"><Ticket :size="15" /></span>
                <span class="command-item-text">
                  <span class="command-item-title truncate">
                    <span class="mono command-id">#{{ issue.id }}</span>
                    {{ issue.subject }}
                  </span>
                  <span class="command-item-sub truncate">{{ issue.project?.name }}</span>
                </span>
                <StatusBadge :status="issue.status" />
                <CornerDownLeft v-if="index === activeIndex" :size="13" class="command-enter" />
              </button>
            </template>

            <template v-else-if="query && !loading">
              <div class="command-empty">
                Aucun ticket ne correspond à « {{ query }} ».
              </div>
            </template>

            <template v-else>
              <p class="command-label">{{ query ? 'Actions' : 'Actions rapides' }}</p>
              <button
                v-for="(action, index) in visibleActions"
                :key="action.id"
                type="button"
                class="command-item"
                :class="{ 'is-active': index === activeIndex }"
                @mouseenter="activeIndex = index"
                @click="activate(index)"
              >
                <span class="command-item-icon"><component :is="action.icon" :size="15" /></span>
                <span class="command-item-text">
                  <span class="command-item-title">{{ action.label }}</span>
                </span>
                <span class="command-hint">{{ action.hint }}</span>
                <CornerDownLeft v-if="index === activeIndex" :size="13" class="command-enter" />
              </button>
              <div v-if="query && !visibleActions.length" class="command-empty">
                Aucune action correspondante.
              </div>
            </template>
          </div>

          <div class="command-foot">
            <span><span class="kbd">↑</span><span class="kbd">↓</span> naviguer</span>
            <span><span class="kbd">↵</span> ouvrir</span>
            <span><span class="kbd">esc</span> fermer</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.command-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: min(16vh, 140px) 20px 20px;
  background: rgba(15, 17, 22, 0.42);
  backdrop-filter: blur(3px);
}

[data-theme='dark'] .command-root {
  background: rgba(0, 0, 0, 0.6);
}

.command-panel {
  width: 100%;
  max-width: 620px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: command-in 180ms var(--ease);
}

@keyframes command-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.985);
  }
}

.command-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}

.command-search-icon {
  color: var(--faint);
  flex: none;
}

.command-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--ink);
}

.command-search input::placeholder {
  color: var(--faint);
}

.command-body {
  max-height: 54vh;
  overflow-y: auto;
  padding: 6px;
}

.command-label {
  padding: 8px 10px 5px;
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--faint);
}

.command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.command-item.is-active {
  background: var(--surface-hover);
}

.command-item-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 7px;
  background: var(--surface-3);
  color: var(--muted);
}

.command-item.is-active .command-item-icon {
  background: var(--accent-soft);
  color: var(--accent);
}

.command-item-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.command-item-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 550;
}

.command-id {
  font-size: 10.5px;
  color: var(--faint);
  flex: none;
}

.command-item-sub {
  font-size: 10.5px;
  color: var(--faint);
}

.command-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--faint);
  flex: none;
}

.command-enter {
  color: var(--faint);
  flex: none;
}

.command-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--muted);
}

.command-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 10px;
  color: var(--faint);
}

.command-foot .kbd {
  margin-right: 3px;
}

.spin {
  animation: spin 0.8s linear infinite;
  color: var(--faint);
}

@media (max-width: 640px) {
  .command-root {
    padding: 70px 10px 10px;
  }
}
</style>
