/**
 * The conversation feature's data plane.
 *
 * Owns exactly the state the chat surface renders — the live session list
 * projection, the open conversation snapshot, the composer draft, the tool
 * block expansion and the workspace pick — and the actions that move them.
 * Domain data stays DSH's: this store holds snapshot REFERENCES and re-reads
 * them on notification; it never copies a session log
 * (deepbuddy-design-current/DEVELOPMENT_RULES.md §5/§6). One instance per
 * plugin fiber.
 */
import type {
  Conversation, Dsh, SessionId, SessionList, SessionSummary, WorkspaceId, WorkspaceList,
} from '../../dsh/adapter.ts'

/** Everything the conversation surface renders from. */
export interface ConversationState {
  /** Live session snapshot. */
  list: SessionList | null
  /** Live workspace snapshot (composer picker, current workspace). */
  wsList: WorkspaceList | null
  /** The open conversation snapshot. */
  conv: Conversation | null
  /** Composer draft. */
  draft: string
  /** The failure of the last send. */
  sendError: string | null
  /** Workspace chosen in the composer picker for the NEXT session. */
  pickedWs: WorkspaceId | null
  /** Per-callId expansion of tool blocks (default collapsed). */
  openCalls: Record<string, boolean>
}

/** A state update in the shape the ported actions were written against. */
type StateUpdate = Partial<ConversationState> | null

/** The conversation store: one per plugin fiber. */
export class ConversationStore {
  state: ConversationState = {
    list: null,
    wsList: null,
    conv: null,
    draft: '',
    sendError: null,
    pickedWs: null,
    openCalls: {},
  }

  /** The wire bundle every action dispatches through. */
  readonly dsh: Dsh

  private offList: (() => void) | undefined
  private offWs: (() => void) | undefined
  private offConv: (() => void) | undefined
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
  setState(update: StateUpdate | ((prev: ConversationState) => StateUpdate), after?: () => void): void {
    const next = typeof update === 'function' ? update(this.state) : update
    if (next !== null) {
      this.state = { ...this.state, ...next }
      this.version += 1
      for (const listener of this.listeners) listener()
    }
    after?.()
  }

  patch = (p: Partial<ConversationState>, after?: () => void): void => {
    this.setState(p, after)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  /** Whether the conversation shows the empty hero. */
  get empty(): boolean {
    const { list, conv } = this.state
    if (!list || list.current === undefined) return true
    return conv !== null && conv.blank
  }

  /** Summary row of the current session. */
  get currentSummary(): SessionSummary | undefined {
    const { list } = this.state
    if (!list || list.current === undefined) return undefined
    return (list.byId as Partial<Record<string, SessionSummary>>)[list.current as string]
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    this.offList = this.dsh.sessions.list.subscribe(this.onSessions)
    this.onSessions()
    this.offWs = this.dsh.workspaces.list.subscribe(this.onWorkspaces)
    this.onWorkspaces()
  }

  dispose(): void {
    this.offList?.()
    this.offWs?.()
    this.offConv?.()
  }

  private onSessions = (): void => {
    const list = this.dsh.sessions.list.getSnapshot()
    this.setState({ list })
    // Re-watch when the current id changed, and retry a binding that was not
    // hydrated yet (watchedId stays undefined until a subscription sticks).
    if (list.current !== this.watchedId) this.watchSession(list.current)
  }

  private onWorkspaces = (): void => {
    this.setState({ wsList: this.dsh.workspaces.list.getSnapshot() })
  }

  private watchSession(id: SessionId | undefined): void {
    this.offConv?.()
    this.offConv = undefined
    this.watchedId = id
    // Session switch: the conversation belongs to the new fence.
    this.setState({ conv: null, sendError: null })
    if (id === undefined) return
    const binding = this.dsh.sessions.binding(id)
    if (!binding) {
      // Not hydrated yet: the next list notification retries.
      this.watchedId = undefined
      return
    }
    const push = (): void => { this.setState({ conv: binding.session.getSnapshot() }) }
    this.offConv = binding.session.subscribe(push)
    push()
  }

  // ── actions ───────────────────────────────────────────────────────────────

  newTask = (): void => {
    this.dsh.workspaces.startSession(this.state.pickedWs ?? undefined)
  }

  /** Send the draft to the live session (steering while it runs). */
  send = (): void => {
    const text = this.state.draft.trim()
    if (!text) return
    this.setState({ draft: '', sendError: null })
    void (async () => {
      try {
        const cur = this.state.list?.current
        if (cur !== undefined) {
          const binding = this.dsh.sessions.binding(cur)
          if (!binding) throw new Error('会话尚未就绪')
          const mode: 'queue' | 'steer' = this.state.conv?.running ? 'steer' : 'queue'
          await binding.session.prompt([{ type: 'text', text }], mode)
          return
        }
        // No session at all: connect the picked (or most recent) workspace.
        const wsId = this.state.pickedWs
          ?? this.state.wsList?.recentWorkspaceId
          ?? this.state.wsList?.items[0]?.workspaceId
        if (wsId === undefined) throw new Error('没有可用的工作空间')
        const id = await this.dsh.workspaces.connectWorkspace(wsId)
        this.dsh.sessions.open(id)
        await this.dsh.sessions.binding(id)?.session.prompt([{ type: 'text', text }], 'queue')
      }
      catch (e) {
        this.setState({ sendError: e instanceof Error ? e.message : String(e) })
      }
    })()
  }

  /** Cancel the running turn of the current session. */
  stop = (): void => {
    const cur = this.state.list?.current
    if (cur === undefined) return
    void this.dsh.sessions.binding(cur)?.session.cancel()
  }

  /** Pull one more page of history into the open conversation. */
  loadOlder = (): void => {
    const cur = this.state.list?.current
    if (cur === undefined) return
    void this.dsh.sessions.binding(cur)?.session.loadOlder()
  }

  toggleCall = (callId: string): void => {
    this.setState(x => ({ openCalls: { ...x.openCalls, [callId]: !x.openCalls[callId] } }))
  }

  /** Composer picker: with no session it connects now, else it arms the next task. */
  pickWorkspace = (id: WorkspaceId): void => {
    if (this.state.list?.current === undefined) {
      void (async () => {
        const sessionId = await this.dsh.workspaces.connectWorkspace(id)
        this.dsh.sessions.open(sessionId)
      })()
      return
    }
    this.patch({ pickedWs: id })
  }

  /** Directory picker → workspace record → connected session. */
  openLocalFolder = (): void => {
    void (async () => {
      const path = await this.dsh.workspaces.pickDirectory()
      if (path === null) return
      const view = await this.dsh.workspaces.create({ path })
      const sessionId = await this.dsh.workspaces.connectWorkspace(view.workspaceId)
      this.dsh.sessions.open(sessionId)
    })()
  }
}
