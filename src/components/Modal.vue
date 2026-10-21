<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' },
  closeOnBackdrop: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])
const panel = ref(null)
let previouslyFocused = null

function close() {
  emit('close')
}

function onBackdrop() {
  if (props.closeOnBackdrop) close()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    // Une combobox de mention ouverte doit pouvoir être fermée sans
    // refermer la modale qui la contient.
    if (document.body.dataset.mentionOpen) return
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const focusables = panel.value.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown, true)
      await nextTick()
      const target = panel.value?.querySelector(
        '[autofocus], textarea, input:not([type="hidden"]), select',
      )
      target?.focus()
    } else {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown, true)
      if (previouslyFocused?.focus) previouslyFocused.focus()
    }
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-root" role="presentation" @mousedown.self="onBackdrop">
        <div
          ref="panel"
          class="modal-panel"
          :data-size="size"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header v-if="title || $slots.header" class="modal-head">
            <slot name="header">
              <div class="modal-head-text">
                <h2 class="modal-title">{{ title }}</h2>
                <p v-if="description" class="modal-description">{{ description }}</p>
              </div>
            </slot>
            <button class="btn btn-ghost btn-icon btn-sm modal-close" type="button" @click="close">
              <X :size="16" />
              <span class="sr-only">Fermer</span>
            </button>
          </header>

          <div class="modal-body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 17, 22, 0.48);
  backdrop-filter: blur(3px);
  overflow-y: auto;
}

[data-theme='dark'] .modal-root {
  background: rgba(0, 0, 0, 0.62);
}

.modal-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 48px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-panel[data-size='sm'] {
  max-width: 430px;
}
.modal-panel[data-size='lg'] {
  max-width: 760px;
}
.modal-panel[data-size='xl'] {
  max-width: 960px;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
}

.modal-head-text {
  min-width: 0;
}

.modal-title {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.modal-description {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--muted);
}

.modal-close {
  margin: -4px -6px 0 0;
}

.modal-body {
  padding: 0 22px 20px;
  overflow-y: auto;
  min-height: 0;
}

.modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms var(--ease);
}
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 200ms var(--ease), opacity 200ms var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(10px) scale(0.985);
  opacity: 0;
}

@media (max-width: 640px) {
  .modal-root {
    padding: 0;
    align-items: flex-end;
  }
  .modal-panel,
  .modal-panel[data-size] {
    max-width: 100%;
    max-height: 92vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}
</style>
