/**
 * The temporary occupants' data plane.
 *
 * M1 re-seats the existing chat / session-list / explorer / settings surfaces
 * as in-package occupants of the `dbdy.*` seats, so the window stays usable
 * while the kernel lands. They still need somewhere to hold session, file and
 * preset state — this is that place, and it is deliberately NOT the layout
 * kernel: the kernel knows where things are, this knows what is in them.
 *
 * Everything here is ported from the pre-kernel FrameController with its
 * layout half removed. When M2 lifts each occupant into its own package this
 * file dissolves into those packages, and the kernel keeps no data plane at
 * all — which is the point of splitting them now rather than later.
 */
import type {
  Conversation, Dsh, SessionId, SessionList, SessionSummary, WorkspaceId, WorkspaceList,
} from './dsh.ts'
import type { DirectoryChild, ReadFileResult } from './files.ts'
import type { AgentPresetRoster, PluginInventory, PresetSessionId } from './presets.ts'
import { copyIdBlocker } from './presets.ts'

/** The copy-a-preset draft, live only while a source row is named. */
export interface PresetCopyDraft {
  from: string
  id: string
  name: string
  saving: boolean
  error: string | null
}

/** Everything the temporary occupants render from. */
export interface AppState {
  /** Live session and workspace snapshots. */
  list: SessionList | null
  wsList: WorkspaceList | null
  conv: Conversation | null
  /** Composer draft and the failure of the last send. */
  draft: string
  sendError: string | null
  /** Workspace chosen in the composer picker for the NEXT session. */
  pickedWs: WorkspaceId | null
  /** Per-callId expansion of tool blocks (default collapsed). */
  openCalls: Record<string, boolean>
  /** Workspace files: root path, children per directory, expansion, bodies. */
  fsRoot: string | null
  fsChildren: Record<string, DirectoryChild[] | 'loading' | { error: string }>
  fsExpanded: Record<string, boolean>
  fileBodies: Record<string, ReadFileResult | 'loading'>
  /** Agent-preset roster, and the failure that replaced it. */
  roster: AgentPresetRoster | null
  presetError: string | null
  /** A select/copy/remove/default write is in flight. */
  presetBusy: boolean
  /**
   * A preset picked for the NEXT session, waiting for one to land on. The
   * new-session screen has no session to switch, and the pick must survive
   * whether the workspace connect creates a session or reuses a blank one.
   */
  stagedPreset: string | null
  copy: PresetCopyDraft | null
  /** The preset id awaiting delete confirmation. */
  pendingDelete: string | null
  /** Loader inventory for the plugins settings page. */
  plugins: PluginInventory | null
  pluginsError: string | null
}

/** A state update in the shape the ported actions were written against. */
type StateUpdate = Partial<AppState> | null

/** The occupants' shared store: one per plugin fiber. */
export class AppStore {
  state: AppState = {
    list: null,
    wsList: null,
    conv: null,
    draft: '',
    sendError: null,
    pickedWs: null,
    openCalls: {},
    fsRoot: null,
    fsChildren: {},
    fsExpanded: {},
    fileBodies: {},
    roster: null,
    presetError: null,
    presetBusy: false,
    stagedPreset: null,
    copy: null,
    pendingDelete: null,
    plugins: null,
    pluginsError: null,
  }

  /** The wire bundle every action dispatches through. */
  readonly dsh: Dsh

  private offList: (() => void) | undefined
  private offWs: (() => void) | undefined
  private offConv: (() => void) | undefined
  private offRoster: (() => void) | undefined
  private watchedId: SessionId | undefined

  private readonly listeners = new Set<() => void>()
  private version = 0

  /** Session-change listeners; the explorer pane drops its tabs on one. */
  private readonly sessionListeners = new Set<(id: SessionId | undefined) => void>()

  /**
   * @param dsh - the client wire bundle.
   */
  constructor(dsh: Dsh) {
    this.dsh = dsh
  }

  /**
   * Replace state and notify. Same call shapes React accepted, so the ported
   * action bodies read unchanged.
   * @param update - partial patch, or an updater that returns null to decline.
   * @param after - callback run once the new state is committed.
   */
  setState(update: StateUpdate | ((prev: AppState) => StateUpdate), after?: () => void): void {
    const next = typeof update === 'function' ? update(this.state) : update
    if (next !== null) {
      this.state = { ...this.state, ...next }
      this.version += 1
      for (const listener of this.listeners) listener()
    }
    after?.()
  }

  patch = (p: Partial<AppState>, after?: () => void): void => {
    this.setState(p, after)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  /**
   * Watch the current session id.
   * @param listener - called with the new id whenever it changes.
   * @returns unsubscribe.
   */
  onSessionChange(listener: (id: SessionId | undefined) => void): () => void {
    this.sessionListeners.add(listener)
    return () => { this.sessionListeners.delete(listener) }
  }

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
    // The default moving on disk (or in another tab) changes what the mode
    // surfaces open on, so the roster follows the settings document.
    this.offRoster = this.dsh.onRosterMoved(() => { void this.loadRoster() })
    void this.loadRoster()
  }

  dispose(): void {
    this.offList?.()
    this.offWs?.()
    this.offConv?.()
    this.offRoster?.()
  }

  private onSessions = (): void => {
    const list = this.dsh.sessions.list.getSnapshot()
    this.setState({ list }, () => { void this.applyStagedPreset() })
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
    // Session switch: the file tree belongs to the old fence.
    this.setState({ conv: null, fsRoot: null, fsChildren: {}, fsExpanded: {}, fileBodies: {}, sendError: null })
    for (const listener of this.sessionListeners) listener(id)
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
    void this.loadDir('')
  }

  // ── session actions ───────────────────────────────────────────────────────

  newTask = (): void => {
    this.dsh.workspaces.startSession(this.state.pickedWs ?? undefined)
  }

  selectTask = (id: SessionId): void => {
    this.dsh.sessions.open(id)
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

  // ── agent preset actions ──────────────────────────────────────────────────

  /** Re-read the roster; the one place `presetError` is set from a read. */
  loadRoster = async (): Promise<void> => {
    const r = await this.dsh.presets.list()
    if (!r.ok) {
      this.setState({ presetError: r.error })
      return
    }
    this.setState({ roster: r.value, presetError: null })
  }

  /**
   * Stage a preset for the current-or-next session, then try to apply it.
   *
   * Staging rather than applying directly is what makes the mode chip work on
   * a screen that has no session yet: the pick waits for one to become current
   * and still be blank, whichever way it got created.
   * @param agentPreset - the preset id the user picked.
   */
  selectPreset = (agentPreset: string): void => {
    if (this.state.presetBusy) return
    this.setState({ stagedPreset: agentPreset, presetError: null }, () => { void this.applyStagedPreset() })
  }

  /**
   * Hand the staged pick to the current session when one can take it.
   *
   * Runs both after a pick and after every session-list change, because the
   * session may appear either before or after the pick. A non-blank session
   * consumes the stage without a call: the gateway would answer
   * `agent-preset-locked`, and those render read-only anyway.
   */
  private applyStagedPreset = async (): Promise<void> => {
    const staged = this.state.stagedPreset
    const summary = this.currentSummary
    if (staged === null || summary === undefined || this.state.presetBusy) return
    if (!summary.blank || summary.agentPreset === staged) {
      this.setState({ stagedPreset: null })
      return
    }
    this.setState({ presetBusy: true, presetError: null })
    const r = await this.dsh.presets.select(summary.id as PresetSessionId, staged)
    if (!r.ok) {
      this.setState({ presetBusy: false, stagedPreset: null, presetError: r.error })
      return
    }
    this.setState({ presetBusy: false, stagedPreset: null })
    // Fold the committed choice into the session store this renders from; the
    // host's own `agent-preset/selected` does the same for every other tab.
    this.dsh.sessions.noteAgentPreset(summary.id, r.value)
  }

  /** Persist the preset that sessions created later start from. */
  makeDefaultPreset = (agentPreset: string): void => {
    if (this.state.presetBusy) return
    this.setState({ presetBusy: true, presetError: null })
    void (async () => {
      const r = await this.dsh.presets.setDefault(agentPreset)
      if (!r.ok) {
        this.setState({ presetBusy: false, presetError: r.error })
        return
      }
      this.setState({ presetBusy: false })
      await this.loadRoster()
    })()
  }

  beginCopyPreset = (from: string): void => {
    this.setState({ copy: { from, id: '', name: '', saving: false, error: null }, pendingDelete: null })
  }

  patchCopy = (patch: Partial<PresetCopyDraft>): void => {
    this.setState(x => (x.copy === null ? null : { copy: { ...x.copy, ...patch } }))
  }

  cancelCopyPreset = (): void => {
    this.setState({ copy: null })
  }

  /** Submit the copy, then re-read so the new row appears with its trust. */
  confirmCopyPreset = (): void => {
    const draft = this.state.copy
    const roster = this.state.roster
    if (draft === null || draft.saving || roster === null) return
    const blocker = copyIdBlocker(draft.id, roster)
    if (blocker !== undefined) {
      this.patchCopy({ error: blocker })
      return
    }
    this.patchCopy({ saving: true, error: null })
    void (async () => {
      const r = await this.dsh.presets.copy(draft.from, draft.id.trim(), draft.name)
      if (!r.ok) {
        this.patchCopy({ saving: false, error: r.error })
        return
      }
      this.setState({ copy: null })
      await this.loadRoster()
    })()
  }

  confirmDeletePreset = (agentPreset: string | null): void => {
    this.setState({ pendingDelete: agentPreset, copy: null })
  }

  /** Delete the preset awaiting confirmation; sessions already composed from it keep running. */
  removePreset = (): void => {
    const agentPreset = this.state.pendingDelete
    if (agentPreset === null || this.state.presetBusy) return
    this.setState({ presetBusy: true, presetError: null })
    void (async () => {
      const r = await this.dsh.presets.remove(agentPreset)
      if (!r.ok) {
        this.setState({ presetBusy: false, pendingDelete: null, presetError: r.error })
        return
      }
      this.setState({ presetBusy: false, pendingDelete: null })
      await this.loadRoster()
    })()
  }

  /**
   * The creator entry: a session composed from the `cordis` preset is how a
   * new preset (and a new plugin) gets authored, so 「新建模式」 stages that
   * preset and starts a session rather than writing anything itself.
   *
   * Staged WITHOUT the immediate apply: the still-current session would meet
   * the stage first and consume it as unservable; the list-change applier
   * takes it once the started session becomes current.
   */
  startCreatorSession = (): void => {
    this.setState({ stagedPreset: 'cordis', presetError: null, copy: null, pendingDelete: null })
    this.dsh.workspaces.startSession()
  }

  /** Read the Loader inventory for the plugins settings page. */
  loadPlugins = async (): Promise<void> => {
    const wire = this.dsh.plugins
    if (wire === null) {
      this.setState({ plugins: null, pluginsError: '插件清单服务未装配（remote.pluginInventory 缺席）' })
      return
    }
    const r = await wire.list()
    if (!r.ok) {
      this.setState({ pluginsError: r.error })
      return
    }
    this.setState({ plugins: r.value, pluginsError: null })
  }

  // ── workspace file actions ────────────────────────────────────────────────

  /** List one directory level ('' = the session's workspace root). */
  loadDir = async (path: string): Promise<void> => {
    // watchedId, not state.list.current: setState notifications are batched by
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

  /** Read one file's body; the caller opens the dock tab that shows it. */
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
