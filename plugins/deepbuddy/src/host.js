/**
 * Host half of the deepbuddy plugin: session-fenced files and the interactive
 * user terminal.
 *
 * Publishes three Remote endpoints on the Typert Gateway's shared `/api`
 * channel — `deepbuddyFiles/readFile`, `readBinary` and `listDirectory` — through
 * which the explorer dock pane reads a session's own workspace. The harness
 * itself has no session-fenced file enumeration (`host.listDirectory` is the
 * directory picker's browse capability and skips files), so the distribution
 * carries its own.
 *
 * The Gateway resolves an endpoint from its strict definition registry
 * (`ctx.typert`), so this plugin hands it a hand-written invocation descriptor
 * instead of generated reflection — an out-of-tree plugin has no generator.
 * Every service this file touches (`typert`, `sessions`, `sessionPersistence`,
 * `fs`) is reached through the injected Context by name and called
 * structurally, so the plugin ships no copy of the harness runtime.
 *
 * Every read is fenced to the requesting session's own project root: resolve
 * both the root and the request through the fs seam (which follows symlinks),
 * refuse anything the seam does not report as contained, and stream the
 * preview under a code-unit cap instead of reading the file whole.
 */

import Schema from '@deepseek-ai/schemastery'

import { createReadStream } from 'node:fs'
import { spawn as spawnPty } from 'node-pty'
import { WebSocketServer } from 'ws'

/** Stable Cordis plugin name. */
export const name = 'deepbuddy'

/**
 * Required services. `fs` stays out: the fs seam is optional in an assembly,
 * and a missing backend is a per-request refusal (`fs-missing`), not a reason
 * to keep the whole distribution unmounted.
 */
export const inject = ['typert', 'sessions', 'webServer']

/** Cordis service key and Remote wire namespace of the file surface. */
const SERVICE_KEY = 'deepbuddyFiles'

/** npm package name, used as the Typert contribution's owner identity. */
const PACKAGE_NAME = 'dsh-plugin-deepbuddy'

/**
 * HTTP path prefix owning fenced media streaming. The browser half builds
 * `<video>`/`<img>` srcs over this; the route re-fences every path against
 * the requesting session's root, so the outbound URL is a capability over a
 * session-relative path, never a server-wide file read. Uses the longest
 * prefix so a distinct sub-path per session carries no state.
 */
const MEDIA_ROUTE = '/deepbuddy/media'

/** Exact HTTP-upgrade route used by the interactive terminal. */
const TERMINAL_ROUTE = '/deepbuddy/terminal'

/** Maximum retained output per terminal instance. */
const TERMINAL_SCROLLBACK_BYTES = 64 * 1024

/** Hard ceiling for simultaneously running PTYs owned by one session. */
const TERMINAL_MAX_PER_SESSION = 6

/** Plugin configuration, validated and defaulted by the dsh loader. */
export const Config = Schema.object({
  /**
   * Inclusive preview cap in UTF-16 code units (the unit of `text.length`).
   * A larger file still answers, with `truncated: true`.
   */
  previewMaxChars: Schema.natural().min(1024).default(262_144),
  /**
   * Inclusive byte cap for the binary preview channel. A file past this
   * answers `tooLarge: true`, never a transport failure — a 200MB media file
   * must not be read into the browser half whole.
   */
  previewMaxBytes: Schema.natural().min(1024).default(50 * 1024 * 1024),
})

/**
 * Build one strict invocation descriptor. `src-json` codecs make the boundary
 * JSON-validated without a generated schema: the Gateway checks that the wire
 * args are a plain object carrying exactly the declared field, and that the
 * result is JSON-safe.
 * @param method - the Remote method name, which is also the service member.
 * @returns the descriptor for `deepbuddyFiles/<method>`.
 */
function descriptorOf(method) {
  return {
    id: `${PACKAGE_NAME}#${SERVICE_KEY}/${method}`,
    service: SERVICE_KEY,
    namespace: SERVICE_KEY,
    method,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
    result: { mode: 'src-json' },
  }
}

/** The Remote surface: read one file, and list one directory level. */
const DESCRIPTORS = [descriptorOf('readFile'), descriptorOf('readBinary'), descriptorOf('listDirectory')]

/** Fold a thrown filesystem failure into the refusal vocabulary. */
function fsErrorRefusal(error) {
  if (typeof error !== 'object' || error === null) {
    return { kind: 'fs-error', message: String(error) }
  }
  const code = typeof error.code === 'string' ? error.code : undefined
  const message = typeof error.message === 'string' ? error.message : JSON.stringify(error)
  return { kind: 'fs-error', ...(code === undefined ? {} : { code }), message }
}
/** Whether the thrown value is the fs seam's binary-content rejection. */
function isNotTextRejection(error) {
  return typeof error === 'object' && error !== null && error.code === 'FS_NOT_TEXT'
}

/** Whether the thrown value is the fs seam's byte-cap rejection. */
function isTooLargeRejection(error) {
  return typeof error === 'object' && error !== null && error.code === 'FS_TOO_LARGE'
}

/** Encode raw bytes as base64 for JSON-safe transport across the Remote wire. */
function Uint8ArrayToBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')
}


/**
 * Resolve the project root that fences one session's reads.
 *
 * `ctx.sessions` only sees the live sessions of this plugin's own realm. Since
 * the agent plane moved into the preset realm (rc.6), a host plugin row no
 * longer sees the sessions the gateway hosts, so the live lookup misses every
 * session the browser can actually open. The gateway itself resolves a cold
 * session the same way this falls back — from the persisted header — so the
 * fence is the identical cwd either way, and the fallback also covers sessions
 * that are merely not resumed.
 * @param ctx - host context carrying `sessions` and optionally `sessionPersistence`.
 * @param sessionId - the session whose root is wanted.
 * @param signal - aborts the persistence listing.
 * @returns the cwd, or the refusal that stopped it.
 */
async function resolveSessionCwd(ctx, sessionId, signal) {
  const live = ctx.sessions.get(sessionId)
  const liveCwd = live?.header?.cwd
  if (liveCwd !== undefined) return { ok: true, cwd: liveCwd }
  const persistence = ctx.get('sessionPersistence')
  if (persistence !== undefined) {
    const stored = (await persistence.list(signal)).find(header => header.id === sessionId)
    if (stored !== undefined) {
      // A known session with no recorded cwd is a different refusal from an
      // unknown one, so the pane can say "this session has no workspace".
      return stored.cwd === undefined
        ? { ok: false, refusal: { kind: 'session-no-cwd' } }
        : { ok: true, cwd: stored.cwd }
    }
  }
  if (live !== undefined) return { ok: false, refusal: { kind: 'session-no-cwd' } }
  return { ok: false, refusal: { kind: 'session-not-found' } }
}

/**
 * Resolve a session-addressed path to a fenced regular file.
 *
 * The fence is the session's recorded project cwd — the same boundary the
 * session's own workspace writes obey — so the pane can never out-read the
 * agent. `fs.resolve` follows symlinks, so a link pointing outside the root is
 * refused exactly like a direct outside path, and containment is asked of the
 * seam rather than computed from path strings (no prefix-collision hazard).
 * @param ctx - host context carrying `sessions` and optionally `sessionPersistence` and `fs`.
 * @param sessionId - the session whose root fences the read.
 * @param path - absolute path to resolve; a relative path resolves against the
 *   backend's base and is still fence-checked.
 * @param signal - aborts resolution.
 * @returns the fenced target, or the refusal that stopped it.
 */
async function resolveWorkspaceFile(ctx, sessionId, path, signal) {
  const root = await resolveSessionCwd(ctx, sessionId, signal)
  if (!root.ok) return root
  const cwd = root.cwd
  const fs = ctx.get('fs')
  if (fs === undefined) return { ok: false, refusal: { kind: 'fs-missing' } }
  try {
    const opts = signal === undefined ? undefined : { signal }
    const rootTarget = await fs.resolve(cwd, opts)
    const target = await fs.resolve(path, opts)
    if (!fs.contains(rootTarget, target)) return { ok: false, refusal: { kind: 'outside-root' } }
    const info = await fs.stat(target, signal)
    if (info === undefined) return { ok: false, refusal: { kind: 'not-found' } }
    if (info.type !== 'file') return { ok: false, refusal: { kind: 'not-regular' } }
    return { ok: true, target, path: fs.processPath(target), info }
  } catch (error) {
    return { ok: false, refusal: fsErrorRefusal(error) }
  }
}

/**
 * MIME for the media the file dock streams over HTTP. Videos use
 * `<video src>` which needs a browser-supported type to render; every other
 * extension the browser could <img> gets a single-image type or a generic
 * binary fallback so a mismatched preview degrades to a download, never a
 * wrong paint.
 */
function mediaMime(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'mp4':
    case 'm4v': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'mov': return 'video/quicktime'
    case 'mkv': return 'video/x-matroska'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'bmp': return 'image/bmp'
    case 'ico': return 'image/x-icon'
    case 'avif': return 'image/avif'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'm4a': return 'audio/mp4'
    case 'aac': return 'audio/aac'
    case 'ogg':
    case 'oga': return 'audio/ogg'
    case 'flac': return 'audio/flac'
    case 'pdf': return 'application/pdf'
    default: return 'application/octet-stream'
  }
}

/**
 * Serve one fenced media file over HTTP with single-Range support.
 *
 * The webserver's `webServer.register` owns the full response lifecycle, so
 * this endpoint streams the realpath with `createReadStream` instead of
 * buffering the whole file into the Remote wire — a 63MB mp4 never becomes
 * base64 in memory. `Range` is honored so `<video>` can seek; a malformed
 * Range still answers 200 with the whole body. The path is re-fenced to the
 * session root (same `resolveWorkspaceFile`), so a URL can never read outside
 * its session.
 * @param ctx - host context, for the same fencing the RPC uses.
 * @param req - the node:http request.
 * @param res - the response to stream into.
 * @param sessionId - the session owning the file (path is relative to it).
 * @param path - the file, already decoded and fenced by the caller.
 */
async function streamMedia(ctx, req, res, sessionId, path) {
  const fenced = await resolveWorkspaceFile(ctx, sessionId, path, undefined)
  if (!fenced.ok) {
    res.statusCode = fenced.refusal.kind === 'not-found' ? 404 : 403
    res.end(fenced.refusal.message ?? fenced.refusal.kind)
    return
  }
  const filePath = fenced.path
  const size = typeof fenced.info.size === 'number' ? fenced.info.size : null
  const mime = mediaMime(filePath)
  res.setHeader('Content-Type', mime)
  res.setHeader('Accept-Ranges', 'bytes')
  // `pipe` does NOT forward stream errors, and an unhandled 'error' on the
  // ReadStream is an uncaughtException that kills the whole host process. A
  // file that stats fine can still fail to open/read (EACCES, deleted between
  // stat and open, dead symlink, unplugged volume) — answer 500/abort the one
  // response instead.
  const streamFile = (options) => {
    const stream = options === undefined ? createReadStream(filePath) : createReadStream(filePath, options)
    stream.on('error', () => {
      // `destroy()` never flushes a status line — the client would see a
      // connection reset, not a 500. Actually answer when nothing was sent
      // yet; abort only a response already mid-stream. `writeHead` keeps
      // headers already queued via setHeader, so the file-sized
      // Content-Length/Content-Range MUST go, or the empty 500 body reads
      // as a truncated response (ERR_CONTENT_LENGTH_MISMATCH) and desyncs
      // the keep-alive parser.
      if (res.headersSent) { res.destroy(); return }
      res.removeHeader('Content-Length')
      res.removeHeader('Content-Range')
      res.writeHead(500)
      res.end()
    })
    stream.pipe(res)
  }
  if (size === null) {
    // Unknown size: no Range math, stream the whole file.
    res.statusCode = 200
    streamFile()
    return
  }
  res.setHeader('Content-Length', String(size))
  const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
  const match = range === undefined ? null : /^bytes=(\d*)-(\d*)$/.exec(range)
  if (match === null) {
    res.statusCode = 200
    streamFile()
    return
  }
  const start = match[1] === '' ? 0 : Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start > end || start >= size) {
    res.statusCode = 416
    res.setHeader('Content-Range', `bytes */${size}`)
    res.end()
    return
  }
  res.statusCode = 206
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  res.setHeader('Content-Length', String(end - start + 1))
  streamFile({ start, end })
}

/**
 * Read a fenced workspace file as capped preview text.
 *
 * Streaming keeps the cap a memory bound instead of a post-hoc slice, so a huge
 * file costs one chunk of memory; a file past the cap answers `truncated: true`
 * rather than refusing, because the head of a large file still previews.
 * Content the seam rejects as non-text answers `kind: 'binary'` so the caller
 * can render a marker instead of failing.
 * @param ctx - host context carrying `sessions` and optionally `sessionPersistence` and `fs`.
 * @param sessionId - the session whose root fences the read.
 * @param path - absolute path of the file to preview.
 * @param maxChars - inclusive cap in UTF-16 code units.
 * @param signal - aborts the read.
 * @returns the text preview, the binary marker, or the refusal.
 */
async function readWorkspaceFileText(ctx, sessionId, path, maxChars, signal) {
  const resolved = await resolveWorkspaceFile(ctx, sessionId, path, signal)
  if (!resolved.ok) return resolved
  const fs = ctx.get('fs')
  const size = typeof resolved.info.size === 'number' ? resolved.info.size : null
  let text = ''
  let truncated = false
  try {
    const stream = await fs.streamText(resolved.target, signal)
    for await (const chunk of stream) {
      // The seam's decoder ends with an empty flush chunk; only real content
      // past the cap means truncation.
      if (chunk.length === 0) continue
      if (text.length >= maxChars) {
        truncated = true
        break
      }
      const room = maxChars - text.length
      if (chunk.length > room) {
        let part = chunk.slice(0, room)
        truncated = true
        // A slice can cut a surrogate pair in half: drop a trailing high
        // surrogate (0xD800-0xDBFF) so the preview never ends mid-character.
        const last = part.charCodeAt(part.length - 1)
        if (last >= 0xd800 && last <= 0xdbff) part = part.slice(0, -1)
        text += part
        // The rest of this chunk is dropped, so appending any later chunk would
        // splice discontinuous content after the cut.
        break
      }
      text += chunk
    }
  } catch (error) {
    if (isNotTextRejection(error)) return { ok: true, kind: 'binary', size }
    return { ok: false, refusal: fsErrorRefusal(error) }
  }
  return { ok: true, kind: 'text', text, truncated, size }
}


/** Resolve a fenced directory target; the file resolver's twin, minus the regular-file rule. */
async function resolveWorkspaceDirectory(ctx, sessionId, path, signal) {
  const root = await resolveSessionCwd(ctx, sessionId, signal)
  if (!root.ok) return root
  const cwd = root.cwd
  const fs = ctx.get('fs')
  if (fs === undefined) return { ok: false, refusal: { kind: 'fs-missing' } }
  try {
    const opts = signal === undefined ? undefined : { signal }
    const rootTarget = await fs.resolve(cwd, opts)
    // An empty request means the session root itself, which is what the tree
    // opens on; anything else is fenced exactly like a file request.
    const target = path === '' ? rootTarget : await fs.resolve(path, opts)
    if (!fs.contains(rootTarget, target)) return { ok: false, refusal: { kind: 'outside-root' } }
    const info = await fs.stat(target, signal)
    if (info === undefined) return { ok: false, refusal: { kind: 'not-found' } }
    if (info.type !== 'directory') return { ok: false, refusal: { kind: 'not-directory' } }
    return { ok: true, target, path: fs.processPath(target) }
  } catch (error) {
    return { ok: false, refusal: fsErrorRefusal(error) }
  }
}
/**
 * Read a fenced workspace file as capped raw bytes.
 *
 * Underlying read is the fs seam's `readBytes`, a full-file allocation under a
 * byte cap; a file past the cap answers `tooLarge: true` rather than throwing,
 * so the caller renders a "文件过大" state instead of a transport failure.
 * Content the seam would reject as non-text is NOT reached here — the caller
 * only asks for bytes of extensions it knows are image/video.
 * @param ctx - host context carrying `sessions` and optionally `sessionPersistence` and `fs`.
 * @param sessionId - the session whose root fences the read.
 * @param path - absolute path of the file to read.
 * @param maxBytes - inclusive byte cap.
 * @param signal - aborts the read.
 * @returns the raw bytes, the too-large marker, or the refusal.
 */
async function readWorkspaceFileBytes(ctx, sessionId, path, maxBytes, signal) {
  const resolved = await resolveWorkspaceFile(ctx, sessionId, path, signal)
  if (!resolved.ok) return resolved
  const fs = ctx.get('fs')
  if (fs === undefined) return { ok: false, refusal: { kind: 'fs-missing' } }
  const size = typeof resolved.info.size === 'number' ? resolved.info.size : null
  try {
    const bytes = await fs.readBytes(resolved.target, signal, maxBytes)
    return { ok: true, size, bytes }
  } catch (error) {
    if (isTooLargeRejection(error)) return { ok: true, size, tooLarge: true }
    return { ok: false, refusal: fsErrorRefusal(error) }
  }
}

/**
 * List one fenced directory level: files and directories together, in stable
 * name order, each with the absolute path the explorer opens next.
 * @param ctx - host context carrying `sessions` and optionally `sessionPersistence` and `fs`.
 * @param sessionId - the session whose root fences the listing.
 * @param path - absolute directory to list.
 * @param signal - aborts the listing.
 * @returns the entries, or the refusal that stopped them.
 */
async function listWorkspaceDirectory(ctx, sessionId, path, signal) {
  const resolved = await resolveWorkspaceDirectory(ctx, sessionId, path, signal)
  if (!resolved.ok) return resolved
  const fs = ctx.get('fs')
  try {
    const children = await fs.listDir(resolved.target, signal)
    const entries = children
      .filter(child => child.type === 'file' || child.type === 'directory')
      .map(child => ({
        name: child.name,
        path: fs.processPath(child.target),
        directory: child.type === 'directory',
      }))
      // The seam promises no order. Directories first, then code-unit order by
      // name: a tree that reshuffles between two expansions is unusable, and
      // locale collation would make the order depend on the host's locale.
      .sort((a, b) => (a.directory === b.directory ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : (a.directory ? -1 : 1)))
    return { ok: true, path: resolved.path, entries }
  } catch (error) {
    return { ok: false, refusal: fsErrorRefusal(error) }
  }
}

/** Send one JSON protocol message when a terminal client is still attached. */
function sendTerminalMessage(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message))
}

/** Retain only the newest bounded UTF-8 terminal output. */
function appendScrollback(current, chunk) {
  const joined = Buffer.from(current + chunk)
  if (joined.byteLength <= TERMINAL_SCROLLBACK_BYTES) return joined.toString('utf8')
  // Dropping bytes can land inside one UTF-8 character. Buffer's decoder
  // replaces that single partial prefix, which is safer than retaining an
  // unbounded buffer; strip the replacement marker from the new head.
  return joined.subarray(joined.byteLength - TERMINAL_SCROLLBACK_BYTES).toString('utf8').replace(/^\uFFFD/, '')
}

/** One host-owned PTY and every browser currently attached to it. */
class TerminalResource {
  constructor(sessionId, termId, cwd, shell, onExit) {
    this.sessionId = sessionId
    this.termId = termId
    this.cwd = cwd
    this.clients = new Set()
    this.scrollback = ''
    this.status = { kind: 'running' }
    this.closing = false
    this.exited = new Promise(resolve => { this.resolveExit = resolve })
    this.pty = spawnPty(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // A GUI-launched Electron inherits no locale, and under the C locale
        // ls and friends sanitize non-ASCII filenames to '?'. Any UTF-8
        // locale fixes the charset; only set it when the user has none.
        ...(process.env.LANG === undefined && process.env.LC_ALL === undefined
          ? { LANG: 'en_US.UTF-8' }
          : {}),
      },
    })
    this.dataSubscription = this.pty.onData((data) => {
      this.scrollback = appendScrollback(this.scrollback, data)
      this.broadcast({ type: 'output', data })
    })
    this.exitSubscription = this.pty.onExit(({ exitCode, signal }) => {
      this.status = { kind: 'exited', exitCode, signal: signal ?? null }
      this.broadcast({ type: 'exit', exitCode, signal: signal ?? null })
      this.resolveExit()
      onExit(this)
    })
  }

  attach(socket) {
    this.clients.add(socket)
    sendTerminalMessage(socket, {
      type: 'snapshot',
      data: this.scrollback,
      cwd: this.cwd,
      status: this.status.kind,
      ...(this.status.kind === 'exited' ? { exitCode: this.status.exitCode } : {}),
    })
  }

  detach(socket) {
    this.clients.delete(socket)
  }

  broadcast(message) {
    for (const socket of this.clients) sendTerminalMessage(socket, message)
  }

  resize(cols, rows) {
    if (this.status.kind === 'running' && !this.closing) this.pty.resize(cols, rows)
  }

  write(data) {
    if (this.status.kind === 'running' && !this.closing) this.pty.write(data)
  }

  kill(reason) {
    if (this.status.kind !== 'running' || this.closing) return
    this.closing = true
    this.broadcast({ type: 'closed', reason })
    this.pty.kill()
  }

  dispose(reason) {
    this.kill(reason)
    this.dataSubscription.dispose()
    this.exitSubscription.dispose()
    for (const socket of this.clients) socket.close(1001, reason)
    this.clients.clear()
  }
}

/**
 * Session + terminal-id keyed PTY owner. React attachments may come and go;
 * this registry alone decides resource lifetime and enforces the per-session
 * concurrency ceiling.
 */
export class DeepbuddyTerminalManager {
  constructor(ctx) {
    this.ctx = ctx
    this.resources = new Map()
    this.pending = new Map()
    // Kill intents that arrived while their PTY was neither in `resources`
    // nor `pending` (attach still resolving its cwd): key → expiry ms. The
    // spawn path consumes them so a raced close cannot leave an invisible
    // PTY; the TTL keeps a stale intent from assassinating a later restart
    // that legitimately reuses the same term id.
    this.killIntents = new Map()
  }

  keyOf(sessionId, termId) {
    return `${sessionId}\u0000${termId}`
  }

  runningCount(sessionId) {
    const running = [...this.resources.values()].filter(resource => resource.sessionId === sessionId
      && resource.status.kind === 'running' && !resource.closing).length
    const spawning = [...this.pending.values()].filter(entry => entry.sessionId === sessionId).length
    return running + spawning
  }

  async resourceFor(sessionId, termId) {
    const resolved = await resolveSessionCwd(this.ctx, sessionId, undefined)
    if (!resolved.ok) throw new Error(resolved.refusal.kind)
    const key = this.keyOf(sessionId, termId)
    const existing = this.resources.get(key)
    if (existing !== undefined && existing.status.kind === 'running' && !existing.closing) return existing
    if (existing !== undefined && existing.closing) {
      await existing.exited
      return this.resourceFor(sessionId, termId)
    }
    if (existing !== undefined && existing.status.kind === 'exited') this.resources.delete(key)
    const spawning = this.pending.get(key)
    if (spawning !== undefined) return spawning.promise
    // A kill that raced this creation (arrived while the cwd was resolving,
    // when the key was in neither map) wins: spawning would leave a PTY no
    // tab points at.
    const intent = this.killIntents.get(key)
    if (intent !== undefined) {
      this.killIntents.delete(key)
      if (intent > Date.now()) throw new Error('terminal-closed: kill arrived before the PTY spawned')
    }
    if (this.runningCount(sessionId) >= TERMINAL_MAX_PER_SESSION) {
      throw new Error(`terminal-limit-reached: max ${TERMINAL_MAX_PER_SESSION} per session`)
    }
    const promise = Promise.resolve().then(() => {
      const shell = process.env.SHELL || '/bin/zsh'
      const resource = new TerminalResource(sessionId, termId, resolved.cwd, shell, (exited) => {
        // Natural exits stay available for one final scrollback attachment;
        // explicit closes leave immediately so a requested restart can spawn.
        if (exited.closing && this.resources.get(key) === exited) this.resources.delete(key)
      })
      this.resources.set(key, resource)
      return resource
    })
    this.pending.set(key, { sessionId, promise })
    try { return await promise }
    finally { this.pending.delete(key) }
  }

  async attach(sessionId, termId, socket) {
    // The message listener must exist BEFORE the (async) resource lookup, or
    // anything the client sends right after open — a kill, an early resize —
    // arrives with no listener and is silently dropped. Buffer (bounded: a
    // same-origin client sends at most a couple of frames before the
    // snapshot, anything more is garbage) until the resource is ready, then
    // replay.
    const early = []
    let onMessage = (raw) => { if (early.length < 64) early.push(raw) }
    socket.on('message', (raw) => { onMessage(raw) })
    const resource = await this.resourceFor(sessionId, termId)
    const handleMessage = (raw) => {
      let message
      try { message = JSON.parse(String(raw)) }
      catch {
        sendTerminalMessage(socket, { type: 'error', message: 'bad terminal message' })
        return
      }
      if (message?.type === 'input' && typeof message.data === 'string' && Buffer.byteLength(message.data) <= 64 * 1024) {
        resource.write(message.data)
      }
      else if (message?.type === 'resize'
        && Number.isInteger(message.cols) && message.cols >= 2 && message.cols <= 500
        && Number.isInteger(message.rows) && message.rows >= 1 && message.rows <= 300) {
        resource.resize(message.cols, message.rows)
      }
      else if (message?.type === 'kill') {
        this.close(sessionId, termId, 'user closed terminal')
      }
      else {
        sendTerminalMessage(socket, { type: 'error', message: 'unsupported terminal message' })
      }
    }
    // The same argument that moved the message listener up applies to close:
    // a socket that died DURING the resource lookup fired 'close' already, so
    // a listener added now would never run and the dead socket would sit in
    // `clients` forever. Honor any queued kill, then only attach a live one.
    onMessage = handleMessage
    for (const raw of early) handleMessage(raw)
    if (socket.readyState !== 1) return
    resource.attach(socket)
    socket.once('close', () => { resource.detach(socket) })
  }

  close(sessionId, termId, reason) {
    const key = this.keyOf(sessionId, termId)
    const resource = this.resources.get(key)
    if (resource === undefined) {
      // Not registered YET is not the same as gone: a spawn may be mid-
      // flight. Chain the kill onto a pending creation, or leave a bounded
      // intent for a creation whose cwd lookup has not even set `pending`.
      const spawning = this.pending.get(key)
      if (spawning !== undefined) {
        spawning.promise.then(created => { created.kill(reason) }).catch(() => {})
        return
      }
      this.killIntents.set(key, Date.now() + 10_000)
      return
    }
    if (resource.status.kind === 'exited') {
      resource.dispose(reason)
      this.resources.delete(key)
      return
    }
    resource.kill(reason)
  }

  killSession(sessionId, reason) {
    for (const [key, resource] of this.resources) {
      if (resource.sessionId !== sessionId) continue
      resource.dispose(reason)
      this.resources.delete(key)
    }
    for (const key of this.killIntents.keys()) {
      if (key.startsWith(`${sessionId}\u0000`)) this.killIntents.delete(key)
    }
  }

  dispose() {
    for (const resource of this.resources.values()) resource.dispose('deepbuddy unloaded')
    this.resources.clear()
  }
}

/**
 * The `deepbuddyFiles` service behind the Remote endpoints.
 *
 * `typertRemote` is the visible binding the Gateway validates before it invokes
 * anything: it must name this exact instance, service key, and namespace.
 */
export class DeepbuddyFilesService {
  /**
   * @param ctx - host context used for every request's fencing.
   * @param config - validated plugin config.
   */
  constructor(ctx, config) {
    this.ctx = ctx
    this.previewMaxChars = config.previewMaxChars
    this.previewMaxBytes = config.previewMaxBytes
    this.webServer = ctx.get('webServer')
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: SERVICE_KEY,
      namespace: SERVICE_KEY,
    })
  }

  /**
   * Absolute HTTP URL for a session-fenced media file, when the web server
   * route is registered. The path is percent-encoded so the session id and
   * file path round-trip through the URL; the route re-fences it.
   * @param sessionId - the session owning the file.
   * @param path - the file path (relative to the session root).
   * @returns the URL, or null when no web server is present.
   */
  mediaUrl(sessionId, path) {
    if (this.webServer === undefined) return null
    // Origin-relative path, not an absolute URL: the page may load over a LAN
    // IP or a loopback literal, and the browser half prepends its own origin.
    // The route is the same capability either way.
    return `${MEDIA_ROUTE}/${encodeURIComponent(sessionId)}/${encodeURIComponent(path)}`
  }

  /**
   * Read one workspace file for the browser half.
   *
   * Refusals are values, not thrown errors: the pane renders `denied` and
   * `not found` as ordinary states of a file view, and a thrown Gateway error
   * would instead surface as a transport failure.
   * @param request - `{ sessionId, path }`; the path is fenced to that
   *   session's project root.
   * @param signal - request cancellation supplied by the Gateway.
   * @returns `{ kind: 'text' | 'binary', … }` on success, `{ error }` on refusal.
   */
  async readFile(request, signal) {
    if (typeof request !== 'object' || request === null) {
      return { error: { kind: 'bad-request' } }
    }
    const { sessionId, path } = request
    if (typeof sessionId !== 'string' || typeof path !== 'string' || path === '') {
      return { error: { kind: 'bad-request' } }
    }
    const read = await readWorkspaceFileText(this.ctx, sessionId, path, this.previewMaxChars, signal)
    if (!read.ok) return { error: read.refusal }
    if (read.kind === 'binary') return { kind: 'binary', size: read.size }
    return { kind: 'text', text: read.text, truncated: read.truncated, size: read.size }
  }
  async readBinary(request, signal) {
    if (typeof request !== 'object' || request === null) {
      return { error: { kind: 'bad-request' } }
    }
    const { sessionId, path } = request
    if (typeof sessionId !== 'string' || typeof path !== 'string' || path === '') {
      return { error: { kind: 'bad-request' } }
    }
    // When the media route is registered (web deployment), serve the bytes
    // from the streaming HTTP endpoint instead of buffering them into the
    // Remote wire as base64. The URL is a capability over a session-relative
    // path; the route re-fences it, so the size cap no longer decides what
    // previews — 63MB mp4s stream.
    const url = this.mediaUrl(sessionId, path)
    if (url !== null) return { kind: 'url', url, size: null }
    const read = await readWorkspaceFileBytes(this.ctx, sessionId, path, this.previewMaxBytes, signal)
    if (!read.ok) return { error: read.refusal }
    if (read.tooLarge) return { kind: 'binary-too-large', size: read.size }
    return { kind: 'binary', base64: Uint8ArrayToBase64(read.bytes), size: read.size }
  }

  /**
   * List one directory level for the file tree.
   * @param request - `{ sessionId, path }`; an empty path means the session's
   *   own root, and every other path is fenced to it.
   * @param signal - request cancellation supplied by the Gateway.
   * @returns `{ path, entries }` on success, `{ error }` on refusal.
   */
  async listDirectory(request, signal) {
    if (typeof request !== 'object' || request === null) {
      return { error: { kind: 'bad-request' } }
    }
    const { sessionId, path } = request
    if (typeof sessionId !== 'string' || typeof path !== 'string') {
      return { error: { kind: 'bad-request' } }
    }
    const listed = await listWorkspaceDirectory(this.ctx, sessionId, path, signal)
    if (!listed.ok) return { error: listed.refusal }
    return { path: listed.path, entries: listed.entries }
  }
}

/**
 * Register the service and its Remote definition.
 *
 * Both registrations are effects, so a reload withdraws the endpoint with the
 * service that answers it; the Gateway stops claiming the endpoint the moment
 * the definition leaves its registry.
 * @param ctx - Cordis context provided by the dsh loader.
 * @param config - validated plugin config.
 */
export function apply(ctx, config) {
  const service = new DeepbuddyFilesService(ctx, config)
  const terminals = new DeepbuddyTerminalManager(ctx)
  ctx.effect(() => ctx.provide(SERVICE_KEY, service), 'deepbuddy: files service')
  ctx.effect(() => ctx.typert.register({
    package: PACKAGE_NAME,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: DESCRIPTORS,
  }), 'deepbuddy: typert definitions')
  // Stream session-fenced media over HTTP so <video>/<img> load directly and
  // large files never round-trip as base64. Guard the optional webServer: a
  // non-web deployment (headless, file://) has none, and readBinary then
  // falls back to the capped base64 path.
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: MEDIA_ROUTE,
      handler(req, res) {
        // Same fail-closed Origin rule as the terminal upgrade below: a
        // foreign page must not read session files even when the server
        // listens on 0.0.0.0. Same-origin media elements send no Origin;
        // any request that does send one must match the host it reached.
        const origin = req.headers.origin
        const reqHost = req.headers.host
        let originHost
        if (origin !== undefined) {
          try { originHost = new URL(origin).host } catch { originHost = '' }
        }
        if (origin !== undefined && reqHost !== undefined && originHost !== reqHost) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        // Belt for the no-Origin embed path: the browser itself refuses to
        // hand these bytes to a cross-origin document.
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
        const raw = new URL(req.url ?? '/', 'http://x').pathname
        const rest = raw.slice(MEDIA_ROUTE.length).replace(/^\//, '')
        const [sessionId, ...pathParts] = rest.split('/').map(part => decodeURIComponent(part))
        if (sessionId === undefined || sessionId === '' || pathParts.length === 0) {
          res.statusCode = 400
          res.end('bad media URL')
          return
        }
        const path = pathParts.join('/')
        // A rejected promise here would be an unhandled rejection — Node ≥15
        // exits the process for those. Fail the one response instead.
        streamMedia(ctx, req, res, sessionId, path).catch(() => {
          if (res.headersSent) { res.destroy(); return }
          res.removeHeader('Content-Length')
          res.removeHeader('Content-Range')
          res.writeHead(500)
          res.end()
        })
      },
    }), 'deepbuddy: media route')

    // webServer owns the HTTP server and exposes an exact upgrade registry, so
    // the plugin supplies only the WebSocket protocol and PTY lifecycle.
    const terminalWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
    terminalWss.on('connection', (socket, request) => {
      const url = new URL(request.url ?? TERMINAL_ROUTE, 'http://x')
      const sessionId = url.searchParams.get('sessionId')
      const termId = url.searchParams.get('termId')
      if (sessionId === null || sessionId === '') {
        sendTerminalMessage(socket, { type: 'error', fatal: true, message: 'session-not-found' })
        socket.close(1008, 'session required')
        return
      }
      if (termId === null || !/^term-\d+$/.test(termId)) {
        sendTerminalMessage(socket, { type: 'error', fatal: true, message: 'term-id-required' })
        socket.close(1008, 'termId required')
        return
      }
      // A kill-intent connection closes an existing PTY and nothing else.
      // Routing it through attach() would SPAWN a shell just to kill it (and
      // race the kill message against listener installation); this path
      // touches only the registry.
      if (url.searchParams.get('intent') === 'kill') {
        terminals.close(sessionId, termId, 'user closed terminal')
        socket.close(1000, 'kill delivered')
        return
      }
      void terminals.attach(sessionId, termId, socket).catch((error) => {
        sendTerminalMessage(socket, { type: 'error', fatal: true, message: error instanceof Error ? error.message : String(error) })
        socket.close(1008, 'terminal refused')
      })
    })
    ctx.effect(() => {
      const unregister = webServer.registerUpgrade({
        path: TERMINAL_ROUTE,
        handler(req, socket, head) {
          // Browser WebSockets carry Origin. Reject a foreign page even when
          // the web server is exposed on 0.0.0.0; same-origin DeepBuddy and
          // non-browser contract clients proceed.
          const origin = req.headers.origin
          const host = req.headers.host
          // `Origin: null` (sandboxed iframe, data:/file: pages) is not a
          // parseable URL — treat it as foreign explicitly instead of relying
          // on the upgrade registry catching the TypeError.
          let originHost
          if (origin !== undefined) {
            try { originHost = new URL(origin).host } catch { originHost = '' }
          }
          if (origin !== undefined && host !== undefined && originHost !== host) {
            socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
            socket.destroy()
            return
          }
          terminalWss.handleUpgrade(req, socket, head, client => { terminalWss.emit('connection', client, req) })
        },
      })
      return () => {
        unregister()
        terminals.dispose()
        for (const client of terminalWss.clients) client.terminate()
        terminalWss.close()
      }
    }, 'deepbuddy: terminal websocket')
  }

  // A session resource ends with its owner, independent of whether a dock
  // attachment happens to be mounted at that moment.
  ctx.effect(() => ctx.on('session/disposed', (session) => {
    terminals.killSession(String(session.id), 'session disposed')
  }), 'deepbuddy: terminal session cleanup')
}

export { DESCRIPTORS, SERVICE_KEY, TERMINAL_MAX_PER_SESSION, TERMINAL_ROUTE }
