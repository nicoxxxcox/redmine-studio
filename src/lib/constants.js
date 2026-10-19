const STATUS_HUE_OFFSET = 205
const FALLBACK_HUE_STEP = 47
const MIN_HUE_GAP = 24

/** Teinte de référence d'un statut, choisie d'après son libellé et son état. */
function preferredStatusHue(status) {
  const name = (status?.name || '').toLowerCase()
  if (/rejet|refus|reject|cancel|annul|dupliqu|irreproduct|non reproduct|abandon/.test(name)) {
    return 4
  }
  if (/résolu|resolu|resolved|réglé|regle|fixed|corrig|termin|termine|done|livr/.test(name)) {
    return 150
  }
  if (status?.is_closed) return 250
  if (/prog|cours|doing|traitement|encours|wip/.test(name)) return 36
  if (/feedback|retour|attente|wait|review|relecture|test|vérif|verif|valid/.test(name)) {
    return 275
  }
  if (/nouveau|new|ouvert|open|backlog|à faire|a faire|todo|planifi/.test(name)) {
    return STATUS_HUE_OFFSET
  }
  return STATUS_HUE_OFFSET
}

function hueDistance(a, b) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Construit une teinte unique pour chaque statut.
 *
 * La teinte de référence reste fidèle au sens du statut (rouge pour un rejet,
 * vert pour un statut résolu, ambre pour un statut en cours…). Si deux statuts
 * partagent la même référence, les suivants sont décalés jusqu'à obtenir une
 * couleur réellement distincte des précédentes.
 */
function buildStatusHueMap(statuses) {
  const map = new Map()
  const used = []
  const minGap = Math.max(
    8,
    Math.min(MIN_HUE_GAP, Math.floor(280 / Math.max(statuses.length, 1))),
  )

  for (const status of statuses) {
    const id = Number(status?.id)
    if (!Number.isFinite(id)) continue

    const base = preferredStatusHue(status)
    let hue = base
    let attempt = 0
    while (
      used.some((existing) => hueDistance(existing, hue) < minGap) &&
      attempt < 360
    ) {
      attempt += 1
      hue = Math.round((base + attempt * FALLBACK_HUE_STEP) % 360)
    }

    // Si l'espace est saturé, on choisit la teinte libre la plus éloignée.
    if (attempt >= 360) {
      let bestHue = hue
      let bestGap = -1
      for (let candidate = 0; candidate < 360; candidate += 1) {
        if (used.includes(candidate)) continue
        const gap = used.reduce(
          (minimum, existing) => Math.min(minimum, hueDistance(existing, candidate)),
          360,
        )
        if (gap > bestGap) {
          bestGap = gap
          bestHue = candidate
        }
      }
      hue = bestHue
    }

    // Sécurité : garantit l'unicité même dans un cas extrême.
    let guard = 0
    while (used.includes(hue) && guard < 360) {
      hue = (hue + 1) % 360
      guard += 1
    }

    used.push(hue)
    map.set(id, hue)
  }

  return map
}

const hueMapCache = new WeakMap()

function getStatusHueMap(statuses) {
  let map = hueMapCache.get(statuses)
  if (!map) {
    map = buildStatusHueMap(statuses)
    hueMapCache.set(statuses, map)
  }
  return map
}

/**
 * Attribue une teinte distincte à chaque statut, y compris lorsque plusieurs
 * statuts partagent le même sens (plusieurs statuts fermés, par exemple).
 */
export function statusHue(status, statuses = []) {
  if (!status) return null

  const id = Number(status?.id)
  const list = Array.isArray(statuses) ? statuses : []

  if (list.length && Number.isFinite(id)) {
    const hue = getStatusHueMap(list).get(id)
    if (hue !== undefined) return hue
  }

  return preferredStatusHue(status)
}

export function priorityTone(priority) {
  const name = (priority?.name || '').toLowerCase()
  if (/immédiat|immediat|urgent|bloqu|critical|critique/.test(name)) return 'red'
  if (/haut|high|élevé|eleve|major/.test(name)) return 'orange'
  if (/bas|low|mineur|minor|faible/.test(name)) return 'slate'
  if (/normal|moyen|medium/.test(name)) return 'blue'
  return 'slate'
}

const AVATAR_COLORS = [
  ['#fde8e2', '#b33a1f'],
  ['#e3f2ec', '#176b4d'],
  ['#e8ecfb', '#324c9c'],
  ['#fbf1dc', '#8a5a10'],
  ['#f2e8fb', '#6b3fa0'],
  ['#e2f2f7', '#14647a'],
  ['#fbe7f0', '#96315f'],
  ['#ecebe6', '#57534e'],
]

export function avatarColors(name = '') {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export const SORT_OPTIONS = [
  { value: 'updated_on:desc', label: 'Dernière activité' },
  { value: 'created_on:desc', label: 'Plus récents' },
  { value: 'priority:desc,updated_on:desc', label: 'Priorité' },
  { value: 'due_date:asc', label: 'Échéance' },
  { value: 'subject:asc', label: 'Sujet (A→Z)' },
]

export const PAGE_SIZE = 50
