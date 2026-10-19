<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings.js'

const props = defineProps({
  sprint: { type: Object, default: null },
})

const settings = useSettingsStore()

const href = computed(() => {
  const baseUrl = String(settings.settings.baseUrl || '').replace(/\/+$/, '')
  if (!baseUrl || !props.sprint?.id) return ''
  return `${baseUrl}/sprints/${props.sprint.id}`
})

function open(event) {
  if (!href.value) return
  event.preventDefault()
  event.stopPropagation()
  window.open(href.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <component
    :is="href ? 'button' : 'span'"
    :type="href ? 'button' : undefined"
    class="sprint-link"
    :class="{ 'is-static': !href }"
    :title="href ? `Ouvrir le sprint ${sprint.value} dans Redmine` : sprint?.label || 'Sprint'"
    @click="open"
    @keydown.stop
  >
    <slot>{{ sprint?.value }}</slot>
  </component>
</template>

<style scoped>
.sprint-link {
  border: 0;
  font: inherit;
  line-height: inherit;
  text-align: inherit;
}

.sprint-link:not(.is-static) {
  cursor: pointer;
}

.sprint-link.is-static {
  cursor: inherit;
}
</style>
