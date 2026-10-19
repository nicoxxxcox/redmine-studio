import { computed, ref, watchEffect } from 'vue'
import { useSettingsStore } from '../stores/settings.js'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const prefersDark = ref(media.matches)
media.addEventListener('change', (event) => {
  prefersDark.value = event.matches
})

export function useTheme() {
  const settings = useSettingsStore()
  const resolved = computed(() => {
    const theme = settings.settings.theme
    if (theme === 'system') return prefersDark.value ? 'dark' : 'light'
    return theme
  })

  watchEffect(() => {
    document.documentElement.dataset.theme = resolved.value
    document.documentElement.style.colorScheme = resolved.value
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved.value === 'dark' ? '#0d0f12' : '#f4f4f0')
  })

  function toggle() {
    settings.setTheme(resolved.value === 'dark' ? 'light' : 'dark')
  }

  return { resolved, toggle }
}
