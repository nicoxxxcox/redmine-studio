<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderKanban,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useUiStore } from '../stores/ui.js'
import { useRefreshStore } from '../stores/refresh.js'
import {
  addDays,
  formatDate,
  formatDay,
  formatHours,
  formatShortDay,
  startOfWeek,
  toIsoDate,
} from '../lib/format.js'
import { filterByFavorites, withSelectedOption } from '../lib/favorites.js'
import EmptyState from '../components/EmptyState.vue'
import IssueId from '../components/IssueId.vue'
import ColumnResizer from '../components/ColumnResizer.vue'
import { useColumnWidths } from '../composables/useColumnWidths.js'

const settings = useSettingsStore()
const session = useSessionStore()
const ui = useUiStore()
const refresh = useRefreshStore()

const weekStart = ref(startOfWeek(new Date()))
const entries = ref([])
const issueMap = ref({})
const loading = ref(true)
const error = ref('')
const projectFilter = ref('')
const projectOptions = computed(() =>
  withSelectedOption(
    filterByFavorites(session.projects, settings.favoriteProjectIds),
    session.projects,
    projectFilter.value,
  ),
)
let loadSequence = 0

const timeHead = ref(null)
const {
  template: columnsTemplate,
  isCustom: columnsResized,
  beginDrag: beginColumnDrag,
  nudge: nudgeColumn,
  reset: resetColumns,
} = useColumnWidths('time-entries', {
  defaults: 'minmax(190px, 1.4fr) 100px minmax(120px, 1fr) 62px 28px',
  count: 5,
  min: 48,
  cells: () => Array.from(timeHead.value?.children ?? []),
})
const columnsStyle = computed(() =>
  columnsResized.value ? { '--time-cols': columnsTemplate.value } : {},
)

const weekEnd = computed(() => addDays(weekStart.value, 6))
const weekLabel = computed(() => {
  const start = weekStart.value
  const end = weekEnd.value
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  }).format(start)
  const endLabel = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end)
  return `${startLabel} – ${endLabel}`
})

const isCurrentWeek = computed(
  () => toIsoDate(weekStart.value) === toIsoDate(startOfWeek(new Date())),
)

const days = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart.value, index)
    const iso = toIsoDate(date)
    const dayEntries = entries.value
      .filter((entry) => entry.spent_on === iso)
      .sort((a, b) => (Number(b.hours) || 0) - (Number(a.hours) || 0))
    return {
      date,
      iso,
      label: formatDay(date),
      short: formatShortDay(date),
      isToday: iso === toIsoDate(),
      entries: dayEntries,
      total: dayEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    }
  }),
)
const daysWithEntries = computed(() => days.value.filter((day) => day.entries.length))
const totalHours = computed(() =>
  entries.value.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
)
const workedDays = computed(() => days.value.filter((day) => day.total > 0).length)
const averagePerWorkedDay = computed(() =>
  workedDays.value ? totalHours.value / workedDays.value : 0,
)
const maxDayHours = computed(() => Math.max(1, ...days.value.map((day) => day.total)))
const byActivity = computed(() => {
  const map = new Map()
  for (const entry of entries.value) {
    const name = entry.activity?.name || 'Sans activité'
    map.set(name, (map.get(name) || 0) + Number(entry.hours || 0))
  }
  return [...map.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours)
})
const topActivity = computed(() => byActivity.value[0] || null)

function entryIssue(entry) {
  return entry.issue ? issueMap.value[entry.issue.id] || entry.issue : null
}

async function load() {
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  const from = toIsoDate(weekStart.value)
  const to = toIsoDate(weekEnd.value)

  try {
    const data = await settings.api.timeEntries({
      user_id: session.user?.id,
      from,
      to,
      project_id: projectFilter.value || undefined,
      limit: 100,
    })
    if (sequence !== loadSequence) return
    entries.value = data?.time_entries || []

    const ids = [...new Set(entries.value.map((entry) => entry.issue?.id).filter(Boolean))]
    if (ids.length) {
      try {
        const issuesData = await settings.api.issues({
          issue_id: ids.join(','),
          status_id: '*',
          limit: 100,
        })
        if (sequence !== loadSequence) return
        const map = {}
        for (const issue of issuesData?.issues || []) map[issue.id] = issue
        issueMap.value = map
      } catch {
        if (sequence === loadSequence) issueMap.value = {}
      }
    } else {
      issueMap.value = {}
    }
  } catch (err) {
    if (sequence !== loadSequence) return
    error.value = err?.message || 'Impossible de charger vos temps.'
    entries.value = []
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function shiftWeek(delta) {
  weekStart.value = addDays(weekStart.value, delta * 7)
  load()
}

function goToday() {
  weekStart.value = startOfWeek(new Date())
  load()
}

function openTime(entry = null, day = null) {
  const issue = entry ? entryIssue(entry) : null
  ui.openTimeEntry({
    ...(entry ? { entry } : {}),
    ...(issue ? { issue } : {}),
    spent_on: entry?.spent_on || day?.iso || toIsoDate(),
  })
}

watch(projectFilter, load)
watch(() => refresh.timeVersion, load)
onMounted(load)
</script>

<template>
  <div class="page time-page">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title">Temps</h1>
        <p class="page-subtitle">Votre feuille de temps, semaine par semaine.</p>
      </div>
      <div class="page-actions">
        <select
          v-model="projectFilter"
          class="select project-filter"
          aria-label="Filtrer par projet"
          :title="
            settings.favoriteProjectIds.length
              ? 'Projets limités à vos favoris'
              : 'Filtrer par projet'
          "
        >
          <option value="">Tous les projets</option>
          <option v-for="project in projectOptions" :key="project.id" :value="String(project.id)">
            {{ project.name }}
          </option>
        </select>
        <button class="btn btn-primary" type="button" @click="openTime()">
          <Plus :size="15" /> Saisir du temps
        </button>
      </div>
    </header>

    <div class="week-toolbar card">
      <div class="week-nav">
        <button class="btn btn-icon btn-sm" type="button" title="Semaine précédente" @click="shiftWeek(-1)">
          <ChevronLeft :size="16" />
        </button>
        <button class="btn btn-icon btn-sm" type="button" title="Semaine suivante" @click="shiftWeek(1)">
          <ChevronRight :size="16" />
        </button>
        <div class="week-title">
          <span class="week-range">{{ weekLabel }}</span>
          <button v-if="!isCurrentWeek" class="week-today-btn" type="button" @click="goToday">
            Revenir à cette semaine
          </button>
          <span v-else class="week-now">Semaine en cours</span>
        </div>
      </div>
      <div class="week-toolbar-stats">
        <span class="toolbar-stat">
          <Clock3 :size="14" />
          <strong>{{ formatHours(totalHours) }}</strong>
          <span class="muted">cette semaine</span>
        </span>
        <span class="toolbar-stat hide-mobile">
          <CalendarDays :size="14" />
          <strong>{{ workedDays }}</strong>
          <span class="muted">jour{{ workedDays > 1 ? 's' : '' }} saisi{{ workedDays > 1 ? 's' : '' }}</span>
        </span>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Actualiser" @click="load">
          <RefreshCw :size="14" :class="{ spin: loading }" />
        </button>
      </div>
    </div>

    <div v-if="error" class="time-error">
      <TriangleAlert :size="15" />
      <span>{{ error }}</span>
      <button class="btn btn-sm" type="button" @click="load">Réessayer</button>
    </div>

    <div class="time-grid">
      <div class="time-main">
        <section class="card week-chart-card">
          <div class="week-chart-body">
            <div
              v-for="day in days"
              :key="day.iso"
              class="chart-day"
              :title="`${day.label} : ${formatHours(day.total)}`"
            >
              <span class="chart-value">{{ day.total ? Number(day.total).toLocaleString('fr-FR') : '' }}</span>
              <div class="chart-track">
                <div
                  class="chart-bar"
                  :class="{ 'is-today': day.isToday, 'is-empty': !day.total }"
                  :style="{ height: day.total ? `${Math.max(12, (day.total / maxDayHours) * 100)}%` : '3px' }"
                ></div>
              </div>
              <span class="chart-label" :class="{ 'is-today': day.isToday }">{{ day.short }}</span>
            </div>
          </div>
        </section>

        <div v-if="loading && !entries.length" class="card time-loading">
          <Loader2 :size="17" class="spin" /> Chargement de vos temps…
        </div>

        <template v-else-if="daysWithEntries.length">
          <div
            class="time-table"
            :class="{ 'is-resized': columnsResized }"
            :style="columnsStyle"
          >
            <div ref="timeHead" class="time-list-head">
              <span>
                Ticket
                <ColumnResizer
                  label="Ajuster la colonne Ticket"
                  @start="beginColumnDrag($event, 0)"
                  @nudge="nudgeColumn(0, $event)"
                  @reset="resetColumns"
                />
              </span>
              <span>
                Activité
                <ColumnResizer
                  label="Ajuster la colonne Activité"
                  @start="beginColumnDrag($event, 1)"
                  @nudge="nudgeColumn(1, $event)"
                  @reset="resetColumns"
                />
              </span>
              <span>
                Commentaire
                <ColumnResizer
                  label="Ajuster la colonne Commentaire"
                  @start="beginColumnDrag($event, 2)"
                  @nudge="nudgeColumn(2, $event)"
                  @reset="resetColumns"
                />
              </span>
              <span>
                Temps
                <ColumnResizer
                  label="Ajuster la colonne Temps"
                  @start="beginColumnDrag($event, 3)"
                  @nudge="nudgeColumn(3, $event)"
                  @reset="resetColumns"
                />
              </span>
              <span></span>
            </div>

            <section v-for="day in daysWithEntries" :key="day.iso" class="card day-card">
              <header class="day-head">
                <div class="day-head-title">
                  <span class="day-name" :class="{ 'is-today': day.isToday }">{{ day.label }}</span>
                  <span v-if="day.isToday" class="today-pill">Aujourd'hui</span>
                </div>
                <div class="day-head-right">
                  <span class="day-total">{{ formatHours(day.total) }}</span>
                  <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Ajouter du temps" @click="openTime(null, day)">
                    <Plus :size="14" />
                  </button>
                </div>
              </header>
              <div class="day-entries">
                <div v-for="entry in day.entries" :key="entry.id" class="time-row">
                  <div class="time-issue">
                    <RouterLink
                      v-if="entry.issue"
                      :to="{ name: 'issue', params: { id: entry.issue.id } }"
                      class="time-issue-link"
                    >
                      <IssueId :id="entry.issue.id" class="time-issue-id" />
                      <span class="truncate">{{ entryIssue(entry)?.subject || `Ticket #${entry.issue.id}` }}</span>
                    </RouterLink>
                    <span v-else class="time-issue-link muted">
                      <FolderKanban :size="13" />
                      <span class="truncate">{{ entry.project?.name || 'Sans ticket' }}</span>
                    </span>
                  </div>
                  <span class="time-activity">{{ entry.activity?.name || '—' }}</span>
                  <span class="time-comment truncate">{{ entry.comments || '' }}</span>
                  <span class="time-hours">{{ formatHours(entry.hours) }}</span>
                  <button
                    v-if="entry.issue && (entry.user?.id === session.user?.id || session.user?.admin)"
                    class="btn btn-ghost btn-icon btn-sm time-edit"
                    type="button"
                    title="Modifier"
                    @click="openTime(entry)"
                  >
                    <Pencil :size="13" />
                  </button>
                  <span v-else></span>
                </div>
              </div>
            </section>
          </div>
        </template>

        <section v-else-if="!loading" class="card">
          <EmptyState
            :icon="Clock3"
            title="Aucun temps saisi"
            :text="projectFilter ? 'Aucune saisie pour ce projet sur cette semaine.' : 'Enregistrez le temps passé sur vos tickets pour remplir votre semaine.'"
          >
            <button class="btn btn-sm btn-primary" type="button" @click="openTime()">
              <Plus :size="13" /> Saisir du temps
            </button>
          </EmptyState>
        </section>
      </div>

      <aside class="time-side">
        <section class="card time-summary-card">
          <header class="card-head">
            <h2 class="card-title"><Clock3 :size="15" /> Résumé</h2>
          </header>
          <div class="summary-body">
            <div class="summary-total">
              <span class="summary-number">{{ formatHours(totalHours) }}</span>
              <span class="summary-label">{{ weekLabel }}</span>
            </div>
            <div class="summary-rows">
              <div class="summary-row">
                <span class="muted">Saisies</span>
                <span class="strong">{{ entries.length }}</span>
              </div>
              <div class="summary-row">
                <span class="muted">Moyenne / jour saisi</span>
                <span class="strong">{{ formatHours(averagePerWorkedDay) }}</span>
              </div>
              <div v-if="topActivity" class="summary-row">
                <span class="muted">Activité principale</span>
                <span class="strong truncate">{{ topActivity.name }}</span>
              </div>
            </div>
            <div v-if="byActivity.length" class="activity-breakdown">
              <p class="eyebrow">Répartition</p>
              <div v-for="activity in byActivity" :key="activity.name" class="activity-line">
                <div class="activity-line-head">
                  <span class="truncate">{{ activity.name }}</span>
                  <span class="muted">{{ formatHours(activity.hours) }}</span>
                </div>
                <div class="activity-track">
                  <span :style="{ width: `${(activity.hours / totalHours) * 100}%` }"></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="quick-time">
            <p class="strong">Une saisie rapide ?</p>
            <p class="text-sm muted">
              Enregistrez vos heures au fil de la semaine pour garder un suivi à jour.
            </p>
            <button class="btn btn-sm btn-block" type="button" @click="openTime()">
              <Plus :size="13" /> Nouvelle saisie
            </button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.project-filter {
  width: auto;
  min-width: 160px;
  max-width: 220px;
}

.week-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 13px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.week-title {
  display: flex;
  flex-direction: column;
  margin-left: 6px;
  line-height: 1.35;
}

.week-range {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
  text-transform: capitalize;
}

.week-now,
.week-today-btn {
  font-size: 12.5px;
  color: var(--faint);
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.week-today-btn {
  color: var(--accent);
  font-weight: 550;
}

.week-toolbar-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toolbar-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13.5px;
  color: var(--muted);
}

.toolbar-stat strong {
  color: var(--ink);
  font-weight: 650;
}

.time-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--red) 25%, var(--line));
  border-radius: var(--radius);
  background: var(--red-soft);
  color: var(--red);
  font-size: 14.5px;
}

.time-error .btn {
  margin-left: auto;
}

.time-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: start;
}

.time-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.week-chart-card {
  padding: 10px 18px 12px;
}

.week-chart-body {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 92px;
}

.chart-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex: 1;
  height: 100%;
}

.chart-value {
  min-height: 10px;
  font-size: 12px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

.chart-track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  flex: 1;
}

.chart-bar {
  width: 70%;
  max-width: 34px;
  border-radius: 4px 4px 2px 2px;
  background: color-mix(in srgb, var(--accent) 55%, var(--surface));
  transition: height 400ms var(--ease);
}

.chart-bar.is-today {
  background: var(--accent);
}

.chart-bar.is-empty {
  background: var(--line);
  min-height: 3px;
}

.chart-label {
  font-size: 12px;
  color: var(--faint);
}

.chart-label.is-today {
  color: var(--accent);
  font-weight: 650;
}

.time-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  font-size: 14.5px;
  color: var(--muted);
}

.day-card {
  overflow: hidden;
}

.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
}

.day-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-name {
  font-size: 14px;
  font-weight: 650;
  text-transform: capitalize;
  color: var(--ink-soft);
}

.day-name.is-today {
  color: var(--accent);
}

.today-pill {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 650;
}

.day-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.day-total {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.day-entries {
  display: flex;
  flex-direction: column;
}

.time-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: auto;
}

.time-list-head {
  display: grid;
  grid-template-columns: var(
    --time-cols,
    minmax(190px, 1.4fr) 100px minmax(120px, 1fr) 62px 28px
  );
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--faint);
}

.time-list-head > span {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 761px) {
  .time-table.is-resized .day-card,
  .time-table.is-resized .time-list-head,
  .time-table.is-resized .time-row {
    min-width: max-content;
  }
}

.time-row {
  display: grid;
  grid-template-columns: var(
    --time-cols,
    minmax(190px, 1.4fr) 100px minmax(120px, 1fr) 62px 28px
  );
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}

.time-row:last-child {
  border-bottom: 0;
}

.time-issue {
  min-width: 0;
}

.time-issue-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 14px;
}

.time-issue-link:hover {
  color: var(--accent);
  text-decoration: none;
}

.time-issue-id {
  font-size: 12px;
  color: var(--faint);
  flex: none;
}

.time-activity {
  font-size: 12.5px;
  color: var(--muted);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-comment {
  font-size: 13px;
  color: var(--faint);
  min-width: 0;
}

.time-hours {
  font-weight: 650;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.time-edit {
  opacity: 0;
}

.time-row:hover .time-edit {
  opacity: 1;
}

.time-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: calc(var(--topbar-h) + 14px);
}

.summary-body {
  padding: 16px;
}

.summary-total {
  display: flex;
  flex-direction: column;
  padding-bottom: 13px;
  margin-bottom: 11px;
  border-bottom: 1px solid var(--line);
}

.summary-number {
  font-size: 32px;
  font-weight: 650;
  letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.summary-label {
  margin-top: 3px;
  font-size: 13px;
  color: var(--faint);
  text-transform: capitalize;
}

.summary-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13.5px;
}

.summary-row .strong {
  max-width: 60%;
}

.activity-breakdown {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}

.activity-breakdown .eyebrow {
  margin-bottom: 9px;
}

.activity-line {
  margin-bottom: 8px;
}

.activity-line:last-child {
  margin-bottom: 0;
}

.activity-line-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 3px;
}

.activity-track {
  height: 4px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.activity-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  opacity: 0.72;
}

.quick-time {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick-time .btn {
  margin-top: 6px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1050px) {
  .time-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .time-side {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

@media (max-width: 760px) {
  .time-row {
    grid-template-columns: minmax(0, 1fr) 62px 28px;
  }
  .time-list-head {
    display: none;
  }
  .time-activity,
  .time-comment {
    display: none;
  }
  .time-edit {
    opacity: 1;
  }
  .time-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .week-toolbar-stats .hide-mobile {
    display: none;
  }
}

@media (max-width: 560px) {
  .project-filter {
    min-width: 0;
    flex: 1;
  }
  .week-toolbar {
    gap: 8px;
  }
  .week-toolbar-stats {
    gap: 8px;
  }
}
</style>
