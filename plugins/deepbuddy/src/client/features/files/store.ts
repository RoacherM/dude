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
}

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
  }

  /** The wire bundle every action dispatches through. */
  readonly dsh: Dsh

  private offList: (() => void) | undefined
  private watchedId: SessionId | undefined

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
  }

  private onSessions = (): void => {
    const list = this.dsh.sessions.list.getSnapshot()
    this.setState({ sessionId: list.current })
    // Re-watch when the current id changed, and retry a binding that was not
    // hydrated yet (watchedId stays undefined until a subscription sticks).
    if (list.current !== this.watchedId) this.watchSession(list.current)
  }

  private watchSession(id: SessionId | undefined): void {
    this.watchedId = id
    // Session switch: the file tree belongs to the old fence.
    this.setState({ fsRoot: null, fsChildren: {}, fsExpanded: {}, fileBodies: {} })
    if (id === undefined) return
    const binding = this.dsh.sessions.binding(id)
    if (!binding) {
      // Not hydrated yet: the next list notification retries.
      this.watchedId = undefined
      return
    }
    void this.loadDir('')
  }

  // ── workspace file actions ────────────────────────────────────────────────

  /** List one directory level ('' = the session's workspace root). */
  loadDir = async (path: string): Promise<void> => {
    // watchedId, not state.sessionId: setState notifications are batched by
    // React and this runs synchronously from watchSession.
    const id = this.watchedId
    const files = this.dsh.files
    if (id === undefined || files === null) return
    const key = path === '' ? 'root' : path
    this.setState(x => ({ fsChildren: { ...x.fsChildren, [key]: 'loading' } }))
    try {
      const r = await files.listDirectory(id as string, path)
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
      this.setState(x => ({ fsChildren: { ...x.fsChildren, [key]: { error: e instanceof Error ? e.message : String(e) } } }))
    }
  }

  toggleFolder = (path: string): void => {
    const expanding = !this.state.fsExpanded[path]
    this.setState(x => ({ fsExpanded: { ...x.fsExpanded, [path]: expanding } }))
    if (expanding && this.state.fsChildren[path] === undefined) void this.loadDir(path)
  }

  /** Read one file's body; the caller opens the inspector tab that shows it. */
  openFile = (child: DirectoryChild): void => {
    const id = this.watchedId
    const files = this.dsh.files
    if (id === undefined || files === null || this.state.fileBodies[child.path] !== undefined) return
    this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: 'loading' } }))
    void files.readFile(id as string, child.path)
      .then((r) => { this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: r } })) })
      .catch((e: unknown) => {
        const err: ReadFileResult = { error: { kind: 'wire', message: e instanceof Error ? e.message : String(e) } }
        this.setState(x => ({ fileBodies: { ...x.fileBodies, [child.path]: err } }))
      })
  }
}
