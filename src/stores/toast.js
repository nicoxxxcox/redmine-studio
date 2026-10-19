import { ref } from 'vue'
import { defineStore } from 'pinia'

let sequence = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function push(message, { type = 'success', duration = 4200, action = null } = {}) {
    const id = ++sequence
    toasts.value.push({ id, message, type, action })
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function success(message, options = {}) {
    return push(message, { type: 'success', ...options })
  }

  function error(message, options = {}) {
    return push(message, { type: 'error', duration: 6500, ...options })
  }

  function info(message, options = {}) {
    return push(message, { type: 'info', ...options })
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return { toasts, push, success, error, info, dismiss }
})
