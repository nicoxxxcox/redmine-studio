<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
import IssueComposer from './IssueComposer.vue'
import TimeEntryModal from './TimeEntryModal.vue'
import CommandPalette from './CommandPalette.vue'
import { useUiStore } from '../stores/ui.js'

const ui = useUiStore()
const router = useRouter()

let chord = null
let chordTimer = null

function clearChord() {
  chord = null
  window.clearTimeout(chordTimer)
}

function isTyping(target) {
  if (!target) return false
  return (
    target.matches?.('input, textarea, select, [contenteditable="true"]') ||
    target.isContentEditable
  )
}

function onKeydown(event) {
  const meta = event.metaKey || event.ctrlKey
  if (meta && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.openCommand()
    return
  }
  if (meta || event.altKey || event.repeat) return
  if (isTyping(event.target)) return
  if (ui.issueComposerOpen || ui.timeEntryOpen || ui.commandOpen) return

  const key = event.key.toLowerCase()

  if (chord === 'g') {
    clearChord()
    const destinations = {
      d: { name: 'dashboard' },
      i: { name: 'issues' },
      t: { name: 'time' },
      p: { name: 'projects' },
      s: { name: 'settings' },
    }
    if (destinations[key]) {
      event.preventDefault()
      router.push(destinations[key])
    }
    return
  }

  if (key === 'g') {
    chord = 'g'
    window.clearTimeout(chordTimer)
    chordTimer = window.setTimeout(clearChord, 900)
    return
  }

  if (key === 'n') {
    event.preventDefault()
    ui.openIssueComposer()
  } else if (key === 't') {
    event.preventDefault()
    ui.openTimeEntry()
  } else if (key === '/') {
    event.preventDefault()
    ui.openCommand()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.clearTimeout(chordTimer)
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-sidebar-collapsed': ui.sidebarCollapsed }">
    <AppSidebar />
    <div class="app-main">
      <AppTopbar />
      <main class="app-content">
        <RouterView />
      </main>
    </div>

    <IssueComposer
      :open="ui.issueComposerOpen"
      :defaults="ui.issueComposerDefaults"
      @close="ui.closeIssueComposer()"
    />
    <TimeEntryModal
      :open="ui.timeEntryOpen"
      :draft="ui.timeEntryDraft"
      @close="ui.closeTimeEntry()"
    />
    <CommandPalette />
  </div>
</template>

<style scoped>
.app-shell {
  --layout-sidebar-w: var(--sidebar-w);
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

.app-main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin-left: var(--sidebar-w);
  min-width: 0;
  transition: margin-left 220ms var(--ease);
}

.app-content {
  flex: 1;
  min-width: 0;
}

@media (min-width: 981px) {
  .app-shell.is-sidebar-collapsed {
    --layout-sidebar-w: var(--sidebar-w-collapsed);
  }

  .app-shell.is-sidebar-collapsed .app-main {
    margin-left: var(--sidebar-w-collapsed);
  }
}

@media (max-width: 980px) {
  .app-shell {
    --layout-sidebar-w: 0px;
  }

  .app-main {
    margin-left: 0;
  }
}
</style>
