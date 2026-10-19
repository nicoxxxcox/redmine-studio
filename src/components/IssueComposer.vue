<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FilePlus2, Loader2, Lock, Paperclip, Plus, Trash2 } from 'lucide-vue-next'
import Modal from './Modal.vue'
import RichTextEditor from './RichTextEditor.vue'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useUiStore } from '../stores/ui.js'
import { formatFileSize, parseHoursInput, toIsoDate } from '../lib/format.js'
import { ApiError } from '../lib/api.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  defaults: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close'])
const router = useRouter()
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const ui = useUiStore()

const form = reactive({
  project_id: '',
  tracker_id: '',
  subject: '',
  description: '',
  status_id: '',
  priority_id: '',
  assigned_to_id: '',
  due_date: '',
  start_date: '',
  estimated_hours: '',
  is_private: false,
})

const files = ref([])
const members = ref([])
const loadingMembers = ref(false)
const saving = ref(false)
const uploadProgress = ref('')
const error = ref('')

const selectedProject = computed(() =>
  session.projects.find((project) => project.id === Number(form.project_id)),
)

const availableTrackers = computed(() => {
  if (selectedProject.value?.trackers?.length) return selectedProject.value.trackers
  return session.trackers
})

const availableStatuses = computed(() =>
  session.statuses.filter((status) => !status.is_closed || Number(form.status_id) === status.id),
)

function init() {
  const defaults = props.defaults || {}
  const projectId =
    defaults.projectId ||
    settings.settings.defaultProjectId ||
    session.projects[0]?.id ||
    ''
  Object.assign(form, {
    project_id: projectId ? String(projectId) : '',
    tracker_id: '',
    subject: '',
    description: '',
    status_id: String(
      defaults.statusId || settings.settings.defaultStatusId || session.defaultStatus?.id || '',
    ),
    priority_id: String(session.defaultPriority?.id || ''),
    assigned_to_id: String(session.user?.id || ''),
    due_date: '',
    start_date: toIsoDate(),
    estimated_hours: '',
    is_private: false,
  })
  files.value = []
  error.value = ''
  saving.value = false
  uploadProgress.value = ''
  syncTracker()
  loadMembers()
}

function syncTracker() {
  const trackers = availableTrackers.value
  if (!trackers.some((tracker) => tracker.id === Number(form.tracker_id))) {
    form.tracker_id = String(trackers[0]?.id || session.defaultTracker?.id || '')
  }
}

async function loadMembers() {
  if (!form.project_id) {
    members.value = []
    return
  }
  loadingMembers.value = true
  try {
    const result = await session.membersFor(Number(form.project_id))
    const list = [...result]
    if (session.user && !list.some((member) => member.id === session.user.id)) {
      list.unshift(session.user)
    }
    members.value = list
  } catch {
    members.value = session.user ? [session.user] : []
  } finally {
    loadingMembers.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) init()
  },
)

watch(
  () => form.project_id,
  () => {
    syncTracker()
    loadMembers()
  },
)

function onFilesChange(event) {
  const selected = Array.from(event.target.files || [])
  for (const file of selected) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`« ${file.name} » dépasse 20 Mo.`)
      continue
    }
    if (!files.value.some((item) => item.name === file.name && item.size === file.size)) {
      files.value.push(file)
    }
  }
  event.target.value = ''
}

function removeFile(index) {
  files.value.splice(index, 1)
}

async function submit() {
  error.value = ''
  if (!form.project_id) {
    error.value = 'Choisissez un projet.'
    return
  }
  if (!form.subject.trim()) {
    error.value = 'Le sujet du ticket est obligatoire.'
    return
  }
  if (!form.tracker_id) {
    error.value = 'Choisissez un tracker.'
    return
  }

  const estimated = form.estimated_hours ? parseHoursInput(form.estimated_hours) : null
  if (form.estimated_hours && (estimated === null || estimated < 0)) {
    error.value = 'Le temps estimé est invalide.'
    return
  }

  saving.value = true
  try {
    const uploads = []
    for (let index = 0; index < files.value.length; index += 1) {
      const file = files.value[index]
      uploadProgress.value = `Envoi du fichier ${index + 1}/${files.value.length}…`
      const upload = await settings.api.uploadFile(file)
      uploads.push({
        token: upload.token,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
    }

    uploadProgress.value = 'Création du ticket…'
    const payload = {
      project_id: Number(form.project_id),
      tracker_id: Number(form.tracker_id),
      subject: form.subject.trim(),
      description: form.description,
      status_id: form.status_id ? Number(form.status_id) : undefined,
      priority_id: form.priority_id ? Number(form.priority_id) : undefined,
      assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : undefined,
      start_date: form.start_date || undefined,
      due_date: form.due_date || undefined,
      estimated_hours: estimated ?? undefined,
      is_private: form.is_private || undefined,
      ...(uploads.length ? { uploads } : {}),
    }
    const data = await settings.api.createIssue(payload)
    const created = data?.issue
    toast.success(`Ticket #${created?.id ?? ''} créé.`)
    emit('close')
    if (created?.id) router.push({ name: 'issue', params: { id: created.id } })
  } catch (err) {
    error.value =
      err instanceof ApiError ? err.message : 'Impossible de créer le ticket pour le moment.'
  } finally {
    saving.value = false
    uploadProgress.value = ''
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="Nouveau ticket"
    description="Décrivez le besoin, puis ajustez les propriétés essentielles."
    size="lg"
    @close="emit('close')"
  >
    <form id="issue-create-form" class="issue-form" @submit.prevent="submit">
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="issue-project">Projet</label>
          <select id="issue-project" v-model="form.project_id" class="select" required>
            <option value="" disabled>Sélectionner un projet</option>
            <option v-for="project in session.projects" :key="project.id" :value="String(project.id)">
              {{ project.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="issue-tracker">Tracker</label>
          <select id="issue-tracker" v-model="form.tracker_id" class="select" required>
            <option v-for="tracker in availableTrackers" :key="tracker.id" :value="String(tracker.id)">
              {{ tracker.name }}
            </option>
          </select>
        </div>

        <div class="field span-2">
          <label class="field-label" for="issue-subject">Sujet</label>
          <input
            id="issue-subject"
            v-model="form.subject"
            class="input"
            type="text"
            placeholder="Résumé clair et actionnable du ticket"
            maxlength="255"
            required
          />
        </div>

        <div class="field span-2">
          <label class="field-label" for="issue-description">Description</label>
          <RichTextEditor
            id="issue-description"
            v-model="form.description"
            min-height="200px"
            aria-label="Description du ticket"
            placeholder="Contexte, étapes de reproduction, résultat attendu…"
          />
          <span class="field-hint">
            Mise en forme rapide ; l'icône source permet d'éditer le Textile.
          </span>
        </div>

        <div class="field">
          <label class="field-label" for="issue-status">Statut</label>
          <select id="issue-status" v-model="form.status_id" class="select">
            <option v-for="status in availableStatuses" :key="status.id" :value="String(status.id)">
              {{ status.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="issue-priority">Priorité</label>
          <select id="issue-priority" v-model="form.priority_id" class="select">
            <option v-for="priority in session.priorities" :key="priority.id" :value="String(priority.id)">
              {{ priority.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="issue-assignee">Assigné à</label>
          <select id="issue-assignee" v-model="form.assigned_to_id" class="select" :disabled="loadingMembers">
            <option value="">Non assigné</option>
            <option v-for="member in members" :key="member.id" :value="String(member.id)">
              {{ [member.firstname, member.lastname].filter(Boolean).join(' ') || member.name }}
            </option>
          </select>
          <span v-if="loadingMembers" class="field-hint">Chargement des membres…</span>
        </div>

        <div class="field">
          <label class="field-label" for="issue-start">Date de début</label>
          <input id="issue-start" v-model="form.start_date" class="input" type="date" />
        </div>

        <div class="field">
          <label class="field-label" for="issue-due">Échéance</label>
          <input id="issue-due" v-model="form.due_date" class="input" type="date" />
        </div>

        <div class="field">
          <label class="field-label" for="issue-estimate">Temps estimé (heures)</label>
          <input
            id="issue-estimate"
            v-model="form.estimated_hours"
            class="input"
            type="text"
            inputmode="decimal"
            placeholder="4,5"
          />
        </div>

        <div class="field">
          <label class="field-label">Confidentialité</label>
          <label class="checkbox visibility-check">
            <input v-model="form.is_private" type="checkbox" />
            <Lock :size="13" />
            Ticket privé
          </label>
        </div>

        <div class="field span-2">
          <span class="field-label">Pièces jointes</span>
          <div class="attachment-upload">
            <label class="upload-button">
              <Paperclip :size="14" />
              Ajouter des fichiers
              <input type="file" multiple @change="onFilesChange" />
            </label>
            <span class="field-hint">20 Mo max par fichier.</span>
          </div>
          <ul v-if="files.length" class="file-list">
            <li v-for="(file, index) in files" :key="`${file.name}-${file.size}`" class="file-item">
              <FilePlus2 :size="14" />
              <span class="truncate">{{ file.name }}</span>
              <span class="faint text-xs">{{ formatFileSize(file.size) }}</span>
              <button type="button" class="file-remove" @click="removeFile(index)">
                <Trash2 :size="13" />
              </button>
            </li>
          </ul>
        </div>
      </div>

      <p v-if="error" class="form-alert" role="alert">{{ error }}</p>
      <p v-if="uploadProgress" class="upload-progress">
        <Loader2 :size="14" class="spin" /> {{ uploadProgress }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" :disabled="saving" @click="emit('close')">Annuler</button>
      <button class="btn btn-primary" type="submit" form="issue-create-form" :disabled="saving">
        <Loader2 v-if="saving" :size="15" class="spin" />
        <Plus v-else :size="15" />
        Créer le ticket
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.issue-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.visibility-check {
  min-height: 36px;
  color: var(--ink-soft);
}

.attachment-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: all var(--transition);
}

.upload-button:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.upload-button input {
  display: none;
}

.file-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 3px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 11.5px;
  color: var(--ink-soft);
}

.file-item .truncate {
  flex: 1;
}

.file-remove {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
}

.file-remove:hover {
  background: var(--red-soft);
  color: var(--red);
}

.form-alert {
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--muted);
}

.spin {
  animation: spin 0.8s linear infinite;
}
</style>
