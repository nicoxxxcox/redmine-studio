import http from 'node:http'
import https from 'node:https'

const PREFIX = '/api/redmine'
const FORWARDED_REQUEST_HEADERS = [
  'x-redmine-api-key',
  'content-type',
  'accept',
  'content-length',
  'cookie',
  'x-requested-with',
]
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
]

/**
 * Petit proxy same-origin vers une instance Redmine.
 *
 * Redmine 3.4 n'envoie pas d'en-têtes CORS : passer par ce proxy évite de
 * configurer Apache/nginx et permet d'utiliser n'importe quelle instance.
 * La cible est fournie par l'en-tête `X-Redmine-Base` (posé par le client).
 */
export function createRedmineProxy({ prefix = PREFIX } = {}) {
  return function redmineProxy(req, res, next) {
    if (!req.url || !req.url.startsWith(prefix)) return next()

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const rawBase = req.headers['x-redmine-base']
    if (!rawBase) {
      return sendJson(res, 400, { error: 'En-tête X-Redmine-Base manquant.' })
    }

    let base
    try {
      base = decodeURIComponent(String(rawBase)).trim().replace(/\/+$/, '')
    } catch {
      return sendJson(res, 400, { error: 'URL Redmine invalide.' })
    }

    let target
    try {
      target = new URL(base)
    } catch {
      return sendJson(res, 400, { error: 'URL Redmine invalide.' })
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return sendJson(res, 400, { error: 'Seuls http:// et https:// sont autorisés.' })
    }

    const suffix = req.url.slice(prefix.length) || '/'
    let targetUrl
    try {
      targetUrl = new URL(target.origin + target.pathname.replace(/\/$/, '') + suffix)
    } catch {
      return sendJson(res, 400, { error: 'Chemin Redmine invalide.' })
    }

    const transport = targetUrl.protocol === 'https:' ? https : http
    const headers = {}
    for (const name of FORWARDED_REQUEST_HEADERS) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name]
    }
    // Les cookies ne sont transmis que si Redmine est hébergé sur le même
    // nom d'hôte que l'application. Cela permet d'utiliser la session web
    // Redmine (nécessaire pour éditer un commentaire en 3.4) sans envoyer
    // les cookies de l'application à une instance distante arbitraire.
    const requestHost = String(req.headers.host || '')
      .replace(/:\d+$/, '')
      .toLowerCase()
    if (requestHost && targetUrl.hostname.toLowerCase() !== requestHost) {
      delete headers.cookie
    }
    headers.host = targetUrl.host
    headers['user-agent'] = 'RedmineStudio/1.0'

    const upstream = transport.request(
      targetUrl,
      { method: req.method, headers, timeout: 120_000 },
      (upstreamRes) => {
        res.statusCode = upstreamRes.statusCode || 502
        for (const name of FORWARDED_RESPONSE_HEADERS) {
          if (upstreamRes.headers[name] !== undefined) {
            res.setHeader(name, upstreamRes.headers[name])
          }
        }
        upstreamRes.pipe(res)
        upstreamRes.on('error', () => res.destroy())
      },
    )

    upstream.on('timeout', () => {
      upstream.destroy(new Error('Délai dépassé'))
    })
    upstream.on('error', (error) => {
      if (res.headersSent) return res.destroy()
      const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code)
      sendJson(res, 502, {
        error: unreachable
          ? `Impossible de joindre ${targetUrl.origin} (${error.code || error.message}).`
          : `Erreur proxy : ${error.message}`,
      })
    })

    req.pipe(upstream)
  }
}

function sendJson(res, status, payload) {
  if (res.headersSent) return res.destroy()
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}
