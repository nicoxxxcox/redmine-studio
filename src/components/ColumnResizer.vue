<script setup>
defineProps({
  label: { type: String, default: 'Redimensionner la colonne' },
})

const emit = defineEmits(['start', 'nudge', 'reset'])
</script>

<template>
  <span
    class="col-resizer"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    tabindex="0"
    title="Glisser pour ajuster · double-clic pour réinitialiser"
    @pointerdown.prevent="emit('start', $event)"
    @dblclick.stop.prevent="emit('reset')"
    @keydown.left.prevent="emit('nudge', -16)"
    @keydown.right.prevent="emit('nudge', 16)"
  ></span>
</template>

<style scoped>
.col-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 3;
  width: 9px;
  cursor: col-resize;
  touch-action: none;
}

.col-resizer::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 4px;
  width: 1px;
  border-radius: 1px;
  background: var(--line-strong);
  opacity: 0.55;
  transition:
    background var(--transition),
    opacity var(--transition);
}

.col-resizer:hover::after,
.col-resizer:focus-visible::after {
  left: 3.5px;
  width: 2px;
  background: var(--accent);
  opacity: 1;
}

.col-resizer:focus-visible {
  outline: none;
}
</style>
