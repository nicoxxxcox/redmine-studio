const DATE_LOCALE = 'fr-FR'

export function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  // Les dates seules (YYYY-MM-DD) ne doivent pas être interprétées en UTC,
  // sinon un décalage horaire négatif affiche la veille.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value, options = {}) {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date)
}

export function formatDateTime(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDay(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

export function formatShortDay(value) {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
  }).format(date)
}

export function relativeTime(value) {
  const date = parseDate(value)
  if (!date) return '—'
  const diff = date.getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(DATE_LOCALE, { numeric: 'auto' })
  const units = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return "à l'instant"
}

export function toIsoDate(value = new Date()) {
  const date = parseDate(value) || new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfWeek(value = new Date()) {
  const date = parseDate(value) || new Date()
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - day)
  return result
}

export function addDays(value, days) {
  const date = new Date(parseDate(value) || new Date())
  date.setDate(date.getDate() + days)
  return date
}

export function formatHours(hours, { compact = false } = {}) {
  const value = Number(hours) || 0
  if (compact) return `${value.toLocaleString(DATE_LOCALE, { maximumFractionDigits: 2 })} h`
  const totalMinutes = Math.round(value * 60)
  const whole = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!whole && !minutes) return '0 h'
  if (!minutes) return `${whole} h`
  if (!whole) return `${minutes} min`
  return `${whole} h ${String(minutes).padStart(2, '0')}`
}

export function parseHoursInput(input) {
  if (typeof input === 'number') return input
  let normalized = String(input ?? '').trim()
  // Accepte « 1h30 », « 1 h 30 » et « 1:30 » en plus de « 1,5 ».
  const withMinutes = /^(\d+)\s*(?:h|:)\s*(\d{1,2})$/i.exec(normalized)
  if (withMinutes) {
    const minutes = Number(withMinutes[2])
    if (minutes >= 60) return null
    return Math.round((Number(withMinutes[1]) + minutes / 60) * 100) / 100
  }
  normalized = normalized.replace(',', '.').replace(/\s*h\s*$/i, '')
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

const SPRINT_FIELD_PATTERN = /(?:^|[^a-z])(sprints?|it[eé]rations?|cycles?)(?:[^a-z]|$)/i

/**
 * Normalise une valeur de sprint provenant d'un objet d'association
 * (`easy_sprint`, `sprint`…) ou d'un champ personnalisé.
 */
function sprintFromValue(value, label = 'Sprint') {
  if (value === null || value === undefined) return null

  if (Array.isArray(value)) {
    const items = value.map((item) => sprintFromValue(item, label)).filter(Boolean)
    if (!items.length) return null
    return {
      label,
      value: items.map((item) => item.value).join(', '),
      id: items.length === 1 ? items[0].id : undefined,
    }
  }

  if (typeof value === 'object') {
    const id = value.id ?? value.sprint_id
    const name = value.name ?? value.label ?? value.title ?? value.value
    if (id === null || id === undefined || id === '') {
      if (!name) return null
      return { label, value: String(name).trim() }
    }
    return {
      label,
      value: name ? String(name).trim() : `Sprint #${id}`,
      id,
    }
  }

  const text = String(value).trim()
  return text ? { label, value: text } : null
}

/**
 * Récupère le sprint d'un ticket. On privilégie l'association sprint exposée
 * par Redmine / ses plugins (`easy_sprint`, `sprint`…), puis le champ
 * personnalisé « Sprint(s) », et enfin la version cible comme simple libellé
 * de repli (sans identifiant de sprint, car ce n'est pas la même entité).
 */
export function issueSprint(issue) {
  let textSprint = null
  let sprintId = issue?.sprint_id

  // On balaie toutes les propriétés liées au sprint : les plugins utilisent
  // des noms variés (sprint, sprints, easy_sprint, easy_sprint_id…).
  for (const [key, raw] of Object.entries(issue || {})) {
    if (!/sprint/i.test(key)) continue
    if (/sprint.*_id$/i.test(key)) {
      if (sprintId === null || sprintId === undefined || sprintId === '') sprintId = raw
      continue
    }
    if (raw && typeof raw === 'object') {
      const sprint = sprintFromValue(raw)
      if (sprint) return sprint
    } else if (!textSprint) {
      textSprint = sprintFromValue(raw)
    }
  }

  if (sprintId !== null && sprintId !== undefined && sprintId !== '') {
    return {
      label: 'Sprint',
      value: String(issue.sprint_name || textSprint?.value || `Sprint #${sprintId}`).trim(),
      id: sprintId,
    }
  }

  if (textSprint) return textSprint

  const fields = Array.isArray(issue?.custom_fields) ? issue.custom_fields : []
  const field = fields.find((item) => {
    if (!SPRINT_FIELD_PATTERN.test(item?.name || '')) return false
    if (Array.isArray(item.value)) return item.value.some((value) => String(value ?? '').trim())
    return item.value !== null && item.value !== undefined && String(item.value).trim() !== ''
  })
  if (field) {
    const sprint = sprintFromValue(field.value, field.name || 'Sprint')
    if (sprint) return sprint
  }

  // Certaines API exposent la version cible sous `version` ou `target_version`.
  const version = issue?.fixed_version || issue?.version || issue?.target_version
  if (version?.name) {
    return { label: 'Sprint', value: version.name }
  }
  if (typeof version === 'string' && version.trim()) {
    return { label: 'Sprint', value: version.trim() }
  }
  return null
}

/** Version texte courte d'un contenu Textile/Markdown, pour les aperçus. */
export function plainText(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/!([^!]*)!/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/"([^"]+)":(?:https?:\/\/\S+)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} o`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} Ko`
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function fullName(user) {
  if (!user) return 'Inconnu'
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || user.name || user.login || 'Inconnu'
}

export function isOverdue(issue) {
  if (!issue?.due_date) return false
  if (issue.status?.is_closed) return false
  const due = parseDate(`${issue.due_date}T23:59:59`)
  return due ? due.getTime() < Date.now() : false
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Rendu léger et sûr du Textile/Markdown utilisé dans Redmine.
 * Le HTML est échappé avant toute transformation : pas d'injection possible.
 */
export function renderRichText(source = '') {
  if (!source) return ''
  const codeBlocks = []
  const links = []
  let text = String(source).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length
    codeBlocks.push(
      `<pre class="rt-code"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`,
    )
    return `\u0000CODE${index}\u0000`
  })

  // Liens Textile « "libellé":url » : extraits avant l'échappement du HTML.
  text = text.replace(/"([^"\n]+)":(https?:\/\/[^\s"<>]+)/g, (_, label, url) => {
    const index = links.length
    links.push(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        label,
      )}</a>`,
    )
    return `\u0000LINK${index}\u0000`
  })

  // Blocs de code Textile « bc. » / « pre. » (jusqu'à la ligne vide suivante).
  const rawLines = text.split(/\r?\n/)
  const keptLines = []
  for (let index = 0; index < rawLines.length; index += 1) {
    const blockMatch = rawLines[index].match(/^(?:bc|pre)\.{1,2}\s?(.*)$/i)
    if (!blockMatch) {
      keptLines.push(rawLines[index])
      continue
    }
    const code = [blockMatch[1]]
    while (
      index + 1 < rawLines.length &&
      rawLines[index + 1].trim() !== '' &&
      !/^(?:bc|pre)\.{1,2}\s?/i.test(rawLines[index + 1])
    ) {
      code.push(rawLines[index + 1])
      index += 1
    }
    const blockIndex = codeBlocks.length
    codeBlocks.push(
      `<pre class="rt-code"><code>${escapeHtml(
        code.join('\n').replace(/\n+$/, ''),
      )}</code></pre>`,
    )
    keptLines.push(`\u0000CODE${blockIndex}\u0000`)
  }
  text = keptLines.join('\n')

  text = escapeHtml(text)
  text = text.replace(/\r\n/g, '\n')

  // Liens markdown [libellé](url)
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  // Liens bruts
  text = text.replace(
    /(?<!["'=])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  // Références de tickets #123
  text = text.replace(
    /(^|[\s(])(#(\d+))\b/g,
    '$1<a class="issue-ref" href="/issues/$3" data-internal>$2</a>',
  )

  const lines = text.split('\n')
  const html = []
  let listType = null
  let inQuote = false
  let paragraph = []

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.join('<br>')}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }
  const closeQuote = () => {
    if (inQuote) {
      html.push('</blockquote>')
      inQuote = false
    }
  }

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushParagraph()
      closeList()
      closeQuote()
      continue
    }

    // Textile numérote les listes avec « # », ce qui entre en conflit avec les
    // titres Markdown. Un « # » suivi d'un autre élément de liste est donc
    // traité comme une liste ; un « # » isolé reste un titre.
    const nextLine = (lines[lineIndex + 1] || '').trim()
    const hashList =
      /^#\s+\S/.test(line) && (listType === 'ol' || /^#\s+\S/.test(nextLine))

    const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/)
    if (codeMatch) {
      flushParagraph()
      closeList()
      closeQuote()
      html.push(codeBlocks[Number(codeMatch[1])] || '')
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    const textileHeading = line.match(/^h([1-6])\.\s+(.+)$/i)
    if ((heading && !hashList) || textileHeading) {
      flushParagraph()
      closeList()
      closeQuote()
      const level = heading ? heading[1].length : Number(textileHeading[1])
      const content = (heading || textileHeading)[2]
      html.push(`<h${level}>${inline(content)}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph()
      closeList()
      closeQuote()
      html.push('<hr>')
      continue
    }

    const quote = line.match(/^(?:>|&gt;)\s?(.*)$/)
    const textileQuote = line.match(/^bq\.\s?(.*)$/i)
    if (quote || textileQuote) {
      flushParagraph()
      closeList()
      if (!inQuote) {
        html.push('<blockquote>')
        inQuote = true
      }
      html.push(`<p>${inline((quote || textileQuote)[1])}</p>`)
      continue
    }
    closeQuote()

    const bullet = line.match(/^(\s*)[*+-]\s+(.+)$/)
    const numbered = line.match(/^(\s*)(?:\d+[.)]|#)\s+(.+)$/)
    if (bullet || numbered) {
      flushParagraph()
      const wanted = bullet ? 'ul' : 'ol'
      if (listType !== wanted) {
        closeList()
        html.push(`<${wanted}>`)
        listType = wanted
      }
      const match = bullet || numbered
      const indent = (match[1] || '').replace(/\t/g, '  ')
      const level = Math.floor(indent.length / 2) + 1
      const levelAttr = level > 1 ? ` style="--rt-level:${level}"` : ''
      html.push(`<li${levelAttr}>${inline(match[2])}</li>`)
      continue
    }
    closeList()

    paragraph.push(inline(line))
  }

  flushParagraph()
  closeList()
  closeQuote()

  let output = html.join('\n')
  if (links.length) {
    output = output.replace(/\u0000LINK(\d+)\u0000/g, (_, index) => links[Number(index)] || '')
  }
  return output
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/@([^@\n]+)@/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Textile : *gras* (le Markdown italique reste disponible via _…_).
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
}
