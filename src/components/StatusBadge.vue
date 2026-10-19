<script setup>
import { computed } from 'vue'
import { statusHue } from '../lib/constants.js'
import { useSessionStore } from '../stores/session.js'

const props = defineProps({
  status: { type: Object, default: null },
  label: { type: String, default: '' },
})

const session = useSessionStore()
const hue = computed(() => statusHue(props.status, session.statuses))
const badgeStyle = computed(() => (hue.value === null ? {} : { '--status-hue': hue.value }))
</script>

<template>
  <span class="badge" :class="{ 'status-badge': hue !== null }" :style="badgeStyle">
    <span class="badge-label">{{ label || status?.name || '—' }}</span>
  </span>
</template>
