// Static server for production build measurement (Node http only).
// Mirrors backend SPAStaticFiles: no compression, existing files served as-is,
// missing files with extension -> 404 text/plain, extensionless missing -> index.html.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PROD_PORT ?? 4180)
let distDir = path.resolve(process.env.PROD_DIST_DIR || '')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  })
  res.end(body)
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const data = fs.readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'no-cache',
  })
  res.end(data)
}

function resolveInside(root, urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const rel = decoded.replace(/^\/+/, '')
  const full = path.resolve(root, rel)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/__health' && req.method === 'GET') {
    return send(res, 200, 'text/plain; charset=utf-8', 'ok')
  }

  if (url.pathname === '/__control/dist' && req.method === 'POST') {
    const dir = url.searchParams.get('dir')
    if (!dir) return send(res, 400, 'text/plain; charset=utf-8', 'dir required')
    const next = path.resolve(dir)
    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
      return send(res, 400, 'text/plain; charset=utf-8', 'dir not found')
    }
    distDir = next
    return send(res, 200, 'text/plain; charset=utf-8', `dist=${distDir}`)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
  }

  const full = resolveInside(distDir, url.pathname)
  if (full === null) return send(res, 403, 'text/plain; charset=utf-8', 'forbidden')

  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    return sendFile(res, full)
  }

  if (path.extname(url.pathname) !== '') {
    return send(res, 404, 'text/plain; charset=utf-8', 'not found')
  }

  return sendFile(res, path.join(distDir, 'index.html'))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serveDist listening on 127.0.0.1:${PORT} dir=${distDir}`)
})
