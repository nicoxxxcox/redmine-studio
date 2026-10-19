<script setup>
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: 'Rien à afficher' },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="empty-state">
    <div v-if="icon" class="empty-icon">
      <component :is="icon" :size="22" />
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="text" class="empty-text">{{ text }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-action {
  margin-top: 10px;
}
</style>
