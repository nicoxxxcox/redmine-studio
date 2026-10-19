<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, Loader2, RefreshCw, Settings2 } from 'lucide-vue-next'
import { useSettingsStore } from './stores/settings.js'
import { useSessionStore } from './stores/session.js'
import { useTheme } from './lib/theme.js'
import ToastStack from './components/ToastStack.vue'
import { ApiError } from './lib/api.js'

useTheme()

const settings = useSettingsStore()
const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const booting = ref(settings.configured)
const bootError = ref(null)
const showConnectionError = computed(
  () => Boolean(bootError.value) && !session.ready && route.name !== 'setup',
)

async function boot() {
  if (!settings.configured) {
    booting.value = false
    return
  }
  booting.value = true
  bootError.value = null
  try {
    await session.load({ force: true })
  } catch (error) {
    bootError.value = error
  } finally {
    booting.value = false
  }
}

function configure() {
  bootError.value = null
  router.push({ name: 'setup', query: { edit: '1' } })
}

const isAuthError = () => bootError.value instanceof ApiError && bootError.value.status === 401

onMounted(boot)
</script>

<template>
  <div v-if="booting" class="boot-screen">
    <div class="boot-mark">
      <svg viewBox="0 0 64 64" width="54" height="54">
        <rect width="64" height="64" rx="17" fill="currentColor" opacity=".14" />
        <path d="M23 25h18M23 32h18M23 39h11" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <circle cx="46" cy="46" r="8.5" fill="var(--surface)" stroke="currentColor" stroke-width="3.4" />
        <path d="M46 42.6v3.6l2.7 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </div>
    <p class="boot-title">Redmine<span>Studio</span></p>
    <p class="boot-text"><Loader2 :size="14" class="spin" /> Connexion à votre Redmine…</p>
  </div>

  <div v-else-if="showConnectionError" class="boot-screen">
    <div class="connection-card">
      <div class="connection-icon">
        <KeyRound :size="24" />
      </div>
      <h1 class="connection-title">
        {{ isAuthError() ? 'Clé API refusée' : 'Redmine est injoignable' }}
      </h1>
      <p class="connection-text">
        {{
          isAuthError()
            ? "La clé API enregistrée n'est plus valide, ou l'accès au serveur a changé."
            : bootError?.message || 'Vérifiez votre connexion réseau et les paramètres du serveur.'
        }}
      </p>
      <div class="connection-actions">
        <button class="btn" type="button" @click="configure">
          <Settings2 :size="15" /> Modifier la connexion
        </button>
        <button class="btn btn-primary" type="button" @click="boot">
          <RefreshCw :size="15" /> Réessayer
        </button>
      </div>
      <p v-if="settings.settings.baseUrl" class="connection-url mono">{{ settings.settings.baseUrl }}</p>
    </div>
  </div>

  <RouterView v-else />
  <ToastStack />
</template>

<style scoped>
.boot-screen {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
}

.boot-mark {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  border-radius: 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--accent);
  box-shadow: var(--shadow-md);
  animation: boot-float 2.6s ease-in-out infinite;
}

@keyframes boot-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.boot-title {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.boot-title span {
  color: var(--accent);
}

.boot-text {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
}

.spin {
  animation: spin 0.8s linear infinite;
}

.connection-card {
  width: 100%;
  max-width: 430px;
  padding: 30px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.connection-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 14px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
}

.connection-title {
  font-size: 19px;
  margin-bottom: 7px;
}

.connection-text {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}

.connection-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.connection-url {
  margin-top: 16px;
  font-size: 10.5px;
  color: var(--faint);
  overflow-wrap: anywhere;
}
</style>
