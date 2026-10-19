<script setup>
import { computed, ref, watch } from 'vue'
import { CalendarDays, Clock3, Loader2, Trash2 } from 'lucide-vue-next'
import Modal from './Modal.vue'
import IssuePicker from './IssuePicker.vue'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useRefreshStore } from '../stores/refresh.js'
import { parseHoursInput, toIsoDate } from '../lib/format.js'
import { ApiError } from '../lib/api.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  draft: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'saved'])
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const refresh = useRefreshStore()

const issue = ref(null)
const spentOn = ref(toIsoDate())
const hours = ref('')
const activityId = ref('')
const comments = ref('')
const saving = ref(false)
const deleting = ref(false)
const error = ref('')

const editing = computed(() => Boolean(props.draft.entry))
const activeActivities = computed(() =>
  session.activities.filter((activity) => activity.active !== false),
)

function reset() {
  const draft = props.draft || {}
  const entry = draft.entry
  issue.value = draft.issue
    ? {
        id: draft.issue.id,
        subject: draft.issue.subject || entry?.issue?.subject || `Ticket #${draft.issue.id}`,
        project: draft.issue.project || entry?.project || null,
        status: draft.issue.status || null,
      }
    : null
  spentOn.value = entry?.spent_on || draft.spent_on || toIsoDate()
  hours.value = entry?.hours ?? draft.hours ?? ''
  activityId.value = String(
    entry?.activity?.id || draft.activity_id || session.defaultActivity?.id || '',
  )
  comments.value = entry?.comments || draft.comments || ''
  error.value = ''
  saving.value = false
  deleting.value = false
}

watch(
  () => [props.open, props.draft],
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

function setHours(value) {
  hours.value = String(value)
}

async function submit() {
  error.value = ''
  if (!issue.value?.id) {
    error.value = 'Choisissez un ticket.'
    return
  }
  const parsed = parseHoursInput(hours.value)
  if (parsed === null || parsed <= 0) {
    error.value = 'Saisissez une durée supérieure à zéro (ex. 1,5).'
    return
  }
  if (parsed > 24) {
    error.value = 'La durée ne peut pas dépasser 24 heures.'
    return
  }
  if (!spentOn.value) {
    error.value = 'Choisissez une date.'
    return
  }
  if (!activityId.value) {
    error.value = "Aucune activité de temps n'est disponible sur ce Redmine."
    return
  }

  saving.value = true
  const payload = {
    issue_id: issue.value.id,
    spent_on: spentOn.value,
    hours: parsed,
    activity_id: Number(activityId.value),
    comments: comments.value.trim(),
  }

  try {
    if (editing.value) {
      await settings.api.updateTimeEntry(props.draft.entry.id, payload)
      toast.success('Temps mis à jour.')
    } else {
      await settings.api.createTimeEntry(payload)
      toast.success(`${parsed.toString().replace('.', ',')} h enregistrée${parsed > 1 ? 's' : ''} sur le ticket #${issue.value.id}.`)
    }
    refresh.bumpTime()
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "Impossible d'enregistrer le temps."
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!editing.value) return
  if (!window.confirm('Supprimer cette saisie de temps ?')) return
  deleting.value = true
  try {
    await settings.api.deleteTimeEntry(props.draft.entry.id)
    toast.success('Saisie supprimée.')
    refresh.bumpTime()
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Suppression impossible.'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="editing ? 'Modifier le temps' : 'Saisir du temps'"
    :description="
      editing
        ? `Saisie du ${spentOn}`
        : 'Enregistrez rapidement le temps passé sur un ticket.'
    "
    size="md"
    @close="emit('close')"
  >
    <form id="time-entry-form" class="time-form" @submit.prevent="submit">
      <div class="field">
        <label class="field-label">Ticket</label>
        <IssuePicker v-model="issue" autofocus />
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="time-date">Date</label>
          <div class="input-group">
            <CalendarDays :size="15" />
            <input id="time-date" v-model="spentOn" class="input" type="date" required />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="time-activity">Activité</label>
          <select id="time-activity" v-model="activityId" class="select" required>
            <option value="" disabled>Sélectionner…</option>
            <option v-for="activity in activeActivities" :key="activity.id" :value="String(activity.id)">
              {{ activity.name }}
            </option>
          </select>
        </div>

        <div class="field span-2">
          <label class="field-label" for="time-hours">Durée (heures)</label>
          <div class="hours-row">
            <div class="input-group hours-input">
              <Clock3 :size="15" />
              <input
                id="time-hours"
                v-model="hours"
                class="input"
                type="text"
                inputmode="decimal"
                placeholder="1,5"
                required
              />
            </div>
            <div class="hours-quick">
              <button
                v-for="value in [0.25, 0.5, 1, 2, 4]"
                :key="value"
                type="button"
                class="hours-chip"
                :class="{ 'is-active': Number(hours) === value }"
                @click="setHours(value)"
              >
                {{ String(value).replace('.', ',') }} h
              </button>
            </div>
          </div>
        </div>

        <div class="field span-2">
          <label class="field-label" for="time-comments">Commentaire <span class="faint">(optionnel)</span></label>
          <textarea
            id="time-comments"
            v-model="comments"
            class="textarea"
            rows="3"
            placeholder="Sur quoi avez-vous travaillé ?"
          ></textarea>
        </div>
      </div>

      <p v-if="error" class="form-alert" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button
        v-if="editing"
        class="btn btn-danger btn-sm footer-delete"
        type="button"
        :disabled="deleting || saving"
        @click="remove"
      >
        <Loader2 v-if="deleting" :size="14" class="spin" />
        <Trash2 v-else :size="14" />
        Supprimer
      </button>
      <button class="btn" type="button" :disabled="saving" @click="emit('close')">Annuler</button>
      <button class="btn btn-primary" type="submit" form="time-entry-form" :disabled="saving">
        <Loader2 v-if="saving" :size="15" class="spin" />
        <Clock3 v-else :size="15" />
        {{ editing ? 'Enregistrer' : 'Saisir le temps' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.time-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.hours-row {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.hours-input {
  width: 130px;
}

.hours-quick {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.hours-chip {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  transition: all var(--transition);
}

.hours-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hours-chip.is-active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent);
}

.form-alert {
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.footer-delete {
  margin-right: auto;
}

.spin {
  animation: spin 0.8s linear infinite;
}
</style>
