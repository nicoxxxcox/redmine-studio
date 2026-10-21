<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  X,
} from 'lucide-vue-next'
import AttachmentImage from './AttachmentImage.vue'
import { useSettingsStore } from '../stores/settings.js'
import { useToastStore } from '../stores/toast.js'
import { formatFileSize } from '../lib/format.js'
import { saveBlob } from '../lib/api.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  attachments: { type: Array, default: () => [] },
  startIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['close'])
const settings = useSettingsStore()
const toast = useToastStore()

const root = ref(null)
const closeButton = ref(null)
const currentIndex = ref(0)
const downloading = ref(false)
let previouslyFocused = null

const current = computed(() => props.attachments[currentIndex.value] || null)
const hasMultiple = computed(() => props.attachments.length > 1)

function clampIndex(value) {
  const max = props.attachments.length - 1
  if (max < 0) return 0
  return Math.min(Math.max(Number(value) || 0, 0), max)
}

function close() {
  emit('close')
}

function previous() {
  if (!hasMultiple.value) return
  currentIndex.value =
    (currentIndex.value - 1 + props.attachments.length) % props.attachments.length
}

function next() {
  if (!hasMultiple.value) return
  currentIndex.value = (currentIndex.value + 1) % props.attachments.length
}

function onBackdrop(event) {
  if (event.target === event.currentTarget) close()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    event.stopPropagation()
    previous()
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    next()
    return
  }
  if (event.key !== 'Tab' || !root.value) return

  const focusables = root.value.querySelectorAll('button:not([disabled]), a[href]')
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

async function download() {
  const attachment = current.value
  if (!attachment || downloading.value) return
  downloading.value = true
  try {
    const blob = await settings.api.downloadAttachment(attachment)
    saveBlob(blob, attachment.filename)
  } catch (error) {
    toast.error(error?.message || 'Téléchargement impossible.')
  } finally {
    downloading.value = false
  }
}

function cleanup() {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown, true)
  if (previouslyFocused?.isConnected) previouslyFocused.focus()
  previouslyFocused = null
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      currentIndex.value = clampIndex(props.startIndex)
      previouslyFocused = document.activeElement
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown, true)
      await nextTick()
      closeButton.value?.focus()
    } else {
      cleanup()
    }
  },
)

watch(
  () => props.startIndex,
  (value) => {
    if (props.open) currentIndex.value = clampIndex(value)
  },
)

watch(
  () => props.attachments.length,
  (length) => {
    if (!length && props.open) {
      close()
      return
    }
    currentIndex.value = clampIndex(currentIndex.value)
  },
)

onBeforeUnmount(cleanup)
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="open && current"
        ref="root"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="`Aperçu de ${current.filename}`"
        @mousedown.self="onBackdrop"
      >
        <header class="lightbox-bar">
          <div class="lightbox-heading">
            <span class="lightbox-title">{{ current.filename }}</span>
            <span class="lightbox-sub">
              {{ formatFileSize(current.filesize) }}
              <template v-if="hasMultiple"> · {{ currentIndex + 1 }} / {{ attachments.length }}</template>
            </span>
          </div>
          <div class="lightbox-actions">
            <button
              class="lightbox-btn"
              type="button"
              title="Télécharger l’image"
              aria-label="Télécharger l’image"
              :disabled="downloading"
              @click="download"
            >
              <Loader2 v-if="downloading" :size="17" class="spin" />
              <Download v-else :size="17" />
            </button>
            <button
              ref="closeButton"
              class="lightbox-btn"
              type="button"
              title="Fermer"
              aria-label="Fermer la visionneuse"
              @click="close"
            >
              <X :size="18" />
            </button>
          </div>
        </header>

        <div class="lightbox-stage" @mousedown.self="onBackdrop">
          <button
            v-if="hasMultiple"
            class="lightbox-nav is-prev"
            type="button"
            title="Image précédente"
            aria-label="Image précédente"
            @click.stop="previous"
          >
            <ChevronLeft :size="24" />
          </button>

          <div class="lightbox-canvas">
            <AttachmentImage
              :key="current.id"
              :attachment="current"
              :thumbnail="false"
              :lazy="false"
              fit="natural"
              :alt="current.filename"
            />
          </div>

          <button
            v-if="hasMultiple"
            class="lightbox-nav is-next"
            type="button"
            title="Image suivante"
            aria-label="Image suivante"
            @click.stop="next"
          >
            <ChevronRight :size="24" />
          </button>
        </div>

        <footer class="lightbox-foot">
          <span v-if="current.description">{{ current.description }}</span>
          <span v-else>Cliquez en dehors de l’image ou appuyez sur Échap pour fermer.</span>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 115;
  display: flex;
  flex-direction: column;
  background: rgba(8, 10, 14, 0.94);
  color: #fff;
  backdrop-filter: blur(8px);
}

.lightbox-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: none;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.lightbox-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lightbox-title {
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-sub {
  color: rgba(255, 255, 255, 0.55);
  font-size: 10.5px;
}

.lightbox-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.lightbox-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.lightbox-btn:hover {
  border-color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.lightbox-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.lightbox-stage {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 22px 72px;
}

.lightbox-canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.lightbox-canvas :deep(.attachment-image) {
  pointer-events: auto;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  transform: translateY(-50%);
  transition:
    background var(--transition),
    border-color var(--transition);
}

.lightbox-nav:hover {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.17);
}

.lightbox-nav.is-prev {
  left: 16px;
}

.lightbox-nav.is-next {
  right: 16px;
}

.lightbox-foot {
  flex: none;
  padding: 10px 20px 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 10.5px;
  text-align: center;
}

.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 180ms var(--ease);
}

.lightbox-enter-active .lightbox-canvas,
.lightbox-leave-active .lightbox-canvas {
  transition: transform 220ms var(--ease);
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

.lightbox-enter-from .lightbox-canvas,
.lightbox-leave-to .lightbox-canvas {
  transform: scale(0.985);
}

@media (max-width: 640px) {
  .lightbox-bar {
    padding: 10px 12px;
  }

  .lightbox-stage {
    padding: 12px 48px;
  }

  .lightbox-nav {
    width: 36px;
    height: 36px;
  }

  .lightbox-nav.is-prev {
    left: 7px;
  }

  .lightbox-nav.is-next {
    right: 7px;
  }

  .lightbox-foot {
    padding: 8px 14px 12px;
  }
}
</style>
