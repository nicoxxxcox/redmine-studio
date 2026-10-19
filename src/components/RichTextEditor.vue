<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  Bold,
  Code,
  Eraser,
  FileCode2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SquareCode,
  Undo2,
} from 'lucide-vue-next'
import { renderRichText } from '../lib/format.js'
import { domToTextile } from '../lib/textile.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Écrivez…' },
  ariaLabel: { type: String, default: 'Éditeur de texte enrichi' },
  id: { type: String, default: '' },
  minHeight: { type: String, default: '150px' },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const editor = ref(null)
const source = ref(null)
const isSource = ref(false)
const isEmpty = ref(!props.modelValue)
const applying = ref(false)

const active = reactive({
  bold: false,
  italic: false,
  ul: false,
  ol: false,
  quote: false,
  h2: false,
  pre: false,
  code: false,
})

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function render() {
  if (!editor.value) return
  editor.value.innerHTML = renderRichText(props.modelValue)
  isEmpty.value = !String(props.modelValue || '').trim()
}

function sync() {
  if (!editor.value) return
  const value = domToTextile(editor.value)
  isEmpty.value = !value
  applying.value = true
  emit('update:modelValue', value)
  nextTick(() => {
    applying.value = false
  })
}

watch(
  () => props.modelValue,
  (value) => {
    if (isSource.value || applying.value || !editor.value) return
    const current = domToTextile(editor.value)
    if (current === String(value || '').trim()) return
    editor.value.innerHTML = renderRichText(value)
    isEmpty.value = !String(value || '').trim()
  },
)

onMounted(() => {
  render()
  document.execCommand('defaultParagraphSeparator', false, 'p')
  document.addEventListener('selectionchange', refreshActive)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', refreshActive)
})

function refreshActive() {
  if (!editor.value || isSource.value || props.disabled) return
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return
  const anchor = selection.anchorNode
  if (!anchor || !editor.value.contains(anchor)) return
  try {
    active.bold = document.queryCommandState('bold')
    active.italic = document.queryCommandState('italic')
    active.ul = document.queryCommandState('insertUnorderedList')
    active.ol = document.queryCommandState('insertOrderedList')
    const block = String(document.queryCommandValue('formatBlock') || '')
      .toLowerCase()
      .replace(/[<>]/g, '')
    active.quote = block === 'blockquote'
    active.h2 = block === 'h2'
    active.pre = block === 'pre'
    const element = anchor.nodeType === 3 ? anchor.parentElement : anchor
    active.code = Boolean(element?.closest?.('code'))
  } catch {
    // queryCommand* peut échouer selon le contexte : on garde l'état précédent.
  }
}

function focusEditor() {
  editor.value?.focus()
}

function focus() {
  if (isSource.value) source.value?.focus()
  else editor.value?.focus()
}

function run(command, value = null) {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  document.execCommand(command, false, value)
  sync()
  refreshActive()
}

function toggleBlock(tag) {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  const current = String(document.queryCommandValue('formatBlock') || '')
    .toLowerCase()
    .replace(/[<>]/g, '')
  document.execCommand('formatBlock', false, current === tag ? 'p' : tag)
  sync()
  refreshActive()
}

function toggleInlineCode() {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return
  const range = selection.getRangeAt(0)
  const code = document.createElement('code')
  if (range.collapsed) {
    code.textContent = '\u200b'
    range.insertNode(code)
    range.setStart(code.firstChild, 1)
    range.collapse(true)
  } else {
    code.textContent = range.toString()
    range.deleteContents()
    range.insertNode(code)
    range.selectNodeContents(code)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  sync()
  refreshActive()
}

function insertLink() {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  const selection = window.getSelection()
  const selected = selection && !selection.isCollapsed ? selection.toString() : ''
  const answer = window.prompt(
    'URL du lien :',
    /^https?:\/\//.test(selected) ? selected : 'https://',
  )
  if (!answer) return
  focusEditor()
  if (selected) {
    document.execCommand('createLink', false, answer)
  } else {
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${escapeHtml(answer)}">${escapeHtml(answer)}</a>`,
    )
  }
  sync()
  refreshActive()
}

function clearFormat() {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  document.execCommand('removeFormat', false)
  document.execCommand('unlink', false)
  document.execCommand('formatBlock', false, 'p')
  sync()
  refreshActive()
}

function history(direction) {
  if (props.disabled || isSource.value || !editor.value) return
  focusEditor()
  document.execCommand(direction)
  sync()
  refreshActive()
}

const tools = [
  { key: 'bold', state: 'bold', icon: Bold, label: 'Gras (Ctrl+B)', run: () => run('bold') },
  { key: 'italic', state: 'italic', icon: Italic, label: 'Italique (Ctrl+I)', run: () => run('italic') },
  { key: 'heading', state: 'h2', icon: Heading2, label: 'Titre', advanced: true, run: () => toggleBlock('h2') },
  { separator: true },
  { key: 'ul', state: 'ul', icon: List, label: 'Liste à puces', run: () => run('insertUnorderedList') },
  { key: 'ol', state: 'ol', icon: ListOrdered, label: 'Liste numérotée', run: () => run('insertOrderedList') },
  { key: 'quote', state: 'quote', icon: Quote, label: 'Citation', run: () => toggleBlock('blockquote') },
  { separator: true },
  { key: 'code', state: 'code', icon: Code, label: 'Code', run: toggleInlineCode },
  { key: 'pre', state: 'pre', icon: SquareCode, label: 'Bloc de code', advanced: true, run: () => toggleBlock('pre') },
  { key: 'link', icon: Link2, label: 'Lien', run: insertLink },
  { key: 'clear', icon: Eraser, label: 'Effacer la mise en forme', advanced: true, run: clearFormat },
  { separator: true, advanced: true },
  { key: 'undo', icon: Undo2, label: 'Annuler', advanced: true, run: () => history('undo') },
  { key: 'redo', icon: Redo2, label: 'Rétablir', advanced: true, run: () => history('redo') },
]

const visibleTools = computed(() => (props.compact ? tools.filter((tool) => !tool.advanced) : tools))

async function toggleSource() {
  if (props.disabled) return
  isSource.value = !isSource.value
  await nextTick()
  if (isSource.value) {
    source.value?.focus()
  } else {
    render()
    focusEditor()
  }
  refreshActive()
}

function onSourceInput(event) {
  const value = event.target.value
  isEmpty.value = !value.trim()
  applying.value = true
  emit('update:modelValue', value)
  nextTick(() => {
    applying.value = false
  })
}

function onPaste(event) {
  if (props.disabled) return
  const data = event.clipboardData
  if (!data) return

  const hasFiles = Array.from(data.items || []).some((item) => item.kind === 'file')
  if (hasFiles) {
    // Les images sont gérées par le composeur parent (pièces jointes).
    event.preventDefault()
    return
  }

  const text = data.getData('text/plain')
  if (!text) return
  event.preventDefault()
  focusEditor()
  document.execCommand('insertText', false, text)
  sync()
}

defineExpose({ focus })
</script>

<template>
  <div
    class="rich-editor"
    :class="{ 'is-source': isSource, 'is-disabled': disabled, 'is-compact': compact }"
    :style="{ '--rich-min-height': minHeight }"
  >
    <div class="rich-toolbar" role="toolbar" :aria-label="`Mise en forme — ${ariaLabel}`">
      <template v-for="(tool, index) in visibleTools" :key="tool.key || `sep-${index}`">
        <span v-if="tool.separator" class="rich-sep" aria-hidden="true"></span>
        <button
          v-else
          type="button"
          class="rich-tool"
          :class="{ 'is-active': tool.state && active[tool.state] }"
          :title="tool.label"
          :aria-label="tool.label"
          :aria-pressed="tool.state ? active[tool.state] : undefined"
          :disabled="disabled"
          @mousedown.prevent
          @click="tool.run"
        >
          <component :is="tool.icon" :size="compact ? 13 : 14" />
        </button>
      </template>
      <span class="rich-grow"></span>
      <button
        type="button"
        class="rich-tool"
        :class="{ 'is-active': isSource }"
        :title="isSource ? 'Revenir à l’éditeur enrichi' : 'Voir la source Textile'"
        aria-label="Afficher la source Textile"
        :aria-pressed="isSource"
        :disabled="disabled"
        @mousedown.prevent
        @click="toggleSource"
      >
        <FileCode2 :size="compact ? 13 : 14" />
      </button>
    </div>

    <div
      v-show="!isSource"
      ref="editor"
      class="rich-editor-area rich-text"
      :class="{ 'is-empty': isEmpty }"
      :id="id || undefined"
      :contenteditable="disabled ? 'false' : 'true'"
      role="textbox"
      aria-multiline="true"
      :aria-label="ariaLabel"
      :data-placeholder="placeholder"
      spellcheck="true"
      @input="sync"
      @paste="onPaste"
      @keyup="refreshActive"
      @mouseup="refreshActive"
      @focus="refreshActive"
    ></div>

    <textarea
      v-show="isSource"
      ref="source"
      class="rich-editor-source"
      :value="modelValue"
      :aria-label="ariaLabel"
      :disabled="disabled"
      spellcheck="false"
      @input="onSourceInput"
    ></textarea>
  </div>
</template>
