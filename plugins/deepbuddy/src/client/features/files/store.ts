/**
 * The files feature's data plane.
 *
 * Owns the workspace file tree — the root path, one listing per directory,
 * the expansion set and the opened file bodies — plus the session watching
 * that fences the tree. File content stays in DSH's hands; this store keeps
 * the frontend projection and the failure states
 * (deepbuddy-design-current/DEVELOPMENT_RULES.md §5/§6). One instance per
 * plugin fiber.
 */
import type { Dsh, SessionId } from '../../dsh/adapter.ts'
import type { DirectoryChild, ReadFileResult } from '../../dsh/files.ts'

/** Decode a base64 string into raw bytes (used by the media preview). */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Everything the file tree renders from. */
export interface FilesState {
  /** The current session id; undefined on the empty frame. */
  sessionId: SessionId | undefined
  /** The session's workspace root path. */
  fsRoot: string | null
  /** Children per directory key ('' → 'root'), loading or error states included. */
  fsChildren: Record<string, DirectoryChild[] | 'loading' | { error: string }>
  /** Per-directory expansion. */
  fsExpanded: Record<string, boolean>
  /** Opened file bodies, keyed by path. */
  fileBodies: Record<string, ReadFileResult | 'loading'>
  /**
   * Decoded image/video previews, keyed by path. Blob URLs are STORE-owned:
   * they live exactly as long as this cache and are revoked by the session
   * fence in `watchSession` — a view unmount must not revoke them, or the
   * cached entry would point at a dead URL on the next open. Kept out of
   * {@link fileBodies} because a media preview is rendering state, not a
   * text-body result.
   */
  mediaBodies: Record<string, MediaBody>
}

/** The byte-preview state for one image/video path. */
export type MediaBody =
  | 'loading'
  | { kind: 'url'; url: string; size: number | null }
  | { kind: 'too-large'; size: number | null }
  | { kind: 'error'; message: string }

/** A state update in the shape the ported actions were written against. */
type StateUpdate = Partial<FilesState> | null

/** The files store: one per plugin fiber. */
export class FilesStore {
  state: FilesState = {
    sessionId: undefined,
    fsRoot: null,
    fsChildren: {},
    fsExpanded: {},
    fileBodies: {},
    mediaBodies: {},
  }

  /** The wire bundle every action dispatches through. */
  readonly dsh: Dsh

  private offList: (() => void) | undefined
  private watchedId: SessionId | undefined
  /**
   * Monotonic fence generation. Comparing session IDs alone lets an A→B→A
   * round-trip revalidate a stale A response (the ABA race); every
   * watchSession — and dispose — bumps this so only responses from the
   * CURRENT watch may write state.
   */
  private generation = 0

  private readonly listeners = new Set<() => void>()
  private version = 0

  /**
   * @param dsh - the client wire bundle.
   */
  constructor(dsh: Dsh) {
    this.dsh = dsh
  }

  /**
   * Replace state and notify.
   * @param update - partial patch, or an updater that returns null to decline.
   * @param after - callback run once the new state is committed.
   */
  setState(update: StateUpdate | ((prev: FilesState) => StateUpdate), after?: () => void): void {
    const next = typeof update === 'function' ? update(this.state) : update
    if (next !== null) {
      this.state = { ...this.state, ...next }
      this.version += 1
      for (const listener of this.listeners) listener()
    }
    after?.()
  }

  patch = (p: Partial<FilesState>, after?: () => void): void => {
    this.setState(p, after)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    this.offList = this.dsh.sessions.list.subscribe(this.onSessions)
    this.onSessions()
  }

  dispose(): void {
    this.offList?.()
    // No session fence runs after this: invalidate every in-flight response
    // (a post-dispose decode would otherwise still create a blob URL nothing
    // can ever revoke) and release the URLs the store owns.
    this.generation += 1
    this.watchedId = undefined
    this.revokeMediaUrls()
  }

  private onSessions = (): void => {
    const list = this.dsh.sessions.list.getSnapshot()
    // The file wire is session-id fenced by the host and does not need the
    // renderer's conversation binding to hydrate first.
    if (list.current !== this.watchedId) this.watchSession(list.current)
  }

  private watchSession(id: SessionId | undefined): void {
    this.watchedId = id
    this.generation += 1
    // Session switch: the file tree belongs to the old fence. The store owns
    // the media blob URLs, so the fence revokes them with the cache — a view
    // unmount deliberately does NOT (the cache would then point at dead URLs).
    this.revokeMediaUrls()
    this.setState({ sessionId: id, fsRoot: null, fsChildren: {}, fsExpanded: {}, fileBodies: {}, mediaBodies: {} })
  }

  private revokeMediaUrls(): void {
    for (const body of Object.values(this.state.mediaBodies)) {
      if (typeof body === 'object' && body.kind === 'url' && body.url.startsWith('blob:')) {
        URL.revokeObjectURL(body.url)
      }
    }
  }

  /**
   * Whether an async response started under generation `gen` may still write
   * state. Every await in this store crosses a possible session switch; a
   * stale response must be dropped, not merged into the next session's tree —
   * the same fence rule the browser/terminal side got in 597822a. The
   * generation (not the session id) is what is compared, so an A→B→A
   * round-trip cannot revalidate a response from the first A watch.
   */
  private fresh(gen: number): boolean {
    return this.generation === gen
  }

  /** Load the root only when the Files view is actually visible. */
  ensureRootLoaded = (): void => {
    const id = this.state.sessionId
    if (id === undefined || this.state.fsChildren['root'] !== undefined) return
    void this.loadDir('')
  }

  // ── workspace file actions ────────────────────────────────────────────────

  /** List one directory level ('' = the session's workspace root). */
  loadDir = async (path: string): Promise<void> => {
    // watchedId is the synchronous session fence set by watchSession.
    const id = this.watchedId
    const gen = this.generation
    const files = this.dsh.files
    if (id === undefined || files === null) return
    const key = path === '' ? 'root' : path
    this.setState(x => ({ fsChildren: { ...x.fsChildren, [key]: 'loading' } }))
    try {
      const r = await files.listDirectory(id as string, path)
      if (!this.fresh(gen)) return
      if ('error' in r) {
        const detail = r.error.message === undefined ? r.error.kind : `${r.error.kind}: ${r.error.message}`
        this.setState(x => ({ fsChildren: { ...x.fsChildren, [key]: { error: detail } } }))
        return
      }
      this.setState(x => ({
        fsRoot: path === '' ? r.path : x.fsRoot,
        fsChildren: { ...x.fsChildren, [key]: r.entries, ...(path === '' ? { [r.path]: r.entries } : {}) },
      }))
    }
    catch (e) {
      if (!this.fresh(gen)) return
      this.setState(x => ({ fsChildren: { ...x.fsChildren, [key]: { error: e instanceof Error ? e.message : String(e) } } }))
    }
  }

  toggleFolder = (path: string): void => {
    const expanding = !this.state.fsExpanded[path]
    this.setState(x => ({ fsExpanded: { ...x.fsExpanded, [path]: expanding } }))
    if (expanding && this.state.fsChildren[path] === undefined) void this.loadDir(path)
  }

  /** Read one file's body; the caller opens the inspector tab that shows it.
   *  A cached error is not a cache hit — clicking again retries. */
  openFile = (child: DirectoryChild): void => {
    const id = this.watchedId
    const gen = this.generation
    const files = this.dsh.files
    if (id === undefined || files === null) return
    const cached = this.state.fileBodies[child.path]
    if (cached !== undefined && !(typeof cached === 'object' && 'error' in cached)) return
    this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: 'loading' } }))
    void files.readFile(id as string, child.path)
      .then((r) => {
        if (!this.fresh(gen)) return
        this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: r } }))
      })
      .catch((e: unknown) => {
        if (!this.fresh(gen)) return
        const err: ReadFileResult = { error: { kind: 'wire', message: e instanceof Error ? e.message : String(e) } }
        this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: err } }))
      })
  }

  /** Read one image/video file's bytes and decode a blob URL for the preview.
   *  A cached error is not a cache hit — clicking again retries. */
  openBinaryFile = (path: string): void => {
    const id = this.watchedId
    const gen = this.generation
    const files = this.dsh.files
    if (id === undefined || files === null) return
    const cached = this.state.mediaBodies[path]
    if (cached !== undefined && !(typeof cached === 'object' && cached.kind === 'error')) return
    this.setState(x => ({ mediaBodies: { ...x.mediaBodies, [path]: 'loading' } }))
    void files.readBinary(id as string, path)
      .then((r) => {
        if (!this.fresh(gen)) return
        if ('error' in r) {
          this.setState(x => ({
            mediaBodies: {
              ...x.mediaBodies,
              [path]: { kind: 'error', message: r.error.message ?? r.error.kind },
            },
          }))
          return
        }
        if (r.kind === 'binary-too-large') {
          this.setState(x => ({ mediaBodies: { ...x.mediaBodies, [path]: { kind: 'too-large', size: r.size } } }))
          return
        }
        // An HTTP URL (media route registered): hand it straight to
        // <img>/<video>, which streams with Range — no base64 decode, no blob.
        // A blob URL is only for the capped base64 fallback.
        if (r.kind === 'url') {
          // The host answers a session-relative path; the page origin makes it
          // an absolute URL to the same HTTP server the app already loaded from.
          const href = new URL(r.url, window.location.origin).href
          this.setState(x => ({ mediaBodies: { ...x.mediaBodies, [path]: { kind: 'url', url: href, size: r.size } } }))
          return
        }
        // Decode base64 to a blob URL. `atob`, not the deprecated Buffer path —
        // this runs in the browser renderer without Node globals.
        const bytes = base64ToBytes(r.base64)
        // `bytes` is exactly-sized (built from the decoded length), so its
        // backing buffer is a plain ArrayBuffer — safe to hand to Blob.
        const blob = new Blob([bytes.buffer as ArrayBuffer])
        const url = URL.createObjectURL(blob)
        if (!this.fresh(gen)) {
          // Stale decode: nothing will ever render or revoke it via state.
          URL.revokeObjectURL(url)
          return
        }
        this.setState(x => ({ mediaBodies: { ...x.mediaBodies, [path]: { kind: 'url', url, size: r.size } } }))
      })
      // A transport rejection (host half missing, IPC drop) must land as a
      // renderable error, not an unhandled rejection that leaves the preview
      // on "读取媒体…" forever with the cache guard blocking every retry.
      .catch((e: unknown) => {
        if (!this.fresh(gen)) return
        this.setState(x => ({
          mediaBodies: {
            ...x.mediaBodies,
            [path]: { kind: 'error', message: e instanceof Error ? e.message : String(e) },
          },
        }))
      })
  }
}
