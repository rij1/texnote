import { callbackify, callbackifyMultiResult } from '@overleaf/promise-utils'
import {
  fetchJson,
  fetchNothing,
  fetchStream,
  fetchStreamWithResponse,
  RequestFailedError,
} from '@overleaf/fetch-utils'
import fs from 'node:fs'
import Path from 'node:path'
import crypto from 'node:crypto'
import settings from '@overleaf/settings'
import OError from '@overleaf/o-error'
import UserGetter from '../User/UserGetter.mjs'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import HistoryBackupDeletionHandler from './HistoryBackupDeletionHandler.mjs'
import { db, waitForDb } from '../../infrastructure/mongodb.mjs'
import Metrics from '@overleaf/metrics'
import logger from '@overleaf/logger'
import { NotFoundError, FileTooLargeError } from '../Errors/Errors.js'

const HISTORY_V1_URL = settings.apis.v1_history.url
const HISTORY_V1_BASIC_AUTH = {
  user: settings.apis.v1_history.user,
  password: settings.apis.v1_history.pass,
}

// BEGIN copy from services/history-v1/storage/lib/blob_store/index.js

const GLOBAL_BLOBS = new Set() // CHANGE FROM SOURCE: only store hashes.

async function loadGlobalBlobs() {
  await waitForDb() // CHANGE FROM SOURCE: wait for db before running query.
  const blobs = db.projectHistoryGlobalBlobs.find()
  for await (const blob of blobs) {
    GLOBAL_BLOBS.add(blob._id) // CHANGE FROM SOURCE: only store hashes.
  }
}

// END copy from services/history-v1/storage/lib/blob_store/index.js

function isGlobalBlob(hash) {
  return GLOBAL_BLOBS.has(hash)
}

function getFilestoreBlobURL(historyId, hash) {
  if (GLOBAL_BLOBS.has(hash)) {
    return `${settings.apis.filestore.url}/history/global/hash/${hash}`
  } else {
    return `${settings.apis.filestore.url}/history/project/${historyId}/hash/${hash}`
  }
}

async function initializeProject(projectId) {
  try {
    const body = await fetchJson(`${settings.apis.project_history.url}/project`, {
      method: 'POST',
      json: { historyId: projectId },
    })
    const historyId = body && body.project && body.project.id
    return historyId || 1
  } catch (err) {
    return 1
  }
}

async function cloneProject(sourceProjectId, targetProjectId) {
  return await fetchStream(
    `${settings.apis.project_history.url}/project/${sourceProjectId}/clone`,
    {
      method: 'POST',
      json: { targetProjectId },
      signal: AbortSignal.timeout(10 * 60_000),
    }
  )
}

async function flushProject(projectId) {
  try {
    await fetchNothing(
      `${settings.apis.project_history.url}/project/${projectId}/flush`,
      { method: 'POST', signal: AbortSignal.timeout(60_000) }
    )
  } catch (err) {
    logger.warn({ err: err.message, projectId }, 'failed to flush project to project history, skipped in standalone mode')
  }
}

async function deleteProjectHistory(projectId) {
  try {
    await fetchNothing(
      `${settings.apis.project_history.url}/project/${projectId}`,
      { method: 'DELETE' }
    )
  } catch (err) {
    logger.warn({ err: err.message, projectId }, 'failed to delete project history, skipped in standalone mode')
  }
}

async function resyncProject(projectId, options = {}) {
  const body = {}
  if (options.force) {
    body.force = options.force
  }
  if (options.origin) {
    body.origin = options.origin
  }
  if (options.historyRangesMigration) {
    body.historyRangesMigration = options.historyRangesMigration
  }
  try {
    await fetchNothing(
      `${settings.apis.project_history.url}/project/${projectId}/resync`,
      {
        method: 'POST',
        json: body,
        signal: AbortSignal.timeout(6 * 60 * 1000),
      }
    )
  } catch (err) {
    logger.warn({ err: err.message, projectId }, 'failed to resync project history, skipped in standalone mode')
  }
}

async function deleteProject(projectId, historyId) {
  const tasks = []
  tasks.push(_deleteProjectInProjectHistory(projectId))
  if (historyId != null) {
    tasks.push(_deleteProjectInFullProjectHistory(historyId))
  }
  await Promise.all(tasks)
  await HistoryBackupDeletionHandler.deleteProject(projectId)
}

async function _deleteProjectInProjectHistory(projectId) {
  try {
    await fetchNothing(
      `${settings.apis.project_history.url}/project/${projectId}`,
      { method: 'DELETE', signal: AbortSignal.timeout(5 * 60_000) }
    )
  } catch (err) {
    logger.warn(
      { err: err.message, projectId },
      'failed to clear project history in project-history, skipped in standalone mode'
    )
  }
}

async function _deleteProjectInFullProjectHistory(historyId) {
  try {
    await fetchNothing(`${HISTORY_V1_URL}/projects/${historyId}`, {
      method: 'DELETE',
      basicAuth: HISTORY_V1_BASIC_AUTH,
      signal: AbortSignal.timeout(5 * 60_000),
    })
  } catch (err) {
    logger.warn({ err: err.message, historyId }, 'failed to clear project history, skipped in standalone mode')
  }
}

function formatProjectKey(projectId) {
  const str = (projectId || 0).toString().padStart(9, '0')
  const prefix = str.split('').reverse().join('')
  return Path.join(prefix.slice(0, 3), prefix.slice(3, 6), prefix.slice(6))
}

async function uploadBlobFromDisk(historyId, hash, byteLength, fsPath) {
  try {
    const projectBlobsDir =
      settings.filestore?.stores?.project_blobs ||
      '/var/lib/overleaf/data/history/overleaf-project-blobs'
    const targetDir = Path.join(
      projectBlobsDir,
      formatProjectKey(historyId),
      hash.slice(0, 2)
    )
    const targetFile = Path.join(targetDir, hash.slice(2))
    await fs.promises.mkdir(targetDir, { recursive: true })
    await fs.promises.copyFile(fsPath, targetFile)

    const globalBlobsDir =
      settings.filestore?.stores?.global_blobs ||
      '/var/lib/overleaf/data/history/overleaf-global-blobs'
    const targetGlobalDir = Path.join(
      globalBlobsDir,
      hash.slice(0, 2),
      hash.slice(2, 4)
    )
    const targetGlobalFile = Path.join(targetGlobalDir, hash.slice(4))
    await fs.promises.mkdir(targetGlobalDir, { recursive: true })
    await fs.promises.copyFile(fsPath, targetGlobalFile)
  } catch (diskErr) {
    logger.warn({ err: diskErr.message, historyId, hash }, 'local blob save error')
  }

  try {
    const outStream = fs.createReadStream(fsPath)

    const url = `${HISTORY_V1_URL}/projects/${historyId}/blobs/${hash}`
    await fetchNothing(url, {
      method: 'PUT',
      body: outStream,
      headers: { 'Content-Length': byteLength },
      signal: AbortSignal.timeout(5000),
      basicAuth: HISTORY_V1_BASIC_AUTH,
    })
  } catch (err) {
    // Expected in standalone mode
  }
}

async function copyBlob(sourceHistoryId, targetHistoryId, hash, sizeLimit) {
  try {
    const projectBlobsDir =
      settings.filestore?.stores?.project_blobs ||
      '/var/lib/overleaf/data/history/overleaf-project-blobs'
    const src = Path.join(
      projectBlobsDir,
      formatProjectKey(sourceHistoryId),
      hash.slice(0, 2),
      hash.slice(2)
    )
    const dstDir = Path.join(
      projectBlobsDir,
      formatProjectKey(targetHistoryId),
      hash.slice(0, 2)
    )
    const dst = Path.join(dstDir, hash.slice(2))
    await fs.promises.mkdir(dstDir, { recursive: true })
    if (fs.existsSync(src)) {
      await fs.promises.copyFile(src, dst)
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'History copyBlob disk copy failed')
  }

  const url = new URL(
    `${HISTORY_V1_URL}/projects/${targetHistoryId}/blobs/${hash}`
  )
  url.searchParams.set('copyFrom', sourceHistoryId)
  if (sizeLimit) url.searchParams.set('sizeLimit', sizeLimit)
  try {
    await fetchNothing(url, {
      method: 'POST',
      basicAuth: HISTORY_V1_BASIC_AUTH,
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    if (err instanceof RequestFailedError && err.response.status === 413) {
      let size
      try {
        ;({ size } = JSON.parse(err.body))
      } catch {}
      throw new FileTooLargeError('file too large', { size })
    }
  }
}

async function requestBlobWithProjectId(
  projectId,
  hash,
  method = 'GET',
  range = ''
) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    'overleaf.history.id': true,
  })
  return requestBlob(project.overleaf.history.id, hash, method, range)
}

async function requestBlob(historyId, hash, method = 'GET', range = '') {
  // Check if file exists locally in project_blobs or global_blobs
  const projectBlobsDir =
    settings.filestore?.stores?.project_blobs ||
    '/var/lib/overleaf/data/history/overleaf-project-blobs'
  const globalBlobsDir =
    settings.filestore?.stores?.global_blobs ||
    '/var/lib/overleaf/data/history/overleaf-global-blobs'

  const candidates = [
    Path.join(projectBlobsDir, String(historyId), hash.slice(0, 2), hash.slice(2)),
    Path.join(projectBlobsDir, formatProjectKey(historyId), hash.slice(0, 2), hash.slice(2)),
    Path.join(projectBlobsDir, hash),
    Path.join(globalBlobsDir, hash.slice(0, 2), hash.slice(2, 4), hash.slice(4)),
    Path.join(globalBlobsDir, hash),
  ]

  for (const localFile of candidates) {
    if (fs.existsSync(localFile)) {
      const stat = await fs.promises.stat(localFile)
      const stream = fs.createReadStream(localFile)
      return {
        url: localFile,
        stream,
        contentLength: stat.size,
        contentRange: null,
      }
    }
  }

  // Talk to history-v1 directly to avoid streaming via project-history.
  const url = new URL(HISTORY_V1_URL)
  url.pathname += `/projects/${historyId}/blobs/${hash}`

  const opts = { method, headers: { Range: range } }
  let stream, response
  try {
    ;({ stream, response } = await fetchStreamWithResponse(url, {
      ...opts,
      signal: AbortSignal.timeout(5000),
      basicAuth: {
        user: settings.apis.v1_history.user,
        password: settings.apis.v1_history.pass,
      },
    }))
    Metrics.inc('request_blob', 1, { path: 'history-v1' })
    return {
      url,
      stream,
      contentLength: parseInt(response.headers.get('Content-Length'), 10),
      contentRange: response.headers.get('Content-Range'),
    }
  } catch (err) {
    // Fallback: try generating offline chunk from Docstore/Mongo if historyId is an ObjectId
    if (/^[0-9a-f]{24}$/.test(String(historyId))) {
      try {
        await generateOfflineHistoryChunk(String(historyId))
        for (const localFile of candidates) {
          if (fs.existsSync(localFile)) {
            const stat = await fs.promises.stat(localFile)
            const fallbackStream = fs.createReadStream(localFile)
            return {
              url: localFile,
              stream: fallbackStream,
              contentLength: stat.size,
              contentRange: null,
            }
          }
        }
      } catch (genErr) {
        logger.warn({ err: genErr.message, historyId, hash }, 'fallback blob generation failed')
      }
    }
    throw new NotFoundError()
  }
}

/**
 * Warning: Don't use this method for large projects. It will eagerly load all
 * the history data and apply all operations.
 * @param {string} projectId
 * @returns Promise<object>
 */
async function getCurrentContent(projectId) {
  const historyId = await getHistoryId(projectId)

  try {
    return await fetchJson(
      `${HISTORY_V1_URL}/projects/${historyId}/latest/content`,
      {
        method: 'GET',
        basicAuth: HISTORY_V1_BASIC_AUTH,
      }
    )
  } catch (err) {
    throw OError.tag(err, 'failed to load project history', { historyId })
  }
}

/**
 * Warning: Don't use this method for large projects. It will eagerly load all
 * the history data and apply all operations.
 * @param {string} projectId
 * @param {number} version
 *
 * @returns Promise<object>
 */
async function getContentAtVersion(projectId, version) {
  const historyId = await getHistoryId(projectId)

  try {
    return await fetchJson(
      `${HISTORY_V1_URL}/projects/${historyId}/versions/${version}/content`,
      {
        method: 'GET',
        basicAuth: HISTORY_V1_BASIC_AUTH,
      }
    )
  } catch (err) {
    throw OError.tag(
      err,
      'failed to load project history snapshot at version',
      { historyId, version }
    )
  }
}

/**
 * Get the latest chunk from history
 *
 * @param {string} projectId
 */
async function getLatestHistory(projectId) {
  try {
    const historyId = await getHistoryId(projectId)
    return await getLatestHistoryWithHistoryId(historyId)
  } catch (err) {
    logger.info({ projectId }, 'Serving offline project chunk for projectSnapshot')
    return await generateOfflineHistoryChunk(projectId)
  }
}

/**
 * Generate a standalone offline project history chunk directly from Mongo & Docstore
 *
 * @param {string} projectId
 */
async function generateOfflineHistoryChunk(projectId) {
  const ProjectEntityHandler = (
    await import('../Project/ProjectEntityHandler.mjs')
  ).default
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const files = await ProjectEntityHandler.promises.getAllFiles(projectId)

  const projectBlobsDir =
    settings.filestore?.stores?.project_blobs ||
    '/var/lib/overleaf/data/history/overleaf-project-blobs'

  const rawFiles = {}
  for (const [docPath, doc] of Object.entries(docs)) {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath
    const content = Array.isArray(doc.lines)
      ? doc.lines.join('\n')
      : doc.lines || ''
    const hash = crypto.createHash('sha1').update(content).digest('hex')
    rawFiles[cleanPath] = {
      content,
      hash,
      stringLength: content.length,
      comments: [],
      trackedChanges: [],
    }

    try {
      const blobDir = Path.join(projectBlobsDir, projectId, hash.slice(0, 2))
      const blobFile = Path.join(blobDir, hash.slice(2))
      if (!fs.existsSync(blobFile)) {
        fs.mkdirSync(blobDir, { recursive: true })
        fs.writeFileSync(blobFile, content, 'utf8')
      }
    } catch (e) {
      logger.warn({ err: e.message, projectId, hash }, 'failed writing offline blob')
    }
  }

  for (const [filePath, file] of Object.entries(files)) {
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath
    rawFiles[cleanPath] = {
      hash: file.hash || file._id?.toString() || 'binary-hash',
      byteLength: file.size || 100,
    }
  }

  return {
    chunk: {
      startVersion: 0,
      history: {
        snapshot: {
          files: rawFiles,
          projectVersion: '1.0',
          v2DocVersions: {},
          timestamp: new Date().toISOString(),
        },
        changes: [],
      },
    },
  }
}

/**
 * Get the latest chunk from history using already resolved historyId
 *
 * @param {string} historyId
 */
async function getLatestHistoryWithHistoryId(historyId) {
  return await fetchJson(
    `${HISTORY_V1_URL}/projects/${historyId}/latest/history`,
    {
      basicAuth: HISTORY_V1_BASIC_AUTH,
    }
  )
}

/**
 * Get the latest chunk from history using already resolved historyId
 *
 * @param {string} historyId
 */
async function getLatestZipWithHistoryId(historyId) {
  const { response, stream } = await fetchStreamWithResponse(
    `${HISTORY_V1_URL}/projects/${historyId}/latest/zip`,
    {
      basicAuth: HISTORY_V1_BASIC_AUTH,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    }
  )
  return { stream, historyVersion: response.headers.get('X-History-Version') }
}

async function getDebugInfo(projectId) {
  return await fetchJson(
    `${settings.apis.project_history.url}/project/${projectId}/debug-info`
  )
}

async function getHistoryFailures() {
  return await fetchJson(
    `${settings.apis.project_history.url}/status/failures-full`
  )
}

/**
 * Get history changes since a given version
 *
 * @param {string} projectId
 * @param {object} [opts]
 * @param {number} [opts.since] - The start version of changes to get
 */
async function getChanges(projectId, opts = {}) {
  const historyId = await getHistoryId(projectId)
  return await getChangesWithHistoryId(historyId, opts)
}

/**
 * Get history changes since a given version and historyId
 *
 * @param {string} historyId
 * @param {object} [opts]
 * @param {number} [opts.since] - The start version of changes to get
 */
async function getChangesWithHistoryId(historyId, opts = {}) {
  try {
    const url = new URL(`${HISTORY_V1_URL}/projects/${historyId}/changes`)
    if (opts.since) {
      url.searchParams.set('since', opts.since)
    }

    return await fetchJson(url, {
      basicAuth: HISTORY_V1_BASIC_AUTH,
    })
  } catch (err) {
    return {
      changes: [],
      hasMore: false,
    }
  }
}

async function getHistoryId(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    overleaf: true,
  })
  const historyId = project?.overleaf?.history?.id
  if (!historyId) {
    return 1
  }
  return historyId
}

async function getBlobStats(historyId, blobHashes) {
  return await fetchJson(`${HISTORY_V1_URL}/projects/${historyId}/blob-stats`, {
    method: 'POST',
    basicAuth: HISTORY_V1_BASIC_AUTH,
    json: { blobHashes: blobHashes.map(id => id.toString()) },
  })
}

async function getProjectBlobStats(historyIds) {
  return await fetchJson(`${HISTORY_V1_URL}/projects/blob-stats`, {
    method: 'POST',
    basicAuth: HISTORY_V1_BASIC_AUTH,
    json: { projectIds: historyIds.map(id => id.toString()) },
  })
}

async function injectUserDetails(data) {
  // data can be either:
  // {
  // 	diff: [{
  // 		i: "foo",
  // 		meta: {
  // 			users: ["user_id", v1_user_id, ...]
  // 			...
  // 		}
  // 	}, ...]
  // }
  // or
  // {
  // 	updates: [{
  // 		pathnames: ["main.tex"]
  // 		meta: {
  // 			users: ["user_id", v1_user_id, ...]
  // 			...
  // 		},
  // 		...
  // 	}, ...]
  // }
  // Either way, the top level key points to an array of objects with a meta.users property
  // that we need to replace user_ids with populated user objects.
  // Note that some entries in the users arrays may be v1 ids returned by the v1 history
  // service. v1 ids will be `numbers`
  let userIds = new Set()
  let v1UserIds = new Set()
  const entries = Array.isArray(data.diff)
    ? data.diff
    : Array.isArray(data.updates)
      ? data.updates
      : []
  for (const entry of entries) {
    for (const user of (entry.meta && entry.meta.users) || []) {
      if (typeof user === 'string') {
        userIds.add(user)
      } else if (typeof user === 'number') {
        v1UserIds.add(user)
      }
    }
  }

  userIds = Array.from(userIds)
  v1UserIds = Array.from(v1UserIds)
  const projection = { first_name: 1, last_name: 1, email: 1 }
  const usersArray = await UserGetter.promises.getUsers(userIds, projection)
  const users = {}
  for (const user of usersArray) {
    users[user._id.toString()] = _userView(user)
  }
  projection.overleaf = 1
  const v1IdentifiedUsersArray = await UserGetter.promises.getUsersByV1Ids(
    v1UserIds,
    projection
  )
  for (const user of v1IdentifiedUsersArray) {
    users[user.overleaf.id] = _userView(user)
  }
  for (const entry of entries) {
    if (entry.meta != null) {
      entry.meta.users = ((entry.meta && entry.meta.users) || []).map(user => {
        if (typeof user === 'string' || typeof user === 'number') {
          return users[user]
        } else {
          return user
        }
      })
    }
  }
  return data
}

function _userView(user) {
  const { _id, first_name: firstName, last_name: lastName, email } = user
  return { first_name: firstName, last_name: lastName, email, id: _id }
}

const loadGlobalBlobsPromise = loadGlobalBlobs()

export default {
  isGlobalBlob,
  getFilestoreBlobURL,
  loadGlobalBlobsPromise,
  initializeProject: callbackify(initializeProject),
  flushProject: callbackify(flushProject),
  resyncProject: callbackify(resyncProject),
  deleteProject: callbackify(deleteProject),
  deleteProjectHistory: callbackify(deleteProjectHistory),
  injectUserDetails: callbackify(injectUserDetails),
  getCurrentContent: callbackify(getCurrentContent),
  uploadBlobFromDisk: callbackify(uploadBlobFromDisk),
  copyBlob: callbackify(copyBlob),
  requestBlob: callbackify(requestBlob),
  requestBlobWithProjectId: callbackify(requestBlobWithProjectId),
  getLatestHistory: callbackify(getLatestHistory),
  getLatestZipWithHistoryId: callbackifyMultiResult(getLatestZipWithHistoryId, [
    'stream',
    'historyVersion',
  ]),
  getChanges: callbackify(getChanges),
  promises: {
    initializeProject,
    cloneProject,
    flushProject,
    resyncProject,
    deleteProject,
    injectUserDetails,
    deleteProjectHistory,
    getCurrentContent,
    getContentAtVersion,
    uploadBlobFromDisk,
    copyBlob,
    requestBlob,
    requestBlobWithProjectId,
    getLatestHistory,
    getLatestZipWithHistoryId,
    getChanges,
    getChangesWithHistoryId,
    getProjectBlobStats,
    getBlobStats,
    getLatestHistoryWithHistoryId,
    generateOfflineHistoryChunk,
    getDebugInfo,
    getHistoryFailures,
  },
}
