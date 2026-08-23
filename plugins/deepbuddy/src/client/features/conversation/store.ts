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

/** Everything the conversation feature's sidebar entry observes. */
export interface ConversationState {
  /** Live session snapshot. */
  list: SessionList | null
  /** Live workspace snapshot (current workspace). */
  wsList: WorkspaceList | null
  /** The open conversation snapshot. */
  conv: Conversation | null
  /** Workspace chosen in the composer picker for the NEXT session. */
  pickedWs: WorkspaceId | null
}

/** A state update in the shape the ported actions were written against. */
type StateUpdate = Partial<ConversationState> | null

/** The conversation store: one per plugin fiber. */
export class ConversationStore {
  state: ConversationState = {
    list: null,
    wsList: null,
    conv: null,
    pickedWs: null,
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

  /** Whether the current session is blank (a fresh, not-yet-started one). */
  get isBlank(): boolean {
    const { conv, list } = this.state
    if (conv !== null) return conv.blank
    const cur = list?.current
    if (cur === undefined) return true
    const summary = (list?.byId as Partial<Record<string, SessionSummary>> | undefined)?.[cur as string]
    return summary === undefined || summary.blank === true
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
    this.setState({ conv: null })
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

}
