/** Normalise une liste d'identifiants de favoris en nombres uniques. */
export function normalizeFavoriteIds(value) {
  if (!Array.isArray(value)) return []
  const ids = value
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
  return [...new Set(ids)]
}

/**
 * Restreint une liste d'options aux favoris lorsque la catégorie en contient.
 * Sans favori, tous les éléments restent disponibles.
 */
export function filterByFavorites(options, favoriteIds) {
  const ids = normalizeFavoriteIds(favoriteIds)
  if (!ids.length) return options
  const allowed = new Set(ids)
  return options.filter((option) => allowed.has(Number(option.id)))
}

/**
 * Conserve l'élément actuellement sélectionné même s'il ne fait pas partie des
 * favoris, pour ne pas casser un lien ou un filtre déjà actif.
 */
export function withSelectedOption(options, allOptions, selectedId) {
  if (!/^\d+$/.test(String(selectedId || ''))) return options
  const id = Number(selectedId)
  if (!id || options.some((option) => Number(option.id) === id)) return options
  const selected = allOptions.find((option) => Number(option.id) === id)
  return selected ? [selected, ...options] : options
}
