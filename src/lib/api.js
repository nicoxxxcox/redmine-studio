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

  buildUrl(path, query) {
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
    return url
  }

  async request(path, { method = 'GET', query, body, signal, headers } = {}) {
    const url = this.buildUrl(path, query)

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

  /**
   * Requête texte/HTML, utilisée pour les routes web de Redmine
   * (notamment le formulaire d'édition d'un commentaire).
   */
  async textRequest(path, { method = 'GET', query, body, signal, headers } = {}) {
    const url = this.buildUrl(path, query)
    let response
    try {
      response = await fetch(url, {
        method,
        signal,
        headers: this.headers(headers),
        body,
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new ApiError(
        'Impossible de contacter le proxy local. Vérifiez que le serveur est démarré.',
        { path },
      )
    }

    const text = await response.text()
    if (!response.ok) {
      let data = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          /* réponse HTML ou vide */
        }
      }
      const errors = Array.isArray(data?.errors)
        ? data.errors
        : typeof data?.error === 'string'
          ? [data.error]
          : []
      const message = errors.length
        ? errors.join(' · ')
        : response.status === 401
          ? 'Session Redmine requise.'
          : response.status === 403
            ? "Vous n'avez pas les droits pour cette action."
            : response.status === 404
              ? 'Formulaire de modification introuvable sur Redmine.'
              : `Erreur Redmine (${response.status}).`
      throw new ApiError(message, { status: response.status, errors, path })
    }

    return { response, text }
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

  /**
   * Modifie une note via la route web `/journals/:id/edit` de Redmine.
   * Redmine 3.4 ne possède pas d'endpoint REST pour les journaux : le
   * formulaire HTML est donc récupéré pour récupérer le jeton CSRF, puis
   * soumis comme le ferait l'interface Redmine.
   */
  async updateJournal(id, { notes, privateNotes = false } = {}) {
    const { text } = await this.textRequest(`/journals/${id}/edit.js`, {
      headers: {
        Accept: 'text/javascript, text/html, application/xhtml+xml',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    const token = extractAuthenticityToken(text)
    const hasJournalForm =
      new RegExp(`journal[-_]${id}[-_]`).test(text) && text.includes('journal[notes]')
    if (!token || !hasJournalForm) {
      throw new ApiError(
        "Redmine n'a pas renvoyé le formulaire de modification. Une session web Redmine active est nécessaire pour modifier un commentaire avec Redmine 3.4.",
        { status: 401, path: `/journals/${id}/edit` },
      )
    }

    const body = new URLSearchParams()
    body.set('_method', 'put')
    body.set('authenticity_token', token)
    body.set('journal[notes]', notes)
    body.set('journal[private_notes]', privateNotes ? '1' : '0')

    await this.textRequest(`/journals/${id}`, {
      method: 'POST',
      body,
      headers: {
        Accept: 'text/javascript, text/html, application/xhtml+xml',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    return true
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

function extractAuthenticityToken(source = '') {
  const normalized = String(source)
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/&quot;/g, '"')
  const patterns = [
    /name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(normalized)
    if (match?.[1]) return match[1]
  }
  return ''
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
