<script setup>
import { computed } from 'vue'
import { priorityTone } from '../lib/constants.js'

const props = defineProps({
  priority: { type: Object, default: null },
  showLabel: { type: Boolean, default: true },
})

const tone = computed(() => priorityTone(props.priority))
</script>

<template>
  <span v-if="priority" class="priority" :title="priority.name">
    <span class="priority-bars" :data-tone="tone" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
    <span v-if="showLabel" class="priority-label">{{ priority.name }}</span>
  </span>
</template>

<style scoped>
.priority {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--muted);
}

.priority-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.priority-bars i {
  width: 3px;
  border-radius: 1px;
  background: var(--line-strong);
}

.priority-bars i:nth-child(1) {
  height: 5px;
}
.priority-bars i:nth-child(2) {
  height: 8px;
}
.priority-bars i:nth-child(3) {
  height: 11px;
}

.priority-bars[data-tone='blue'] i:nth-child(1),
.priority-bars[data-tone='slate'] i:nth-child(1) {
  background: var(--blue);
}

.priority-bars[data-tone='orange'] i:nth-child(-n + 2) {
  background: var(--orange);
}

.priority-bars[data-tone='red'] i {
  background: var(--red);
}

.priority-bars[data-tone='slate'] i {
  background: var(--slate);
}

.priority-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
