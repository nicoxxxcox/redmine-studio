<script setup>
import { computed } from 'vue'
import { avatarColors } from '../lib/constants.js'
import { fullName, initials } from '../lib/format.js'

const props = defineProps({
  user: { type: Object, default: null },
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 30 },
  title: { type: String, default: '' },
})

const label = computed(() => props.name || fullName(props.user))
const colors = computed(() => avatarColors(label.value))
const sizeValue = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <span
    class="avatar"
    :style="{
      '--avatar-size': sizeValue,
      background: colors[0],
      color: colors[1],
    }"
    :title="title || label"
    :aria-label="label"
  >
    {{ initials(label) }}
  </span>
</template>
