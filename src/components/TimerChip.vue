<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Square, Timer } from 'lucide-vue-next'
import { useTimerStore } from '../stores/timer.js'
import { useUiStore } from '../stores/ui.js'
import { toIsoDate } from '../lib/format.js'
import IssueId from './IssueId.vue'

const timerStore = useTimerStore()
const ui = useUiStore()
const now = ref(Date.now())
let interval = null

onMounted(() => {
  interval = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (interval) window.clearInterval(interval)
})

const elapsed = computed(() => {
  if (!timerStore.timer) return '00:00:00'
  const seconds = Math.max(
    0,
    Math.floor((now.value - new Date(timerStore.timer.startedAt).getTime()) / 1000),
  )
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
})

function stop() {
  const stopped = timerStore.stop()
  if (!stopped) return
  ui.openTimeEntry({
    issue: { id: stopped.issueId, subject: stopped.subject, project: { name: stopped.projectName } },
    hours: stopped.hours,
    spent_on: toIsoDate(),
    comments: '',
    fromTimer: true,
  })
}
</script>

<template>
  <div v-if="timerStore.timer" class="timer-chip" :title="timerStore.timer.subject">
    <span class="timer-live" aria-hidden="true"></span>
    <Timer :size="14" class="timer-icon" />
    <span class="timer-time">{{ elapsed }}</span>
    <IssueId :id="timerStore.timer.issueId" class="timer-subject" />
    <button class="timer-stop" type="button" title="Arrêter et saisir le temps" @click="stop">
      <Square :size="11" fill="currentColor" />
      <span>Arrêter</span>
    </button>
  </div>
</template>

<style scoped>
.timer-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 5px 0 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.timer-live {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  animation: pulse 1.7s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.timer-icon {
  opacity: 0.8;
}

.timer-time {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.timer-subject {
  color: color-mix(in srgb, var(--accent) 65%, var(--muted));
  font-weight: 550;
}

.timer-stop {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  margin-left: 2px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 10.5px;
  font-weight: 650;
  transition: background var(--transition);
}

.timer-stop:hover {
  background: var(--accent-hover);
}

@media (max-width: 1180px) {
  .timer-subject {
    display: none;
  }
}

@media (max-width: 760px) {
  .timer-chip {
    padding: 0 4px 0 8px;
  }
  .timer-icon,
  .timer-time {
    display: none;
  }
  .timer-stop span {
    display: none;
  }
  .timer-stop {
    width: 26px;
    padding: 0;
    justify-content: center;
  }
}
</style>
