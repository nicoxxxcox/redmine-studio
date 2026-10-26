/**
 * Conversion de la sortie d'un éditeur contenteditable vers du Textile,
 * le format utilisé par Redmine (3.4). Le rendu inverse est assuré par
 * `renderRichText` dans `format.js` : les deux fonctions se répondent pour
 * préserver la mise en forme lors des allers-retours édition / affichage.
 */

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'hr',
  'table',
  'section',
  'article',
  'header',
  'footer',
  'address',
  'figure',
])

function tagName(node) {
  return node?.nodeType === 1 ? node.tagName.toLowerCase() : ''
}

function isBlock(node) {
  return BLOCK_TAGS.has(tagName(node))
}

function clean(value) {
  return String(value ?? '')
    .replace(/\u200b/g, '')
    .replace(/\u00a0/g, ' ')
}

/** Encadre un contenu en gardant les espaces à l'extérieur des marqueurs. */
function wrap(marker, value) {
  const text = clean(value)
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match || !match[2]) return text
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`
}

/** Sérialise un fragment inline (texte, gras, italique, code, liens…). */
export function inlineToTextile(node) {
  if (!node) return ''
  if (node.nodeType === 3) return clean(node.nodeValue)
  if (node.nodeType !== 1) return ''

  const tag = tagName(node)
  const inner = () => Array.from(node.childNodes).map(inlineToTextile).join('')

  switch (tag) {
    case 'br':
      return '\n'
    case 'strong':
    case 'b':
      return wrap('*', inner())
    case 'em':
    case 'i':
      return wrap('_', inner())
    case 'del':
    case 's':
    case 'strike':
      return wrap('~~', inner())
    case 'code':
      return wrap('@', inner().replace(/\n+/g, ' '))
    case 'span': {
      if (node.classList?.contains('rt-image-ref')) {
        const filename = node.getAttribute('data-filename') || ''
        return filename ? `!${filename}!` : ''
      }
      return inner()
    }
    case 'a': {
      const href = node.getAttribute('href') || ''
      const label = inner()
      if (!href) return label
      // Références internes créées par renderRichText : on conserve « #123 ».
      if (node.hasAttribute('data-internal') || /^\/issues\/\d+$/.test(href)) return label
      if (label.trim() === href.trim()) return href
      return `"${label.replace(/"/g, '')}":${href}`
    }
    case 'img': {
      const src = node.getAttribute('src') || ''
      return src ? `!${src}!` : ''
    }
    default:
      return inner()
  }
}

function inlineChildren(node) {
  return Array.from(node.childNodes)
    .map(inlineToTextile)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

function listToTextile(list, depth) {
  const marker = tagName(list) === 'ol' ? '#' : '*'
  const indent = '  '.repeat(depth)
  const lines = []

  for (const item of Array.from(list.children)) {
    if (tagName(item) !== 'li') continue

    const inlineParts = []
    const nested = []
    for (const child of Array.from(item.childNodes)) {
      if (tagName(child) === 'ul' || tagName(child) === 'ol') {
        nested.push(child)
      } else if (isBlock(child)) {
        inlineParts.push(blockToTextile(child, depth + 1))
      } else {
        inlineParts.push(inlineToTextile(child))
      }
    }

    const text = inlineParts.join(' ').replace(/\s+/g, ' ').trim()
    lines.push(`${indent}${marker} ${text}`.trimEnd())

    for (const sub of nested) {
      const subText = listToTextile(sub, depth + 1)
      if (subText) lines.push(subText)
    }
  }

  return lines.join('\n')
}

function blockquoteToTextile(node) {
  const blocks = []
  let buffer = []
  const flush = () => {
    const text = inlineChildren({ childNodes: buffer })
    if (text) blocks.push(text)
    buffer = []
  }

  for (const child of Array.from(node.childNodes)) {
    if (isBlock(child)) {
      flush()
      const block = blockToTextile(child, 0)
      if (block) blocks.push(block)
    } else {
      buffer.push(child)
    }
  }
  flush()

  return blocks
    .map((block) =>
      block
        .split('\n')
        .map((line) => `bq. ${line}`)
        .join('\n'),
    )
    .join('\n\n')
}

function codeToTextile(node) {
  const code = clean(node.innerText ?? node.textContent ?? '').replace(/\n+$/, '')
  if (!code) return ''
  return code
    .split(/\n{2,}/)
    .map((group) => `bc. ${group}`)
    .join('\n\n')
}

function tableToTextile(node) {
  const rows = []
  for (const tr of Array.from(node.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children).map((cell) =>
      inlineChildren(cell).replace(/\n+/g, ' '),
    )
    rows.push(`| ${cells.join(' | ')} |`)
  }
  return rows.join('\n')
}

function blockChildrenToTextile(node, depth) {
  const blocks = []
  let buffer = []
  const flush = () => {
    const text = inlineChildren({ childNodes: buffer })
    if (text) blocks.push(text)
    buffer = []
  }

  for (const child of Array.from(node.childNodes)) {
    if (isBlock(child)) {
      flush()
      const block = blockToTextile(child, depth)
      if (block) blocks.push(block)
    } else {
      buffer.push(child)
    }
  }
  flush()

  return blocks.join('\n\n')
}

function blockToTextile(node, depth) {
  const tag = tagName(node)

  switch (tag) {
    case 'p':
    case 'div':
      return inlineChildren(node)
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `h${tag[1]}. ${inlineChildren(node)}`.trimEnd()
    case 'ul':
    case 'ol':
      return listToTextile(node, depth)
    case 'blockquote':
      return blockquoteToTextile(node)
    case 'pre':
      return codeToTextile(node)
    case 'hr':
      return '---'
    case 'table':
      return tableToTextile(node)
    default:
      if (node.querySelector('ul, ol, p, blockquote, pre, table')) {
        return blockChildrenToTextile(node, depth)
      }
      return inlineChildren(node)
  }
}

/** Convertit le contenu d'un contenteditable en source Textile. */
export function domToTextile(root) {
  if (!root) return ''
  const blocks = []
  let buffer = []
  const flush = () => {
    const text = inlineChildren({ childNodes: buffer })
    if (text) blocks.push(text)
    buffer = []
  }

  for (const child of Array.from(root.childNodes)) {
    if (isBlock(child)) {
      flush()
      const block = blockToTextile(child, 0)
      if (block) blocks.push(block)
    } else {
      buffer.push(child)
    }
  }
  flush()

  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
}
