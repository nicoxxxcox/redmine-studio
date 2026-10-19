<script setup>
import { computed } from 'vue'
import { statusTone } from '../lib/constants.js'

const props = defineProps({
  status: { type: Object, default: null },
  label: { type: String, default: '' },
})

const tone = computed(() => statusTone(props.status))
</script>

<template>
  <span class="badge" :data-tone="tone">
    {{ label || status?.name || '—' }}
  </span>
</template>
