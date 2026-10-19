<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderRichText } from '../lib/format.js'

const props = defineProps({
  source: { type: String, default: '' },
  emptyText: { type: String, default: 'Aucune description.' },
})

const router = useRouter()
const html = computed(() => renderRichText(props.source))

function onClick(event) {
  const anchor = event.target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (anchor.hasAttribute('data-internal') || href?.startsWith('/')) {
    event.preventDefault()
    router.push(href)
  }
}
</script>

<template>
  <div v-if="html" class="rich-text" @click="onClick" v-html="html"></div>
  <p v-else class="rich-text muted">{{ emptyText }}</p>
</template>
