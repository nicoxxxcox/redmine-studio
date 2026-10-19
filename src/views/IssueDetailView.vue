<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpWideNarrow,
  CalendarDays,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Milestone,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Star,
  TriangleAlert,
  X,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useUiStore } from '../stores/ui.js'
import { useRefreshStore } from '../stores/refresh.js'
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatHours,
  fullName,
  isOverdue,
  issueSprint,
  plainText,
  relativeTime,
  toIsoDate,
} from '../lib/format.js'
import { saveBlob, ApiError } from '../lib/api.js'
import { copyText } from '../lib/clipboard.js'
import IssueId from '../components/IssueId.vue'
import StatusQuickSelect from '../components/StatusQuickSelect.vue'
import PriorityBadge from '../components/PriorityBadge.vue'
import UserAvatar from '../components/UserAvatar.vue'
import MarkdownBody from '../components/MarkdownBody.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const ui = useUiStore()
const refresh = useRefreshStore()

const issueId = computed(() => Number(route.params.id))
const issue = ref(null)
const entries = ref([])
const members = ref([])
const versions = ref([])
const loading = ref(true)
const reloading = ref(false)
const error = ref('')
const activeTab = ref('discussion')
const timelineNotesOnly = ref(false)
const journalSort = ref('desc')
const journalOpen = ref({})
const editingJournalId = ref(null)
const journalDraft = ref('')
const journalEditError = ref('')
const savingJournalId = ref(null)

const editingDescription = ref(false)
const descriptionDraft = ref('')
const savingDescription = ref(false)
const editingSubject = ref(false)
const subjectDraft = ref('')
const savingSubject = ref(false)
const updatingField = ref('')

const comment = ref('')
const privateNote = ref(false)
const commentFiles = ref([])
const submittingComment = ref(false)
const commentError = ref('')
const draftSaved = ref(false)
const uploadingFiles = ref(false)

const relationForm = reactive({ relation_type: 'relates', issue_to_id: '', delay: '' })
const addingRelation = ref(false)

const draftKey = computed(() => `redmine-studio.issue-draft.${issueId.value}`)
let draftRestoredFor = null
let draftTimer = null
let draftSavedTimer = null
let loadSequence = 0

const issueUrl = computed(() =>
  settings.settings.baseUrl ? `${settings.settings.baseUrl}/issues/${issueId.value}` : '#',
)

const project = computed(() => issue.value?.project || null)
const statusOptions = computed(() => {
  const allowed = issue.value?.allowed_statuses
  if (!Array.isArray(allowed) || !allowed.length) return session.statuses
  if (issue.value?.status && !allowed.some((status) => status.id === issue.value.status.id)) {
    return [issue.value.status, ...allowed]
  }
  return allowed
})
const assigneeOptions = computed(() => {
  const list = [...members.value]
  if (issue.value?.assigned_to && !list.some((member) => member.id === issue.value.assigned_to.id)) {
    list.unshift(issue.value.assigned_to)
  }
  return list
})

const journals = computed(() =>
  [...(issue.value?.journals || [])]
    .filter((journal) => hasNote(journal) || journal.details?.length)
    .sort((a, b) => new Date(a.created_on) - new Date(b.created_on)),
)
const sortedJournals = computed(() =>
  journalSort.value === 'desc' ? [...journals.value].reverse() : journals.value,
)
const visibleJournals = computed(() =>
  timelineNotesOnly.value
    ? sortedJournals.value.filter((journal) => hasNote(journal))
    : sortedJournals.value,
)
const noteJournals = computed(() => journals.value.filter((journal) => hasNote(journal)))
const recentNoteIds = computed(
  () => new Set(noteJournals.value.slice(-3).map((journal) => journal.id)),
)
const notesAllExpanded = computed(
  () =>
    noteJournals.value.length > 0 &&
    noteJournals.value.every((journal) => isJournalOpen(journal)),
)
const noteCount = computed(() => noteJournals.value.length)
const sprint = computed(() => issueSprint(issue.value))
const attachments = computed(() => issue.value?.attachments || [])
const relations = computed(() => issue.value?.relations || [])
const children = computed(() => issue.value?.children || [])

const spentHours = computed(() => {
  if (issue.value?.spent_hours !== undefined && issue.value?.spent_hours !== null) {
    return Number(issue.value.spent_hours)
  }
  return entries.value.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
})
const estimatedHours = computed(() => Number(issue.value?.estimated_hours || 0))
const timeProgress = computed(() => {
  if (!estimatedHours.value) return null
  return Math.min(100, Math.round((spentHours.value / estimatedHours.value) * 100))
})
const isWatching = computed(() =>
  (issue.value?.watchers || []).some((watcher) => watcher.id === session.user?.id),
)
const journalSortLabel = computed(() =>
  journalSort.value === 'asc' ? 'Plus anciens d’abord' : 'Plus récents d’abord',
)

function hasNote(journal) {
  return Boolean(journal?.notes && journal.notes.trim())
}

function isJournalOpen(journal) {
  if (!hasNote(journal)) return false
  const key = String(journal.id)
  if (Object.prototype.hasOwnProperty.call(journalOpen.value, key)) {
    return journalOpen.value[key]
  }
  return recentNoteIds.value.has(journal.id)
}

function toggleJournal(journal) {
  if (!hasNote(journal)) return
  journalOpen.value = {
    ...journalOpen.value,
    [journal.id]: !isJournalOpen(journal),
  }
}

function toggleAllJournals() {
  const open = !notesAllExpanded.value
  const next = { ...journalOpen.value }
  for (const journal of noteJournals.value) next[journal.id] = open
  journalOpen.value = next
}

function toggleJournalSort() {
  journalSort.value = journalSort.value === 'asc' ? 'desc' : 'asc'
}

function notePreview(journal) {
  return plainText(journal.notes).slice(0, 180) || 'Commentaire sans texte.'
}

function journalSummary(journal) {
  return (journal.details || []).map((detail) => detailText(detail)).join(' · ')
}

function canEditJournal(journal) {
  return Boolean(
    hasNote(journal) &&
      session.user &&
      (journal.user?.id === session.user.id || session.user.admin),
  )
}

function startJournalEdit(journal) {
  editingJournalId.value = journal.id
  journalDraft.value = journal.notes || ''
  journalEditError.value = ''
  journalOpen.value = { ...journalOpen.value, [journal.id]: true }
}

function cancelJournalEdit() {
  editingJournalId.value = null
  journalDraft.value = ''
  journalEditError.value = ''
}

async function saveJournalEdit(journal) {
  const notes = journalDraft.value.trim()
  if (!notes) {
    journalEditError.value = 'Le commentaire ne peut pas être vide.'
    return
  }
  savingJournalId.value = journal.id
  journalEditError.value = ''
  try {
    await settings.api.updateJournal(journal.id, { notes })
    editingJournalId.value = null
    journalDraft.value = ''
    toast.success('Commentaire mis à jour.')
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    journalEditError.value = err?.message || 'Impossible de modifier ce commentaire.'
  } finally {
    savingJournalId.value = null
  }
}

function focusComposer() {
  document.getElementById('issue-comment-input')?.focus()
  document.getElementById('comment-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const relationTypes = [
  { value: 'relates', label: 'Est lié à' },
  { value: 'duplicates', label: 'Duplique' },
  { value: 'blocks', label: 'Bloque' },
  { value: 'precedes', label: 'Précède' },
  { value: 'follows', label: 'Suit' },
  { value: 'copied_to', label: 'Copié vers' },
]

const ATTRIBUTE_LABELS = {
  status_id: 'Statut',
  priority_id: 'Priorité',
  assigned_to_id: 'Assigné à',
  tracker_id: 'Tracker',
  project_id: 'Projet',
  fixed_version_id: 'Version',
  category_id: 'Catégorie',
  due_date: 'Échéance',
  start_date: 'Date de début',
  estimated_hours: 'Temps estimé',
  done_ratio: 'Avancement',
  subject: 'Sujet',
  description: 'Description',
  is_private: 'Confidentialité',
  parent_id: 'Ticket parent',
}

async function load({ silent = false } = {}) {
  const sequence = ++loadSequence
  if (!silent) loading.value = true
  else reloading.value = true
  error.value = ''

  const [issueResult, timeResult] = await Promise.allSettled([
    settings.api.issue(issueId.value),
    settings.api.timeEntries({ issue_id: issueId.value, limit: 100, sort: 'spent_on:desc' }),
  ])

  if (sequence !== loadSequence) return

  if (issueResult.status === 'fulfilled') {
    issue.value = issueResult.value?.issue || null
    if (issue.value) {
      document.title = `#${issue.value.id} ${issue.value.subject} · Redmine Studio`
      descriptionDraft.value = issue.value.description || ''
      subjectDraft.value = issue.value.subject || ''
      restoreDraft()
      await Promise.all([loadMembers(), loadVersions()])
    }
  } else {
    error.value = issueResult.reason?.message || 'Impossible de charger ce ticket.'
    issue.value = null
  }

  if (timeResult.status === 'fulfilled') {
    entries.value = timeResult.value?.time_entries || []
  } else {
    entries.value = []
  }

  loading.value = false
  reloading.value = false
}

async function loadMembers() {
  if (!project.value?.id) return
  try {
    const list = [...(await session.membersFor(project.value.id))]
    if (session.user && !list.some((member) => member.id === session.user.id)) {
      list.unshift(session.user)
    }
    members.value = list
  } catch {
    members.value = session.user ? [session.user] : []
  }
}

async function loadVersions() {
  if (!project.value?.id) return
  try {
    const data = await settings.api.projectVersions(project.value.id)
    versions.value = data?.versions || []
  } catch {
    versions.value = []
  }
}

function restoreDraft() {
  if (!issue.value || draftRestoredFor === issue.value.id) return
  draftRestoredFor = issue.value.id
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey.value) || 'null')
    if (stored?.comment) {
      comment.value = stored.comment
      privateNote.value = Boolean(stored.privateNote)
      draftSaved.value = true
    }
  } catch {
    /* brouillon illisible */
  }
}

function clearDraft() {
  localStorage.removeItem(draftKey.value)
  draftSaved.value = false
}

watch([comment, privateNote], () => {
  window.clearTimeout(draftTimer)
  if (!issue.value) return
  draftTimer = window.setTimeout(() => {
    if (comment.value.trim() || privateNote.value) {
      localStorage.setItem(
        draftKey.value,
        JSON.stringify({ comment: comment.value, privateNote: privateNote.value }),
      )
      draftSaved.value = true
      window.clearTimeout(draftSavedTimer)
      draftSavedTimer = window.setTimeout(() => {
        draftSaved.value = false
      }, 2500)
    } else {
      localStorage.removeItem(draftKey.value)
    }
  }, 600)
})

watch(issueId, () => {
  issue.value = null
  entries.value = []
  members.value = []
  versions.value = []
  comment.value = ''
  privateNote.value = false
  commentFiles.value = []
  editingDescription.value = false
  editingSubject.value = false
  draftRestoredFor = null
  activeTab.value = 'discussion'
  timelineNotesOnly.value = false
  journalSort.value = 'desc'
  journalOpen.value = {}
  editingJournalId.value = null
  journalDraft.value = ''
  journalEditError.value = ''
  load()
})

watch(
  () => refresh.timeVersion,
  () => {
    if (issue.value) load({ silent: true })
  },
)

async function reload() {
  await load({ silent: true })
}

async function saveSubject() {
  const value = subjectDraft.value.trim()
  if (!value || !issue.value) return
  savingSubject.value = true
  try {
    await settings.api.updateIssue(issue.value.id, { subject: value })
    editingSubject.value = false
    toast.success('Sujet mis à jour.')
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    toast.error(err?.message || 'Modification impossible.')
  } finally {
    savingSubject.value = false
  }
}

async function saveDescription() {
  if (!issue.value) return
  savingDescription.value = true
  try {
    await settings.api.updateIssue(issue.value.id, { description: descriptionDraft.value })
    editingDescription.value = false
    toast.success('Description mise à jour.')
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    toast.error(err?.message || 'Modification impossible.')
  } finally {
    savingDescription.value = false
  }
}

async function patch(field, rawValue) {
  if (!issue.value || updatingField.value) return
  let value = rawValue
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    value = null
  } else if (
    ['status_id', 'priority_id', 'assigned_to_id', 'tracker_id', 'fixed_version_id', 'done_ratio'].includes(
      field,
    )
  ) {
    value = Number(rawValue)
  } else if (field === 'estimated_hours') {
    value = Number(String(rawValue).replace(',', '.'))
    if (!Number.isFinite(value)) {
      toast.error('Temps estimé invalide.')
      return
    }
  }

  updatingField.value = field
  try {
    await settings.api.updateIssue(issue.value.id, { [field]: value })
    toast.success('Ticket mis à jour.')
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    toast.error(err?.message || 'Modification refusée par Redmine.')
    await load({ silent: true })
  } finally {
    updatingField.value = ''
  }
}

async function toggleWatch() {
  if (!issue.value || !session.user) return
  updatingField.value = 'watch'
  try {
    if (isWatching.value) {
      await settings.api.removeWatcher(issue.value.id, session.user.id)
      toast.success('Vous ne suivez plus ce ticket.')
    } else {
      await settings.api.addWatcher(issue.value.id, session.user.id)
      toast.success('Vous suivez maintenant ce ticket.')
    }
    await load({ silent: true })
  } catch (err) {
    toast.error(err?.message || 'Impossible de modifier le suivi.')
  } finally {
    updatingField.value = ''
  }
}

function addCommentFiles(files) {
  let added = 0
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`« ${file.name} » dépasse 20 Mo.`)
      continue
    }
    if (!commentFiles.value.some((item) => item.name === file.name && item.size === file.size)) {
      commentFiles.value.push(file)
      added += 1
    }
  }
  return added
}

function onCommentFiles(event) {
  addCommentFiles(Array.from(event.target.files || []))
  event.target.value = ''
}

function clipboardImages(event) {
  const data = event.clipboardData
  if (!data) return []
  const items = Array.from(data.items || [])
    .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  const files = items.length
    ? items
    : Array.from(data.files || []).filter((file) => file.type?.startsWith('image/'))
  return files.map((file, index) => {
    const type = file.type || 'image/png'
    return new File([file], pastedImageName(type, index), {
      type,
      lastModified: Date.now(),
    })
  })
}

function pastedImageName(type, index) {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    String(now.getMilliseconds()).padStart(3, '0'),
  ].join('')
  const subtype = (type.split('/')[1] || 'png').toLowerCase()
  const extension =
    subtype === 'jpeg'
      ? 'jpg'
      : subtype === 'svg+xml'
        ? 'svg'
        : subtype.replace(/[^a-z0-9]/g, '')
  return `image-collee-${stamp}${index ? `-${index + 1}` : ''}.${extension || 'png'}`
}

function onCommentPaste(event) {
  const files = clipboardImages(event)
  if (!files.length) return
  event.preventDefault()
  const added = addCommentFiles(files)
  if (added) {
    toast.success(added > 1 ? `${added} images collées.` : 'Image collée dans le commentaire.')
  }
}

function onJournalPaste(event) {
  if (!clipboardImages(event).length) return
  event.preventDefault()
  toast.info(
    "Redmine 3.4 ne permet pas d'ajouter une image à un commentaire existant. Ajoutez-la dans un nouveau commentaire.",
  )
}

function removeCommentFile(index) {
  commentFiles.value.splice(index, 1)
}

async function uploadAttachments(event) {
  const selected = Array.from(event.target.files || [])
  event.target.value = ''
  if (!selected.length || !issue.value) return

  const files = selected.filter((file) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`« ${file.name} » dépasse 20 Mo.`)
      return false
    }
    return true
  })
  if (!files.length) return

  uploadingFiles.value = true
  try {
    const uploads = []
    for (const file of files) {
      const upload = await settings.api.uploadFile(file)
      uploads.push({
        token: upload.token,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
    }
    await settings.api.updateIssue(issue.value.id, { uploads })
    toast.success(
      files.length > 1 ? `${files.length} pièces jointes ajoutées.` : 'Pièce jointe ajoutée.',
    )
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    toast.error(err?.message || "Impossible d'ajouter la pièce jointe.")
  } finally {
    uploadingFiles.value = false
  }
}

async function submitComment() {
  commentError.value = ''
  if (!issue.value) return
  if (!comment.value.trim() && !commentFiles.value.length) {
    commentError.value = 'Écrivez un commentaire ou joignez un fichier.'
    return
  }
  submittingComment.value = true
  try {
    const uploads = []
    for (const file of commentFiles.value) {
      const upload = await settings.api.uploadFile(file)
      uploads.push({
        token: upload.token,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
    }
    await settings.api.updateIssue(issue.value.id, {
      notes: comment.value.trim() || undefined,
      private_notes: privateNote.value || undefined,
      ...(uploads.length ? { uploads } : {}),
    })
    comment.value = ''
    privateNote.value = false
    commentFiles.value = []
    clearDraft()
    toast.success('Commentaire ajouté.')
    await load({ silent: true })
    refresh.bumpIssue()
  } catch (err) {
    commentError.value = err instanceof ApiError ? err.message : "Impossible d'ajouter le commentaire."
  } finally {
    submittingComment.value = false
  }
}

async function downloadAttachment(attachment) {
  try {
    const blob = await settings.api.downloadAttachment(attachment)
    saveBlob(blob, attachment.filename)
  } catch (err) {
    toast.error(err?.message || 'Téléchargement impossible.')
  }
}

function openTime(entry = null) {
  if (!issue.value) return
  ui.openTimeEntry({
    ...(entry ? { entry } : {}),
    issue: {
      id: issue.value.id,
      subject: issue.value.subject,
      project: issue.value.project,
      status: issue.value.status,
    },
    spent_on: entry?.spent_on || toIsoDate(),
  })
}

function quickChangeStatus(status) {
  if (!status || !issue.value || issue.value.status?.id === status.id) return
  patch('status_id', status.id)
}

async function copyLink() {
  if (await copyText(window.location.href)) {
    toast.success('Lien du ticket copié.')
  } else {
    toast.error('Copie impossible dans ce navigateur.')
  }
}

function memberName(id) {
  const numeric = Number(id)
  if (session.user?.id === numeric) return fullName(session.user)
  const member = assigneeOptions.value.find((item) => item.id === numeric)
  return member ? [member.firstname, member.lastname].filter(Boolean).join(' ') || member.name : `Utilisateur #${id}`
}

function detailValue(name, value) {
  if (value === null || value === undefined || value === '') return '—'
  switch (name) {
    case 'status_id':
      return session.statusById(value)?.name || `Statut #${value}`
    case 'priority_id':
      return session.priorityById(value)?.name || `Priorité #${value}`
    case 'tracker_id':
      return session.trackerById(value)?.name || `Tracker #${value}`
    case 'project_id':
      return session.projectById(value)?.name || `Projet #${value}`
    case 'assigned_to_id':
      return memberName(value)
    case 'fixed_version_id':
      return versions.value.find((version) => version.id === Number(value))?.name || `Version #${value}`
    case 'due_date':
    case 'start_date':
      return formatDate(value)
    case 'estimated_hours':
      return formatHours(value)
    case 'done_ratio':
      return `${value} %`
    case 'is_private':
      return value === '1' || value === true ? 'Privé' : 'Public'
    case 'parent_id':
      return `#${value}`
    case 'description':
      return 'mise à jour'
    default:
      return String(value).length > 60 ? `${String(value).slice(0, 60)}…` : String(value)
  }
}

function detailText(detail) {
  if (detail.property === 'attachment') {
    return `Pièce jointe : ${detail.new_value || detail.old_value || ''}`
  }
  if (detail.property === 'cf') {
    return 'Champ personnalisé mis à jour'
  }
  if (detail.property === 'attr') {
    const label = ATTRIBUTE_LABELS[detail.name] || detail.name
    if (detail.name === 'description') return 'Description mise à jour'
    return `${label} : ${detailValue(detail.name, detail.old_value)} → ${detailValue(detail.name, detail.new_value)}`
  }
  return 'Ticket mis à jour'
}

function relationInfo(relation) {
  const outgoing = relation.issue_id === issue.value?.id
  const otherId = outgoing ? relation.issue_to_id : relation.issue_id
  const labels = {
    relates: 'Est lié à',
    duplicates: outgoing ? 'Duplique' : 'Est dupliqué par',
    blocks: outgoing ? 'Bloque' : 'Est bloqué par',
    precedes: outgoing ? 'Précède' : 'Suit',
    follows: outgoing ? 'Suit' : 'Précède',
    copied_to: outgoing ? 'Copié vers' : 'Copié depuis',
  }
  return { label: labels[relation.relation_type] || relation.relation_type, otherId }
}

async function addRelation() {
  if (!issue.value) return
  const targetId = Number(relationForm.issue_to_id)
  if (!targetId || targetId === issue.value.id) {
    toast.error('Indiquez un numéro de ticket valide et différent.')
    return
  }
  addingRelation.value = true
  try {
    await settings.api.createRelation(issue.value.id, {
      issue_to_id: targetId,
      relation_type: relationForm.relation_type,
      ...(relationForm.delay && ['precedes', 'follows'].includes(relationForm.relation_type)
        ? { delay: Number(relationForm.delay) }
        : {}),
    })
    relationForm.issue_to_id = ''
    relationForm.delay = ''
    toast.success('Relation ajoutée.')
    await load({ silent: true })
  } catch (err) {
    toast.error(err?.message || 'Impossible de créer la relation.')
  } finally {
    addingRelation.value = false
  }
}

function switchTab(tab) {
  activeTab.value = tab
}

onMounted(load)

onBeforeUnmount(() => {
  window.clearTimeout(draftTimer)
  window.clearTimeout(draftSavedTimer)
})
</script>

<template>
  <div class="issue-detail page">
    <div v-if="loading && !issue" class="detail-loading">
      <div class="skeleton" style="width: 130px; height: 12px; margin-bottom: 20px"></div>
      <div class="skeleton" style="width: min(620px, 80%); height: 32px; margin-bottom: 12px"></div>
      <div class="skeleton" style="width: 300px; height: 20px; margin-bottom: 28px"></div>
      <div class="detail-loading-grid">
        <div class="skeleton" style="height: 220px; border-radius: 16px"></div>
        <div class="skeleton" style="height: 300px; border-radius: 16px"></div>
      </div>
    </div>

    <div v-else-if="error" class="card detail-error">
      <div class="empty-state">
        <div class="empty-icon"><TriangleAlert :size="22" /></div>
        <p class="empty-title">Ticket introuvable</p>
        <p class="empty-text">{{ error }}</p>
        <div class="row">
          <button class="btn" type="button" @click="router.push({ name: 'issues' })">
            <ArrowLeft :size="14" /> Retour aux tickets
          </button>
          <button class="btn btn-primary" type="button" @click="load()">
            <RefreshCw :size="14" /> Réessayer
          </button>
        </div>
      </div>
    </div>

    <template v-else-if="issue">
      <div class="detail-breadcrumb">
        <button class="back-link" type="button" @click="router.push({ name: 'issues' })">
          <ArrowLeft :size="15" /> Tickets
        </button>
        <span class="crumb-sep">/</span>
        <span class="crumb-project">{{ issue.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <IssueId :id="issue.id" class="crumb-id" />
        <span v-if="reloading" class="crumb-loading"><Loader2 :size="12" class="spin" /></span>
      </div>

      <header class="detail-head">
        <div class="detail-head-main">
          <div class="detail-kicker">
            <StatusQuickSelect
              :issue="issue"
              :options="statusOptions"
              :busy="updatingField === 'status_id'"
              @change="quickChangeStatus"
            />
            <span v-if="issue.tracker" class="tag">{{ issue.tracker.name }}</span>
            <span v-if="sprint" class="pill sprint-pill" data-tone="violet" :title="sprint.label">
              <Milestone :size="11" /> {{ sprint.value }}
            </span>
            <span v-if="issue.is_private" class="tag"><Lock :size="11" /> Privé</span>
            <span v-if="isOverdue(issue)" class="overdue-tag">
              <TriangleAlert :size="11" /> En retard
            </span>
          </div>

          <div v-if="editingSubject" class="subject-edit">
            <input
              v-model="subjectDraft"
              class="input subject-input"
              type="text"
              maxlength="255"
              @keydown.enter.prevent="saveSubject"
              @keydown.esc="editingSubject = false"
            />
            <button class="btn btn-primary btn-sm" type="button" :disabled="savingSubject" @click="saveSubject">
              <Loader2 v-if="savingSubject" :size="13" class="spin" /> Enregistrer
            </button>
            <button class="btn btn-sm" type="button" @click="editingSubject = false">Annuler</button>
          </div>
          <h1 v-else class="detail-title">
            <IssueId :id="issue.id" class="detail-id" always />
            <span>{{ issue.subject }}</span>
            <button
              class="title-edit"
              type="button"
              title="Modifier le sujet"
              @click="editingSubject = true; subjectDraft = issue.subject"
            >
              <Pencil :size="14" />
            </button>
          </h1>

          <div class="detail-meta">
            <span v-if="issue.assigned_to" class="meta-item">
              <UserAvatar :user="issue.assigned_to" :size="21" />
              {{ [issue.assigned_to.firstname, issue.assigned_to.lastname].filter(Boolean).join(' ') || issue.assigned_to.name }}
            </span>
            <span v-else class="meta-item muted">Non assigné</span>
            <span v-if="issue.due_date" class="meta-item" :class="{ 'is-late': isOverdue(issue) }">
              <CalendarDays :size="13" /> {{ formatDate(issue.due_date) }}
            </span>
            <span class="meta-item"><Clock3 :size="13" /> {{ relativeTime(issue.updated_on) }}</span>
            <PriorityBadge :priority="issue.priority" />
          </div>
        </div>

        <div class="detail-actions">
          <button
            class="btn btn-icon"
            type="button"
            :title="isWatching ? 'Ne plus suivre' : 'Suivre ce ticket'"
            :class="{ 'is-watching': isWatching }"
            @click="toggleWatch"
          >
            <Star :size="16" :fill="isWatching ? 'currentColor' : 'none'" />
          </button>
          <button class="btn" type="button" @click="openTime()">
            <Clock3 :size="14" /> Saisir du temps
          </button>
          <a class="btn btn-icon" :href="issueUrl" target="_blank" rel="noopener noreferrer" title="Ouvrir dans Redmine">
            <ExternalLink :size="15" />
          </a>
        </div>
      </header>

      <div class="detail-layout">
        <div class="detail-main">
          <nav class="detail-tabs" aria-label="Sections du ticket">
            <button
              type="button"
              class="detail-tab"
              :class="{ 'is-active': activeTab === 'discussion' }"
              @click="switchTab('discussion')"
            >
              <MessageSquare :size="14" /> Discussion
              <span class="tab-count">{{ noteCount }}</span>
            </button>
            <button
              type="button"
              class="detail-tab"
              :class="{ 'is-active': activeTab === 'time' }"
              @click="switchTab('time')"
            >
              <Clock3 :size="14" /> Temps
              <span class="tab-count">{{ entries.length }}</span>
            </button>
            <button
              type="button"
              class="detail-tab"
              :class="{ 'is-active': activeTab === 'files' }"
              @click="switchTab('files')"
            >
              <Paperclip :size="14" /> Fichiers
              <span class="tab-count">{{ attachments.length }}</span>
            </button>
            <button
              type="button"
              class="detail-tab"
              :class="{ 'is-active': activeTab === 'relations' }"
              @click="switchTab('relations')"
            >
              <GitBranch :size="14" /> Relations
              <span class="tab-count">{{ relations.length + children.length }}</span>
            </button>
          </nav>

          <template v-if="activeTab === 'discussion'">
          <section class="card description-card">
            <header class="card-head">
              <h2 class="card-title"><FileText :size="15" /> Description</h2>
              <div class="row">
                <span v-if="!editingDescription" class="field-hint">Textile / Markdown</span>
                <button
                  v-if="!editingDescription"
                  class="btn btn-ghost btn-sm"
                  type="button"
                  @click="editingDescription = true; descriptionDraft = issue.description || ''"
                >
                  <Pencil :size="13" /> Modifier
                </button>
              </div>
            </header>
            <div class="card-body">
              <template v-if="editingDescription">
                <textarea v-model="descriptionDraft" class="textarea textarea-tall" rows="10"></textarea>
                <div class="edit-actions">
                  <button class="btn" type="button" @click="editingDescription = false">Annuler</button>
                  <button class="btn btn-primary" type="button" :disabled="savingDescription" @click="saveDescription">
                    <Loader2 v-if="savingDescription" :size="14" class="spin" />
                    Enregistrer la description
                  </button>
                </div>
              </template>
              <MarkdownBody v-else :source="issue.description" empty-text="Aucune description pour ce ticket." />
            </div>

            <div v-if="attachments.length" class="description-attachments">
              <button
                v-for="attachment in attachments"
                :key="attachment.id"
                type="button"
                class="attachment-chip"
                @click="downloadAttachment(attachment)"
              >
                <Paperclip :size="12" />
                <span class="truncate">{{ attachment.filename }}</span>
                <span class="faint">{{ formatFileSize(attachment.filesize) }}</span>
                <Download :size="12" class="attachment-dl" />
              </button>
            </div>
          </section>

          <section class="card activity-card">
            <header class="card-head activity-head">
              <h2 class="card-title"><MessageSquare :size="15" /> Activité</h2>
              <div class="activity-tools">
                <div class="segmented">
                  <button
                    type="button"
                    :class="{ 'is-active': !timelineNotesOnly }"
                    @click="timelineNotesOnly = false"
                  >
                    Tout
                  </button>
                  <button
                    type="button"
                    :class="{ 'is-active': timelineNotesOnly }"
                    @click="timelineNotesOnly = true"
                  >
                    Commentaires
                    <span class="tab-count">{{ noteCount }}</span>
                  </button>
                </div>
                <button
                  class="btn btn-sm journal-sort"
                  type="button"
                  :title="journalSortLabel"
                  :aria-label="journalSortLabel"
                  @click="toggleJournalSort"
                >
                  <ArrowDownWideNarrow v-if="journalSort === 'desc'" :size="14" />
                  <ArrowUpWideNarrow v-else :size="14" />
                  <span>{{ journalSort === 'desc' ? 'Récents' : 'Anciens' }}</span>
                </button>
                <button
                  v-if="noteCount"
                  class="btn btn-ghost btn-icon btn-sm journal-tool"
                  type="button"
                  :title="notesAllExpanded ? 'Tout replier' : 'Tout déplier'"
                  :aria-label="notesAllExpanded ? 'Tout replier' : 'Tout déplier'"
                  @click="toggleAllJournals"
                >
                  <ChevronsDownUp v-if="notesAllExpanded" :size="14" />
                  <ChevronsUpDown v-else :size="14" />
                </button>
                <button class="btn btn-sm comment-jump" type="button" @click="focusComposer">
                  <MessageSquarePlus :size="13" /> Commenter
                </button>
              </div>
            </header>

            <div class="timeline">
              <div v-if="visibleJournals.length" class="timeline-list">
                <article
                  v-for="journal in visibleJournals"
                  :key="journal.id"
                  class="timeline-item"
                  :class="{
                    'is-history': !hasNote(journal),
                    'is-collapsed': hasNote(journal) && !isJournalOpen(journal),
                  }"
                >
                  <div class="timeline-rail">
                    <UserAvatar :user="journal.user" :size="hasNote(journal) ? 28 : 18" />
                  </div>

                  <div v-if="hasNote(journal)" class="timeline-content">
                    <div class="timeline-head">
                      <button
                        class="journal-toggle"
                        type="button"
                        :aria-expanded="isJournalOpen(journal)"
                        :aria-label="isJournalOpen(journal) ? 'Replier le commentaire' : 'Déplier le commentaire'"
                        :title="isJournalOpen(journal) ? 'Replier' : 'Déplier'"
                        @click="toggleJournal(journal)"
                      >
                        <ChevronRight :size="15" :class="{ 'is-open': isJournalOpen(journal) }" />
                      </button>
                      <span class="strong">{{ fullName(journal.user) }}</span>
                      <span class="timeline-time" :title="formatDateTime(journal.created_on)">
                        {{ relativeTime(journal.created_on) }}
                      </span>
                      <span v-if="journal.private_notes" class="private-badge">
                        <Lock :size="10" /> Note privée
                      </span>
                      <span class="spacer"></span>
                      <button
                        v-if="canEditJournal(journal)"
                        class="journal-edit-btn"
                        type="button"
                        title="Modifier ce commentaire"
                        @click="startJournalEdit(journal)"
                      >
                        <Pencil :size="12" /> Modifier
                      </button>
                    </div>

                    <button
                      v-if="!isJournalOpen(journal)"
                      class="journal-collapsed"
                      type="button"
                      @click="toggleJournal(journal)"
                    >
                      <span class="journal-preview">{{ notePreview(journal) }}</span>
                    </button>

                    <template v-else>
                      <div v-if="journal.details?.length" class="journal-changes">
                        <span v-for="(detail, index) in journal.details" :key="index" class="journal-change">
                          {{ detailText(detail) }}
                        </span>
                      </div>

                      <div v-if="editingJournalId === journal.id" class="journal-edit">
                        <textarea
                          v-model="journalDraft"
                          class="textarea journal-edit-textarea"
                          rows="6"
                          @keydown.esc="cancelJournalEdit"
                          @paste="onJournalPaste"
                        ></textarea>
                        <p v-if="journalEditError" class="composer-error" role="alert">
                          {{ journalEditError }}
                        </p>
                        <div class="journal-edit-actions">
                          <button class="btn btn-sm" type="button" @click="cancelJournalEdit">
                            Annuler
                          </button>
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            :disabled="savingJournalId === journal.id"
                            @click="saveJournalEdit(journal)"
                          >
                            <Loader2 v-if="savingJournalId === journal.id" :size="13" class="spin" />
                            Enregistrer
                          </button>
                        </div>
                      </div>
                      <div v-else class="journal-note">
                        <MarkdownBody :source="journal.notes" />
                      </div>
                    </template>
                  </div>

                  <div v-else class="journal-history-line">
                    <span class="strong">{{ fullName(journal.user) }}</span>
                    <span class="journal-history-text">{{ journalSummary(journal) }}</span>
                    <span class="journal-history-time" :title="formatDateTime(journal.created_on)">
                      {{ relativeTime(journal.created_on) }}
                    </span>
                  </div>
                </article>
              </div>
              <EmptyState
                v-else
                :icon="MessageSquare"
                title="Aucun commentaire"
                :text="timelineNotesOnly ? 'Aucun commentaire pour le moment.' : 'Aucune activité enregistrée sur ce ticket.'"
              />
            </div>
          </section>
          </template>

          <section v-else-if="activeTab === 'time'" class="card">
            <header class="card-head">
              <h2 class="card-title"><Clock3 :size="15" /> Temps passé</h2>
              <div class="row">
                <button class="btn btn-primary btn-sm" type="button" @click="openTime()">
                  <Plus :size="13" /> Saisir du temps
                </button>
              </div>
            </header>
            <div class="time-summary">
              <div class="time-stat">
                <span class="time-stat-label">Estimé</span>
                <span class="time-stat-value">{{ estimatedHours ? formatHours(estimatedHours) : '—' }}</span>
              </div>
              <div class="time-stat">
                <span class="time-stat-label">Passé</span>
                <span class="time-stat-value">{{ formatHours(spentHours) }}</span>
              </div>
              <div class="time-stat">
                <span class="time-stat-label">Restant</span>
                <span class="time-stat-value">
                  {{ estimatedHours ? formatHours(Math.max(0, estimatedHours - spentHours)) : '—' }}
                </span>
              </div>
              <div class="time-progress">
                <div class="row-between text-xs">
                  <span class="muted">Avancement temps</span>
                  <span class="strong">{{ timeProgress === null ? '—' : `${timeProgress} %` }}</span>
                </div>
                <div class="progress">
                  <span
                    :style="{ width: `${timeProgress || 0}%`, background: timeProgress > 100 ? 'var(--red)' : undefined }"
                  ></span>
                </div>
              </div>
            </div>

            <div v-if="entries.length" class="time-entry-list">
              <div v-for="entry in entries" :key="entry.id" class="time-entry-row">
                <span class="time-entry-date">
                  <CalendarDays :size="12" /> {{ formatDate(entry.spent_on) }}
                </span>
                <UserAvatar :user="entry.user" :size="22" />
                <span class="time-entry-user truncate">{{ fullName(entry.user) }}</span>
                <span class="time-entry-activity">{{ entry.activity?.name }}</span>
                <span class="time-entry-comment truncate">{{ entry.comments || '—' }}</span>
                <span class="time-entry-hours">{{ formatHours(entry.hours) }}</span>
                <button
                  v-if="entry.user?.id === session.user?.id || session.user?.admin"
                  class="btn btn-ghost btn-icon btn-sm"
                  type="button"
                  title="Modifier cette saisie"
                  @click="openTime(entry)"
                >
                  <Pencil :size="12" />
                </button>
                <span v-else></span>
              </div>
            </div>
            <EmptyState
              v-else
              :icon="Clock3"
              title="Aucun temps saisi"
              text="Enregistrez le temps passé pour suivre l'avancement du ticket."
            >
              <button class="btn btn-sm" type="button" @click="openTime()">
                <Plus :size="13" /> Saisir du temps
              </button>
            </EmptyState>
          </section>

          <section v-else-if="activeTab === 'files'" class="card">
            <header class="card-head">
              <h2 class="card-title"><Paperclip :size="15" /> Pièces jointes</h2>
              <label class="btn btn-sm">
                <Loader2 v-if="uploadingFiles" :size="13" class="spin" />
                <Plus v-else :size="13" />
                {{ uploadingFiles ? 'Envoi…' : 'Ajouter' }}
                <input
                  type="file"
                  multiple
                  style="display: none"
                  :disabled="uploadingFiles"
                  @change="uploadAttachments"
                />
              </label>
            </header>
            <div v-if="attachments.length" class="files-list">
              <div v-for="attachment in attachments" :key="attachment.id" class="file-row">
                <span class="file-icon"><FileText :size="16" /></span>
                <div class="file-info">
                  <span class="file-name">{{ attachment.filename }}</span>
                  <span class="file-meta">
                    {{ formatFileSize(attachment.filesize) }}
                    <template v-if="attachment.author"> · {{ fullName(attachment.author) }}</template>
                    <template v-if="attachment.created_on"> · {{ formatDate(attachment.created_on) }}</template>
                  </span>
                </div>
                <button class="btn btn-sm" type="button" @click="downloadAttachment(attachment)">
                  <Download :size="13" /> Télécharger
                </button>
              </div>
            </div>
            <EmptyState v-else :icon="Paperclip" title="Aucune pièce jointe" text="Les fichiers ajoutés au ticket apparaîtront ici." />
          </section>

          <section v-else-if="activeTab === 'relations'" class="card">
            <header class="card-head">
              <h2 class="card-title"><GitBranch :size="15" /> Relations</h2>
            </header>
            <div class="relations-body">
              <div v-if="relations.length" class="relations-list">
                <RouterLink
                  v-for="relation in relations"
                  :key="relation.id"
                  :to="{ name: 'issue', params: { id: relationInfo(relation).otherId } }"
                  class="relation-row"
                >
                  <span class="relation-type">{{ relationInfo(relation).label }}</span>
                  <IssueId :id="relationInfo(relation).otherId" />
                  <span v-if="relation.delay" class="faint text-xs">délai {{ relation.delay }} j</span>
                  <ExternalLink :size="12" class="relation-arrow" />
                </RouterLink>
              </div>
              <p v-else class="text-sm muted relations-empty">Aucune relation pour ce ticket.</p>

              <template v-if="children.length">
                <p class="relations-subtitle">Sous-tickets</p>
                <div class="relations-list">
                  <RouterLink
                    v-for="child in children"
                    :key="child.id"
                    :to="{ name: 'issue', params: { id: child.id } }"
                    class="relation-row"
                  >
                    <IssueId :id="child.id" />
                    <span class="truncate">{{ child.subject }}</span>
                    <span class="tag">{{ child.tracker?.name }}</span>
                  </RouterLink>
                </div>
              </template>

              <form class="relation-form" @submit.prevent="addRelation">
                <p class="relations-subtitle">Ajouter une relation</p>
                <div class="relation-form-row">
                  <select v-model="relationForm.relation_type" class="select">
                    <option v-for="type in relationTypes" :key="type.value" :value="type.value">
                      {{ type.label }}
                    </option>
                  </select>
                  <input
                    v-model="relationForm.issue_to_id"
                    class="input relation-target"
                    type="number"
                    min="1"
                    placeholder="N° du ticket"
                    required
                  />
                  <input
                    v-if="['precedes', 'follows'].includes(relationForm.relation_type)"
                    v-model="relationForm.delay"
                    class="input relation-delay"
                    type="number"
                    min="0"
                    placeholder="Délai (j)"
                  />
                  <button class="btn btn-primary" type="submit" :disabled="addingRelation">
                    <Loader2 v-if="addingRelation" :size="14" class="spin" /> Ajouter
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <aside class="detail-side">
          <section id="comment-composer" class="card composer-card" @paste="onCommentPaste">
            <header class="card-head">
              <h2 class="card-title"><MessageSquarePlus :size="15" /> Ajouter un commentaire</h2>
              <span v-if="draftSaved" class="draft-saved">Brouillon enregistré</span>
            </header>
            <div class="composer-body">
              <div class="composer-head">
                <UserAvatar :user="session.user" :size="26" />
                <div class="composer-title">
                  <span class="strong">{{ session.displayName || 'Vous' }}</span>
                  <span class="faint text-xs">Textile ou Markdown accepté</span>
                </div>
              </div>
              <textarea
                id="issue-comment-input"
                v-model="comment"
                class="textarea composer-textarea"
                rows="5"
                placeholder="Votre commentaire… (Ctrl+V / Cmd+V pour coller une image)"
              ></textarea>
              <ul v-if="commentFiles.length" class="comment-files">
                <li v-for="(file, index) in commentFiles" :key="`${file.name}-${file.size}`">
                  <FileImage v-if="file.type?.startsWith('image/')" :size="12" />
                  <Paperclip v-else :size="12" />
                  <span class="truncate">{{ file.name }}</span>
                  <span class="faint text-xs">{{ formatFileSize(file.size) }}</span>
                  <button type="button" class="file-remove" @click="removeCommentFile(index)">
                    <X :size="12" />
                  </button>
                </li>
              </ul>
              <p v-if="commentError" class="composer-error" role="alert">{{ commentError }}</p>
              <div class="composer-foot">
                <label class="upload-button">
                  <Paperclip :size="13" />
                  Joindre
                  <input type="file" multiple @change="onCommentFiles" />
                </label>
                <label class="checkbox private-check">
                  <input v-model="privateNote" type="checkbox" />
                  <Lock :size="12" />
                  Note privée
                </label>
                <span class="spacer"></span>
                <button
                  class="btn btn-primary"
                  type="button"
                  :disabled="submittingComment || (!comment.trim() && !commentFiles.length)"
                  @click="submitComment"
                >
                  <Loader2 v-if="submittingComment" :size="14" class="spin" />
                  <Send v-else :size="14" />
                  Commenter
                </button>
              </div>
            </div>
          </section>

          <section class="card properties-card">
            <header class="card-head">
              <h2 class="card-title">Propriétés</h2>
              <Loader2 v-if="updatingField" :size="13" class="spin muted" />
            </header>
            <div class="properties-body">
              <div class="property-row">
                <label class="property-label" for="prop-status">Statut</label>
                <select
                  id="prop-status"
                  class="select property-control"
                  :value="issue.status?.id || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('status_id', $event.target.value)"
                >
                  <option v-for="status in statusOptions" :key="status.id" :value="status.id">
                    {{ status.name }}
                  </option>
                </select>
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-priority">Priorité</label>
                <select
                  id="prop-priority"
                  class="select property-control"
                  :value="issue.priority?.id || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('priority_id', $event.target.value)"
                >
                  <option v-for="priority in session.priorities" :key="priority.id" :value="priority.id">
                    {{ priority.name }}
                  </option>
                </select>
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-assignee">Assigné à</label>
                <select
                  id="prop-assignee"
                  class="select property-control"
                  :value="issue.assigned_to?.id || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('assigned_to_id', $event.target.value)"
                >
                  <option value="">Non assigné</option>
                  <option v-for="member in assigneeOptions" :key="member.id" :value="member.id">
                    {{ [member.firstname, member.lastname].filter(Boolean).join(' ') || member.name }}
                  </option>
                </select>
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-tracker">Tracker</label>
                <select
                  id="prop-tracker"
                  class="select property-control"
                  :value="issue.tracker?.id || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('tracker_id', $event.target.value)"
                >
                  <option v-for="tracker in session.trackers" :key="tracker.id" :value="tracker.id">
                    {{ tracker.name }}
                  </option>
                </select>
              </div>

              <div v-if="versions.length" class="property-row">
                <label class="property-label" for="prop-version">Version cible</label>
                <select
                  id="prop-version"
                  class="select property-control"
                  :value="issue.fixed_version?.id || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('fixed_version_id', $event.target.value)"
                >
                  <option value="">Aucune</option>
                  <option v-for="version in versions" :key="version.id" :value="version.id">
                    {{ version.name }}
                  </option>
                </select>
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-start">Début</label>
                <input
                  id="prop-start"
                  class="input property-control"
                  type="date"
                  :value="issue.start_date || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('start_date', $event.target.value)"
                />
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-due">Échéance</label>
                <input
                  id="prop-due"
                  class="input property-control"
                  type="date"
                  :value="issue.due_date || ''"
                  :disabled="Boolean(updatingField)"
                  @change="patch('due_date', $event.target.value)"
                />
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-estimate">Temps estimé</label>
                <div class="property-input-suffix">
                  <input
                    id="prop-estimate"
                    class="input property-control"
                    type="text"
                    inputmode="decimal"
                    :value="issue.estimated_hours ?? ''"
                    :disabled="Boolean(updatingField)"
                    placeholder="—"
                    @change="patch('estimated_hours', $event.target.value)"
                  />
                  <span>h</span>
                </div>
              </div>

              <div class="property-row">
                <label class="property-label" for="prop-done">Avancement</label>
                <select
                  id="prop-done"
                  class="select property-control"
                  :value="issue.done_ratio ?? 0"
                  :disabled="Boolean(updatingField)"
                  @change="patch('done_ratio', $event.target.value)"
                >
                  <option v-for="value in [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]" :key="value" :value="value">
                    {{ value }} %
                  </option>
                </select>
              </div>
            </div>
            <div v-if="timeProgress !== null" class="property-progress">
              <div class="row-between text-xs">
                <span class="muted">Temps consommé</span>
                <span class="strong">{{ Math.round((spentHours / estimatedHours) * 100) }} %</span>
              </div>
              <div class="progress">
                <span
                  :style="{
                    width: `${Math.min(100, (spentHours / estimatedHours) * 100)}%`,
                    background: spentHours > estimatedHours ? 'var(--red)' : undefined,
                  }"
                ></span>
              </div>
            </div>
          </section>

          <section class="card time-card">
            <header class="card-head">
              <h2 class="card-title"><Clock3 :size="15" /> Suivi du temps</h2>
            </header>
            <div class="time-card-body">
              <div class="time-card-total">
                <span class="time-card-number">{{ formatHours(spentHours) }}</span>
                <span class="time-card-label">
                  passées
                  <template v-if="estimatedHours"> sur {{ formatHours(estimatedHours) }} estimées</template>
                </span>
              </div>
              <div class="time-card-actions">
                <button class="btn btn-sm" type="button" @click="openTime()">
                  <Plus :size="13" /> Saisir du temps
                </button>
              </div>
            </div>
          </section>

          <section class="card meta-card">
            <header class="card-head">
              <h2 class="card-title">Informations</h2>
            </header>
            <div class="meta-body">
              <div class="meta-row">
                <span class="meta-label">Auteur</span>
                <span class="meta-value">
                  <UserAvatar :user="issue.author" :size="20" />
                  {{ fullName(issue.author) }}
                </span>
              </div>
              <div v-if="sprint" class="meta-row">
                <span class="meta-label">{{ sprint.label }}</span>
                <span class="meta-value">
                  <Milestone :size="13" />
                  <span class="truncate" :title="sprint.value">{{ sprint.value }}</span>
                </span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Créé le</span>
                <span class="meta-value">{{ formatDateTime(issue.created_on) }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Mis à jour</span>
                <span class="meta-value">{{ formatDateTime(issue.updated_on) }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Suivi</span>
                <span class="meta-value">
                  <span class="avatar-stack">
                    <UserAvatar
                      v-for="watcher in (issue.watchers || []).slice(0, 4)"
                      :key="watcher.id"
                      :user="watcher"
                      :size="21"
                    />
                  </span>
                  <span class="text-xs muted">
                    {{ (issue.watchers || []).length || 0 }}
                  </span>
                </span>
              </div>
              <div class="meta-links">
                <button class="meta-link" type="button" @click="toggleWatch">
                  <Star :size="13" :fill="isWatching ? 'currentColor' : 'none'" />
                  {{ isWatching ? 'Ne plus suivre' : 'Suivre ce ticket' }}
                </button>
                <button class="meta-link" type="button" @click="copyLink">
                  <Copy :size="13" /> Copier le lien
                </button>
                <a class="meta-link" :href="issueUrl" target="_blank" rel="noopener noreferrer">
                  <ExternalLink :size="13" /> Ouvrir dans Redmine
                </a>
              </div>
            </div>
          </section>
        </aside>
      </div>

    </template>
  </div>
</template>

<style scoped>
.detail-loading-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
  gap: 16px;
}

.detail-error {
  max-width: 560px;
  margin: 40px auto;
}

.detail-breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--faint);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  padding: 3px 5px;
  border-radius: 5px;
}

.back-link:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.crumb-sep {
  color: var(--line-strong);
}

.crumb-project {
  color: var(--muted);
}

.crumb-id {
  color: var(--faint);
}

.crumb-loading {
  display: flex;
  color: var(--faint);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}

.detail-head-main {
  min-width: 0;
}

.detail-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

.overdue-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 10.5px;
  font-weight: 650;
}

.detail-title {
  display: flex;
  align-items: baseline;
  gap: 9px;
  font-size: 25px;
  line-height: 1.25;
  letter-spacing: -0.035em;
  max-width: 900px;
}

.detail-id {
  font-size: 16px;
  color: var(--faint);
  font-weight: 500;
  flex: none;
}

.title-edit {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--faint);
  opacity: 0;
  transition: all var(--transition);
  align-self: center;
}

.detail-title:hover .title-edit {
  opacity: 1;
}

.title-edit:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.subject-edit {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 900px;
}

.subject-input {
  font-size: 19px;
  font-weight: 600;
  height: 42px;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 9px;
  font-size: 11.5px;
  color: var(--muted);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.meta-item.is-late {
  color: var(--red);
  font-weight: 600;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.detail-actions .btn {
  min-height: 34px;
}

.btn.is-watching {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(290px, 1fr);
  gap: 15px;
  align-items: start;
}

.detail-main {
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-width: 0;
}

.detail-side {
  display: flex;
  flex-direction: column;
  gap: 15px;
  position: sticky;
  top: calc(var(--topbar-h) + 14px);
  max-height: calc(100vh - var(--topbar-h) - 28px);
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}

.description-card .card-body {
  padding-top: 16px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.description-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 18px 14px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  height: 27px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--ink-soft);
  font-size: 10.5px;
}

.attachment-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.attachment-chip .truncate {
  max-width: 160px;
}

.attachment-dl {
  color: var(--faint);
}

.activity-head {
  flex-wrap: wrap;
  gap: 8px;
}

.activity-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.journal-sort {
  min-height: 29px;
  gap: 5px;
  padding: 0 8px;
  color: var(--muted);
}

.journal-sort span {
  font-size: 10.5px;
}

.journal-tool {
  width: 29px;
  height: 29px;
  color: var(--faint);
}

.journal-tool:hover {
  color: var(--ink);
  background: var(--surface-3);
}

.comment-jump {
  min-height: 29px;
  gap: 5px;
  margin-left: 3px;
}

.sprint-pill {
  gap: 4px;
  flex: none;
}

.timeline {
  padding: 4px 0 0;
}

.timeline-list {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
}

.timeline-item:last-child {
  border-bottom: 0;
}

.timeline-rail {
  flex: none;
  padding-top: 1px;
}

.timeline-content {
  min-width: 0;
  flex: 1;
}

.timeline-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 11.5px;
}

.journal-toggle {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-left: -4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--faint);
  flex: none;
}

.journal-toggle:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.journal-toggle svg {
  transition: transform 140ms var(--ease);
}

.journal-toggle svg.is-open {
  transform: rotate(90deg);
}

.journal-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 23px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
  font-size: 10px;
  font-weight: 550;
  opacity: 0;
  transition: opacity var(--transition), background var(--transition), color var(--transition);
}

.timeline-item:hover .journal-edit-btn,
.journal-edit-btn:focus-visible {
  opacity: 1;
}

.journal-edit-btn:hover {
  border-color: var(--line);
  background: var(--surface-3);
  color: var(--ink);
}

.journal-collapsed {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  text-align: left;
  font-size: 11.5px;
  cursor: pointer;
}

.journal-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-collapsed:hover .journal-preview {
  color: var(--ink-soft);
}

.timeline-time {
  color: var(--faint);
  font-size: 10.5px;
}

.timeline-item.is-history {
  align-items: center;
  gap: 7px;
  padding: 5px 18px;
  border-bottom-color: color-mix(in srgb, var(--line) 64%, transparent);
  background: color-mix(in srgb, var(--surface-2) 35%, transparent);
}

.timeline-item.is-history .timeline-rail {
  padding-top: 0;
  opacity: 0.75;
}

.journal-history-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex: 1;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 10.5px;
  color: var(--muted);
}

.journal-history-line .strong {
  font-size: 10.5px;
}

.journal-history-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.journal-history-time {
  margin-left: auto;
  color: var(--faint);
  font-size: 9.5px;
  white-space: nowrap;
}

.journal-edit {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 7px;
}

.journal-edit-textarea {
  min-height: 120px;
  background: var(--surface);
}

.journal-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.private-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--amber-soft);
  color: var(--amber);
  font-size: 9.5px;
  font-weight: 600;
}

.journal-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}

.journal-change {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.5;
}

.journal-note {
  margin-top: 8px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.journal-note :deep(.rich-text) {
  font-size: 12.5px;
}

.composer-card .card-head {
  flex-wrap: wrap;
  gap: 6px;
}

.composer-body {
  padding: 12px 16px 16px;
}

.composer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.composer-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  font-size: 11.5px;
}

.draft-saved {
  font-size: 9.5px;
  color: var(--green);
}

.composer-textarea {
  background: var(--surface);
  min-height: 88px;
}

.composer-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 29px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.upload-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.upload-button input {
  display: none;
}

.private-check {
  font-size: 11px;
  color: var(--muted);
}

.comment-files {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 7px;
}

.comment-files li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 10.5px;
}

.comment-files li .truncate {
  flex: 1;
}

.file-remove {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--faint);
}

.file-remove:hover {
  background: var(--red-soft);
  color: var(--red);
}

.composer-error {
  margin-top: 7px;
  font-size: 11px;
  color: var(--red);
}

.properties-body {
  padding: 4px 16px 10px;
}

.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.property-row:last-child {
  border-bottom: 0;
}

.property-label {
  font-size: 10.5px;
  color: var(--muted);
  flex: none;
  width: 92px;
}

.property-control {
  min-height: 30px;
  padding: 4px 8px;
  font-size: 11px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  width: auto;
  flex: 1;
  min-width: 0;
  text-align: right;
  text-align-last: right;
}

select.property-control {
  padding-right: 24px;
  background-position: right 6px center;
}

.property-control:hover {
  border-color: var(--line-strong);
  background: var(--surface);
}

.property-control:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 2px var(--accent-ring);
}

.property-input-suffix {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.property-input-suffix span {
  font-size: 10.5px;
  color: var(--faint);
}

.property-input-suffix .property-control {
  text-align: right;
}

.property-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--line);
}

.time-card-body {
  padding: 13px 16px 14px;
}

.time-card-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 11px;
}

.time-card-number {
  font-size: 23px;
  font-weight: 650;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.time-card-label {
  font-size: 10px;
  color: var(--faint);
}

.time-card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-body {
  padding: 8px 16px 12px;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 11px;
}

.meta-label {
  color: var(--faint);
  flex: none;
}

.meta-value {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-soft);
  min-width: 0;
  text-align: right;
}

.meta-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.meta-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  margin: 0 -6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 10.5px;
  text-align: left;
}

.meta-link:hover {
  background: var(--surface-hover);
  color: var(--ink);
  text-decoration: none;
}

.time-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(140px, 1.4fr);
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.time-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-stat-label {
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--faint);
}

.time-stat-value {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.time-progress {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.time-entry-list {
  display: flex;
  flex-direction: column;
}

.time-entry-row {
  display: grid;
  grid-template-columns: 100px 22px minmax(90px, 0.8fr) 100px minmax(120px, 1.4fr) 60px 28px;
  align-items: center;
  gap: 9px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
}

.time-entry-row:last-child {
  border-bottom: 0;
}

.time-entry-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 10.5px;
}

.time-entry-user {
  color: var(--ink-soft);
}

.time-entry-activity {
  color: var(--muted);
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-entry-comment {
  color: var(--faint);
  font-size: 10.5px;
}

.time-entry-hours {
  font-weight: 650;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.files-list {
  display: flex;
  flex-direction: column;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}

.file-row:last-child {
  border-bottom: 0;
}

.file-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--muted);
  flex: none;
}

.file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 12px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 10px;
  color: var(--faint);
}

.relations-body {
  padding: 12px 16px 16px;
}

.relations-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relation-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink);
  font-size: 11.5px;
  background: var(--surface-2);
}

.relation-row:hover {
  border-color: var(--accent);
  text-decoration: none;
}

.relation-type {
  font-size: 10px;
  font-weight: 650;
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  flex: none;
}

.relation-arrow {
  margin-left: auto;
  color: var(--faint);
}

.relations-empty {
  padding: 8px 0;
}

.relations-subtitle {
  margin: 16px 0 7px;
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
}

.relation-form {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.relation-form-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.relation-form-row .select {
  width: auto;
  flex: 1;
  min-width: 130px;
}

.relation-target {
  width: 120px;
  flex: none;
}

.relation-delay {
  width: 100px;
  flex: none;
}

@media (hover: none) {
  .journal-edit-btn {
    opacity: 1;
  }
}

.detail-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow-x: auto;
}

.detail-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 550;
  white-space: nowrap;
}

.detail-tab:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.detail-tab.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.detail-tab .tab-count {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1150px) {
  .detail-layout {
    grid-template-columns: minmax(0, 1fr) minmax(270px, 0.8fr);
  }
  .time-entry-row {
    grid-template-columns: 90px 22px minmax(80px, 1fr) 80px 60px 24px;
  }
  .time-entry-comment {
    display: none;
  }
}

@media (max-width: 900px) {
  .detail-head {
    flex-direction: column;
    gap: 12px;
  }
  .detail-actions {
    justify-content: flex-start;
  }
  .detail-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .detail-side {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }
  .properties-card,
  .composer-card {
    grid-column: span 2;
  }
}

@media (max-width: 640px) {
  .detail-title {
    font-size: 20px;
    flex-wrap: wrap;
  }
  .detail-id {
    font-size: 13px;
  }
  .detail-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .properties-card,
  .composer-card {
    grid-column: auto;
  }
  .activity-tools {
    width: 100%;
  }
  .comment-jump {
    margin-left: auto;
  }
  .journal-edit-btn {
    opacity: 1;
  }
  .time-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .time-progress {
    grid-column: span 3;
  }
  .time-entry-row {
    grid-template-columns: 90px 1fr 60px 24px;
  }
  .time-entry-row > :nth-child(2),
  .time-entry-row > :nth-child(3),
  .time-entry-row > :nth-child(4) {
    display: none;
  }
  .time-entry-row > .time-entry-hours {
    display: block;
    grid-column: 2;
  }
  .subject-edit {
    flex-wrap: wrap;
  }
  .subject-input {
    width: 100%;
  }
  .relation-form-row .select,
  .relation-target {
    flex: 1;
    width: auto;
  }
}
</style>
