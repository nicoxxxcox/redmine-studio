import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'redmine-studio.timer.v1'

function loadTimer() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (stored?.startedAt && stored?.issueId) return stored
  } catch {
    /* ignore */
  }
  return null
}

export const useTimerStore = defineStore('timer', () => {
  const timer = ref(loadTimer())

  const running = computed(() => Boolean(timer.value))
  const issueId = computed(() => timer.value?.issueId || null)

  function persist() {
    if (timer.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer.value))
    else localStorage.removeItem(STORAGE_KEY)
  }

  function start(issue) {
    if (!issue?.id) return
    timer.value = {
      issueId: issue.id,
      subject: issue.subject,
      projectName: issue.project?.name || '',
      startedAt: new Date().toISOString(),
    }
    persist()
  }

  function stop() {
    if (!timer.value) return null
    const snapshot = timer.value
    const elapsedMs = Math.max(0, Date.now() - new Date(snapshot.startedAt).getTime())
    const hours = Math.max(0.01, Math.round((elapsedMs / 3_600_000) * 100) / 100)
    timer.value = null
    persist()
    return { ...snapshot, hours, elapsedMs }
  }

  function cancel() {
    timer.value = null
    persist()
  }

  function elapsedMs() {
    if (!timer.value) return 0
    return Math.max(0, Date.now() - new Date(timer.value.startedAt).getTime())
  }

  return { timer, running, issueId, start, stop, cancel, elapsedMs }
})
