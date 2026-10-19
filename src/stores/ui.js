import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(false)
  const issueComposerOpen = ref(false)
  const issueComposerDefaults = ref({})
  const timeEntryOpen = ref(false)
  const timeEntryDraft = ref({})
  const commandOpen = ref(false)

  function toggleSidebar(value) {
    sidebarOpen.value = value === undefined ? !sidebarOpen.value : value
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
    toggleSidebar,
    openIssueComposer,
    closeIssueComposer,
    openTimeEntry,
    closeTimeEntry,
    openCommand,
    closeCommand,
  }
})
