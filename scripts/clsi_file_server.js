import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = 8080
const OUTPUT_BASE = '/var/lib/overleaf/data/output'

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.log': 'text/plain; charset=utf-8',
  '.aux': 'text/plain; charset=utf-8',
  '.stdout': 'text/plain; charset=utf-8',
  '.stderr': 'text/plain; charset=utf-8',
  '.synctex.gz': 'application/gzip',
  '.gz': 'application/gzip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Served-By', 'clsi-file-server')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Allow': 'GET,HEAD,OPTIONS' })
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)

  // Status check
  if (pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
    return
  }

  // Match /project/:projectId/user/:userId/build/:buildId/output/:file
  const userMatch = pathname.match(/^\/project\/([0-9a-f]+)\/user\/([0-9a-f]+)\/build\/([0-9a-f-]+)\/output\/(.+)$/i)
  // Match /project/:projectId/build/:buildId/output/:file
  const anonMatch = pathname.match(/^\/project\/([0-9a-f]+)\/build\/([0-9a-f-]+)\/output\/(.+)$/i)

  let filePath = null

  if (userMatch) {
    const [, projectId, userId, buildId, file] = userMatch
    filePath = path.join(OUTPUT_BASE, `${projectId}-${userId}`, 'generated-files', buildId, file)
  } else if (anonMatch) {
    const [, projectId, buildId, file] = anonMatch
    filePath = path.join(OUTPUT_BASE, projectId, 'generated-files', buildId, file)
  }

  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('File not found')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const stat = fs.statSync(filePath)
  const total = stat.size

  const range = req.headers.range

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const partialStart = parts[0]
    const partialEnd = parts[1]

    let start = parseInt(partialStart, 10)
    let end = partialEnd ? parseInt(partialEnd, 10) : total - 1

    if (isNaN(start)) {
      start = total - parseInt(partialEnd, 10)
      end = total - 1
    }

    if (start >= total || end >= total) {
      res.writeHead(416, {
        'Content-Range': `bytes */${total}`,
        'Content-Type': contentType,
      })
      res.end()
      return
    }

    const chunksize = end - start + 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    })

    if (req.method === 'HEAD') {
      res.end()
    } else {
      fs.createReadStream(filePath, { start, end }).pipe(res)
    }
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    })

    if (req.method === 'HEAD') {
      res.end()
    } else {
      fs.createReadStream(filePath).pipe(res)
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`CLSI output file server listening on 127.0.0.1:${PORT}`)
})
