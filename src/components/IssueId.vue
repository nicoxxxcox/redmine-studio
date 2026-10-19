<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import { copyText } from '../lib/clipboard.js'
import { useToastStore } from '../stores/toast.js'

const props = defineProps({
  id: { type: [Number, String], required: true },
  always: { type: Boolean, default: false },
})

const toast = useToastStore()
const copied = ref(false)
let resetTimer = null

const copyLabel = computed(() =>
  copied.value ? `Numéro #${props.id} copié` : `Copier le numéro du ticket #${props.id}`,
)

async function copy(event) {
  event.preventDefault()
  event.stopPropagation()

  if (!(await copyText(`#${props.id}`))) {
    toast.error('Copie impossible dans ce navigateur.')
    return
  }

  copied.value = true
  toast.success(`Ticket #${props.id} copié.`, { duration: 1800 })
  window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

onBeforeUnmount(() => window.clearTimeout(resetTimer))
</script>

<template>
  <span class="issue-id" :class="{ 'is-always': always, 'is-copied': copied }">
    <span class="issue-id-label mono">#{{ id }}</span>
    <button
      class="issue-id-copy"
      type="button"
      :title="copyLabel"
      :aria-label="copyLabel"
      @click="copy"
      @keydown.stop
    >
      <Check v-if="copied" :size="11" />
      <Copy v-else :size="11" />
    </button>
  </span>
</template>

<style scoped>
.issue-id {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  vertical-align: middle;
}

.issue-id-label {
  line-height: 1;
}

.issue-id-copy {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  opacity: 0.4;
  cursor: pointer;
  flex: none;
  transition:
    opacity 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.issue-id:hover .issue-id-copy,
.issue-id.is-always .issue-id-copy,
.issue-id.is-copied .issue-id-copy {
  opacity: 0.75;
}

.issue-id-copy:hover {
  opacity: 1;
  background: var(--surface-hover);
  color: var(--accent);
}

.issue-id-copy:focus-visible {
  opacity: 1;
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.issue-id.is-copied .issue-id-copy {
  opacity: 1;
  color: var(--green);
}

@media (hover: none) {
  .issue-id-copy {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .issue-id-copy {
    transition: none;
  }
}
</style>
