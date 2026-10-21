<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Milestone } from 'lucide-vue-next'
import {
  formatDate,
  formatDateTime,
  formatHours,
  isOverdue,
  issueSprint,
  relativeTime,
} from '../lib/format.js'
import IssueId from './IssueId.vue'
import StatusBadge from './StatusBadge.vue'
import StatusQuickSelect from './StatusQuickSelect.vue'
import SprintLink from './SprintLink.vue'
import PriorityBadge from './PriorityBadge.vue'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({
  issue: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  statusBusy: { type: Boolean, default: false },
  subjectLinkOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['change-status'])

const overdue = computed(() => isOverdue(props.issue))
const sprint = computed(() => issueSprint(props.issue))
const assigneeName = computed(() => {
  const user = props.issue.assigned_to
  if (!user) return ''
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || user.name || user.login
})
</script>

<template>
  <component
    :is="subjectLinkOnly ? 'div' : RouterLink"
    :to="subjectLinkOnly ? undefined : { name: 'issue', params: { id: issue.id } }"
    class="issue-row issues-grid"
    :class="{
      'is-overdue': overdue,
      'is-compact': compact,
      'is-subject-only': subjectLinkOnly,
    }"
  >
    <IssueId :id="issue.id" class="row-id" />

    <component
      :is="subjectLinkOnly ? RouterLink : 'span'"
      :to="subjectLinkOnly ? { name: 'issue', params: { id: issue.id } } : undefined"
      class="row-subject"
      :class="{ 'row-subject-link': subjectLinkOnly }"
    >
      <span class="subject-line">{{ issue.subject }}</span>
      <span class="subject-meta">
        <span v-if="issue.project" class="project-name">{{ issue.project.name }}</span>
        <span v-if="issue.tracker" class="tracker-name">
          <span class="meta-sep">·</span>{{ issue.tracker.name }}
        </span>
        <span v-if="issue.spent_hours" class="meta-hours">{{ formatHours(issue.spent_hours) }}</span>
      </span>
      <span class="row-mobile-meta">
        <StatusBadge :status="issue.status" />
        <SprintLink v-if="sprint" class="sprint-chip" :sprint="sprint">
          <Milestone :size="10" />
          <span class="truncate">{{ sprint.value }}</span>
        </SprintLink>
        <span v-if="assigneeName" class="mobile-assignee">{{ assigneeName }}</span>
        <span v-if="issue.due_date" :class="{ 'due-overdue': overdue }">
          {{ formatDate(issue.due_date, { year: undefined }) }}
        </span>
      </span>
    </component>

    <span class="row-status">
      <StatusQuickSelect
        :issue="issue"
        :busy="statusBusy"
        @change="emit('change-status', $event)"
      />
    </span>

    <span class="row-priority">
      <PriorityBadge :priority="issue.priority" :show-label="false" />
      <span class="priority-text">{{ issue.priority?.name || '—' }}</span>
    </span>

    <span class="row-assignee">
      <template v-if="issue.assigned_to">
        <UserAvatar :user="issue.assigned_to" :size="23" />
        <span class="truncate">{{ assigneeName }}</span>
      </template>
      <span v-else class="unassigned">Non assigné</span>
    </span>

    <span class="row-sprint">
      <SprintLink v-if="sprint" class="sprint-chip" :sprint="sprint">
        <Milestone :size="10" />
        <span class="truncate">{{ sprint.value }}</span>
      </SprintLink>
      <span v-else class="row-empty" title="Aucun sprint">—</span>
    </span>

    <span class="row-updated" :title="formatDateTime(issue.updated_on)">
      {{ relativeTime(issue.updated_on) }}
    </span>
  </component>
</template>

<style scoped>
.issue-row {
  position: relative;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
  transition: background var(--transition);
}

.issue-row:last-child {
  border-bottom: 0;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.issue-row:hover {
  background: var(--surface-hover);
  text-decoration: none;
}

.issue-row.is-subject-only {
  cursor: default;
}

.issue-row.is-overdue::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--red);
}

.row-id {
  font-size: 11.5px;
  color: var(--faint);
  font-weight: 500;
}

.row-subject {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.row-subject-link {
  color: inherit;
  text-decoration: none;
  border-radius: 4px;
}

.row-subject-link:hover .subject-line {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.row-subject-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.subject-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 550;
  letter-spacing: -0.005em;
}

.issue-row:not(.is-subject-only):hover .subject-line {
  color: var(--accent);
}

.subject-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: var(--faint);
  min-width: 0;
}

.project-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-sep {
  margin-right: 6px;
  color: var(--line-strong);
}

.tracker-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sprint-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  height: 17px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--violet-soft);
  color: var(--violet);
  font-size: 9.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sprint-chip svg {
  flex: none;
}

.sprint-chip:not(.is-static):hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.meta-hours {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.row-status,
.row-priority {
  display: flex;
  align-items: center;
  min-width: 0;
}

.row-status {
  overflow: hidden;
}

.row-priority {
  gap: 6px;
}

.priority-text {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-assignee {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink-soft);
}

.unassigned {
  color: var(--faint);
  font-style: italic;
  font-size: 11px;
}

.row-sprint {
  display: flex;
  align-items: center;
  min-width: 0;
}

.row-empty {
  color: var(--faint);
  font-size: 11px;
}

.row-updated {
  font-size: 10.5px;
  color: var(--faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mobile-assignee {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.due-overdue {
  color: var(--red);
}

.is-compact {
  padding-top: 8px;
  padding-bottom: 8px;
}
</style>
