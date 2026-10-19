const PREFIX = '/api/redmine'

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], path = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.path = path
  }
}

/**
 * Client minimal pour l'API REST Redmine 3.4.
 * Toutes les requêtes passent par le proxy same-origin (server/proxy.mjs).
 */
export class RedmineApi {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '')
    this.apiKey = apiKey || ''
  }

  headers(extra = {}) {
    const headers = {
      'X-Redmine-Base': encodeURIComponent(this.baseUrl),
      Accept: 'application/json',
      ...extra,
    }
    if (this.apiKey) headers['X-Redmine-API-Key'] = this.apiKey
    return headers
  }

  async request(path, { method = 'GET', query, body, signal, headers } = {}) {
    let url = PREFIX + (path.startsWith('/') ? path : `/${path}`)
    if (query) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue
        params.append(key, String(value))
      }
      const qs = params.toString()
      if (qs) url += `?${qs}`
    }

    let response
    try {
      response = await fetch(url, {
        method,
        signal,
        headers: this.headers({
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        }),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new ApiError(
        'Impossible de contacter le proxy local. Vérifiez que le serveur est démarré.',
        { path },
      )
    }

    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (response.ok && typeof data === 'string') {
      throw new ApiError(
        "Le serveur a renvoyé une réponse inattendue. Vérifiez l'URL de votre Redmine.",
        { status: response.status, path },
      )
    }

    if (!response.ok) {
      const errors = Array.isArray(data?.errors)
        ? data.errors
        : typeof data?.error === 'string'
          ? [data.error]
          : []
      const message = errors.length
        ? errors.join(' · ')
        : response.status === 401
          ? 'Clé API refusée ou expirée.'
          : response.status === 403
            ? "Vous n'avez pas les droits pour cette action."
            : response.status === 404
              ? 'Ressource introuvable sur Redmine.'
              : `Erreur Redmine (${response.status}).`
      throw new ApiError(message, { status: response.status, errors, path })
    }

    return data
  }

  async testConnection() {
    const data = await this.request('/users/current.json')
    if (!data?.user) {
      throw new ApiError(
        "Réponse inattendue de Redmine : l'URL ne pointe probablement pas vers une API Redmine.",
      )
    }
    return data.user
  }

  currentUser() {
    return this.request('/users/current.json')
  }

  statuses() {
    return this.request('/issue_statuses.json')
  }

  trackers() {
    return this.request('/trackers.json')
  }

  priorities() {
    return this.request('/enumerations/issue_priorities.json')
  }

  activities() {
    return this.request('/enumerations/time_entry_activities.json')
  }

  projects({ limit = 100, offset = 0, query, include } = {}) {
    return this.request('/projects.json', {
      query: {
        limit,
        offset,
        ...(query ? { name: query } : {}),
        ...(include ? { include } : {}),
        sort: 'name',
      },
    })
  }

  projectMembers(projectId, { limit = 100, offset = 0 } = {}) {
    return this.request(`/projects/${projectId}/memberships.json`, {
      query: { limit, offset },
    })
  }

  issues(params = {}) {
    return this.request('/issues.json', { query: params })
  }

  issue(id, include = 'journals,attachments,relations,children,watchers,allowed_statuses') {
    return this.request(`/issues/${id}.json`, { query: include ? { include } : {} })
  }

  createIssue(issue) {
    return this.request('/issues.json', { method: 'POST', body: { issue } })
  }

  updateIssue(id, issue) {
    return this.request(`/issues/${id}.json`, { method: 'PUT', body: { issue } })
  }

  addWatcher(issueId, userId) {
    return this.request(`/issues/${issueId}/watchers.json`, {
      method: 'POST',
      body: { user_id: userId },
    })
  }

  removeWatcher(issueId, userId) {
    return this.request(`/issues/${issueId}/watchers/${userId}.json`, { method: 'DELETE' })
  }

  createRelation(issueId, relation) {
    return this.request(`/issues/${issueId}/relations.json`, {
      method: 'POST',
      body: { relation },
    })
  }

  projectVersions(projectId) {
    return this.request(`/projects/${projectId}/versions.json`, {
      query: { limit: 100 },
    })
  }

  timeEntries(params = {}) {
    return this.request('/time_entries.json', { query: params })
  }

  createTimeEntry(timeEntry) {
    return this.request('/time_entries.json', { method: 'POST', body: { time_entry: timeEntry } })
  }

  updateTimeEntry(id, timeEntry) {
    return this.request(`/time_entries/${id}.json`, {
      method: 'PUT',
      body: { time_entry: timeEntry },
    })
  }

  deleteTimeEntry(id) {
    return this.request(`/time_entries/${id}.json`, { method: 'DELETE' })
  }

  async uploadFile(file) {
    let response
    try {
      response = await fetch(
        `${PREFIX}/uploads.json?filename=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: this.headers({ 'Content-Type': 'application/octet-stream' }),
          body: file,
        },
      )
    } catch {
      throw new ApiError("Échec de l'envoi du fichier vers le proxy local.")
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ApiError(data?.errors?.join(' · ') || "Échec de l'envoi du fichier.", {
        status: response.status,
      })
    }
    return data.upload
  }

  async downloadAttachment(attachment) {
    let pathname
    try {
      const absolute = new URL(attachment.content_url, `${this.baseUrl}/`)
      pathname = absolute.pathname + absolute.search
      // Redmine inclut le sous-dossier d'installation dans content_url ; le
      // proxy l'ajoute déjà à partir de X-Redmine-Base.
      const basePath = new URL(this.baseUrl).pathname.replace(/\/+$/, '')
      if (basePath && pathname.startsWith(`${basePath}/`)) {
        pathname = pathname.slice(basePath.length)
      }
    } catch {
      pathname = attachment.content_url
    }
    const response = await fetch(PREFIX + pathname, { headers: this.headers() })
    if (!response.ok) {
      throw new ApiError('Téléchargement impossible.', { status: response.status })
    }
    return response.blob()
  }
}

/** Construit une URL de fichier locale pour un téléchargement. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || 'fichier'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
