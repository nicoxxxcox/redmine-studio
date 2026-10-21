<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ImageOff, Loader2 } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { isSvgAttachment } from '../lib/format.js'

const props = defineProps({
  attachment: { type: Object, required: true },
  thumbnail: { type: Boolean, default: true },
  thumbnailSize: { type: Number, default: 400 },
  fit: { type: String, default: 'cover' },
  alt: { type: String, default: '' },
  lazy: { type: Boolean, default: true },
})

const settings = useSettingsStore()
const root = ref(null)
const shouldLoad = ref(!props.lazy)
const displayUrl = ref('')
const pending = ref(true)
const ready = ref(false)
const failed = ref(false)
const altText = computed(() => props.alt || props.attachment?.filename || 'Image')
const svg = computed(() => isSvgAttachment(props.attachment))

let objectUrl = ''
let loadId = 0
let observer = null

function revoke() {
  if (!objectUrl) return
  URL.revokeObjectURL(objectUrl)
  objectUrl = ''
}

async function load() {
  const current = ++loadId
  revoke()
  displayUrl.value = ''
  pending.value = true
  ready.value = false
  failed.value = false

  try {
    let blob
    try {
      blob = await settings.api.fetchAttachment(props.attachment, {
        thumbnail: props.thumbnail,
        thumbnailSize: props.thumbnailSize,
      })
    } catch (error) {
      // Certaines images anciennes n'ont pas de miniature : on retombe sur
      // le fichier original plutôt que d'afficher une vignette cassée.
      if (!props.thumbnail || !props.attachment?.thumbnail_url) throw error
      blob = await settings.api.fetchAttachment(props.attachment)
    }
    if (current !== loadId) return
    objectUrl = URL.createObjectURL(blob)
    displayUrl.value = objectUrl
  } catch {
    if (current === loadId) failed.value = true
  } finally {
    if (current === loadId) pending.value = false
  }
}

watch(
  () => [
    props.attachment?.id,
    props.attachment?.content_url,
    props.attachment?.thumbnail_url,
    props.thumbnail,
    props.thumbnailSize,
    settings.settings.baseUrl,
    settings.settings.apiKey,
  ],
  () => {
    if (shouldLoad.value) load()
  },
  { immediate: true },
)

watch(shouldLoad, (value) => {
  if (value) load()
})

onMounted(() => {
  if (!props.lazy || shouldLoad.value || typeof IntersectionObserver === 'undefined') {
    shouldLoad.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      shouldLoad.value = true
      observer?.disconnect()
      observer = null
    },
    { rootMargin: '300px 0px' },
  )
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  loadId += 1
  observer?.disconnect()
  observer = null
  revoke()
})
</script>

<template>
  <span
    ref="root"
    class="attachment-image"
    :class="[`is-${fit}`, { 'is-ready': ready, 'is-failed': failed, 'is-svg': svg }]"
  >
    <img
      v-if="displayUrl && !failed"
      :src="displayUrl"
      :alt="altText"
      decoding="async"
      draggable="false"
      @load="ready = true"
      @error="failed = true"
    />
    <span
      v-if="!failed && (pending || (displayUrl && !ready))"
      class="attachment-image-state"
      aria-hidden="true"
    >
      <Loader2 :size="16" class="spin" />
    </span>
    <span v-if="failed || (!pending && !displayUrl)" class="attachment-image-state" aria-hidden="true">
      <ImageOff :size="17" />
    </span>
  </span>
</template>

<style scoped>
.attachment-image {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-3);
  color: var(--faint);
}

.attachment-image img {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 160ms var(--ease);
}

.attachment-image.is-cover img {
  object-fit: cover;
}

.attachment-image.is-svg.is-cover img {
  object-fit: contain;
}

.attachment-image.is-contain img {
  object-fit: contain;
}

.attachment-image.is-ready img {
  opacity: 1;
}

.attachment-image-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  min-width: 48px;
  min-height: 48px;
}

.attachment-image.is-natural {
  display: inline-flex;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  background: transparent;
}

.attachment-image.is-natural img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.attachment-image.is-natural.is-svg {
  width: 100%;
  height: 100%;
}

.attachment-image.is-natural.is-svg img {
  width: 100%;
  height: 100%;
}

.attachment-image.is-natural .attachment-image-state {
  position: static;
  min-width: 64px;
  min-height: 64px;
}

.attachment-image.is-natural.is-svg .attachment-image-state {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
}
</style>
