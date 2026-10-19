import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRedmineProxy } from './proxy.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '127.0.0.1'
const proxy = createRedmineProxy()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/redmine')) {
    proxy(req, res, () => sendJson(res, 404, { error: 'Route inconnue.' }))
    return
  }

  if (req.url === '/api/health') {
    return sendJson(res, 200, { ok: true })
  }

  if (!existsSync(dist)) {
    res.statusCode = 503
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end("Le dossier dist/ est absent. Lancez d'abord « npm run build ».")
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.statusCode = 400
    return res.end('Requête invalide')
  }

  let filePath = normalize(join(dist, pathname))
  if (filePath !== dist && !filePath.startsWith(dist + sep)) {
    res.statusCode = 403
    return res.end('Accès refusé')
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(dist, 'index.html')
  }

  res.statusCode = 200
  res.setHeader('content-type', MIME[extname(filePath)] || 'application/octet-stream')
  if (filePath.endsWith('index.html')) {
    res.setHeader('cache-control', 'no-cache')
  } else {
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
  }
  createReadStream(filePath).pipe(res)
})

server.listen(port, host, () => {
  console.log(`\n  Redmine Studio → http://${host}:${port}\n`)
  if (!existsSync(dist)) {
    console.log("  ⚠  dist/ introuvable : exécutez « npm run build » avant « npm start ».\n")
  }
})

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}
