<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FolderKanban,
  KeyRound,
  ListFilter,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  TriangleAlert,
  Users,
  Wifi,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useToastStore } from '../stores/toast.js'
import { useTheme } from '../lib/theme.js'
import { ApiError, RedmineApi } from '../lib/api.js'
import { fullName } from '../lib/format.js'
import UserAvatar from '../components/UserAvatar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import FavoritePicker from '../components/FavoritePicker.vue'

const router = useRouter()
const settings = useSettingsStore()
const session = useSessionStore()
const toast = useToastStore()
const { resolved } = useTheme()

const form = reactive({
  baseUrl: settings.settings.baseUrl,
  apiKey: settings.settings.apiKey,
  rememberKey: settings.settings.rememberKey !== false,
})
const showKey = ref(false)
const testing = ref(false)
const saving = ref(false)
const testUser = ref(null)
const error = ref('')
let testSequence = 0

const themeOptions = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
]

const accountUrl = computed(() => {
  const base = settings.settings.baseUrl
  return base ? `${base}/my/account` : ''
})

const defaultProject = computed({
  get: () => (settings.settings.defaultProjectId ? String(settings.settings.defaultProjectId) : ''),
  set: (value) => {
    settings.settings.defaultProjectId = value ? Number(value) : null
  },
})
const defaultActivity = computed({
  get: () => (settings.settings.defaultActivityId ? String(settings.settings.defaultActivityId) : ''),
  set: (value) => {
    settings.settings.defaultActivityId = value ? Number(value) : null
  },
})
const defaultStatus = computed({
  get: () => (settings.settings.defaultStatusId ? String(settings.settings.defaultStatusId) : ''),
  set: (value) => {
    settings.settings.defaultStatusId = value ? Number(value) : null
  },
})

const favoriteTab = ref('status')
const favoriteStatuses = computed({
  get: () => settings.favoriteStatusIds,
  set: (ids) => settings.setFavoriteStatuses(ids),
})
const favoriteUsers = computed({
  get: () => settings.favoriteUserIds,
  set: (ids) => settings.setFavoriteUsers(ids),
})
const favoriteProjects = computed({
  get: () => settings.favoriteProjectIds,
  set: (ids) => settings.setFavoriteProjects(ids),
})

const favoriteTabs = computed(() => [
  {
    value: 'status',
    label: 'Statuts',
    icon: ListFilter,
    count: settings.favoriteStatusIds.length,
  },
  {
    value: 'user',
    label: 'Utilisateurs',
    icon: Users,
    count: settings.favoriteUserIds.length,
  },
  {
    value: 'project',
    label: 'Projets',
    icon: FolderKanban,
    count: settings.favoriteProjectIds.length,
  },
])

const favoriteCount = computed(
  () =>
    settings.favoriteStatusIds.length +
    settings.favoriteUserIds.length +
    settings.favoriteProjectIds.length,
)

const favoriteStatusOptions = computed(() =>
  session.statuses.map((status) => ({
    id: status.id,
    label: status.name,
    status,
  })),
)

const favoriteUserOptions = computed(() =>
  session.userDirectory.map((user) => ({
    id: user.id,
    label: fullName(user) || user.name || `Utilisateur #${user.id}`,
    meta: user.login ? `@${user.login}` : '',
    user,
  })),
)

const favoriteProjectOptions = computed(() =>
  session.projects.map((project) => ({
    id: project.id,
    label: project.name,
    meta: project.identifier ? `#${project.identifier}` : '',
    project,
  })),
)

const userDirectoryLoadingLabel = computed(() => {
  const progress = session.userDirectoryProgress
  if (progress.total) {
    return `Chargement des utilisateurs… ${progress.done}/${progress.total} projets`
  }
  return 'Chargement des utilisateurs…'
})

const userDirectoryEmptyLabel = computed(
  () => session.userDirectoryError || 'Aucun utilisateur accessible.',
)

watch(
  () => settings.favoriteUserIds,
  (ids) => {
    if (ids.length) session.ensureUsers(ids)
  },
  { immediate: true },
)

onMounted(() => {
  if (!session.userDirectoryLoaded) session.loadUserDirectory()
})

function resetTest() {
  testSequence += 1
  testing.value = false
  testUser.value = null
  error.value = ''
}

function validate() {
  const base = settings.normalizeBaseUrl(form.baseUrl)
  if (!base) return 'Renseignez l’URL de votre Redmine.'
  try {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol)) return 'L’URL doit être en http:// ou https://.'
  } catch {
    return 'Cette URL ne semble pas valide.'
  }
  if (!form.apiKey.trim()) return 'Renseignez votre clé API.'
  return ''
}

async function testConnection() {
  const invalid = validate()
  if (invalid) {
    error.value = invalid
    return null
  }
  testing.value = true
  error.value = ''
  testUser.value = null
  const sequence = ++testSequence
  try {
    const api = new RedmineApi({
      baseUrl: settings.normalizeBaseUrl(form.baseUrl),
      apiKey: form.apiKey.trim(),
    })
    const user = await api.testConnection()
    if (sequence !== testSequence) return null
    testUser.value = user
    return user
  } catch (err) {
    if (sequence !== testSequence) return null
    error.value = err instanceof ApiError ? err.message : 'Connexion impossible.'
    return null
  } finally {
    if (sequence === testSequence) testing.value = false
  }
}

async function saveConnection() {
  if (!testUser.value) {
    const user = await testConnection()
    if (!user) return
  }
  saving.value = true
  error.value = ''
  try {
    const previousBaseUrl = settings.settings.baseUrl
    settings.setConnection({
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      rememberKey: form.rememberKey,
    })
    if (previousBaseUrl && previousBaseUrl !== settings.settings.baseUrl) {
      settings.setFavoriteStatuses([])
      settings.setFavoriteUsers([])
      settings.setFavoriteProjects([])
    }
    form.baseUrl = settings.settings.baseUrl
    session.reset()
    await session.load({ force: true })
    session.loadUserDirectory()
    toast.success('Connexion et données Redmine mises à jour.')
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : 'Connexion enregistrée, mais le rechargement des données a échoué.'
  } finally {
    saving.value = false
  }
}

function setTheme(theme) {
  settings.setTheme(theme)
}

function clearDrafts() {
  let removed = 0
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('redmine-studio.issue-draft.')) {
      localStorage.removeItem(key)
      removed += 1
    }
  }
  toast.success(
    removed ? `${removed} brouillon${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''}.` : 'Aucun brouillon local à supprimer.',
  )
}

function disconnect() {
  if (!window.confirm('Se déconnecter ? La clé API sera oubliée sur cet appareil.')) return
  session.reset()
  settings.disconnect()
  router.push({ name: 'setup' })
}
</script>

<template>
  <div class="page settings-page">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title">Paramètres</h1>
        <p class="page-subtitle">Connexion Redmine, apparence et préférences de travail.</p>
      </div>
      <div class="page-actions">
        <a v-if="accountUrl" class="btn" :href="accountUrl" target="_blank" rel="noopener noreferrer">
          <KeyRound :size="14" /> Gérer ma clé API
        </a>
      </div>
    </header>

    <div class="settings-layout">
      <div class="settings-main">
        <section class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title"><Server :size="15" /> Connexion Redmine</h2>
              <p class="card-sub">Ces informations sont stockées dans votre navigateur uniquement.</p>
            </div>
            <span class="connection-badge" :class="{ 'is-ok': session.ready }">
              <span class="dot" :data-tone="session.ready ? 'green' : 'red'"></span>
              {{ session.ready ? 'Connecté' : 'Déconnecté' }}
            </span>
          </header>

          <div class="card-body connection-form">
            <div class="field">
              <label class="field-label" for="settings-url">URL de votre Redmine</label>
              <div class="input-group">
                <Wifi :size="15" />
                <input
                  id="settings-url"
                  v-model="form.baseUrl"
                  class="input"
                  type="url"
                  placeholder="https://redmine.mon-entreprise.fr"
                  spellcheck="false"
                  @input="resetTest"
                />
              </div>
              <span class="field-hint">
                Le proxy local de l'application relaie les requêtes pour éviter les blocages CORS.
              </span>
            </div>

            <div class="field">
              <label class="field-label" for="settings-key">Clé d'accès API</label>
              <div class="input-group">
                <KeyRound :size="15" />
                <input
                  id="settings-key"
                  v-model="form.apiKey"
                  class="input key-input"
                  :type="showKey ? 'text' : 'password'"
                  placeholder="Votre clé API Redmine"
                  autocomplete="off"
                  spellcheck="false"
                  @input="resetTest"
                />
                <button
                  class="btn btn-ghost btn-icon btn-sm input-action"
                  type="button"
                  :title="showKey ? 'Masquer' : 'Afficher'"
                  @click="showKey = !showKey"
                >
                  <EyeOff v-if="showKey" :size="14" />
                  <Eye v-else :size="14" />
                </button>
              </div>
              <span v-if="accountUrl" class="field-hint">
                Retrouvez-la dans
                <a :href="accountUrl" target="_blank" rel="noopener noreferrer">
                  Mon compte → Clé d'accès API
                </a>.
              </span>
            </div>

            <label class="checkbox">
              <input v-model="form.rememberKey" type="checkbox" />
              Mémoriser la clé API sur cet appareil
              <span class="faint">(localStorage du navigateur)</span>
            </label>

            <div v-if="testUser" class="settings-result is-success">
              <CheckCircle2 :size="17" />
              <div>
                <p class="strong">Connexion réussie</p>
                <p class="text-sm">Connecté en tant que {{ fullName(testUser) }}.</p>
              </div>
            </div>

            <div v-if="error" class="settings-result is-error" role="alert">
              <TriangleAlert :size="17" />
              <div>
                <p class="strong">Connexion impossible</p>
                <p class="text-sm">{{ error }}</p>
              </div>
            </div>

            <div class="connection-actions">
              <button class="btn" type="button" :disabled="testing || saving" @click="testConnection">
                <Loader2 v-if="testing" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
                Tester la connexion
              </button>
              <button class="btn btn-primary" type="button" :disabled="testing || saving" @click="saveConnection">
                <Loader2 v-if="saving" :size="14" class="spin" />
                <CheckCircle2 v-else :size="14" />
                Enregistrer
              </button>
            </div>
          </div>
        </section>

        <section class="card">
          <header class="card-head">
            <h2 class="card-title"><Palette :size="15" /> Apparence</h2>
          </header>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Thème</span>
                <span class="setting-description">Choisissez l'apparence de l'interface.</span>
              </div>
              <div class="theme-picker">
                <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  class="theme-option"
                  :class="{ 'is-active': settings.settings.theme === option.value }"
                  @click="setTheme(option.value)"
                >
                  <component :is="option.icon" :size="10" />
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Liste compacte</span>
                <span class="setting-description">Réduit l'espacement des lignes de tickets.</span>
              </div>
              <label class="switch">
                <input v-model="settings.settings.compactList" type="checkbox" />
                <span class="sr-only">Liste compacte</span>
              </label>
            </div>
          </div>
        </section>

        <section class="card">
          <header class="card-head">
            <h2 class="card-title"><SlidersHorizontal :size="15" /> Préférences</h2>
          </header>
          <div class="card-body preference-grid">
            <div class="field">
              <label class="field-label" for="default-project">Projet par défaut</label>
              <select id="default-project" v-model="defaultProject" class="select">
                <option value="">Aucun</option>
                <option v-for="project in session.projects" :key="project.id" :value="String(project.id)">
                  {{ project.name }}
                </option>
              </select>
              <span class="field-hint">Présélectionné lors de la création d'un ticket.</span>
            </div>

            <div class="field">
              <label class="field-label" for="default-activity">Activité de temps</label>
              <select id="default-activity" v-model="defaultActivity" class="select">
                <option value="">Activité par défaut de Redmine</option>
                <option v-for="activity in session.activities" :key="activity.id" :value="String(activity.id)">
                  {{ activity.name }}
                </option>
              </select>
              <span class="field-hint">Utilisée pour préremplir les saisies de temps.</span>
            </div>

            <div class="field">
              <label class="field-label" for="default-status">Statut par défaut</label>
              <select id="default-status" v-model="defaultStatus" class="select">
                <option value="">Statut par défaut de Redmine</option>
                <option v-for="status in session.statuses" :key="status.id" :value="String(status.id)">
                  {{ status.name }}
                </option>
              </select>
              <span class="field-hint">Pour les nouveaux tickets.</span>
            </div>
          </div>
        </section>

        <section class="card favorites-card">
          <header class="card-head">
            <div>
              <h2 class="card-title"><Star :size="15" /> Favoris</h2>
              <p class="card-sub">
                Ces favoris limitent les choix proposés dans les filtres des tickets et du temps.
              </p>
            </div>
            <span class="favorites-total">
              {{ favoriteCount }} favori{{ favoriteCount > 1 ? 's' : '' }}
            </span>
          </header>
          <div class="card-body favorites-body">
            <p class="favorites-note">
              Laissez une catégorie vide pour continuer à voir tous ses éléments dans les filtres.
            </p>

            <div class="favorite-tabs" role="tablist" aria-label="Catégories de favoris">
              <button
                v-for="tab in favoriteTabs"
                :key="tab.value"
                type="button"
                class="favorite-tab"
                :class="{ 'is-active': favoriteTab === tab.value }"
                role="tab"
                :aria-selected="favoriteTab === tab.value"
                @click="favoriteTab = tab.value"
              >
                <component :is="tab.icon" :size="13" />
                {{ tab.label }}
                <span v-if="tab.count" class="favorite-tab-count">{{ tab.count }}</span>
              </button>
            </div>

            <FavoritePicker
              v-if="favoriteTab === 'status'"
              v-model="favoriteStatuses"
              :options="favoriteStatusOptions"
              :searchable="session.statuses.length > 8"
              search-placeholder="Rechercher un statut…"
              empty-label="Aucun statut accessible."
            >
              <template #option="{ option }">
                <StatusBadge :status="option.status" />
              </template>
              <template #chip="{ option }">
                <StatusBadge :status="option.status" />
              </template>
            </FavoritePicker>

            <FavoritePicker
              v-else-if="favoriteTab === 'user'"
              v-model="favoriteUsers"
              :options="favoriteUserOptions"
              :loading="session.userDirectoryLoading"
              :loading-label="userDirectoryLoadingLabel"
              search-placeholder="Rechercher un utilisateur…"
              :empty-label="userDirectoryEmptyLabel"
            >
              <template #option="{ option }">
                <UserAvatar :user="option.user" :name="option.label" :size="23" />
                <span class="favorite-user-text">
                  <span class="favorite-user-name">{{ option.label }}</span>
                  <span v-if="option.meta" class="favorite-user-login">{{ option.meta }}</span>
                </span>
              </template>
              <template #chip="{ option }">
                <UserAvatar :user="option.user" :name="option.label" :size="16" />
                <span>{{ option.label }}</span>
              </template>
            </FavoritePicker>

            <FavoritePicker
              v-else
              v-model="favoriteProjects"
              :options="favoriteProjectOptions"
              search-placeholder="Rechercher un projet…"
              empty-label="Aucun projet accessible."
            />
          </div>
        </section>
      </div>

      <aside class="settings-side">
        <section class="card account-card">
          <div class="account-head">
            <UserAvatar :user="session.user" :name="session.displayName" :size="44" />
            <div class="account-info">
              <span class="account-name">{{ session.displayName || 'Utilisateur' }}</span>
              <span class="account-login">@{{ session.user?.login || '—' }}</span>
            </div>
          </div>
          <div class="account-rows">
            <div class="account-row">
              <span class="muted">Instance</span>
              <span class="mono truncate" :title="settings.settings.baseUrl">{{ settings.settings.baseUrl }}</span>
            </div>
            <div class="account-row">
              <span class="muted">Utilisateur</span>
              <span>{{ fullName(session.user) || '—' }}</span>
            </div>
            <div v-if="session.user?.mail" class="account-row">
              <span class="muted">Email</span>
              <span class="truncate">{{ session.user.mail }}</span>
            </div>
            <div class="account-row">
              <span class="muted">Projets</span>
              <span>{{ session.projects.length }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <header class="card-head">
            <h2 class="card-title"><ShieldCheck :size="15" /> Sécurité</h2>
          </header>
          <div class="card-body security-body">
            <p class="security-note">
              La clé API est conservée {{ settings.settings.rememberKey ? 'dans le stockage local' : 'uniquement pour cette session' }}
              du navigateur. Elle n'est jamais envoyée à un serveur tiers : toutes les requêtes
              passent par le proxy de l'application vers votre Redmine.
            </p>
            <button class="btn btn-sm btn-block" type="button" @click="clearDrafts">
              <Trash2 :size="13" /> Effacer les brouillons locaux
            </button>
            <button class="btn btn-sm btn-danger btn-block" type="button" @click="disconnect">
              <LogOut :size="13" /> Se déconnecter
            </button>
          </div>
        </section>

        <section class="card about-card">
          <div class="card-body">
            <div class="about-logo">
              <span class="about-mark">
                <svg viewBox="0 0 64 64" width="24" height="24">
                  <rect width="64" height="64" rx="17" fill="currentColor" opacity=".14" />
                  <path d="M23 25h18M23 32h18M23 39h11" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                  <circle cx="46" cy="46" r="8.5" fill="var(--surface)" stroke="currentColor" stroke-width="3.4" />
                  <path d="M46 42.6v3.6l2.7 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <div>
                <p class="strong">Redmine Studio</p>
                <p class="text-xs muted">Version 1.0 · Redmine 3.4+</p>
              </div>
            </div>
            <p class="about-text">
              Client non officiel, conçu pour rendre la gestion quotidienne des tickets plus rapide
              et plus lisible. Il utilise uniquement l'API REST de Redmine.
            </p>
            <div class="about-badges">
              <span class="tag"><Database :size="11" /> API REST</span>
              <span class="tag"><ShieldCheck :size="11" /> Proxy local</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.card-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--faint);
}

.settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: start;
}

.settings-main,
.settings-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 10px;
  font-weight: 650;
}

.connection-badge.is-ok {
  background: var(--green-soft);
  color: var(--green);
}

.connection-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.key-input {
  padding-right: 38px;
}

.settings-result {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 11.5px;
}

.settings-result .strong {
  font-size: 11.5px;
}

.settings-result p:not(.strong) {
  color: var(--ink-soft);
}

.settings-result.is-success {
  background: var(--green-soft);
  color: var(--green);
}

.settings-result.is-error {
  background: var(--red-soft);
  color: var(--red);
}

.connection-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}

.connection-actions .btn-primary {
  margin-left: auto;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.setting-row:first-child {
  padding-top: 0;
}

.setting-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-title {
  font-size: 12.5px;
  font-weight: 600;
}

.setting-description {
  font-size: 10.5px;
  color: var(--muted);
}

.theme-picker {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  flex: none;
}

.theme-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 550;
}

.theme-option:hover {
  color: var(--ink);
}

.theme-option.is-active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-xs);
}

.preference-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.favorites-total {
  display: inline-flex;
  align-items: center;
  height: 23px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.favorites-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.favorites-note {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--muted);
}

.favorite-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.favorite-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 550;
}

.favorite-tab:hover {
  color: var(--ink);
}

.favorite-tab.is-active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-xs);
}

.favorite-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 9px;
  font-weight: 700;
}

.favorite-user-text {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.favorite-user-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-user-login {
  margin-left: auto;
  flex: none;
  color: var(--faint);
  font-size: 9.5px;
}

.account-card {
  padding: 16px;
}

.account-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--line);
}

.account-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.account-name {
  font-size: 13.5px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.account-login {
  font-size: 10.5px;
  color: var(--faint);
}

.account-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 12px;
}

.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 10.5px;
}

.account-row > span:last-child {
  color: var(--ink-soft);
  max-width: 65%;
  text-align: right;
}

.security-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.security-note {
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--muted);
  margin-bottom: 4px;
}

.about-logo {
  display: flex;
  align-items: center;
  gap: 9px;
}

.about-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.about-text {
  margin-top: 10px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--muted);
}

.about-badges {
  display: flex;
  gap: 5px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1050px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

@media (max-width: 760px) {
  .preference-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .setting-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .theme-picker {
    width: 100%;
  }
  .theme-option {
    flex: 1;
    justify-content: center;
  }
}
</style>
