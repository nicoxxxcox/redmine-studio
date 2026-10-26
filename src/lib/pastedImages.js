let pasteSequence = 0

const PASTED_IMAGE_REFERENCE = /!image-collee-[^!\n]+!/gi

function pastedImageName(type, index = 0) {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    String(now.getMilliseconds()).padStart(3, '0'),
  ].join('')
  const subtype = (type.split('/')[1] || 'png').toLowerCase()
  const extension =
    subtype === 'jpeg'
      ? 'jpg'
      : subtype === 'svg+xml'
        ? 'svg'
        : subtype.replace(/[^a-z0-9]/g, '')
  pasteSequence += 1
  return `image-collee-${stamp}-${pasteSequence}${index ? `-${index + 1}` : ''}.${extension || 'png'}`
}

/**
 * Récupère les images présentes dans le presse-papiers d'un événement `paste`
 * et leur donne un nom de fichier stable, lisible et unique.
 */
export function clipboardImageFiles(event) {
  const data = event?.clipboardData
  if (!data) return []

  const itemFiles = Array.from(data.items || [])
    .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  const files = itemFiles.length
    ? itemFiles
    : Array.from(data.files || []).filter((file) => file.type?.startsWith('image/'))

  return files.map((file, index) => {
    const type = file.type || 'image/png'
    return new File([file], pastedImageName(type, index), {
      type,
      lastModified: Date.now(),
    })
  })
}

/** Les fichiers collés ne survivent pas à un rechargement du brouillon. */
export function hasPastedImageReferences(value) {
  return new RegExp(PASTED_IMAGE_REFERENCE.source, 'i').test(String(value || ''))
}

export function stripPastedImageReferences(value) {
  return String(value || '')
    .replace(PASTED_IMAGE_REFERENCE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
