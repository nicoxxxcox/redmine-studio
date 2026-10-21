import { computed, reactive, watch } from 'vue'
import { defineStore } from 'pinia'
import { RedmineApi } from '../lib/api.js'
import { normalizeFavoriteIds } from '../lib/favorites.js'

const STORAGE_KEY = 'redmine-studio.settings.v1'

const DEFAULTS = {
  baseUrl: '',
  apiKey: '',
  theme: 'system',
  defaultProjectId: null,
  defaultActivityId: null,
  defaultStatusId: null,
  compactList: false,
  rememberKey: true,
  favoriteStatusIds: [],
  favoriteUserIds: [],
  favoriteProjectIds: [],
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const merged = { ...DEFAULTS, ...stored }
    merged.favoriteStatusIds = normalizeFavoriteIds(merged.favoriteStatusIds)
    merged.favoriteUserIds = normalizeFavoriteIds(merged.favoriteUserIds)
    merged.favoriteProjectIds = normalizeFavoriteIds(merged.favoriteProjectIds)
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

function normalizeBaseUrl(value) {
  let url = String(value || '').trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '')
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive(loadSettings())
  if (!settings.rememberKey) settings.apiKey = ''

  const configured = computed(() => Boolean(settings.baseUrl && settings.apiKey))
  const api = computed(
    () => new RedmineApi({ baseUrl: settings.baseUrl, apiKey: settings.apiKey }),
  )
  const favoriteStatusIds = computed(() => normalizeFavoriteIds(settings.favoriteStatusIds))
  const favoriteUserIds = computed(() => normalizeFavoriteIds(settings.favoriteUserIds))
  const favoriteProjectIds = computed(() => normalizeFavoriteIds(settings.favoriteProjectIds))
  const hasFavorites = computed(
    () =>
      favoriteStatusIds.value.length > 0 ||
      favoriteUserIds.value.length > 0 ||
      favoriteProjectIds.value.length > 0,
  )

  watch(
    settings,
    (value) => {
      const payload = { ...value }
      if (!value.rememberKey) payload.apiKey = ''
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    },
    { deep: true },
  )

  function setConnection({ baseUrl, apiKey, rememberKey = true }) {
    settings.baseUrl = normalizeBaseUrl(baseUrl)
    settings.apiKey = String(apiKey || '').trim()
    settings.rememberKey = rememberKey
    if (!rememberKey) sessionStorage.setItem('redmine-studio.apiKey', settings.apiKey)
  }

  function restoreSessionKey() {
    if (!settings.rememberKey && !settings.apiKey) {
      settings.apiKey = sessionStorage.getItem('redmine-studio.apiKey') || ''
    }
  }

  function disconnect() {
    settings.baseUrl = ''
    settings.apiKey = ''
    settings.defaultProjectId = null
    settings.defaultActivityId = null
    settings.defaultStatusId = null
    settings.favoriteStatusIds = []
    settings.favoriteUserIds = []
    settings.favoriteProjectIds = []
    sessionStorage.removeItem('redmine-studio.apiKey')
  }

  function setFavoriteStatuses(ids) {
    settings.favoriteStatusIds = normalizeFavoriteIds(ids)
  }

  function setFavoriteUsers(ids) {
    settings.favoriteUserIds = normalizeFavoriteIds(ids)
  }

  function setFavoriteProjects(ids) {
    settings.favoriteProjectIds = normalizeFavoriteIds(ids)
  }

  function setTheme(theme) {
    settings.theme = theme
  }

  function toggleCompactList() {
    settings.compactList = !settings.compactList
  }

  restoreSessionKey()

  return {
    settings,
    configured,
    api,
    favoriteStatusIds,
    favoriteUserIds,
    favoriteProjectIds,
    hasFavorites,
    setConnection,
    disconnect,
    setFavoriteStatuses,
    setFavoriteUsers,
    setFavoriteProjects,
    setTheme,
    toggleCompactList,
    normalizeBaseUrl,
  }
})
