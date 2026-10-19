export const STATUS_TONES = {
  new: 'blue',
  progress: 'amber',
  feedback: 'violet',
  resolved: 'green',
  closed: 'slate',
  rejected: 'red',
}

/** Associe un statut Redmine à une tonalité visuelle, quel que soit son libellé. */
export function statusTone(status) {
  const name = (status?.name || '').toLowerCase()
  if (status?.is_closed) {
    if (/rejet|refus|reject|cancel|annul/.test(name)) return 'red'
    if (/résolu|resolu|resolved|réglé|regle|fixed|corrig/.test(name)) return 'green'
    return 'slate'
  }
  if (/prog|cours|doing|traitement|encours|wip/.test(name)) return 'amber'
  if (/feedback|retour|attente|wait|review|relecture|test/.test(name)) return 'violet'
  if (/résolu|resolu|resolved|réglé|regle|fixed|corrig|done|termin/.test(name)) return 'green'
  if (/rejet|refus|reject/.test(name)) return 'red'
  if (/nouveau|new|ouvert|open|backlog|à faire|a faire|todo/.test(name)) return 'blue'
  return 'blue'
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
