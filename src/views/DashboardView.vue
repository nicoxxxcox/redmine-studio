<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Ticket,
  TriangleAlert,
  UserRound,
  Zap,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useUiStore } from '../stores/ui.js'
import { useRefreshStore } from '../stores/refresh.js'
import {
  addDays,
  formatDate,
  formatHours,
  formatShortDay,
  isOverdue,
  relativeTime,
  startOfWeek,
  toIsoDate,
} from '../lib/format.js'
import IssueId from '../components/IssueId.vue'
import StatusBadge from '../components/StatusBadge.vue'
import StatusQuickSelect from '../components/StatusQuickSelect.vue'
import PriorityBadge from '../components/PriorityBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import ColumnResizer from '../components/ColumnResizer.vue'
import { useColumnWidths } from '../composables/useColumnWidths.js'

const router = useRouter()
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const ui = useUiStore()
const refresh = useRefreshStore()

const loading = ref(true)
const loaded = ref(false)
const error = ref('')
const myIssues = ref([])
const myTotal = ref(0)
const overdueCount = ref(0)
const createdCount = ref(0)
const recentIssues = ref([])
const entries = ref([])

const recentHead = ref(null)
const {
  template: columnsTemplate,
  isCustom: columnsResized,
  beginDrag: beginColumnDrag,
  nudge: nudgeColumn,
  reset: resetColumns,
} = useColumnWidths('dashboard-recent', {
  defaults: '52px minmax(160px, 1.4fr) minmax(100px, 1fr) 110px 90px',
  count: 5,
  min: 44,
  cells: () => Array.from(recentHead.value?.children ?? []),
})
const columnsStyle = computed(() =>
  columnsResized.value ? { '--recent-cols': columnsTemplate.value } : {},
)
const statusSaving = ref(new Set())
let loadSequence = 0

const weekStart = ref(startOfWeek(new Date()))
const weekDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart.value, index)
    const iso = toIsoDate(date)
    const hours = entries.value
      .filter((entry) => entry.spent_on === iso)
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    return { date, iso, label: formatShortDay(date), hours, isToday: iso === toIsoDate() }
  }),
)
const maxDayHours = computed(() => Math.max(1, ...weekDays.value.map((day) => day.hours)))
const weekTotal = computed(() => entries.value.reduce((sum, entry) => sum + Number(entry.hours || 0), 0))
const todayHours = computed(
  () => entries.value.filter((entry) => entry.spent_on === toIsoDate()).reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return 'Bonne nuit'
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bon après-midi'
  return 'Bonsoir'
})
const firstName = computed(() => session.user?.firstname || session.displayName || '')
const todayLabel = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())

const priorityIssues = computed(() =>
  [...myIssues.value]
    .sort((a, b) => {
      const overdueA = isOverdue(a) ? 0 : 1
      const overdueB = isOverdue(b) ? 0 : 1
      if (overdueA !== overdueB) return overdueA - overdueB
      if (a.due_date && b.due_date && a.due_date !== b.due_date) {
        return a.due_date.localeCompare(b.due_date)
      }
      return (b.priority?.id || 0) - (a.priority?.id || 0)
    })
    .slice(0, 6),
)

const stats = computed(() => [
  {
    label: 'Mes tickets ouverts',
    value: myTotal.value,
    hint: 'assignés à vous',
    icon: Inbox,
    tone: 'blue',
    to: { name: 'issues', query: { assigned_to_id: 'me', status_id: 'open' } },
  },
  {
    label: 'En retard',
    value: overdueCount.value,
    hint: 'échéance dépassée',
    icon: TriangleAlert,
    tone: 'red',
    to: {
      name: 'issues',
      query: { assigned_to_id: 'me', status_id: 'open', overdue: '1' },
    },
  },
  {
    label: 'Créés par moi',
    value: createdCount.value,
    hint: 'encore ouverts',
    icon: UserRound,
    tone: 'violet',
    to: { name: 'issues', query: { author_id: 'me', status_id: 'open' } },
  },
  {
    label: 'Temps cette semaine',
    value: formatHours(weekTotal.value),
    hint: `${formatHours(todayHours.value)} aujourd'hui`,
    icon: Clock3,
    tone: 'green',
    to: { name: 'time' },
    isText: true,
  },
])

async function load({ silent = false } = {}) {
  const sequence = ++loadSequence
  if (!silent) loading.value = true
  error.value = ''
  const today = toIsoDate()
  const from = toIsoDate(weekStart.value)
  const to = toIsoDate(addDays(weekStart.value, 6))
  const api = settings.api

  const [mine, overdue, created, time, recent] = await Promise.allSettled([
    api.issues({
      assigned_to_id: 'me',
      status_id: 'open',
      limit: 100,
      sort: 'priority:desc,due_date:asc,updated_on:desc',
    }),
    api.issues({ assigned_to_id: 'me', status_id: 'open', due_date: `<${today}`, limit: 1 }),
    api.issues({ author_id: 'me', status_id: 'open', limit: 1 }),
    api.timeEntries({ user_id: session.user?.id, from, to, limit: 100 }),
    api.issues({ status_id: '*', sort: 'updated_on:desc', limit: 7 }),
  ])

  if (sequence !== loadSequence) return

  if (mine.status === 'fulfilled') {
    myIssues.value = mine.value?.issues || []
    myTotal.value = mine.value?.total_count ?? myIssues.value.length
  } else {
    error.value = mine.reason?.message || 'Impossible de charger vos tickets.'
  }

  if (overdue.status === 'fulfilled') overdueCount.value = overdue.value?.total_count ?? 0
  if (created.status === 'fulfilled') createdCount.value = created.value?.total_count ?? 0
  if (time.status === 'fulfilled') entries.value = time.value?.time_entries || []
  if (recent.status === 'fulfilled') recentIssues.value = recent.value?.issues || []

  loading.value = false
  loaded.value = true
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
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    issue.status = previous
    toast.error(err?.message || 'Le changement de statut a été refusé.')
  } finally {
    setStatusSaving(issue.id, false)
  }
}

onMounted(load)
watch(() => refresh.timeVersion, load)
</script>

<template>
  <div class="page dashboard">
    <header class="page-head">
      <div class="page-head-main">
        <p class="dash-date">{{ todayLabel }}</p>
        <h1 class="page-title">{{ greeting }}<template v-if="firstName">, {{ firstName }}</template>.</h1>
        <p class="page-subtitle">
          Voici l'essentiel de votre activité Redmine.
          <template v-if="myTotal"> {{ myTotal }} ticket{{ myTotal > 1 ? 's' : '' }} ouverts vous attendent.</template>
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="ui.openTimeEntry({ spent_on: toIsoDate() })">
          <Clock3 :size="15" />
          Saisir du temps
        </button>
        <button class="btn btn-primary" type="button" @click="ui.openIssueComposer()">
          <Plus :size="15" />
          Nouveau ticket
        </button>
      </div>
    </header>

    <div v-if="error" class="dash-error">
      <TriangleAlert :size="16" />
      <span>{{ error }}</span>
      <button class="btn btn-sm" type="button" @click="load">
        <RefreshCw :size="13" /> Réessayer
      </button>
    </div>

    <section class="stats-grid" aria-label="Indicateurs">
      <button
        v-for="stat in stats"
        :key="stat.label"
        type="button"
        class="stat-card"
        :data-tone="stat.tone"
        @click="router.push(stat.to)"
      >
        <span class="stat-icon"><component :is="stat.icon" :size="18" /></span>
        <span class="stat-body">
          <span class="stat-label">{{ stat.label }}</span>
          <span class="stat-value" :class="{ 'is-text': stat.isText }">
            <span v-if="loading" class="skeleton stat-skeleton"></span>
            <template v-else>{{ stat.value }}</template>
          </span>
          <span class="stat-hint">{{ stat.hint }}</span>
        </span>
        <ArrowRight :size="14" class="stat-arrow" />
      </button>
    </section>

    <div class="dash-grid">
      <section class="card priority-card">
        <header class="card-head">
          <div>
            <h2 class="card-title"><Sparkles :size="15" /> À traiter en priorité</h2>
            <p class="card-sub">Vos tickets ouverts, triés par urgence et échéance.</p>
          </div>
          <RouterLink
            :to="{ name: 'issues', query: { assigned_to_id: 'me', status_id: 'open' } }"
            class="btn btn-ghost btn-sm"
          >
            Tout voir <ArrowRight :size="13" />
          </RouterLink>
        </header>

        <div v-if="loading" class="priority-skeleton">
          <div v-for="index in 4" :key="index" class="skeleton-row">
            <span class="skeleton" style="width: 58px; height: 12px"></span>
            <span class="skeleton" style="flex: 1; height: 14px"></span>
            <span class="skeleton" style="width: 70px; height: 18px"></span>
          </div>
        </div>

        <div v-else-if="priorityIssues.length" class="priority-list">
          <div
            v-for="issue in priorityIssues"
            :key="issue.id"
            class="priority-item"
            :class="{ 'is-overdue': isOverdue(issue) }"
            role="link"
            tabindex="0"
            @click="router.push({ name: 'issue', params: { id: issue.id } })"
            @keydown.enter="router.push({ name: 'issue', params: { id: issue.id } })"
          >
            <IssueId :id="issue.id" class="priority-id" />
            <div class="priority-main">
              <span class="priority-subject truncate">{{ issue.subject }}</span>
              <span class="priority-meta">
                <span class="truncate">{{ issue.project?.name }}</span>
                <span v-if="issue.due_date" class="meta-due" :class="{ 'is-late': isOverdue(issue) }">
                  <CalendarDays :size="11" />
                  {{ formatDate(issue.due_date) }}
                </span>
              </span>
            </div>
            <PriorityBadge :priority="issue.priority" :show-label="false" />
            <StatusQuickSelect
              :issue="issue"
              :busy="statusSaving.has(issue.id)"
              @change="changeStatus(issue, $event)"
            />
          </div>
        </div>

        <EmptyState
          v-else-if="loaded"
          :icon="CheckCircle2"
          title="Tout est à jour"
          text="Aucun ticket ouvert ne vous est assigné. Profitez-en, ou créez un nouveau ticket."
        >
          <button class="btn btn-sm btn-primary" type="button" @click="ui.openIssueComposer()">
            <Plus :size="14" /> Nouveau ticket
          </button>
        </EmptyState>
      </section>

      <aside class="dash-side">
        <section class="card week-card">
          <header class="card-head">
            <h2 class="card-title"><Clock3 :size="15" /> Ma semaine</h2>
            <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Actualiser" @click="load">
              <RefreshCw :size="13" :class="{ spin: loading }" />
            </button>
          </header>
          <div class="week-body">
            <div class="week-total">
              <span class="week-number">{{ formatHours(weekTotal) }}</span>
              <span class="week-caption">
                sur la semaine
                <span v-if="todayHours" class="week-today">· {{ formatHours(todayHours) }} aujourd'hui</span>
              </span>
            </div>
            <div class="week-chart">
              <div
                v-for="day in weekDays"
                :key="day.iso"
                class="week-bar-wrap"
                :title="`${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} : ${formatHours(day.hours)}`"
              >
                <span class="week-bar-value" :class="{ 'is-empty': !day.hours }">
                  {{ day.hours ? Number(day.hours).toLocaleString('fr-FR') : '' }}
                </span>
                <div class="week-bar-track">
                  <div
                    class="week-bar"
                    :class="{ 'is-today': day.isToday, 'is-empty': !day.hours }"
                    :style="{ height: day.hours ? `${Math.max(12, (day.hours / maxDayHours) * 100)}%` : '3px' }"
                  ></div>
                </div>
                <span class="week-bar-label" :class="{ 'is-today': day.isToday }">{{ day.label }}</span>
              </div>
            </div>
            <RouterLink :to="{ name: 'time' }" class="week-link">
              Voir le détail de mes temps <ArrowRight :size="13" />
            </RouterLink>
          </div>
        </section>

        <section class="card quick-card">
          <header class="card-head">
            <h2 class="card-title"><Zap :size="15" /> Actions rapides</h2>
          </header>
          <div class="quick-body">
            <button class="quick-action" type="button" @click="ui.openIssueComposer()">
              <span class="quick-icon"><Ticket :size="16" /></span>
              <span>
                <strong>Créer un ticket</strong>
                <span>Décrire un besoin ou un bug</span>
              </span>
              <Plus :size="14" class="quick-arrow" />
            </button>
            <button class="quick-action" type="button" @click="ui.openTimeEntry({ spent_on: toIsoDate() })">
              <span class="quick-icon"><Clock3 :size="16" /></span>
              <span>
                <strong>Saisir du temps</strong>
                <span>Sur un ticket existant</span>
              </span>
              <Plus :size="14" class="quick-arrow" />
            </button>
            <p class="quick-tip">
              <span class="kbd">N</span> nouveau ticket · <span class="kbd">⌘ K</span> recherche
            </p>
          </div>
        </section>
      </aside>
    </div>

    <section class="card recent-card">
      <header class="card-head">
        <div>
          <h2 class="card-title"><Clock3 :size="15" /> Activité récente</h2>
          <p class="card-sub">Les derniers tickets mis à jour sur votre Redmine.</p>
        </div>
        <RouterLink :to="{ name: 'issues' }" class="btn btn-ghost btn-sm">
          Tous les tickets <ArrowRight :size="13" />
        </RouterLink>
      </header>
      <div
        v-if="recentIssues.length"
        class="recent-list"
        :class="{ 'is-resized': columnsResized }"
        :style="columnsStyle"
      >
        <div ref="recentHead" class="recent-head">
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
          <span>
            Projet
            <ColumnResizer
              label="Ajuster la colonne Projet"
              @start="beginColumnDrag($event, 2)"
              @nudge="nudgeColumn(2, $event)"
              @reset="resetColumns"
            />
          </span>
          <span>
            Statut
            <ColumnResizer
              label="Ajuster la colonne Statut"
              @start="beginColumnDrag($event, 3)"
              @nudge="nudgeColumn(3, $event)"
              @reset="resetColumns"
            />
          </span>
          <span>Activité</span>
        </div>
        <RouterLink
          v-for="issue in recentIssues"
          :key="issue.id"
          :to="{ name: 'issue', params: { id: issue.id } }"
          class="recent-item"
        >
          <IssueId :id="issue.id" class="recent-id" />
          <span class="recent-subject truncate">{{ issue.subject }}</span>
          <span class="recent-project truncate">{{ issue.project?.name }}</span>
          <StatusBadge :status="issue.status" />
          <span class="recent-time">{{ relativeTime(issue.updated_on) }}</span>
        </RouterLink>
      </div>
      <div v-else-if="loading" class="recent-loading">
        <Loader2 :size="16" class="spin" /> Chargement de l'activité…
      </div>
      <EmptyState v-else title="Aucune activité récente" text="Les tickets mis à jour apparaîtront ici." />
    </section>
  </div>
</template>

<style scoped>
.dash-date {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 5px;
}

.dash-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 16px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--red) 25%, var(--line));
  border-radius: var(--radius);
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.dash-error .btn {
  margin-left: auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.stat-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 15px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}

.stat-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
  border-color: var(--line-strong);
}

.stat-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex: none;
  background: var(--slate-soft);
  color: var(--slate);
}

.stat-card[data-tone='blue'] .stat-icon {
  background: var(--blue-soft);
  color: var(--blue);
}
.stat-card[data-tone='red'] .stat-icon {
  background: var(--red-soft);
  color: var(--red);
}
.stat-card[data-tone='violet'] .stat-icon {
  background: var(--violet-soft);
  color: var(--violet);
}
.stat-card[data-tone='green'] .stat-icon {
  background: var(--green-soft);
  color: var(--green);
}

.stat-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.stat-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  margin-top: 3px;
  font-size: 25px;
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.stat-value.is-text {
  font-size: 20px;
  margin-top: 6px;
}

.stat-hint {
  margin-top: 2px;
  font-size: 10px;
  color: var(--faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-arrow {
  position: absolute;
  right: 12px;
  top: 14px;
  color: var(--faint);
  opacity: 0;
  transform: translateX(-3px);
  transition: all var(--transition);
}

.stat-card:hover .stat-arrow {
  opacity: 1;
  transform: none;
}

.stat-skeleton {
  width: 46px;
  height: 25px;
  display: inline-block;
  margin: 3px 0 4px;
}

.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr);
  gap: 14px;
  margin-bottom: 14px;
  align-items: start;
}

.dash-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--faint);
}

.priority-card .card-head,
.week-card .card-head,
.quick-card .card-head,
.recent-card .card-head {
  padding: 13px 16px;
}

.priority-list {
  display: flex;
  flex-direction: column;
}

.priority-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background var(--transition);
}

.priority-item:last-child {
  border-bottom: 0;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.priority-item:hover {
  background: var(--surface-hover);
}

.priority-item.is-overdue {
  box-shadow: inset 2px 0 0 var(--red);
}

.priority-id {
  font-size: 10.5px;
  color: var(--faint);
  min-width: 44px;
  flex: none;
}

.priority-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.priority-subject {
  font-size: 12.5px;
  font-weight: 550;
}

.priority-item:hover .priority-subject {
  color: var(--accent);
}

.priority-meta {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 10.5px;
  color: var(--faint);
}

.priority-meta > span:first-child {
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-due {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
}

.meta-due.is-late {
  color: var(--red);
  font-weight: 600;
}

.priority-skeleton {
  padding: 6px 16px 12px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}

.skeleton-row:last-child {
  border-bottom: 0;
}

.week-body {
  padding: 16px;
}

.week-total {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
}

.week-number {
  font-size: 27px;
  font-weight: 650;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.week-caption {
  font-size: 10.5px;
  color: var(--faint);
}

.week-today {
  color: var(--accent);
}

.week-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  height: 112px;
  padding-top: 16px;
}

.week-bar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  height: 100%;
  gap: 5px;
}

.week-bar-value {
  font-size: 9px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-height: 11px;
}

.week-bar-value.is-empty {
  opacity: 0;
}

.week-bar-track {
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 22px;
  flex: 1;
}

.week-bar {
  width: 100%;
  border-radius: 4px 4px 2px 2px;
  background: color-mix(in srgb, var(--accent) 68%, var(--surface));
  transition: height 400ms var(--ease);
  min-height: 3px;
}

.week-bar.is-today {
  background: var(--accent);
}

.week-bar.is-empty {
  background: var(--line);
}

.week-bar-label {
  font-size: 9px;
  color: var(--faint);
  text-transform: capitalize;
}

.week-bar-label.is-today {
  color: var(--accent);
  font-weight: 650;
}

.week-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  font-weight: 550;
  color: var(--muted);
}

.week-link:hover {
  color: var(--accent);
  text-decoration: none;
}

.quick-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.quick-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  transition: background var(--transition);
}

.quick-action:hover {
  background: var(--surface-hover);
}

.quick-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--muted);
}

.quick-action:hover .quick-icon {
  background: var(--accent-soft);
  color: var(--accent);
}

.quick-action > span:nth-child(2) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.quick-action strong {
  font-size: 12px;
  font-weight: 600;
}

.quick-action span span {
  font-size: 10px;
  color: var(--faint);
}

.quick-arrow {
  color: var(--faint);
  flex: none;
}

.quick-tip {
  padding: 8px 9px 3px;
  border-top: 1px solid var(--line);
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--faint);
}

.quick-tip .kbd {
  height: 17px;
  min-width: 17px;
  font-size: 9px;
  margin: 0 2px;
}

.recent-card .card-head {
  align-items: flex-start;
}

.recent-list {
  display: flex;
  flex-direction: column;
  overflow-x: auto;
}

.recent-head {
  display: grid;
  grid-template-columns: var(
    --recent-cols,
    52px minmax(160px, 1.4fr) minmax(100px, 1fr) 110px 90px
  );
  align-items: center;
  gap: 12px;
  padding: 0 16px 7px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--faint);
}

.recent-head > span {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 681px) {
  .recent-list.is-resized .recent-head,
  .recent-list.is-resized .recent-item {
    min-width: max-content;
  }
}

.recent-item {
  display: grid;
  grid-template-columns: var(
    --recent-cols,
    52px minmax(160px, 1.4fr) minmax(100px, 1fr) 110px 90px
  );
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 12px;
  text-decoration: none;
}

.recent-item:last-child {
  border-bottom: 0;
}

.recent-item:hover {
  background: var(--surface-hover);
  text-decoration: none;
}

.recent-id {
  font-size: 10px;
  color: var(--faint);
}

.recent-subject {
  font-weight: 500;
}

.recent-project {
  font-size: 10.5px;
  color: var(--faint);
}

.recent-time {
  font-size: 10px;
  color: var(--faint);
  text-align: right;
}

.recent-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 26px;
  font-size: 12px;
  color: var(--muted);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dash-grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  }
}

@media (max-width: 900px) {
  .dash-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dash-side {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

@media (max-width: 680px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .stat-card {
    padding: 12px;
    gap: 8px;
  }
  .stat-icon {
    width: 30px;
    height: 30px;
  }
  .stat-value {
    font-size: 21px;
  }
  .stat-value.is-text {
    font-size: 16px;
  }
  .dash-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .priority-item {
    flex-wrap: wrap;
  }
  .priority-item .row-status,
  .priority-item > .status-quick,
  .priority-item > .badge {
    display: none;
  }
  .recent-item {
    grid-template-columns: 44px minmax(0, 1fr) 90px;
  }
  .recent-head {
    display: none;
  }
  .recent-project,
  .recent-time {
    display: none;
  }
}
</style>
