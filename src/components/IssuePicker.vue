<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2, Search, Ticket, X } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({
  modelValue: { type: Object, default: null },
  placeholder: { type: String, default: 'Rechercher un ticket par sujet ou n°…' },
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const settings = useSettingsStore()

const root = ref(null)
const input = ref(null)
const query = ref('')
const results = ref([])
const open = ref(false)
const loading = ref(false)
const activeIndex = ref(0)

let debounceTimer = null
let requestSequence = 0

const selected = computed(() => props.modelValue)

function subjectOf(issue) {
  return issue?.subject || `Ticket #${issue?.id ?? ''}`
}

async function search(term) {
  const sequence = ++requestSequence
  loading.value = true
  try {
    let issues = []
    const clean = term.trim()
    if (!clean) {
      const data = await settings.api.issues({
        limit: 8,
        status_id: '*',
        sort: 'updated_on:desc',
      })
      issues = data?.issues || []
    } else {
      const data = await settings.api.issues({
        subject: `~${clean}`,
        limit: 8,
        status_id: '*',
        sort: 'updated_on:desc',
      })
      issues = data?.issues || []
      if (/^#?\d+$/.test(clean)) {
        const id = Number(clean.replace('#', ''))
        if (!issues.some((issue) => issue.id === id)) {
          try {
            const one = await settings.api.issue(id, '')
            if (one?.issue) issues = [one.issue, ...issues]
          } catch {
            /* ticket introuvable : on garde la recherche textuelle */
          }
        }
      }
    }
    if (sequence === requestSequence) {
      results.value = issues
      activeIndex.value = 0
    }
  } catch {
    if (sequence === requestSequence) results.value = []
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function scheduleSearch() {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => search(query.value), 260)
}

function onFocus() {
  if (selected.value) return
  open.value = true
  if (!results.value.length) search(query.value)
  if (props.autofocus) nextTick(() => input.value?.focus())
}

function select(issue) {
  emit('update:modelValue', issue)
  query.value = ''
  results.value = []
  open.value = false
}

function clear() {
  emit('update:modelValue', null)
  nextTick(() => input.value?.focus())
}

function onKeydown(event) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % Math.max(results.value.length, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value =
      (activeIndex.value - 1 + Math.max(results.value.length, 1)) % Math.max(results.value.length, 1)
  } else if (event.key === 'Enter') {
    if (results.value[activeIndex.value]) {
      event.preventDefault()
      select(results.value[activeIndex.value])
    }
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

function onClickOutside(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

watch(query, () => {
  if (!open.value) return
  scheduleSearch()
})

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  if (props.autofocus) nextTick(() => input.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  window.clearTimeout(debounceTimer)
})
</script>

<template>
  <div ref="root" class="issue-picker">
    <div v-if="selected" class="picker-selected">
      <span class="picker-selected-icon"><Ticket :size="15" /></span>
      <span class="picker-selected-text">
        <span class="picker-selected-id mono">#{{ selected.id }}</span>
        <span class="picker-selected-subject truncate">{{ subjectOf(selected) }}</span>
        <span v-if="selected.project?.name" class="picker-selected-project truncate">
          {{ selected.project.name }}
        </span>
      </span>
      <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Changer" @click="clear">
        <X :size="14" />
      </button>
    </div>

    <div v-else class="picker-input-wrap">
      <div class="input-group">
        <Search :size="15" />
        <input
          ref="input"
          v-model="query"
          class="input"
          type="text"
          :placeholder="placeholder"
          autocomplete="off"
          @focus="onFocus"
          @keydown="onKeydown"
        />
        <span v-if="loading" class="picker-spinner"><Loader2 :size="15" class="spin" /></span>
      </div>

      <Transition name="pop">
        <div v-if="open" class="picker-dropdown">
          <div v-if="loading && !results.length" class="picker-loading">Recherche…</div>
          <template v-else-if="results.length">
            <p class="picker-hint">{{ query ? 'Résultats' : 'Tickets récents' }}</p>
            <button
              v-for="(issue, index) in results"
              :key="issue.id"
              type="button"
              class="picker-option"
              :class="{ 'is-active': index === activeIndex }"
              @mouseenter="activeIndex = index"
              @click="select(issue)"
            >
              <span class="picker-id mono">#{{ issue.id }}</span>
              <span class="picker-subject truncate">{{ issue.subject }}</span>
              <StatusBadge :status="issue.status" />
            </button>
          </template>
          <div v-else class="picker-empty">
            Aucun ticket trouvé{{ query ? ` pour « ${query} »` : '' }}.
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.issue-picker {
  position: relative;
}

.picker-input-wrap {
  position: relative;
}

.picker-spinner {
  position: absolute;
  right: 10px;
  color: var(--faint);
  display: flex;
}

.picker-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  z-index: 20;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  max-height: 320px;
  overflow-y: auto;
}

.picker-hint {
  padding: 5px 8px 4px;
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
}

.picker-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.picker-option:hover,
.picker-option.is-active {
  background: var(--surface-hover);
}

.picker-id {
  font-size: 10.5px;
  color: var(--faint);
  flex: none;
}

.picker-subject {
  flex: 1;
  font-size: 12px;
  min-width: 0;
}

.picker-empty,
.picker-loading {
  padding: 14px 10px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.picker-selected {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 7px 7px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.picker-selected-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--accent);
  flex: none;
}

.picker-selected-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.35;
}

.picker-selected-id {
  font-size: 10px;
  color: var(--faint);
}

.picker-selected-subject {
  font-size: 12px;
  font-weight: 550;
}

.picker-selected-project {
  font-size: 10px;
  color: var(--faint);
}

.spin {
  animation: spin 0.8s linear infinite;
}
</style>
