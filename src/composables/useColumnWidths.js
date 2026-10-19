import { computed, ref } from 'vue'

const STORAGE_PREFIX = 'redmine-studio:column-widths:'

/**
 * Gère des largeurs de colonnes personnalisées et persistantes (localStorage).
 *
 * - `defaults` : valeur CSS de `grid-template-columns` tant que rien n'est personnalisé.
 * - `count` : nombre de colonnes du tableau.
 * - `cells` : fonction renvoyant les cellules d'en-tête, dans l'ordre des colonnes.
 *   Elles servent à mesurer les largeurs réelles avant le premier redimensionnement.
 */
export function useColumnWidths(key, { defaults, count, cells, min = 48 }) {
  const storageKey = STORAGE_PREFIX + key
  const widths = ref(load())

  function load() {
    try {
      if (typeof localStorage === 'undefined') return null
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length !== count) return null
      if (!parsed.every((width) => Number.isFinite(width) && width >= 24)) return null
      return parsed.map((width) => Math.round(width))
    } catch {
      return null
    }
  }

  const isCustom = computed(() => Array.isArray(widths.value))

  const template = computed(() =>
    widths.value
      ? widths.value.map((width) => `${width}px`).join(' ')
      : defaults,
  )

  function currentCells() {
    return (cells?.() ?? []).filter(
      (cell) => cell && cell.getBoundingClientRect().width > 0,
    )
  }

  function measure(list) {
    return list.map((cell) => Math.round(cell.getBoundingClientRect().width))
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths.value))
    } catch {
      /* stockage local indisponible : les largeurs restent valables pour la session */
    }
  }

  function ensureWidths(list) {
    if (!widths.value) widths.value = measure(list)
    return widths.value
  }

  function beginDrag(event, index) {
    if (event.button !== undefined && event.button !== 0) return
    const list = currentCells()
    if (list.length !== count) return

    const start = (widths.value ?? measure(list)).slice()
    const startX = event.clientX
    let moved = false
    document.body.classList.add('is-resizing-columns')

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      if (Math.abs(delta) < 1) return
      moved = true
      const next = start.slice()
      next[index] = Math.max(min, Math.round(start[index] + delta))
      widths.value = next
    }

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('blur', onEnd)
      document.body.classList.remove('is-resizing-columns')
      if (moved) persist()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('blur', onEnd)
  }

  function nudge(index, delta) {
    const list = currentCells()
    if (list.length !== count) return
    const next = ensureWidths(list).slice()
    next[index] = Math.max(min, Math.round(next[index] + delta))
    widths.value = next
    persist()
  }

  function reset() {
    widths.value = null
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* noop */
    }
  }

  return { widths, template, isCustom, beginDrag, nudge, reset }
}
