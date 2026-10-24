<script setup>
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useToastStore } from '../stores/toast.js'

const toastStore = useToastStore()

const icons = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="toast"
          :data-type="toast.type"
          role="status"
        >
          <component :is="icons[toast.type] || Info" class="toast-icon" :size="17" />
          <p class="toast-message">{{ toast.message }}</p>
          <button
            v-if="toast.action"
            class="toast-action"
            type="button"
            @click="toast.action.run(); toastStore.dismiss(toast.id)"
          >
            {{ toast.action.label }}
          </button>
          <button class="toast-close" type="button" @click="toastStore.dismiss(toast.id)">
            <X :size="14" />
            <span class="sr-only">Fermer</span>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 11px 11px 13px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  pointer-events: auto;
}

.toast-icon {
  flex: none;
  margin-top: 1px;
  color: var(--muted);
}

.toast[data-type='success'] .toast-icon {
  color: var(--green);
}
.toast[data-type='error'] .toast-icon {
  color: var(--red);
}
.toast[data-type='info'] .toast-icon {
  color: var(--blue);
}

.toast-message {
  flex: 1;
  font-size: 15px;
  line-height: 1.45;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.toast-action {
  flex: none;
  padding: 2px 6px;
  border: 0;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}

.toast-close {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
}

.toast-close:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 220ms var(--ease);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

@media (max-width: 640px) {
  .toast-stack {
    right: 12px;
    bottom: 76px;
  }
}
</style>
