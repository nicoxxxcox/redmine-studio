<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
  Ticket,
  TriangleAlert,
  Wifi,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings.js'
import { useSessionStore } from '../stores/session.js'
import { useTheme } from '../lib/theme.js'
import { RedmineApi, ApiError } from '../lib/api.js'
import { fullName } from '../lib/format.js'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()
const session = useSessionStore()
const { resolved, toggle } = useTheme()

const form = reactive({
  baseUrl: settings.settings.baseUrl || '',
  apiKey: settings.settings.apiKey || '',
  rememberKey: settings.settings.rememberKey !== false,
})

const showKey = ref(false)
const testing = ref(false)
const saving = ref(false)
const testUser = ref(null)
const error = ref('')
let testSequence = 0

const isEditing = computed(() => Boolean(route.query.edit) || settings.configured)
const accountUrl = computed(() => {
  const base = settings.normalizeBaseUrl(form.baseUrl)
  return base ? `${base}/my/account` : ''
})

watch(
  () => [form.baseUrl, form.apiKey],
  () => {
    testSequence += 1
    testing.value = false
    testUser.value = null
    error.value = ''
  },
)

function validate() {
  const base = settings.normalizeBaseUrl(form.baseUrl)
  if (!base) return 'Renseignez l’URL de votre Redmine.'
  try {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol)) return 'L’URL doit commencer par http:// ou https://.'
  } catch {
    return 'Cette URL ne semble pas valide.'
  }
  if (!form.apiKey.trim()) return 'Renseignez votre clé d’accès API.'
  return ''
}

async function testConnection() {
  const invalid = validate()
  if (invalid) {
    error.value = invalid
    return null
  }
  error.value = ''
  testing.value = true
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
    error.value =
      err instanceof ApiError
        ? err.message
        : 'Connexion impossible. Vérifiez l’URL, la clé et le réseau.'
    return null
  } finally {
    if (sequence === testSequence) testing.value = false
  }
}

async function submit() {
  const invalid = validate()
  if (invalid) {
    error.value = invalid
    return
  }
  if (!testUser.value) {
    const user = await testConnection()
    if (!user) return
  }

  saving.value = true
  error.value = ''
  try {
    settings.setConnection({
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      rememberKey: form.rememberKey,
    })
    await session.load({ force: true })
    router.push({ name: 'dashboard' })
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : 'Connexion établie, mais le chargement des données a échoué.'
  } finally {
    saving.value = false
  }
}

function back() {
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="setup">
    <aside class="setup-brand">
      <div class="brand-orb brand-orb-1"></div>
      <div class="brand-orb brand-orb-2"></div>

      <div class="setup-brand-top">
        <span class="setup-logo">
          <svg viewBox="0 0 64 64" width="32" height="32">
            <rect width="64" height="64" rx="17" fill="currentColor" opacity=".18" />
            <path d="M23 25h18M23 32h18M23 39h11" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
            <circle cx="46" cy="46" r="8.5" fill="#14171c" stroke="currentColor" stroke-width="3.4" />
            <path d="M46 42.6v3.6l2.7 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </span>
        <span class="setup-logo-text">Redmine<span>Studio</span></span>
      </div>

      <div class="setup-brand-body">
        <p class="setup-kicker">L'interface qui manquait à Redmine</p>
        <h1>Vos tickets.<br />Vos temps.<br /><em>Sans friction.</em></h1>
        <p class="setup-lead">
          Une console rapide et lisible pour traiter vos tickets, commenter et saisir votre temps —
          connectée directement à votre instance Redmine.
        </p>

        <ul class="setup-features">
          <li>
            <span class="feature-icon"><Ticket :size="16" /></span>
            <div>
              <strong>Tickets au centre</strong>
              <span>Liste filtrée, détails, statuts et commentaires.</span>
            </div>
          </li>
          <li>
            <span class="feature-icon"><Clock3 :size="16" /></span>
            <div>
              <strong>Temps simplifié</strong>
              <span>Saisissez et ajustez votre temps directement sur chaque ticket.</span>
            </div>
          </li>
          <li>
            <span class="feature-icon"><ShieldCheck :size="16" /></span>
            <div>
              <strong>Connexion directe</strong>
              <span>Votre clé API reste dans votre navigateur.</span>
            </div>
          </li>
        </ul>
      </div>

      <div class="setup-brand-foot">
        <span class="setup-compat"><span class="live-dot"></span> Compatible Redmine 3.4+</span>
        <span class="setup-version">v1.0</span>
      </div>
    </aside>

    <main class="setup-main">
      <div class="setup-top">
        <button v-if="isEditing && session.ready" class="btn btn-ghost btn-sm" type="button" @click="back">
          ← Retour
        </button>
        <span v-else></span>
        <button
          class="btn btn-ghost btn-icon"
          type="button"
          :title="resolved === 'dark' ? 'Thème clair' : 'Thème sombre'"
          @click="toggle"
        >
          <Sun v-if="resolved === 'dark'" :size="17" />
          <Moon v-else :size="17" />
        </button>
      </div>

      <div class="setup-card">
        <div class="setup-step">
          <span class="step-dot"></span>
          {{ isEditing ? 'Connexion' : 'Bienvenue' }}
        </div>
        <h2 class="setup-title">
          {{ isEditing ? 'Mettez à jour votre connexion' : 'Connectez votre Redmine' }}
        </h2>
        <p class="setup-subtitle">
          Deux informations suffisent. Vous pourrez les modifier à tout moment depuis les
          paramètres.
        </p>

        <form class="setup-form" @submit.prevent="submit">
          <div class="field">
            <label class="field-label" for="setup-url">URL de votre Redmine</label>
            <div class="input-group">
              <Wifi :size="15" />
              <input
                id="setup-url"
                v-model="form.baseUrl"
                class="input"
                type="url"
                placeholder="https://redmine.mon-entreprise.fr"
                autocomplete="url"
                spellcheck="false"
                required
                autofocus
              />
            </div>
            <span class="field-hint">Sous-dossier accepté : https://exemple.fr/redmine</span>
          </div>

          <div class="field">
            <label class="field-label" for="setup-key">Clé d'accès API</label>
            <div class="input-group">
              <KeyRound :size="15" />
              <input
                id="setup-key"
                v-model="form.apiKey"
                class="input key-input"
                :type="showKey ? 'text' : 'password'"
                placeholder="Votre clé API Redmine"
                autocomplete="off"
                spellcheck="false"
                required
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
            <span class="field-hint">
              Disponible dans
              <a v-if="accountUrl" :href="accountUrl" target="_blank" rel="noopener noreferrer">
                Mon compte → Clé d'accès API
              </a>
              <span v-else>Mon compte → Clé d'accès API</span>
              (colonne de droite).
            </span>
          </div>

          <label class="checkbox remember-check">
            <input v-model="form.rememberKey" type="checkbox" />
            Mémoriser la clé sur cet appareil
            <span class="faint">(stockage local du navigateur)</span>
          </label>

          <div v-if="testUser" class="test-result is-success">
            <CheckCircle2 :size="18" />
            <div>
              <p class="strong">Connexion réussie</p>
              <p class="text-sm">
                Connecté en tant que {{ fullName(testUser) }}
                <span v-if="testUser.login" class="faint">(@{{ testUser.login }})</span>
              </p>
            </div>
          </div>

          <div v-if="error" class="test-result is-error" role="alert">
            <TriangleAlert :size="18" />
            <div>
              <p class="strong">Connexion impossible</p>
              <p class="text-sm">{{ error }}</p>
              <p class="text-xs test-hint">
                Si Redmine bloque les requêtes (CORS), lancez l'application avec
                <code>npm run dev</code> ou <code>npm start</code> : le proxy local intégré s'en
                occupe.
              </p>
            </div>
          </div>

          <div class="setup-actions">
            <button class="btn btn-lg" type="submit" :disabled="testing || saving">
              <Loader2 v-if="saving || testing" :size="16" class="spin" />
              <LockKeyhole v-else :size="16" />
              {{ testing ? 'Test en cours…' : saving ? 'Connexion…' : 'Se connecter' }}
            </button>
            <button
              class="btn btn-lg btn-ghost"
              type="button"
              :disabled="testing || saving"
              @click="testConnection"
            >
              <Loader2 v-if="testing" :size="15" class="spin" />
              Tester la connexion
            </button>
          </div>
        </form>

        <div class="setup-security">
          <ShieldCheck :size="15" />
          <p>
            Votre clé API n'est envoyée qu'à votre Redmine via le proxy de l'application. Elle
            n'est jamais transmise à un service tiers.
          </p>
        </div>
      </div>

      <p class="setup-foot">
        Pas de configuration serveur nécessaire — le proxy local intégré contourne les limitations
        CORS de Redmine 3.4.
      </p>
    </main>
  </div>
</template>

<style scoped>
.setup {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(380px, 0.9fr) minmax(480px, 1.1fr);
  min-height: 100vh;
  background: var(--bg);
}

.setup-brand {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 34px 42px 28px;
  background: #14171c;
  color: #f1f2f4;
  overflow: hidden;
}

.setup-brand::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: radial-gradient(ellipse 90% 70% at 30% 30%, #000, transparent 75%);
  pointer-events: none;
}

.brand-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}

.brand-orb-1 {
  width: 320px;
  height: 320px;
  right: -80px;
  top: 12%;
  background: rgba(232, 85, 47, 0.28);
}

.brand-orb-2 {
  width: 260px;
  height: 260px;
  left: -100px;
  bottom: -60px;
  background: rgba(115, 80, 183, 0.22);
}

.setup-brand-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.setup-logo {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  color: #ff7a55;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.setup-logo-text {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.setup-logo-text span {
  color: #ff7a55;
}

.setup-brand-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 520px;
  padding: 40px 0;
}

.setup-kicker {
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.48);
  margin-bottom: 18px;
}

.setup-brand-body h1 {
  font-size: clamp(34px, 4vw, 52px);
  line-height: 1.06;
  font-weight: 620;
  letter-spacing: -0.045em;
  color: #fff;
}

.setup-brand-body h1 em {
  font-style: normal;
  color: #ff7a55;
}

.setup-lead {
  max-width: 410px;
  margin-top: 22px;
  font-size: 13.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.55);
}

.setup-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 17px;
  margin-top: 38px;
}

.setup-features li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.feature-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #ff9a7d;
}

.setup-features strong {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.setup-features span:last-child {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
}

.setup-brand-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.4);
}

.setup-compat {
  display: flex;
  align-items: center;
  gap: 7px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4bd3a4;
  box-shadow: 0 0 0 3px rgba(75, 211, 164, 0.14);
}

.setup-version {
  font-family: var(--font-mono);
}

.setup-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 48px;
  min-width: 0;
}

.setup-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 470px;
  height: 44px;
  margin-bottom: 8px;
}

.setup-card {
  width: 100%;
  max-width: 470px;
  padding: 34px 36px 28px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}

.setup-step {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 3px 10px 3px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.step-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.setup-title {
  margin-top: 14px;
  font-size: 25px;
  letter-spacing: -0.035em;
}

.setup-subtitle {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}

.setup-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 24px;
}

.key-input {
  padding-right: 38px;
}

.remember-check {
  font-size: 11.5px;
  flex-wrap: wrap;
  row-gap: 2px;
}

.test-result {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 11px 13px;
  border-radius: var(--radius);
  font-size: 12px;
}

.test-result.is-success {
  background: var(--green-soft);
  color: var(--green);
}

.test-result.is-error {
  background: var(--red-soft);
  color: var(--red);
}

.test-result .strong {
  font-size: 12px;
  margin-bottom: 2px;
}

.test-result p:not(.strong) {
  color: var(--ink-soft);
  line-height: 1.5;
}

.test-hint {
  margin-top: 5px;
  color: var(--muted) !important;
}

.test-hint code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--surface);
}

.setup-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}

.setup-actions .btn-lg {
  width: 100%;
}

.setup-security {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--faint);
}

.setup-security svg {
  flex: none;
  margin-top: 2px;
}

.setup-security p {
  font-size: 10.5px;
  line-height: 1.55;
}

.setup-foot {
  max-width: 470px;
  margin-top: 16px;
  text-align: center;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--faint);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 1000px) {
  .setup {
    grid-template-columns: 1fr;
  }
  .setup-brand {
    display: none;
  }
  .setup-main {
    padding: 24px 20px;
    justify-content: flex-start;
    padding-top: 8vh;
  }
}

@media (max-width: 560px) {
  .setup-main {
    padding: 16px 14px 40px;
  }
  .setup-card {
    padding: 24px 20px;
  }
}
</style>
