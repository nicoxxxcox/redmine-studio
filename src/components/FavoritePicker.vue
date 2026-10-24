<script setup>
import { computed, ref } from 'vue'
import { Check, Loader2, Search, X } from 'lucide-vue-next'
import { normalizeFavoriteIds } from '../lib/favorites.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  searchable: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  loadingLabel: { type: String, default: 'Chargement…' },
  emptyLabel: { type: String, default: 'Aucun élément disponible.' },
  searchPlaceholder: { type: String, default: 'Rechercher…' },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const selectedIds = computed(() => new Set(normalizeFavoriteIds(props.modelValue)))

const optionMap = computed(
  () => new Map(props.options.map((option) => [Number(option.id), option])),
)

const selectedOptions = computed(() =>
  normalizeFavoriteIds(props.modelValue).map(
    (id) => optionMap.value.get(id) || { id, label: `#${id}`, missing: true },
  ),
)

function fold(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim()
}

const filteredOptions = computed(() => {
  const term = fold(query.value)
  if (!term) return props.options
  return props.options.filter((option) =>
    fold(`${option.label || ''} ${option.meta || ''} ${option.search || ''}`).includes(term),
  )
})

function toggle(id) {
  const next = new Set(selectedIds.value)
  const numericId = Number(id)
  if (next.has(numericId)) next.delete(numericId)
  else next.add(numericId)
  emit('update:modelValue', [...next])
}

function remove(id) {
  const next = new Set(selectedIds.value)
  next.delete(Number(id))
  emit('update:modelValue', [...next])
}

function clear() {
  emit('update:modelValue', [])
}
</script>

<template>
  <div class="favorite-picker">
    <div v-if="selectedOptions.length" class="favorite-selected">
      <span
        v-for="option in selectedOptions"
        :key="option.id"
        class="favorite-chip"
        :class="{ 'is-missing': option.missing }"
      >
        <slot name="chip" :option="option">{{ option.label }}</slot>
        <button
          class="favorite-chip-remove"
          type="button"
          :aria-label="`Retirer ${option.label}`"
          @click="remove(option.id)"
        >
          <X :size="10" />
        </button>
      </span>
    </div>

    <div v-if="searchable" class="favorite-search input-group">
      <Search :size="14" />
      <input
        v-model="query"
        class="input"
        type="search"
        :placeholder="searchPlaceholder"
        autocomplete="off"
      />
      <button
        v-if="query"
        class="favorite-search-clear"
        type="button"
        aria-label="Effacer la recherche"
        @click="query = ''"
      >
        <X :size="12" />
      </button>
    </div>

    <div class="favorite-list" role="group">
      <label
        v-for="option in filteredOptions"
        :key="option.id"
        class="favorite-option"
        :class="{ 'is-selected': selectedIds.has(Number(option.id)) }"
      >
        <input
          type="checkbox"
          :checked="selectedIds.has(Number(option.id))"
          :aria-label="option.label"
          @change="toggle(option.id)"
        />
        <span class="favorite-check" aria-hidden="true">
          <Check v-if="selectedIds.has(Number(option.id))" :size="11" />
        </span>
        <span class="favorite-option-content">
          <slot name="option" :option="option">
            <span class="favorite-option-label">{{ option.label }}</span>
            <span v-if="option.meta" class="favorite-option-meta">{{ option.meta }}</span>
          </slot>
        </span>
      </label>

      <p v-if="!filteredOptions.length && !loading" class="favorite-empty">
        {{ query ? 'Aucun résultat pour cette recherche.' : emptyLabel }}
      </p>

      <p v-if="loading" class="favorite-loading">
        <Loader2 :size="13" class="spin" />
        {{ loadingLabel }}
      </p>
    </div>

    <footer class="favorite-picker-foot">
      <span>
        {{ selectedOptions.length }} sélectionné{{ selectedOptions.length > 1 ? 's' : '' }}
      </span>
      <button v-if="selectedOptions.length" class="favorite-clear" type="button" @click="clear">
        Tout effacer
      </button>
    </footer>
  </div>
</template>

<style scoped>
.favorite-picker {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.favorite-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.favorite-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 5px 0 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--line));
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 13px;
  font-weight: 550;
}

.favorite-chip.is-missing {
  border-style: dashed;
  color: var(--muted);
}

.favorite-chip-remove {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--faint);
}

.favorite-chip-remove:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--ink);
}

.favorite-search .input {
  padding-right: 31px;
}

.favorite-search-clear {
  position: absolute;
  right: 5px;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--faint);
}

.favorite-search-clear:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.favorite-list {
  max-height: 238px;
  overflow-y: auto;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.favorite-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 7px;
  border-radius: 7px;
  cursor: pointer;
}

.favorite-option:hover {
  background: var(--surface);
}

.favorite-option.is-selected {
  background: var(--surface);
}

.favorite-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.favorite-check {
  display: grid;
  place-items: center;
  flex: none;
  width: 15px;
  height: 15px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--surface);
  color: var(--accent-ink);
}

.favorite-option.is-selected .favorite-check {
  border-color: var(--accent);
  background: var(--accent);
}

.favorite-option:has(input:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--accent) 42%, transparent);
  outline-offset: -2px;
}

.favorite-option-content {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
  font-size: 14px;
  color: var(--ink-soft);
}

.favorite-option.is-selected .favorite-option-content {
  color: var(--ink);
}

.favorite-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-option-meta {
  margin-left: auto;
  flex: none;
  color: var(--faint);
  font-size: 12px;
}

.favorite-empty,
.favorite-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  color: var(--muted);
  font-size: 13.5px;
  text-align: center;
}

.favorite-picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  color: var(--faint);
  font-size: 12.5px;
}

.favorite-clear {
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
}

.favorite-clear:hover {
  background: var(--accent-soft);
}

.spin {
  animation: spin 0.8s linear infinite;
}
</style>
