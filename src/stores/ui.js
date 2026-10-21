import { ref } from 'vue'
import { defineStore } from 'pinia'

const SIDEBAR_COLLAPSED_KEY = 'redmine-studio.sidebar-collapsed.v1'

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(false)
  const sidebarCollapsed = ref(readSidebarCollapsed())
  const issueComposerOpen = ref(false)
  const issueComposerDefaults = ref({})
  const timeEntryOpen = ref(false)
  const timeEntryDraft = ref({})
  const commandOpen = ref(false)

  function toggleSidebar(value) {
    sidebarOpen.value = value === undefined ? !sidebarOpen.value : value
  }

  function setSidebarCollapsed(value) {
    sidebarCollapsed.value = Boolean(value)
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? '1' : '0')
    } catch {
      // Le stockage local peut être indisponible (navigation privée).
    }
  }

  function toggleSidebarCollapsed(value) {
    setSidebarCollapsed(value === undefined ? !sidebarCollapsed.value : value)
  }

  function openIssueComposer(defaults = {}) {
    issueComposerDefaults.value = defaults
    issueComposerOpen.value = true
  }

  function closeIssueComposer() {
    issueComposerOpen.value = false
  }

  function openTimeEntry(draft = {}) {
    timeEntryDraft.value = draft
    timeEntryOpen.value = true
  }

  function closeTimeEntry() {
    timeEntryOpen.value = false
  }

  function openCommand() {
    commandOpen.value = true
  }

  function closeCommand() {
    commandOpen.value = false
  }

  return {
    sidebarOpen,
    issueComposerOpen,
    issueComposerDefaults,
    timeEntryOpen,
    timeEntryDraft,
    commandOpen,
    sidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    openIssueComposer,
    closeIssueComposer,
    openTimeEntry,
    closeTimeEntry,
    openCommand,
    closeCommand,
  }
})
