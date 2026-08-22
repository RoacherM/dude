/**
 * Workspace file listing/reading over the `deepbuddyFiles/*` Typert Remote
 * endpoints that this plugin's own host half registers. The harness itself
 * has no session-fenced file enumeration — `host.listDirectory` lists
 * directories only — so the distribution carries its own (src/host.js).
 *
 * Endpoint `deepbuddyFiles/<method>`, payload `{ args: { request } }`;
 * `session-not-found` is retried briefly because a freshly opened stored
 * session hydrates a moment after selection.
 */

export interface WorkspaceRefusal {
  kind: string
  message?: string
}

export type ReadFileResult =
  | { kind: 'text'; text: string; truncated: boolean; size: number | null }
  | { kind: 'binary'; size: number | null }
  | { kind: 'binary-too-large'; size: number | null }
  | { error: WorkspaceRefusal }

/** Result of the byte channel an image/video renderer reads through. */
export type ReadBinaryResult =
  | { kind: 'binary'; base64: string; size: number | null }
  | { kind: 'binary-too-large'; size: number | null }
  | { error: WorkspaceRefusal }

export interface DirectoryChild {
  name: string
  path: string
  directory: boolean
}

export type ListDirectoryResult =
  | { path: string; entries: DirectoryChild[] }
  | { error: WorkspaceRefusal }

/** The generic RPC caller the Connection service exposes to the browser. */
export interface ConnectionRpc {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<
    { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
  >
}

export interface WorkspaceFilesWire {
  readFile(sessionId: string, path: string): Promise<ReadFileResult>
  readBinary(sessionId: string, path: string): Promise<ReadBinaryResult>
  listDirectory(sessionId: string, path: string, signal?: AbortSignal): Promise<ListDirectoryResult>
}

const HYDRATING = 'session-not-found'
const RETRY_MS = 250
const RETRY_LIMIT = 12

function hydrating(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return typeof error === 'object' && error !== null && error !== undefined
    && 'kind' in error && error.kind === HYDRATING
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  // The TS lib target predates `Promise.withResolvers`, so the executor form
  // is the portable way to build this promise.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Build the wire over the Connection RPC caller.
 * @param rpc - `connection.rpc`.
 * @returns the three calls the file dock makes.
 */
export function createFilesWire(rpc: ConnectionRpc): WorkspaceFilesWire {
  const call = async (method: string, request: unknown, signal?: AbortSignal): Promise<unknown> => {
    for (let attempt = 0; ; attempt++) {
      const result = await rpc.call('/api', `deepbuddyFiles/${method}`, { args: { request } }, signal)
      if (!result.ok) {
        // `invocation-unavailable` here means the host half is not loaded —
        // the dock renders that as its empty state.
        throw new Error(`deepbuddyFiles/${method}: ${result.error.message}`)
      }
      if (attempt >= RETRY_LIMIT || !hydrating(result.value)) return result.value
      await delay(RETRY_MS, signal)
    }
  }
  return {
    async readFile(sessionId, path) {
      return await call('readFile', { sessionId, path }) as ReadFileResult
    },
    async readBinary(sessionId, path) {
      return await call('readBinary', { sessionId, path }) as ReadBinaryResult
    },
    async listDirectory(sessionId, path, signal) {
      return await call('listDirectory', { sessionId, path }, signal) as ListDirectoryResult
    },
  }
}
