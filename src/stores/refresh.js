import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useRefreshStore = defineStore('refresh', () => {
  const timeVersion = ref(0)
  const issueVersion = ref(0)

  function bumpTime() {
    timeVersion.value += 1
  }

  function bumpIssue() {
    issueVersion.value += 1
  }

  return { timeVersion, issueVersion, bumpTime, bumpIssue }
})
