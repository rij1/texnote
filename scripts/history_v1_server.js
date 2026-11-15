#!/usr/bin/env node

/**
 * Standalone Local History-v1 Storage Server
 * Port: 3100
 *
 * Provides a lightweight local persistence layer for project-history and Overleaf web,
 * completely offline without AWS / S3 / proprietary v1-history dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3100;
const DATA_DIR = '/var/lib/overleaf/data/history';
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const BLOBS_DIR = path.join(DATA_DIR, 'blobs');
const PROJECT_BLOBS_DIR = path.join(DATA_DIR, 'overleaf-project-blobs');
const GLOBAL_BLOBS_DIR = path.join(DATA_DIR, 'overleaf-global-blobs');

// Ensure storage directories exist
[DATA_DIR, CHUNKS_DIR, BLOBS_DIR, PROJECT_BLOBS_DIR, GLOBAL_BLOBS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function formatProjectKey(historyId) {
  return String(historyId);
}

function findBlobPath(historyId, hash) {
  if (!hash) return null;
  const candidates = [
    path.join(PROJECT_BLOBS_DIR, hash),
    path.join(GLOBAL_BLOBS_DIR, hash),
    path.join(PROJECT_BLOBS_DIR, formatProjectKey(historyId), hash.slice(0, 2), hash.slice(2)),
    path.join(PROJECT_BLOBS_DIR, String(historyId), hash.slice(0, 2), hash.slice(2)),
    path.join(GLOBAL_BLOBS_DIR, hash.slice(0, 2), hash.slice(2, 4), hash.slice(4)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Try to create from chunk if it has content for this hash
  const chunk = readChunk(historyId);
  if (chunk?.history?.snapshot?.files) {
    for (const file of Object.values(chunk.history.snapshot.files)) {
      if (file.hash === hash && file.content != null) {
        const targetPath = path.join(PROJECT_BLOBS_DIR, formatProjectKey(historyId), hash.slice(0, 2), hash.slice(2));
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf8');
        return targetPath;
      }
    }
  }
  return null;
}

function getChunkFilePath(historyId) {
  return path.join(CHUNKS_DIR, `${historyId}.json`);
}

function normalizeChange(change) {
  if (!change) return change;
  if (!change.timestamp) change.timestamp = new Date().toISOString();

  const v2 = [];
  if (Array.isArray(change.v2Authors)) {
    for (const a of change.v2Authors) {
      if (typeof a === 'string') v2.push(a);
    }
  }
  if (Array.isArray(change.authors)) {
    for (const a of change.authors) {
      if (typeof a === 'string' && /^[0-9a-f]{24}$/.test(a) && !v2.includes(a)) {
        v2.push(a);
      }
    }
  }
  if (!v2.length) {
    v2.push('6af6f73c4716a5f2fe282888');
  }
  change.v2Authors = v2;
  // V1 authors MUST be integers to pass assertV1 check in overleaf-editor-core
  change.authors = [1];
  return change;
}

function normalizeChunk(chunk) {
  if (!chunk) return chunk;
  if (!chunk.history) chunk.history = { snapshot: { files: {} }, changes: [] };
  if (!chunk.history.changes) chunk.history.changes = [];
  chunk.history.changes = chunk.history.changes.map(normalizeChange);
  chunk.authors = [
    {
      id: 1,
      name: 'Desktop User',
      email: 'user@localhost',
    },
  ];
  return chunk;
}

function readChunk(historyId) {
  const filePath = getChunkFilePath(historyId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return normalizeChunk(data);
    } catch (err) {
      console.error(`[history-v1] Error reading chunk for ${historyId}:`, err);
    }
  }
  return null;
}

function writeChunk(historyId, chunkData) {
  const filePath = getChunkFilePath(historyId);
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  const normalized = normalizeChunk(chunkData);
  fs.writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);

  // Write blobs for any files with content to ensure immediate availability
  if (normalized.history?.snapshot?.files) {
    for (const file of Object.values(normalized.history.snapshot.files)) {
      if (file.hash && file.content != null) {
        const dirs = [
          path.join(PROJECT_BLOBS_DIR, formatProjectKey(historyId), file.hash.slice(0, 2)),
          path.join(PROJECT_BLOBS_DIR, String(historyId), file.hash.slice(0, 2)),
        ];
        for (const dir of dirs) {
          try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, file.hash.slice(2)), file.content, 'utf8');
          } catch (e) {}
        }
      }
    }
  }
}

async function fetchInitialChunkFromWeb(historyId) {
  try {
    const webPort = process.env.WEB_PORT || 7777;
    const res = await fetch(`http://127.0.0.1:${webPort}/internal/project/${historyId}/offline-chunk`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.chunk) {
        return data.chunk;
      }
    } else {
      console.error(`[history-v1] fetchInitialChunkFromWeb status ${res.status} for ${historyId}`);
    }
  } catch (err) {
    console.error(`[history-v1] Failed to fetch initial chunk from web for ${historyId}:`, err.message);
  }
  return null;
}

async function getOrCreateChunk(historyId) {
  let chunk = readChunk(historyId);
  const hasFiles = chunk?.history?.snapshot?.files && Object.keys(chunk.history.snapshot.files).length > 0;
  if (!chunk || !hasFiles) {
    console.log(`[history-v1] Fetching chunk from web for project ${historyId}`);
    const initial = await fetchInitialChunkFromWeb(historyId);
    if (initial && initial.history?.snapshot?.files && Object.keys(initial.history.snapshot.files).length > 0) {
      chunk = initial;
      writeChunk(historyId, chunk);
    } else if (!chunk) {
      chunk = {
        startVersion: 0,
        endVersion: 0,
        endTimestamp: new Date().toISOString(),
        history: {
          snapshot: { files: {} },
          changes: [],
        },
        authors: [
          {
            id: 1,
            name: 'Desktop User',
            email: 'user@localhost',
          },
        ],
      };
      writeChunk(historyId, chunk);
    }
  }

  // Ensure blobs for all files in snapshot exist on disk
  if (chunk?.history?.snapshot?.files) {
    for (const [pathname, file] of Object.entries(chunk.history.snapshot.files)) {
      if (file.content != null && !file.hash) {
        file.hash = crypto.createHash('sha1').update(file.content).digest('hex');
        file.stringLength = file.content.length;
      }
      if (file.content != null && file.hash) {
        const bDir = path.join(PROJECT_BLOBS_DIR, formatProjectKey(historyId), file.hash.slice(0, 2));
        const bFile = path.join(bDir, file.hash.slice(2));
        if (!fs.existsSync(bFile)) {
          fs.mkdirSync(bDir, { recursive: true });
          fs.writeFileSync(bFile, file.content, 'utf8');
        }
      }
    }
  }
  return chunk;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        resolve(data);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:3100'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Logging
  // console.log(`[history-v1] ${method} ${pathname}`);

  try {
    // Health check
    if (pathname === '/health_check' || pathname === '/status') {
      return sendJson(res, 200, { status: 'alive' });
    }

    // POST /api/projects - Create history record
    if (method === 'POST' && pathname === '/api/projects') {
      const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await getOrCreateChunk(historyId);
      return sendJson(res, 200, { project: { id: historyId } });
    }

    // POST /api/projects/blob-stats
    if (method === 'POST' && pathname === '/api/projects/blob-stats') {
      return sendJson(res, 200, {});
    }

    // Route format: /api/projects/:historyId/...
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(.*)$/);
    if (!projectMatch) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    const historyId = projectMatch[1];
    const subpath = projectMatch[2] || '';

    // POST /api/projects/:historyId/blob-stats
    if (method === 'POST' && subpath === '/blob-stats') {
      return sendJson(res, 200, {});
    }

    // POST /api/projects/:historyId/clone
    if (method === 'POST' && subpath === '/clone') {
      const body = await parseBody(req);
      const targetProjectId = body?.targetProjectId || `hist_${Date.now()}`;
      const srcChunk = await getOrCreateChunk(historyId);
      writeChunk(targetProjectId, JSON.parse(JSON.stringify(srcChunk)));
      return sendJson(res, 200, { projectId: targetProjectId });
    }

    // GET /api/projects/:historyId/latest/history/raw
    if (method === 'GET' && subpath === '/latest/history/raw') {
      const chunk = await getOrCreateChunk(historyId);
      const changes = chunk.history?.changes || [];
      return sendJson(res, 200, {
        startVersion: chunk.startVersion || 0,
        endVersion: (chunk.startVersion || 0) + changes.length,
        endTimestamp: chunk.endTimestamp || new Date().toISOString(),
      });
    }

    // GET /api/projects/:historyId/latest/history
    if (method === 'GET' && subpath === '/latest/history') {
      const chunk = await getOrCreateChunk(historyId);
      const changes = chunk.history?.changes || [];
      return sendJson(res, 200, {
        chunk: {
          startVersion: chunk.startVersion || 0,
          endVersion: (chunk.startVersion || 0) + changes.length,
          endTimestamp: chunk.endTimestamp || new Date().toISOString(),
          history: {
            snapshot: chunk.history?.snapshot || { files: {} },
            changes: changes,
          },
        },
        authors: [
          {
            id: 1,
            name: 'Desktop User',
            email: 'user@localhost',
          },
        ],
      });
    }

    // GET /api/projects/:historyId/versions/:version/history
    const versionMatch = subpath.match(/^\/versions\/(\d+)\/history$/);
    if (method === 'GET' && versionMatch) {
      const requestedVersion = parseInt(versionMatch[1], 10);
      const chunk = await getOrCreateChunk(historyId);
      const allChanges = chunk.history?.changes || [];
      const slicedChanges = allChanges.slice(0, requestedVersion);
      return sendJson(res, 200, {
        chunk: {
          startVersion: chunk.startVersion || 0,
          endVersion: requestedVersion,
          endTimestamp: slicedChanges.length ? slicedChanges[slicedChanges.length - 1].timestamp : chunk.endTimestamp,
          history: {
            snapshot: chunk.history?.snapshot || { files: {} },
            changes: slicedChanges,
          },
        },
        authors: chunk.authors || [],
      });
    }

    // POST /api/projects/:historyId/legacy_changes
    if (method === 'POST' && subpath === '/legacy_changes') {
      const newChanges = await parseBody(req);
      const chunk = await getOrCreateChunk(historyId);
      if (!chunk.history) chunk.history = { snapshot: { files: {} }, changes: [] };
      if (!chunk.history.changes) chunk.history.changes = [];

      if (Array.isArray(newChanges)) {
        for (const change of newChanges) {
          if (!change.timestamp) change.timestamp = new Date().toISOString();
          if (!change.authors || !change.authors.length) {
            change.authors = [1];
          }
          change.v2Authors = ['6af6f73c4716a5f2fe282888'];
          chunk.history.changes.push(normalizeChange(change));
        }
      }

      chunk.endVersion = (chunk.startVersion || 0) + chunk.history.changes.length;
      chunk.endTimestamp = new Date().toISOString();
      writeChunk(historyId, chunk);

      return sendJson(res, 200, { resyncNeeded: false });
    }

    // GET /api/projects/:historyId/changes
    if (method === 'GET' && subpath === '/changes') {
      const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);
      const chunk = await getOrCreateChunk(historyId);
      const allChanges = chunk.history?.changes || [];
      const changes = allChanges.slice(since);
      return sendJson(res, 200, { changes, hasMore: false });
    }

    // Blob routes: /api/projects/:historyId/blobs/:hash
    const blobMatch = subpath.match(/^\/blobs\/([a-zA-Z0-9_-]+)$/);
    if (blobMatch) {
      const hash = blobMatch[1];

      if (method === 'HEAD') {
        const p = findBlobPath(historyId, hash);
        if (p) {
          const stats = fs.statSync(p);
          res.writeHead(200, {
            'Content-Length': stats.size,
            'Content-Type': 'application/octet-stream',
          });
          return res.end();
        } else {
          res.writeHead(404);
          return res.end();
        }
      }

      if (method === 'GET') {
        const p = findBlobPath(historyId, hash);
        if (p) {
          const stats = fs.statSync(p);
          res.writeHead(200, {
            'Content-Length': stats.size,
            'Content-Type': 'application/octet-stream',
          });
          return fs.createReadStream(p).pipe(res);
        } else {
          res.writeHead(404);
          return res.end();
        }
      }

      if (method === 'PUT') {
        const targetPath = path.join(PROJECT_BLOBS_DIR, formatProjectKey(historyId), hash.slice(0, 2), hash.slice(2));
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const writeStream = fs.createWriteStream(targetPath);
        req.pipe(writeStream);
        writeStream.on('finish', () => {
          sendJson(res, 200, { status: 'stored' });
        });
        writeStream.on('error', err => {
          sendJson(res, 500, { error: err.message });
        });
        return;
      }
    }

    // DELETE /api/projects/:historyId
    if (method === 'DELETE' && subpath === '') {
      const filePath = getChunkFilePath(historyId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return sendJson(res, 200, { status: 'deleted' });
    }

    return sendJson(res, 404, { error: 'Unknown endpoint', subpath });
  } catch (err) {
    console.error(`[history-v1] Error handling ${method} ${pathname}:`, err);
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[history-v1] Local offline history server running on http://127.0.0.1:${PORT}`);
});
