<script setup>
import { computed } from 'vue'
import { ChevronDown, UserRound } from 'lucide-vue-next'
import { fullName } from '../lib/format.js'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({
  issue: { type: Object, required: true },
  options: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['change'])

const choices = computed(() => {
  const list = (props.options || []).filter((user) => user?.id && !user.isGroup)
  const current = props.issue?.assigned_to
  if (!current || list.some((user) => user.id === current.id)) return list
  return [current, ...list]
})

const currentName = computed(() =>
  props.issue?.assigned_to ? fullName(props.issue.assigned_to) : 'Non assigné',
)

function onChange(event) {
  event.stopPropagation()
  const nextId = event.target.value
  const next = nextId ? choices.value.find((user) => String(user.id) === nextId) || null : null
  event.target.value = props.issue?.assigned_to?.id ? String(props.issue.assigned_to.id) : ''
  if ((next?.id ?? null) === (props.issue?.assigned_to?.id ?? null)) return
  emit('change', next)
}
</script>

<template>
  <span
    class="assignee-quick"
    :class="{
      'is-busy': busy,
      'is-unassigned': !issue.assigned_to,
      'is-compact': compact,
    }"
    :title="`Changer l’assigné du ticket #${issue.id}`"
  >
    <UserAvatar v-if="issue.assigned_to" :user="issue.assigned_to" :size="compact ? 20 : 21" />
    <UserRound v-else :size="compact ? 13 : 14" class="assignee-quick-icon" aria-hidden="true" />
    <span v-if="!compact" class="assignee-quick-name truncate">{{ currentName }}</span>
    <ChevronDown :size="11" class="assignee-quick-chevron" aria-hidden="true" />
    <select
      class="assignee-quick-select"
      :value="issue.assigned_to?.id ? String(issue.assigned_to.id) : ''"
      :disabled="busy"
      :title="`Changer l’assigné du ticket #${issue.id}`"
      :aria-label="`Changer l’assigné du ticket #${issue.id}`"
      @click.stop
      @mousedown.stop
      @keydown.stop
      @change="onChange"
    >
      <option value="">Non assigné</option>
      <option v-for="member in choices" :key="member.id" :value="String(member.id)">
        {{ fullName(member) }}
      </option>
    </select>
  </span>
</template>

<style scoped>
.assignee-quick {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  min-width: 0;
  border-radius: 999px;
  vertical-align: middle;
}

.assignee-quick-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignee-quick-icon {
  flex: none;
  color: var(--faint);
}

.assignee-quick-chevron {
  flex: none;
  color: var(--faint);
  pointer-events: none;
}

.assignee-quick-select {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 0;
  opacity: 0;
  cursor: pointer;
}

.assignee-quick-select:disabled {
  cursor: default;
}

.assignee-quick:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.assignee-quick.is-busy {
  opacity: 0.55;
}

.assignee-quick.is-unassigned {
  color: var(--faint);
  font-style: italic;
}

.assignee-quick :deep(.avatar) {
  pointer-events: none;
}
</style>
