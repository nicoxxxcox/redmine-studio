import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useSettingsStore } from './settings.js'

const membershipCache = new Map()

export const useSessionStore = defineStore('session', () => {
  const settings = useSettingsStore()

  const user = ref(null)
  const statuses = ref([])
  const trackers = ref([])
  const priorities = ref([])
  const activities = ref([])
  const projects = ref([])
  const loading = ref(false)
  const ready = ref(false)
  const error = ref(null)
  const loadedAt = ref(0)

  const defaultStatus = computed(
    () => statuses.value.find((status) => status.is_default) || statuses.value[0] || null,
  )
  const defaultPriority = computed(
    () =>
      priorities.value.find((priority) => priority.is_default) ||
      priorities.value.find((priority) => /normal/i.test(priority.name)) ||
      priorities.value[0] ||
      null,
  )
  const defaultTracker = computed(() => trackers.value[0] || null)
  const defaultActivity = computed(
    () =>
      activities.value.find((activity) => activity.id === settings.settings.defaultActivityId) ||
      activities.value.find((activity) => activity.is_default) ||
      activities.value[0] ||
      null,
  )
  const openStatuses = computed(() => statuses.value.filter((status) => !status.is_closed))

  const displayName = computed(() => {
    if (!user.value) return ''
    return (
      [user.value.firstname, user.value.lastname].filter(Boolean).join(' ') ||
      user.value.login ||
      ''
    )
  })

  async function load({ force = false } = {}) {
    if (!settings.configured) {
      ready.value = false
      return
    }
    if (loading.value) return
    if (!force && ready.value && Date.now() - loadedAt.value < 5 * 60_000) return

    loading.value = true
    error.value = null
    const api = settings.api

    const requests = await Promise.allSettled([
      api.currentUser(),
      api.statuses(),
      api.trackers(),
      api.priorities(),
      api.activities(),
      api.projects({ limit: 100, include: 'trackers' }),
    ])

    const [userRes, statusesRes, trackersRes, prioritiesRes, activitiesRes, projectsRes] = requests

    if (userRes.status === 'fulfilled') {
      user.value = userRes.value?.user || null
    } else {
      error.value = userRes.reason
      if (userRes.reason?.status === 401) {
        ready.value = false
        loading.value = false
        throw userRes.reason
      }
    }
    if (statusesRes.status === 'fulfilled') {
      statuses.value = statusesRes.value?.issue_statuses || []
    }
    if (trackersRes.status === 'fulfilled') {
      trackers.value = trackersRes.value?.trackers || []
    }
    if (prioritiesRes.status === 'fulfilled') {
      priorities.value = prioritiesRes.value?.issue_priorities || []
    }
    if (activitiesRes.status === 'fulfilled') {
      activities.value = activitiesRes.value?.time_entry_activities || []
    }
    if (projectsRes.status === 'fulfilled') {
      projects.value = projectsRes.value?.projects || []
    }

    loadedAt.value = Date.now()
    ready.value = Boolean(user.value)
    loading.value = false
    if (!ready.value && error.value) throw error.value
  }

  function statusById(id) {
    return statuses.value.find((status) => status.id === Number(id)) || null
  }

  function trackerById(id) {
    return trackers.value.find((tracker) => tracker.id === Number(id)) || null
  }

  function priorityById(id) {
    return priorities.value.find((priority) => priority.id === Number(id)) || null
  }

  function projectById(id) {
    return projects.value.find((project) => project.id === Number(id)) || null
  }

  async function membersFor(projectId) {
    if (!projectId) return []
    const key = String(projectId)
    if (membershipCache.has(key)) return membershipCache.get(key)
    const data = await settings.api.projectMembers(projectId, { limit: 100 })
    const members = (data?.memberships || [])
      .map((membership) => membership.user || membership.group)
      .filter(Boolean)
    const unique = []
    const seen = new Set()
    for (const member of members) {
      if (seen.has(member.id)) continue
      seen.add(member.id)
      unique.push(member)
    }
    unique.sort((a, b) =>
      [a.firstname, a.lastname].join(' ').localeCompare([b.firstname, b.lastname].join(' '), 'fr'),
    )
    membershipCache.set(key, unique)
    return unique
  }

  function reset() {
    user.value = null
    statuses.value = []
    trackers.value = []
    priorities.value = []
    activities.value = []
    projects.value = []
    ready.value = false
    error.value = null
    loadedAt.value = 0
    membershipCache.clear()
  }

  return {
    user,
    statuses,
    trackers,
    priorities,
    activities,
    projects,
    loading,
    ready,
    error,
    loadedAt,
    defaultStatus,
    defaultPriority,
    defaultTracker,
    defaultActivity,
    openStatuses,
    displayName,
    load,
    statusById,
    trackerById,
    priorityById,
    projectById,
    membersFor,
    reset,
  }
})
