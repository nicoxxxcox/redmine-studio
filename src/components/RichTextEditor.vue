<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  AtSign,
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
import { fullName, renderRichText } from '../lib/format.js'
import { domToTextile } from '../lib/textile.js'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Écrivez…' },
  ariaLabel: { type: String, default: 'Éditeur de texte enrichi' },
  id: { type: String, default: '' },
  minHeight: { type: String, default: '150px' },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  users: { type: Array, default: () => [] },
  resolveUser: { type: Function, default: null },
  pasteImages: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue'])

const editor = ref(null)
const source = ref(null)
const mentionMenu = ref(null)
const isSource = ref(false)
const isEmpty = ref(!props.modelValue)
const applying = ref(false)

const mention = reactive({
  open: false,
  query: '',
  activeIndex: 0,
  top: 0,
  left: 0,
  width: 320,
})
let mentionRange = null

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

function normalizeMentionSearch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const mentionResults = computed(() => {
  const users = (props.users || []).filter((user) => user?.id && !user.isGroup)
  const query = normalizeMentionSearch(mention.query)
  if (!query) return users.slice(0, 10)
  const terms = query.split(/\s+/).filter(Boolean)
  return users
    .filter((user) => {
      const haystack = normalizeMentionSearch(
        [fullName(user), user.login, user.mail, user.name].filter(Boolean).join(' '),
      )
      return terms.every((term) => haystack.includes(term))
    })
    .slice(0, 10)
})

const activeMention = computed(() => mentionResults.value[mention.activeIndex] || null)

function mentionMeta(user) {
  if (user?.login) return `@${user.login}`
  return user?.mail || ''
}

function mentionHandle(user) {
  return String(user?.login || user?.name || fullName(user)).trim()
}

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
    closeMention()
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
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', closeMention)
  delete document.body.dataset.mentionOpen
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function insertIntoSource(text) {
  const element = source.value
  if (!element || !text) return
  const start = element.selectionStart ?? element.value.length
  const end = element.selectionEnd ?? start
  element.value = element.value.slice(0, start) + text + element.value.slice(end)
  element.selectionStart = start + text.length
  element.selectionEnd = start + text.length
  onSourceInput({ target: element })
}

function editorSelectionRange() {
  if (!editor.value) return null
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!editor.value.contains(range.commonAncestorContainer)) return null
  return range
}

function createImageReference(filename) {
  const chip = document.createElement('span')
  chip.className = 'rt-image-ref'
  chip.dataset.filename = filename
  chip.contentEditable = 'false'
  chip.title = `Image jointe : ${filename}`
  chip.textContent = `Image : ${filename}`
  return chip
}

function normalizeImageReferences(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  const text = String(value).trim()
  if (!text) return []
  const references = [...text.matchAll(/!([^!\n]+)!/g)].map((match) => match[1].trim())
  return references.length ? references : [text]
}

function insertImageReferences(value) {
  if (props.disabled) return
  const filenames = normalizeImageReferences(value)
  if (!filenames.length) return

  if (isSource.value) {
    insertIntoSource(filenames.map((filename) => `!${filename}!`).join('\n'))
    return
  }

  focusEditor()
  const selection = window.getSelection()
  let range = editorSelectionRange()
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(editor.value)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  range.deleteContents()
  const fragment = document.createDocumentFragment()
  let lastNode = null
  filenames.forEach((filename, index) => {
    if (index) {
      lastNode = document.createElement('br')
      fragment.appendChild(lastNode)
    }
    lastNode = createImageReference(filename)
    fragment.appendChild(lastNode)
  })
  lastNode = document.createTextNode('\u00a0')
  fragment.appendChild(lastNode)
  range.insertNode(fragment)

  const caret = document.createRange()
  caret.setStartAfter(lastNode)
  caret.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(caret)
  sync()
  refreshActive()
}

function removeImageReference(filename) {
  if (!filename || props.disabled) return
  if (isSource.value) {
    const next = String(source.value?.value || '').replace(
      new RegExp(`!${escapeRegExp(filename)}!`, 'g'),
      '',
    )
    if (source.value) source.value.value = next
    onSourceInput({ target: { value: next } })
    return
  }
  if (!editor.value) return
  const chips = Array.from(editor.value.querySelectorAll('.rt-image-ref')).filter(
    (element) => element.getAttribute('data-filename') === filename,
  )
  if (!chips.length) return
  for (const chip of chips) chip.remove()
  sync()
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

function closeMention() {
  mention.open = false
  mention.query = ''
  mention.activeIndex = 0
  mentionRange = null
}

function positionMentionMenu() {
  const rect = mentionRange?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(320, window.innerWidth - 16)
  const estimatedHeight = Math.min(300, 42 + Math.max(1, mentionResults.value.length) * 38)
  let left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  let top = rect.bottom + 6
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, rect.top - estimatedHeight - 6)
  }
  mention.width = Math.round(width)
  mention.left = Math.round(left)
  mention.top = Math.round(top)
}

function detectMentionContext() {
  if (props.disabled || isSource.value || !editor.value) {
    closeMention()
    return
  }
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) {
    closeMention()
    return
  }
  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (node?.nodeType !== Node.TEXT_NODE || !editor.value.contains(node)) {
    closeMention()
    return
  }
  if (node.parentElement?.closest('code, pre')) {
    closeMention()
    return
  }
  const before = node.textContent.slice(0, range.startOffset)
  const match = /(?:^|[\s([{«"'’])@([\p{L}\p{N} ._'-]{0,40})$/u.exec(before)
  if (!match) {
    closeMention()
    return
  }

  const query = match[1]
  const atOffset = before.length - query.length - 1
  const nextRange = document.createRange()
  nextRange.setStart(node, atOffset)
  nextRange.setEnd(node, range.startOffset)
  mentionRange = nextRange

  const changed = !mention.open || mention.query !== query
  mention.open = true
  mention.query = query
  if (changed) mention.activeIndex = 0
  if (mention.activeIndex >= mentionResults.value.length) mention.activeIndex = 0
  positionMentionMenu()
}

function scrollMentionOption() {
  nextTick(() => {
    mentionMenu.value?.querySelector('.mention-option.is-active')?.scrollIntoView({
      block: 'nearest',
    })
  })
}

function moveMention(delta) {
  const count = mentionResults.value.length
  if (!count) return
  mention.activeIndex = (mention.activeIndex + delta + count) % count
  scrollMentionOption()
}

async function selectMention(user) {
  if (!user || !mentionRange) return
  const range = mentionRange.cloneRange()
  closeMention()

  let resolved = user
  if (!resolved.login && props.resolveUser) {
    try {
      resolved = await props.resolveUser(resolved)
    } catch {
      // Le nom reste utilisable si le login ne peut pas être récupéré.
    }
  }

  if (!range.startContainer?.isConnected || !editor.value?.contains(range.startContainer)) return
  const handle = mentionHandle(resolved)
  if (!handle) return

  range.deleteContents()
  const token = document.createTextNode(`@${handle} `)
  range.insertNode(token)
  const caret = document.createRange()
  caret.setStart(token, token.length)
  caret.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(caret)
  focusEditor()
  sync()
  refreshActive()
}

function onEditorKeydown(event) {
  if (!mention.open) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveMention(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveMention(-1)
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    if (activeMention.value) {
      event.preventDefault()
      selectMention(activeMention.value)
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMention()
  }
}

function onDocumentPointerDown(event) {
  if (mentionMenu.value?.contains(event.target)) return
  closeMention()
}

function onWindowScroll(event) {
  if (mentionMenu.value?.contains(event.target)) return
  closeMention()
}

function onEditorInput() {
  sync()
  detectMentionContext()
}

watch(
  () => mention.open,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      window.addEventListener('scroll', onWindowScroll, true)
      window.addEventListener('resize', closeMention)
      document.body.dataset.mentionOpen = '1'
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      window.removeEventListener('scroll', onWindowScroll, true)
      window.removeEventListener('resize', closeMention)
      delete document.body.dataset.mentionOpen
    }
  },
)

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
  closeMention()
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

function pasteClipboardImages(event) {
  const data = event.clipboardData
  if (!data) return false
  const hasFiles = Array.from(data.items || []).some((item) => item.kind === 'file')
  if (!hasFiles) return false

  event.preventDefault()
  if (!props.pasteImages) return true
  let references = null
  try {
    references = props.pasteImages(event)
  } catch {
    references = null
  }
  if (references) insertImageReferences(references)
  return true
}

function onPaste(event) {
  if (props.disabled) return
  closeMention()
  if (pasteClipboardImages(event)) return

  const text = event.clipboardData?.getData('text/plain')
  if (!text) return
  event.preventDefault()
  focusEditor()
  document.execCommand('insertText', false, text)
  sync()
}

function onSourcePaste(event) {
  if (props.disabled) return
  pasteClipboardImages(event)
}

defineExpose({ focus, insertImageReferences, removeImageReference })
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
      aria-autocomplete="list"
      :aria-label="ariaLabel"
      :aria-expanded="mention.open"
      :aria-controls="mention.open ? 'rich-mention-menu' : undefined"
      :aria-activedescendant="
        mention.open && activeMention ? `mention-option-${activeMention.id}` : undefined
      "
      :data-placeholder="placeholder"
      spellcheck="true"
      @input="onEditorInput"
      @paste="onPaste"
      @keydown="onEditorKeydown"
      @keyup="refreshActive"
      @mouseup="refreshActive"
      @focus="refreshActive"
      @blur="closeMention"
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
      @paste="onSourcePaste"
    ></textarea>

    <Teleport to="body">
      <div
        v-if="mention.open"
        id="rich-mention-menu"
        ref="mentionMenu"
        class="mention-menu"
        role="listbox"
        aria-label="Mentionner un utilisateur"
        :style="{ top: `${mention.top}px`, left: `${mention.left}px`, width: `${mention.width}px` }"
        @mousedown.prevent
      >
        <div class="mention-menu-head">
          <AtSign :size="12" />
          <span>Mentionner un utilisateur</span>
          <span v-if="mention.query" class="mention-query">@{{ mention.query }}</span>
        </div>

        <button
          v-for="(user, index) in mentionResults"
          :id="`mention-option-${user.id}`"
          :key="user.id"
          type="button"
          class="mention-option"
          :class="{ 'is-active': index === mention.activeIndex }"
          role="option"
          :aria-selected="index === mention.activeIndex"
          @mouseenter="mention.activeIndex = index"
          @mousedown.prevent="selectMention(user)"
        >
          <UserAvatar :user="user" :size="24" />
          <span class="mention-option-text">
            <span class="mention-option-name">{{ fullName(user) }}</span>
            <span v-if="mentionMeta(user)" class="mention-option-meta">{{ mentionMeta(user) }}</span>
          </span>
        </button>

        <p v-if="!mentionResults.length" class="mention-empty">
          Aucun utilisateur trouvé.
        </p>
      </div>
    </Teleport>
  </div>
</template>
