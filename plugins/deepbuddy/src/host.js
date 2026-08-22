/**
 * Host half of the deepbuddy plugin: the distribution's session-fenced file
 * surface.
 *
 * Publishes two Remote endpoints on the Typert Gateway's shared `/api` channel
 * — `deepbuddyFiles/readFile` and `deepbuddyFiles/listDirectory` — through
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

/** Stable Cordis plugin name. */
export const name = 'deepbuddy'

/**
 * Required services. `fs` stays out: the fs seam is optional in an assembly,
 * and a missing backend is a per-request refusal (`fs-missing`), not a reason
 * to keep the whole distribution unmounted.
 */
export const inject = ['typert', 'sessions']

/** Cordis service key and Remote wire namespace of the file surface. */
const SERVICE_KEY = 'deepbuddyFiles'

/** npm package name, used as the Typert contribution's owner identity. */
const PACKAGE_NAME = 'dsh-plugin-deepbuddy'

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
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: SERVICE_KEY,
      namespace: SERVICE_KEY,
    })
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

  /**
   * Read one workspace file's raw bytes for the browser's media renderer.
   *
   * Same fence and refusal vocabulary as {@link readFile}; the byte cap is
   * `previewMaxBytes`. A file past the cap answers `tooLarge: true` so the
   * renderer shows a "文件过大" state. The bytes travel as base64 — JSON-safe
   * across the Remote boundary without a second channel.
   * @param request - `{ sessionId, path }`; the path is fenced to that
   *   session's project root.
   * @param signal - request cancellation supplied by the Gateway.
   * @returns `{ kind: 'binary', base64, size }`, `{ kind: 'binary-too-large',
   *   size }`, or `{ error }` on refusal.
   */
  async readBinary(request, signal) {
    if (typeof request !== 'object' || request === null) {
      return { error: { kind: 'bad-request' } }
    }
    const { sessionId, path } = request
    if (typeof sessionId !== 'string' || typeof path !== 'string' || path === '') {
      return { error: { kind: 'bad-request' } }
    }
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
  ctx.effect(() => ctx.provide(SERVICE_KEY, service), 'deepbuddy: files service')
  ctx.effect(() => ctx.typert.register({
    package: PACKAGE_NAME,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: DESCRIPTORS,
  }), 'deepbuddy: typert definitions')
}

export { DESCRIPTORS, SERVICE_KEY }
