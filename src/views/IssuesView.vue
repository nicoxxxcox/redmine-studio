<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Columns3,
  Inbox,
  LayoutList,
  Loader2,
  Milestone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useUiStore } from '../stores/ui.js'
import { useRefreshStore } from '../stores/refresh.js'
import { formatDate, isOverdue, issueSprint, relativeTime, toIsoDate } from '../lib/format.js'
import { statusHue } from '../lib/constants.js'
import { filterByFavorites, withSelectedOption } from '../lib/favorites.js'
import IssueId from '../components/IssueId.vue'
import IssueRow from '../components/IssueRow.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SprintLink from '../components/SprintLink.vue'
import PriorityBadge from '../components/PriorityBadge.vue'
import UserAvatar from '../components/UserAvatar.vue'
import EmptyState from '../components/EmptyState.vue'
import ColumnResizer from '../components/ColumnResizer.vue'
import { useColumnWidths } from '../composables/useColumnWidths.js'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const ui = useUiStore()
const refresh = useRefreshStore()

function defaultProjectFilter(favoritesEnabled) {
  if (!favoritesEnabled) return ''
  return settings.favoriteProjectIds.length ? 'favorites' : 'all'
}

function defaultStatusFilter(favoritesEnabled) {
  return favoritesEnabled && settings.favoriteStatusIds.length ? 'favorites' : 'open'
}

function defaultAssigneeFilter(favoritesEnabled) {
  if (!favoritesEnabled) return ''
  return settings.favoriteUserIds.length ? 'favorites' : 'all'
}

function normalizeFavoriteFilterValues(favoritesEnabled) {
  if (!favoritesEnabled) {
    if (filters.project_id === 'favorites' || filters.project_id === 'all') filters.project_id = ''
    if (filters.status_id === 'favorites') filters.status_id = 'open'
    if (filters.assigned_to_id === 'favorites' || filters.assigned_to_id === 'all') {
      filters.assigned_to_id = ''
    }
    return
  }
  if (filters.project_id === 'favorites' && !settings.favoriteProjectIds.length) {
    filters.project_id = 'all'
  }
  if (filters.status_id === 'favorites' && !settings.favoriteStatusIds.length) {
    filters.status_id = 'open'
  }
  if (filters.assigned_to_id === 'favorites' && !settings.favoriteUserIds.length) {
    filters.assigned_to_id = 'all'
  }
}

const favoritesInitiallyEnabled = settings.hasFavorites && route.query.favorites !== '0'
const filters = reactive({
  project_id: route.query.project_id
    ? String(route.query.project_id)
    : defaultProjectFilter(favoritesInitiallyEnabled),
  status_id: route.query.status_id
    ? String(route.query.status_id)
    : defaultStatusFilter(favoritesInitiallyEnabled),
  assigned_to_id: route.query.assigned_to_id
    ? String(route.query.assigned_to_id)
    : defaultAssigneeFilter(favoritesInitiallyEnabled),
  priority_id: route.query.priority_id ? String(route.query.priority_id) : '',
  tracker_id: route.query.tracker_id ? String(route.query.tracker_id) : '',
  author_id: route.query.author_id ? String(route.query.author_id) : '',
  subject: route.query.subject ? String(route.query.subject) : '',
  sort: route.query.sort ? String(route.query.sort) : 'updated_on:desc',
  overdue: route.query.overdue === '1',
  favorites: favoritesInitiallyEnabled,
})

normalizeFavoriteFilterValues(filters.favorites)

const favoritesModeActive = computed(() => filters.favorites && settings.hasFavorites)

const view = ref(route.query.view === 'board' ? 'board' : 'list')
const search = ref(filters.subject)
const advancedOpen = ref(
  Boolean(filters.priority_id || filters.tracker_id || filters.author_id || filters.overdue),
)

const listHead = ref(null)
const {
  template: columnsTemplate,
  isCustom: columnsResized,
  beginDrag: beginColumnDrag,
  nudge: nudgeColumn,
  reset: resetColumns,
} = useColumnWidths('issues-list', {
  defaults: '76px minmax(220px, 1fr) 124px 104px 156px 132px 104px',
  count: 7,
  min: 56,
  cells: () => Array.from(listHead.value?.children ?? []),
})
const columnsStyle = computed(() =>
  columnsResized.value ? { '--issues-cols': columnsTemplate.value } : {},
)

const issues = ref([])
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const members = ref([])
const loadingMembers = ref(false)
const dragging = ref(null)
const dragOver = ref(null)
const statusSaving = ref(new Set())

const favoriteUsers = computed(() =>
  filterByFavorites(session.userDirectory, settings.favoriteUserIds),
)
const assigneeOptions = computed(() => {
  const source =
    favoritesModeActive.value && settings.favoriteUserIds.length
      ? favoriteUsers.value
      : members.value
  const selectedId = Number(filters.assigned_to_id)
  if (!Number.isFinite(selectedId) || selectedId <= 0) return source
  if (source.some((user) => user.id === selectedId)) return source
  const selected =
    members.value.find((user) => user.id === selectedId) ||
    session.userDirectory.find((user) => user.id === selectedId)
  return [selected || { id: selectedId, name: `Utilisateur #${selectedId}` }, ...source]
})

let requestSequence = 0
let filterTimer = null
let urlTimer = null
let searchTimer = null
let applyingRoute = false

const selectedProject = computed(() => {
  if (!/^\d+$/.test(String(filters.project_id || ''))) return undefined
  return session.projects.find((project) => project.id === Number(filters.project_id))
})

const favoriteProjects = computed(() =>
  filterByFavorites(session.projects, settings.favoriteProjectIds),
)
const projectOptions = computed(() =>
  withSelectedOption(
    favoritesModeActive.value ? favoriteProjects.value : session.projects,
    session.projects,
    filters.project_id,
  ),
)

const favoriteStatuses = computed(() =>
  filterByFavorites(session.statuses, settings.favoriteStatusIds),
)
const statusOptions = computed(() =>
  withSelectedOption(
    favoritesModeActive.value ? favoriteStatuses.value : session.statuses,
    session.statuses,
    filters.status_id,
  ),
)

const searchedIssueId = computed(() => {
  const match = /^#?(\d+)$/.exec(String(filters.subject || '').trim())
  return match ? match[1] : ''
})

const activeFilterCount = computed(() => {
  let count = 0
  if (filters.project_id && filters.project_id !== 'favorites' && filters.project_id !== 'all') {
    count += 1
  }
  if (filters.status_id && filters.status_id !== 'open' && filters.status_id !== 'favorites') {
    count += 1
  }
  if (
    filters.assigned_to_id &&
    filters.assigned_to_id !== 'favorites' &&
    filters.assigned_to_id !== 'all'
  ) {
    count += 1
  }
  if (filters.priority_id) count += 1
  if (filters.tracker_id) count += 1
  if (filters.author_id) count += 1
  if (filters.subject) count += 1
  if (filters.overdue) count += 1
  return count
})

const hasMore = computed(() => view.value === 'list' && issues.value.length < total.value)

const hiddenBoardStatuses = ref(new Set())

const boardStatusOptions = computed(() => {
  const present = new Set(issues.value.map((issue) => issue.status?.id).filter(Boolean))
  const columns = statusOptions.value.filter(
    (status) => !status.is_closed || present.has(status.id),
  )
  if (!settings.favoriteStatusIds.length) {
    const known = new Set(columns.map((status) => status.id))
    for (const issue of issues.value) {
      if (issue.status && !known.has(issue.status.id)) {
        columns.push(issue.status)
        known.add(issue.status.id)
      }
    }
  }
  return columns
})

const boardColumns = computed(() =>
  boardStatusOptions.value.filter((status) => !hiddenBoardStatuses.value.has(status.id)),
)

const hiddenBoardIssueCount = computed(() => {
  const visible = new Set(boardColumns.value.map((status) => status.id))
  return issues.value.filter((issue) => !visible.has(issue.status?.id)).length
})

function statusDotStyle(status) {
  const hue = statusHue(status, session.statuses)
  return hue === null ? {} : { '--status-hue': hue }
}

function issuesForStatus(statusId) {
  return issues.value.filter((issue) => issue.status?.id === statusId)
}

function isBoardStatusVisible(statusId) {
  return !hiddenBoardStatuses.value.has(statusId)
}

function toggleBoardStatus(statusId) {
  const next = new Set(hiddenBoardStatuses.value)
  if (next.has(statusId)) next.delete(statusId)
  else next.add(statusId)
  hiddenBoardStatuses.value = next
}

function showAllBoardStatuses() {
  hiddenBoardStatuses.value = new Set()
}

function sprintOf(issue) {
  return issueSprint(issue)
}

function readQuery(query) {
  applyingRoute = true
  window.clearTimeout(searchTimer)
  const favoritesEnabled = settings.hasFavorites && query.favorites !== '0'
  filters.favorites = favoritesEnabled
  filters.project_id = query.project_id
    ? String(query.project_id)
    : defaultProjectFilter(favoritesEnabled)
  filters.status_id = query.status_id
    ? String(query.status_id)
    : defaultStatusFilter(favoritesEnabled)
  filters.assigned_to_id = query.assigned_to_id
    ? String(query.assigned_to_id)
    : defaultAssigneeFilter(favoritesEnabled)
  normalizeFavoriteFilterValues(favoritesEnabled)
  filters.priority_id = query.priority_id ? String(query.priority_id) : ''
  filters.tracker_id = query.tracker_id ? String(query.tracker_id) : ''
  filters.author_id = query.author_id ? String(query.author_id) : ''
  filters.subject = query.subject ? String(query.subject) : ''
  filters.sort = query.sort ? String(query.sort) : 'updated_on:desc'
  filters.overdue = query.overdue === '1'
  search.value = filters.subject
  view.value = query.view === 'board' ? 'board' : 'list'
  window.setTimeout(() => {
    applyingRoute = false
  }, 0)
}

function toRouteQuery() {
  const query = {}
  if (filters.project_id) query.project_id = filters.project_id
  if (filters.status_id && filters.status_id !== 'open') query.status_id = filters.status_id
  if (filters.assigned_to_id) query.assigned_to_id = filters.assigned_to_id
  if (filters.priority_id) query.priority_id = filters.priority_id
  if (filters.tracker_id) query.tracker_id = filters.tracker_id
  if (filters.author_id) query.author_id = filters.author_id
  if (filters.subject) query.subject = filters.subject
  if (filters.sort && filters.sort !== 'updated_on:desc') query.sort = filters.sort
  if (filters.overdue) query.overdue = '1'
  if (!filters.favorites && settings.hasFavorites) query.favorites = '0'
  if (view.value === 'board') query.view = 'board'
  return query
}

function queryEquals(a, b) {
  const normalize = (query) => {
    const entries = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)])
      .sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(entries)
  }
  return normalize(a) === normalize(b)
}

function syncUrl() {
  const query = toRouteQuery()
  if (queryEquals(query, route.query)) return
  router.replace({ name: 'issues', query })
}

function simpleApiParams(offset = 0) {
  return {
    project_id: filters.project_id || undefined,
    status_id: filters.status_id || 'open',
    assigned_to_id: filters.assigned_to_id || undefined,
    priority_id: filters.priority_id || undefined,
    tracker_id: filters.tracker_id || undefined,
    author_id: filters.author_id || undefined,
    subject: !searchedIssueId.value && filters.subject ? `~${filters.subject}` : undefined,
    issue_id: searchedIssueId.value || undefined,
    due_date: filters.overdue ? `<${toIsoDate()}` : undefined,
    sort: filters.sort,
    limit: view.value === 'board' ? 100 : 50,
    offset,
  }
}

/**
 * Redmine accepte les filtres avancés `f[]` / `op[]` / `v[]` via l'API. Ils
 * permettent de filtrer sur plusieurs favoris à la fois, ce que les paramètres
 * simples (`status_id=1`) ne permettent pas.
 */
function advancedApiParams(offset = 0) {
  const fields = []
  const operators = {}
  const values = {}

  function add(field, operator, list = []) {
    fields.push(field)
    operators[field] = operator
    if (list.length) values[field] = list.map(String)
  }

  const favoriteProjectIds = settings.favoriteProjectIds.map(String)
  if (filters.project_id === 'favorites') {
    if (favoriteProjectIds.length) add('project_id', '=', favoriteProjectIds)
  } else if (filters.project_id && filters.project_id !== 'all') {
    add('project_id', '=', [filters.project_id])
  }

  const favoriteStatusIds = settings.favoriteStatusIds.map(String)
  const favoriteStatusSet = new Set(favoriteStatusIds)
  if (filters.status_id === 'favorites') {
    if (favoriteStatusIds.length) add('status_id', '=', favoriteStatusIds)
    else add('status_id', 'o')
  } else if (filters.status_id === 'open') {
    if (favoriteStatusIds.length) {
      const openIds = session.statuses
        .filter((status) => favoriteStatusSet.has(String(status.id)) && !status.is_closed)
        .map((status) => status.id)
      add('status_id', '=', openIds.length ? openIds : ['0'])
    } else {
      add('status_id', 'o')
    }
  } else if (filters.status_id === 'closed') {
    if (favoriteStatusIds.length) {
      const closedIds = session.statuses
        .filter((status) => favoriteStatusSet.has(String(status.id)) && status.is_closed)
        .map((status) => status.id)
      add('status_id', '=', closedIds.length ? closedIds : ['0'])
    } else {
      add('status_id', 'c')
    }
  } else if (filters.status_id === '*' || filters.status_id === 'all') {
    add('status_id', '*')
  } else if (filters.status_id) {
    add('status_id', '=', [filters.status_id])
  } else {
    add('status_id', 'o')
  }

  if (filters.assigned_to_id === 'favorites') {
    const favoriteUserIds = settings.favoriteUserIds.map(String)
    if (favoriteUserIds.length) add('assigned_to_id', '=', favoriteUserIds)
  } else if (filters.assigned_to_id === 'me') {
    add('assigned_to_id', '=', ['me'])
  } else if (filters.assigned_to_id === '!*' || filters.assigned_to_id === 'unassigned') {
    add('assigned_to_id', '!*')
  } else if (filters.assigned_to_id && filters.assigned_to_id !== 'all') {
    add('assigned_to_id', '=', [filters.assigned_to_id])
  }

  if (filters.priority_id) add('priority_id', '=', [filters.priority_id])
  if (filters.tracker_id) add('tracker_id', '=', [filters.tracker_id])
  if (filters.author_id === 'me') add('author_id', '=', ['me'])
  else if (filters.author_id) add('author_id', '=', [filters.author_id])

  if (searchedIssueId.value) add('issue_id', '=', [searchedIssueId.value])
  else if (filters.subject) add('subject', '~', [filters.subject])
  if (filters.overdue) add('due_date', '<', [toIsoDate()])

  const params = {
    sort: filters.sort,
    limit: view.value === 'board' ? 100 : 50,
    offset,
    'f[]': fields,
  }
  for (const field of fields) {
    params[`op[${field}]`] = operators[field]
    if (values[field]?.length) params[`v[${field}][]`] = values[field]
  }
  return params
}

function apiParams(offset = 0) {
  return favoritesModeActive.value ? advancedApiParams(offset) : simpleApiParams(offset)
}

async function load({ append = false } = {}) {
  const sequence = ++requestSequence
  const offset = append ? issues.value.length : 0
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = ''

  try {
    const data = await settings.api.issues(apiParams(offset))
    if (sequence !== requestSequence) return
    const list = data?.issues || []
    issues.value = append ? [...issues.value, ...list] : list
    total.value = data?.total_count ?? list.length
    enrichSprints(list, offset, sequence)
  } catch (err) {
    if (sequence !== requestSequence) return
    error.value = err?.message || 'Impossible de charger les tickets.'
    if (!append) {
      issues.value = []
      total.value = 0
    }
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

/**
 * L'API REST Redmine n'expose pas le sprint du plugin Scrum. On complète donc
 * les tickets à partir de la page HTML de la liste (colonne « Sprint »), sans
 * bloquer l'affichage et sans écraser le repli « version cible ».
 */
async function enrichSprints(list, offset, sequence) {
  if (!list.length) return
  const ids = new Set(list.map((issue) => issue.id))
  try {
    const sprints = await settings.api.webIssueSprints(apiParams(offset))
    if (sequence !== requestSequence) return
    // On parcourt `issues.value` (et non la liste brute) pour que l'ajout du
    // sprint passe par le proxy réactif et rafraîchisse immédiatement la vue.
    for (const issue of issues.value) {
      if (!ids.has(issue.id)) continue
      const sprint = sprints.get(issue.id)
      if (sprint) issue.sprint = sprint
    }
  } catch {
    // Sprint indisponible : le repli sur la version cible reste appliqué.
  }
}

function scheduleReload() {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => load(), 160)
}

function scheduleUrlSync() {
  window.clearTimeout(urlTimer)
  urlTimer = window.setTimeout(syncUrl, 360)
}

async function loadMembers() {
  if (!/^\d+$/.test(String(filters.project_id || ''))) {
    members.value = []
    return
  }
  loadingMembers.value = true
  try {
    members.value = await session.membersFor(Number(filters.project_id))
  } catch {
    members.value = []
  } finally {
    loadingMembers.value = false
  }
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  if (value === filters.subject) return
  searchTimer = window.setTimeout(() => {
    filters.subject = value.trim()
  }, 280)
})

watch(
  filters,
  () => {
    if (applyingRoute) return
    scheduleReload()
    scheduleUrlSync()
  },
  { deep: true },
)

watch(view, () => {
  if (applyingRoute) return
  scheduleReload()
  scheduleUrlSync()
})

watch(
  () => filters.project_id,
  () => {
    loadMembers()
  },
)

watch(
  () => route.query,
  (query) => {
    if (route.name !== 'issues') return
    if (queryEquals(toRouteQuery(), query)) return
    readQuery(query)
    load()
  },
  { deep: true },
)

watch(
  () => filters.overdue,
  (value) => {
    if (value) advancedOpen.value = true
  },
)

watch(
  () => settings.favoriteUserIds,
  (ids) => {
    if (ids.length) session.ensureUsers(ids)
  },
  { immediate: true },
)

watch(
  () => settings.hasFavorites,
  (hasFavorites) => {
    if (hasFavorites) return
    filters.favorites = false
    if (filters.project_id === 'favorites' || filters.project_id === 'all') filters.project_id = ''
    if (filters.status_id === 'favorites') filters.status_id = 'open'
    if (filters.assigned_to_id === 'favorites' || filters.assigned_to_id === 'all') {
      filters.assigned_to_id = ''
    }
  },
)

watch(
  () => settings.favoriteProjectIds.length,
  (length) => {
    if (!length && filters.project_id === 'favorites') {
      filters.project_id = filters.favorites ? 'all' : ''
    }
  },
)

watch(
  () => settings.favoriteStatusIds.length,
  (length) => {
    if (!length && filters.status_id === 'favorites') filters.status_id = 'open'
  },
)

watch(
  () => settings.favoriteUserIds.length,
  (length) => {
    if (!length && filters.assigned_to_id === 'favorites') {
      filters.assigned_to_id = filters.favorites ? 'all' : ''
    }
  },
)

function resetFilters() {
  filters.project_id = favoritesModeActive.value
    ? settings.favoriteProjectIds.length
      ? 'favorites'
      : 'all'
    : ''
  filters.status_id =
    favoritesModeActive.value && settings.favoriteStatusIds.length ? 'favorites' : 'open'
  filters.assigned_to_id = favoritesModeActive.value
    ? settings.favoriteUserIds.length
      ? 'favorites'
      : 'all'
    : ''
  filters.priority_id = ''
  filters.tracker_id = ''
  filters.author_id = ''
  filters.subject = ''
  filters.sort = 'updated_on:desc'
  filters.overdue = false
  search.value = ''
  advancedOpen.value = false
}

function toggleFavoritesMode() {
  if (!settings.hasFavorites) return
  if (filters.favorites) {
    filters.favorites = false
    if (filters.project_id === 'favorites' || filters.project_id === 'all') filters.project_id = ''
    if (filters.status_id === 'favorites') filters.status_id = 'open'
    if (filters.assigned_to_id === 'favorites' || filters.assigned_to_id === 'all') {
      filters.assigned_to_id = ''
    }
    return
  }

  filters.favorites = true
  filters.project_id = settings.favoriteProjectIds.length ? 'favorites' : 'all'
  filters.status_id = settings.favoriteStatusIds.length ? 'favorites' : 'open'
  filters.assigned_to_id = settings.favoriteUserIds.length ? 'favorites' : 'all'
}

function toggleQuick(key) {
  if (key === 'mine') {
    filters.assigned_to_id = filters.assigned_to_id === 'me' ? '' : 'me'
  } else if (key === 'unassigned') {
    filters.assigned_to_id = filters.assigned_to_id === '!*' ? '' : '!*'
  } else if (key === 'overdue') {
    filters.overdue = !filters.overdue
  } else if (key === 'created') {
    filters.author_id = filters.author_id === 'me' ? '' : 'me'
  } else if (key === 'open') {
    const defaultStatus =
      favoritesModeActive.value && settings.favoriteStatusIds.length ? 'favorites' : 'open'
    filters.status_id = filters.status_id === '*' ? defaultStatus : '*'
  }
}

function setView(nextView) {
  view.value = nextView
}

function openComposer(status = null) {
  const projectId = /^\d+$/.test(String(filters.project_id || ''))
    ? Number(filters.project_id)
    : null
  ui.openIssueComposer({
    projectId,
    statusId: status?.id || null,
  })
}

function setStatusSaving(issueId, value) {
  const next = new Set(statusSaving.value)
  if (value) next.add(issueId)
  else next.delete(issueId)
  statusSaving.value = next
}

async function changeStatus(issue, status) {
  if (!issue || !status || issue.status?.id === status.id || statusSaving.value.has(issue.id)) return

  const previous = issue.status
  setStatusSaving(issue.id, true)
  issue.status = status
  try {
    await settings.api.updateIssue(issue.id, { status_id: status.id })
    toast.success(`Ticket #${issue.id} : statut « ${status.name} ».`)
    refresh.bumpIssue()
  } catch (err) {
    issue.status = previous
    toast.error(err?.message || 'Le changement de statut a été refusé.')
  } finally {
    setStatusSaving(issue.id, false)
  }
}

function onDragStart(issue, event) {
  dragging.value = issue
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(issue.id))
}

async function onDrop(status) {
  dragOver.value = null
  const issue = dragging.value
  dragging.value = null
  if (!issue || issue.status?.id === status.id) return

  const previous = issue.status
  issue.status = status
  try {
    await settings.api.updateIssue(issue.id, { status_id: status.id })
    toast.success(`Ticket #${issue.id} déplacé vers « ${status.name} ».`)
    refresh.bumpIssue()
  } catch (err) {
    issue.status = previous
    toast.error(err?.message || 'Le changement de statut a été refusé.')
  }
}

onMounted(() => {
  load()
  loadMembers()
})

onBeforeUnmount(() => {
  window.clearTimeout(filterTimer)
  window.clearTimeout(urlTimer)
  window.clearTimeout(searchTimer)
})

// Recharge lorsqu'un ticket est modifié ailleurs (tableau, détails…).
watch(() => refresh.issueVersion, () => load())
</script>

<template>
  <div class="page issues-page">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title">Tickets</h1>
        <p class="page-subtitle">
          <template v-if="loading && !issues.length">Chargement des tickets…</template>
          <template v-else>
            {{ total }} ticket{{ total > 1 ? 's' : '' }}
            <template v-if="selectedProject"> dans <strong>{{ selectedProject.name }}</strong></template>
            <template v-if="view === 'board' && total > issues.length">
              · {{ issues.length }} affichés
            </template>
          </template>
        </p>
      </div>
      <div class="page-actions">
        <div class="segmented" aria-label="Affichage">
          <button type="button" :class="{ 'is-active': view === 'list' }" @click="setView('list')">
            <LayoutList /> Liste
          </button>
          <button type="button" :class="{ 'is-active': view === 'board' }" @click="setView('board')">
            <Columns3 /> Tableau
          </button>
        </div>
        <button class="btn btn-primary" type="button" @click="openComposer()">
          <Plus :size="15" /> Nouveau ticket
        </button>
      </div>
    </header>

    <section class="filters-card card">
      <div class="filters-main">
        <div class="search-box input-group">
          <Search :size="15" />
          <input
            v-model="search"
            class="input"
            type="search"
            placeholder="Rechercher un sujet ou un n°…"
            aria-label="Rechercher un ticket par sujet ou numéro"
          />
          <button
            v-if="search"
            class="search-clear"
            type="button"
            aria-label="Effacer la recherche"
            @click="search = ''"
          >
            <X :size="13" />
          </button>
        </div>

        <select
          v-model="filters.project_id"
          class="select filter-select"
          aria-label="Projet"
          :title="
            favoritesModeActive
              ? 'Projets limités à vos favoris'
              : 'Filtrer par projet'
          "
        >
          <option v-if="favoritesModeActive" value="all">Tous les projets</option>
          <option v-else value="">Tous les projets</option>
          <option
            v-if="favoritesModeActive && settings.favoriteProjectIds.length"
            value="favorites"
          >
            Projets favoris ({{ settings.favoriteProjectIds.length }})
          </option>
          <option v-for="project in projectOptions" :key="project.id" :value="String(project.id)">
            {{ project.name }}
          </option>
        </select>

        <select
          v-model="filters.status_id"
          class="select filter-select filter-status"
          aria-label="Statut"
          :title="
            favoritesModeActive
              ? 'Statuts limités à vos favoris'
              : 'Filtrer par statut'
          "
        >
          <option
            v-if="favoritesModeActive && settings.favoriteStatusIds.length"
            value="favorites"
          >
            Statuts favoris ({{ settings.favoriteStatusIds.length }})
          </option>
          <option value="open">
            {{
              favoritesModeActive && settings.favoriteStatusIds.length
                ? 'Statuts ouverts favoris'
                : 'Statuts ouverts'
            }}
          </option>
          <option value="closed">
            {{
              favoritesModeActive && settings.favoriteStatusIds.length
                ? 'Statuts fermés favoris'
                : 'Statuts fermés'
            }}
          </option>
          <option value="*">Tous les statuts</option>
          <option v-for="status in statusOptions" :key="status.id" :value="String(status.id)">
            {{ status.name }}
          </option>
        </select>

        <select
          v-model="filters.assigned_to_id"
          class="select filter-select filter-assignee"
          aria-label="Assigné à"
          :disabled="loadingMembers && !settings.favoriteUserIds.length"
          :title="
            favoritesModeActive
              ? 'Utilisateurs limités à vos favoris'
              : 'Filtrer par assigné'
          "
        >
          <option
            v-if="favoritesModeActive && settings.favoriteUserIds.length"
            value="favorites"
          >
            Assignés favoris
          </option>
          <option v-if="favoritesModeActive" value="all">Toute l'équipe</option>
          <option v-else value="">Toute l'équipe</option>
          <option value="me">Moi</option>
          <option value="!*">Non assigné</option>
          <option v-for="member in assigneeOptions" :key="member.id" :value="String(member.id)">
            {{ [member.firstname, member.lastname].filter(Boolean).join(' ') || member.name }}
          </option>
        </select>

        <button
          class="btn filter-more"
          :class="{ 'is-active': advancedOpen || activeFilterCount > 2 }"
          type="button"
          @click="advancedOpen = !advancedOpen"
        >
          <SlidersHorizontal :size="14" />
          Filtres
          <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
        </button>
      </div>

      <div class="quick-filters">
        <button
          type="button"
          class="quick-chip"
          :class="{ 'is-active': filters.assigned_to_id === 'me' }"
          @click="toggleQuick('mine')"
        >
          Mes tickets
        </button>
        <button
          type="button"
          class="quick-chip"
          :class="{ 'is-active': filters.overdue }"
          @click="toggleQuick('overdue')"
        >
          En retard
        </button>
        <button
          type="button"
          class="quick-chip"
          :class="{ 'is-active': filters.author_id === 'me' }"
          @click="toggleQuick('created')"
        >
          Créés par moi
        </button>
        <button
          type="button"
          class="quick-chip"
          :class="{ 'is-active': filters.assigned_to_id === '!*' }"
          @click="toggleQuick('unassigned')"
        >
          Non assignés
        </button>
        <button
          type="button"
          class="quick-chip"
          :class="{ 'is-active': filters.status_id === '*' }"
          @click="toggleQuick('open')"
        >
          Tous les statuts
        </button>
        <button
          v-if="settings.hasFavorites"
          type="button"
          class="quick-chip favorites-shortcut"
          :class="{ 'is-active': favoritesModeActive }"
          :aria-pressed="favoritesModeActive"
          :title="
            favoritesModeActive
              ? 'Désactiver le filtrage par favoris'
              : 'Activer le filtrage par favoris'
          "
          @click="toggleFavoritesMode"
        >
          <Star :size="11" /> Favoris
        </button>
        <RouterLink
          v-if="settings.hasFavorites"
          class="favorites-manage"
          :to="{ name: 'settings' }"
          title="Gérer les favoris"
          aria-label="Gérer les favoris"
        >
          <Settings2 :size="12" />
        </RouterLink>
        <button
          v-if="activeFilterCount"
          type="button"
          class="quick-chip quick-reset"
          @click="resetFilters"
        >
          <X :size="11" /> Réinitialiser
        </button>
        <button
          class="refresh-btn"
          type="button"
          title="Actualiser"
          :disabled="loading"
          @click="load()"
        >
          <RefreshCw :size="13" :class="{ spin: loading }" />
        </button>
      </div>

      <Transition name="slide">
        <div v-if="advancedOpen" class="filters-advanced">
          <div class="field">
            <label class="field-label">Priorité</label>
            <select v-model="filters.priority_id" class="select">
              <option value="">Toutes</option>
              <option v-for="priority in session.priorities" :key="priority.id" :value="String(priority.id)">
                {{ priority.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Tracker</label>
            <select v-model="filters.tracker_id" class="select">
              <option value="">Tous</option>
              <option v-for="tracker in session.trackers" :key="tracker.id" :value="String(tracker.id)">
                {{ tracker.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Tri</label>
            <select v-model="filters.sort" class="select">
              <option value="updated_on:desc">Dernière activité</option>
              <option value="created_on:desc">Plus récents</option>
              <option value="priority:desc,updated_on:desc">Priorité</option>
              <option value="due_date:asc">Échéance</option>
              <option value="subject:asc">Sujet (A→Z)</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Auteur</label>
            <select v-model="filters.author_id" class="select">
              <option value="">Tous</option>
              <option value="me">Moi</option>
            </select>
          </div>
          <label class="checkbox advanced-check">
            <input v-model="filters.overdue" type="checkbox" />
            Uniquement les tickets en retard
          </label>
        </div>
      </Transition>
    </section>

    <div v-if="error" class="issues-error">
      <span>{{ error }}</span>
      <button class="btn btn-sm" type="button" @click="load()">
        <RefreshCw :size="13" /> Réessayer
      </button>
    </div>

    <div v-if="view === 'list'" class="card issues-card">
      <div
        class="issues-scroll"
        :class="{ 'is-resized': columnsResized }"
        :style="columnsStyle"
      >
        <div ref="listHead" class="issue-table-head issues-grid">
          <span>
            N°
            <ColumnResizer
              label="Ajuster la colonne N°"
              @start="beginColumnDrag($event, 0)"
              @nudge="nudgeColumn(0, $event)"
              @reset="resetColumns"
            />
          </span>
          <span>
            Sujet
            <ColumnResizer
              label="Ajuster la colonne Sujet"
              @start="beginColumnDrag($event, 1)"
              @nudge="nudgeColumn(1, $event)"
              @reset="resetColumns"
            />
          </span>
          <span class="col-status">
            Statut
            <ColumnResizer
              label="Ajuster la colonne Statut"
              @start="beginColumnDrag($event, 2)"
              @nudge="nudgeColumn(2, $event)"
              @reset="resetColumns"
            />
          </span>
          <span class="col-priority">
            Priorité
            <ColumnResizer
              label="Ajuster la colonne Priorité"
              @start="beginColumnDrag($event, 3)"
              @nudge="nudgeColumn(3, $event)"
              @reset="resetColumns"
            />
          </span>
          <span class="col-assignee">
            Assigné
            <ColumnResizer
              label="Ajuster la colonne Assigné"
              @start="beginColumnDrag($event, 4)"
              @nudge="nudgeColumn(4, $event)"
              @reset="resetColumns"
            />
          </span>
          <span class="col-sprint">
            Sprints
            <ColumnResizer
              label="Ajuster la colonne Sprints"
              @start="beginColumnDrag($event, 5)"
              @nudge="nudgeColumn(5, $event)"
              @reset="resetColumns"
            />
          </span>
          <span class="col-updated">Activité</span>
        </div>

        <div v-if="loading && !issues.length" class="issue-skeletons">
          <div v-for="index in 8" :key="index" class="skeleton-issue issues-grid">
            <span class="skeleton" style="width: 34px; height: 11px"></span>
            <span class="skeleton" style="height: 14px; width: 70%"></span>
            <span class="skeleton" style="height: 19px; width: 80px"></span>
            <span class="skeleton" style="height: 12px; width: 60px"></span>
            <span class="skeleton" style="height: 22px; width: 110px"></span>
            <span class="skeleton" style="height: 12px; width: 70px"></span>
            <span class="skeleton" style="height: 11px; width: 60px"></span>
          </div>
        </div>

        <template v-else-if="issues.length">
          <IssueRow
            v-for="issue in issues"
            :key="issue.id"
            :issue="issue"
            :status-busy="statusSaving.has(issue.id)"
            :subject-link-only="filters.assigned_to_id === 'me'"
            @change-status="changeStatus(issue, $event)"
          />
        </template>

        <EmptyState
          v-else
          :icon="Inbox"
          title="Aucun ticket ne correspond"
          text="Essayez d'élargir les filtres ou de modifier votre recherche."
        >
          <button class="btn btn-sm" type="button" @click="resetFilters">
            <X :size="13" /> Réinitialiser les filtres
          </button>
        </EmptyState>
      </div>

      <footer v-if="issues.length" class="issues-foot">
        <span class="text-xs muted">
          {{ issues.length }} sur {{ total }} ticket{{ total > 1 ? 's' : '' }}
        </span>
        <button
          v-if="hasMore"
          class="btn btn-sm"
          type="button"
          :disabled="loadingMore"
          @click="load({ append: true })"
        >
          <Loader2 v-if="loadingMore" :size="13" class="spin" />
          Charger plus
        </button>
      </footer>
    </div>

    <div v-else class="board-wrap">
      <div class="board-toolbar">
        <span class="board-toolbar-label">Statuts affichés</span>
        <div class="board-status-filters" role="group" aria-label="Filtrer les colonnes par statut">
          <button
            v-for="status in boardStatusOptions"
            :key="status.id"
            type="button"
            class="board-status-chip"
            :class="{ 'is-active': isBoardStatusVisible(status.id) }"
            :aria-pressed="isBoardStatusVisible(status.id)"
            :title="`${isBoardStatusVisible(status.id) ? 'Masquer' : 'Afficher'} le statut ${status.name}`"
            @click="toggleBoardStatus(status.id)"
          >
            <span class="board-status-dot" :style="statusDotStyle(status)"></span>
            <span class="board-chip-name">{{ status.name }}</span>
            <span class="board-count">{{ issuesForStatus(status.id).length }}</span>
          </button>
        </div>
        <button
          v-if="hiddenBoardStatuses.size"
          class="board-status-reset"
          type="button"
          @click="showAllBoardStatuses"
        >
          Tout afficher
        </button>
      </div>

      <div v-if="boardColumns.length" class="board">
        <section
          v-for="status in boardColumns"
          :key="status.id"
          class="board-column"
          :class="{ 'is-drag-over': dragOver === status.id }"
          @dragover.prevent="dragOver = status.id"
          @dragleave.self="dragOver = null"
          @drop.prevent="onDrop(status)"
        >
          <header class="board-column-head">
            <span class="board-status-dot" :style="statusDotStyle(status)"></span>
            <span class="board-column-name">{{ status.name }}</span>
            <span class="board-count">{{ issuesForStatus(status.id).length }}</span>
            <button
              class="board-add"
              type="button"
              title="Créer un ticket dans ce statut"
              @click="openComposer(status)"
            >
              <Plus :size="13" />
            </button>
          </header>

          <div class="board-column-body">
            <article
              v-for="issue in issuesForStatus(status.id)"
              :key="issue.id"
              class="board-card"
              :class="{ 'is-dragging': dragging?.id === issue.id, 'is-overdue': isOverdue(issue) }"
              draggable="true"
              tabindex="0"
              @dragstart="onDragStart(issue, $event)"
              @dragend="dragging = null; dragOver = null"
              @click="router.push({ name: 'issue', params: { id: issue.id } })"
              @keydown.enter="router.push({ name: 'issue', params: { id: issue.id } })"
            >
              <div class="board-card-top">
                <IssueId :id="issue.id" class="board-card-id" />
                <PriorityBadge :priority="issue.priority" :show-label="false" />
              </div>
              <p class="board-card-subject">{{ issue.subject }}</p>
              <SprintLink v-if="sprintOf(issue)" class="board-card-sprint" :sprint="sprintOf(issue)">
                <Milestone :size="10" /> {{ sprintOf(issue).value }}
              </SprintLink>
              <div class="board-card-meta">
                <span class="truncate">{{ issue.project?.name }}</span>
                <span
                  v-if="issue.due_date"
                  class="board-due"
                  :class="{ 'is-late': isOverdue(issue) }"
                >
                  {{ formatDate(issue.due_date) }}
                </span>
              </div>
              <div class="board-card-foot">
                <UserAvatar v-if="issue.assigned_to" :user="issue.assigned_to" :size="21" />
                <span v-else class="board-unassigned">Non assigné</span>
                <span class="board-updated">{{ relativeTime(issue.updated_on) }}</span>
              </div>
            </article>

            <button class="board-empty" type="button" @click="openComposer(status)">
              <Plus :size="14" /> Ajouter un ticket
            </button>
          </div>
        </section>
      </div>

      <EmptyState
        v-else
        :icon="Inbox"
        title="Aucun statut affiché"
        text="Réactivez au moins un statut pour afficher les colonnes et les tickets du tableau."
      >
        <button class="btn btn-sm" type="button" @click="showAllBoardStatuses">
          <X :size="13" /> Tout afficher
        </button>
      </EmptyState>

      <p v-if="hiddenBoardIssueCount" class="board-note">
        {{ hiddenBoardIssueCount }} ticket{{ hiddenBoardIssueCount > 1 ? 's' : '' }} masqué{{
          hiddenBoardIssueCount > 1 ? 's' : ''
        }}
        par le filtre de statut.
      </p>
      <p v-if="total > issues.length" class="board-note">
        {{ issues.length }} tickets affichés sur {{ total }}. Affinez les filtres pour voir les
        autres.
      </p>
    </div>
  </div>
</template>

<style scoped>
.filters-card {
  margin-bottom: 14px;
  overflow: visible;
}

.filters-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 190px;
}

.search-box .input {
  padding-right: 32px;
}

.search-clear {
  position: absolute;
  right: 6px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
}

.search-clear:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.filter-select {
  width: auto;
  min-width: 128px;
  max-width: 220px;
  flex: none;
}

.filter-status {
  min-width: 138px;
}

.filter-more {
  flex: none;
  min-height: 36px;
  gap: 6px;
}

.filter-more.is-active {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
  background: var(--accent-soft);
}

.filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
}

.quick-filters {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px 10px;
  flex-wrap: wrap;
}

.quick-chip {
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  font-weight: 550;
  transition: all var(--transition);
}

.quick-chip:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.quick-chip.is-active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
}

.favorites-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.favorites-shortcut.is-active {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: var(--accent-soft);
  color: var(--accent);
}

.favorites-manage {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--faint);
}

.favorites-manage:hover {
  border-color: var(--line-strong);
  color: var(--accent);
}

.quick-reset {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-color: transparent;
  background: transparent;
  color: var(--faint);
}

.refresh-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--faint);
}

.refresh-btn:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.filters-advanced {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.advanced-check {
  height: 36px;
  white-space: nowrap;
  font-size: 14px;
}

.issues-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--red) 25%, var(--line));
  border-radius: var(--radius);
  background: var(--red-soft);
  color: var(--red);
  font-size: 14.5px;
}

.issues-error .btn {
  margin-left: auto;
}

.issues-card {
  overflow: hidden;
}

.issues-scroll {
  overflow-x: auto;
}

@media (min-width: 1241px) {
  .issues-scroll.is-resized .issues-grid {
    min-width: max-content;
  }
}

.issue-skeleton {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--line);
}

.skeleton-issue {
  padding: 13px 16px;
  border-bottom: 1px solid var(--line);
}

.issues-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
}

.board-wrap {
  min-width: 0;
}

.board-toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  margin-bottom: 10px;
}

.board-toolbar-label {
  flex: none;
  color: var(--faint);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board-status-filters {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow-x: auto;
  padding: 1px;
  scrollbar-width: none;
}

.board-status-filters::-webkit-scrollbar {
  display: none;
}

.board-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  font-weight: 550;
  transition: all var(--transition);
}

.board-status-chip:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.board-status-chip.is-active {
  border-color: color-mix(in srgb, var(--accent) 26%, var(--line));
  background: var(--accent-soft);
  color: var(--ink);
}

.board-status-chip:not(.is-active) {
  border-style: dashed;
  background: transparent;
  opacity: 0.55;
}

.board-status-chip .board-status-dot {
  width: 6px;
  height: 6px;
}

.board-status-chip .board-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 12px;
}

.board-status-reset {
  flex: none;
  margin-left: auto;
  padding: 3px 5px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}

.board-status-reset:hover {
  background: var(--accent-soft);
}

.board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 10px;
  align-items: flex-start;
  scroll-snap-type: x proximity;
}

.board-column {
  width: 278px;
  min-width: 278px;
  max-height: calc(100vh - 280px);
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  scroll-snap-align: start;
  transition: border-color var(--transition), background var(--transition);
}

.board-column.is-drag-over {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.board-column-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--line);
}

.board-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
  background: hsl(var(--status-hue, 210) 62% 42%);
}

:global([data-theme='dark'] .board-status-dot) {
  background: hsl(var(--status-hue, 210) 72% 64%);
}

.board-column-name {
  font-size: 14px;
  font-weight: 650;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.board-add {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
}

.board-add:hover {
  background: var(--surface);
  color: var(--accent);
}

.board-column-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
  overflow-y: auto;
  min-height: 80px;
}

.board-card {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  cursor: grab;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}

.board-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-sm);
}

.board-card.is-dragging {
  opacity: 0.45;
  transform: rotate(1deg);
}

.board-card.is-overdue {
  box-shadow: inset 2px 0 0 var(--red), var(--shadow-xs);
}

.board-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.board-card-id {
  font-size: 12px;
  color: var(--faint);
}

.board-card-subject {
  font-size: 14.5px;
  font-weight: 550;
  line-height: 1.4;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.board-card-sprint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  height: 17px;
  margin-top: 5px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--violet-soft);
  color: var(--violet);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-card-sprint svg {
  flex: none;
}

.board-card-sprint:not(.is-static):hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.board-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--faint);
}

.board-due.is-late {
  color: var(--red);
  font-weight: 600;
}

.board-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--line);
}

.board-unassigned {
  font-size: 12px;
  color: var(--faint);
  font-style: italic;
}

.board-updated {
  font-size: 12px;
  color: var(--faint);
}

.board-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  min-height: 54px;
  border: 1px dashed var(--line-strong);
  border-radius: 9px;
  background: transparent;
  color: var(--faint);
  font-size: 13px;
}

.board-empty:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface);
}

.board-note {
  margin-top: 8px;
  font-size: 13px;
  color: var(--faint);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1240px) {
  .filters-advanced {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .advanced-check {
    grid-column: span 2;
  }
  .issue-table-head :deep(.col-resizer) {
    display: none;
  }
}

@media (max-width: 860px) {
  .filters-main {
    gap: 7px;
  }
  .filter-select {
    max-width: none;
    flex: 1;
    min-width: 120px;
  }
  .search-box {
    flex-basis: 100%;
  }
  .filter-more {
    margin-left: auto;
  }
  .board-column {
    max-height: none;
  }
}

@media (max-width: 640px) {
  .board-toolbar-label {
    display: none;
  }
  .filters-advanced {
    grid-template-columns: minmax(0, 1fr);
  }
  .advanced-check {
    grid-column: auto;
  }
  .quick-filters {
    overflow-x: auto;
    flex-wrap: nowrap;
    scrollbar-width: none;
  }
  .quick-filters::-webkit-scrollbar {
    display: none;
  }
  .quick-chip {
    flex: none;
  }
  .refresh-btn {
    flex: none;
  }
}
</style>
