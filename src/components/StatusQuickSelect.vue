<script setup>
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useSessionStore } from '../stores/session.js'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({
  issue: { type: Object, required: true },
  options: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['change'])
const session = useSessionStore()

const choices = computed(() => {
  const list = props.options?.length ? props.options : session.statuses
  const current = props.issue?.status
  if (!current || list.some((status) => status.id === current.id)) return list
  return [current, ...list]
})

function onChange(event) {
  event.stopPropagation()
  const nextId = Number(event.target.value)
  const next = choices.value.find((status) => status.id === nextId)
  event.target.value = String(props.issue?.status?.id ?? '')
  if (!next || next.id === props.issue?.status?.id) return
  emit('change', next)
}
</script>

<template>
  <span class="status-quick" :class="{ 'is-busy': busy }">
    <StatusBadge :status="issue.status" />
    <ChevronDown :size="11" class="status-quick-chevron" aria-hidden="true" />
    <select
      class="status-quick-select"
      :value="issue.status?.id ?? ''"
      :disabled="busy || !choices.length"
      :title="`Changer le statut du ticket #${issue.id}`"
      :aria-label="`Changer le statut du ticket #${issue.id}`"
      @click.stop
      @mousedown.stop
      @keydown.stop
      @change="onChange"
    >
      <option v-for="status in choices" :key="status.id" :value="status.id">
        {{ status.name }}
      </option>
    </select>
  </span>
</template>

<style scoped>
.status-quick {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  min-width: 0;
  border-radius: 999px;
  vertical-align: middle;
}

.status-quick-chevron {
  flex: none;
  color: var(--faint);
  pointer-events: none;
}

.status-quick-select {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 0;
  opacity: 0;
  cursor: pointer;
}

.status-quick-select:disabled {
  cursor: default;
}

.status-quick:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.status-quick.is-busy {
  opacity: 0.55;
}

.status-quick :deep(.badge) {
  pointer-events: none;
}
</style>
