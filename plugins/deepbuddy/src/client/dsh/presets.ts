/**
 * Agent presets ("模式") and the Loader plugin inventory.
 *
 * Two host surfaces, one module, because the frame shows them side by side in
 * settings and they share the same failure vocabulary:
 *
 * - presets ride `connection.api.agentPresets` / `connection.api.settings` —
 *   the payload-direct client face of the apiproxy contract. The roster is
 *   ordinary; copy/remove/read are loopback-pinned privileged calls, and the
 *   default preset is a settings FIELD (`agent-presets` namespace, `default`),
 *   not a preset property, so it is written through `settings.update`.
 * - the inventory rides the typed Remote `ctx.remote.pluginInventory.list()`;
 *   there is no apiproxy route for it.
 *
 * Every type derives from `ConnectionHandle['api']` / `ClientContext['remote']`
 * rather than naming a harness export, the same rule dsh.ts follows, so a
 * release that moves a payload shape breaks the typecheck instead of the UI.
 *
 * Failures are values: both wires answer `{ ok: false, error }` for a business
 * refusal AND for a transport rejection, because every DeepBuddy surface shows
 * them the same way (the promptError red-line pattern) and a thrown error
 * inside a click handler would be lost.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: mounts the api-remotes assembly's `ctx.remote` member and its
// `pluginInventory` namespace into this compilation. Erased at build time.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Dsh, SessionSummary } from './adapter.ts'

type Api = ConnectionHandle['api']
type Remote = ClientContext['remote']

/**
 * The success branch's payload of an `ok`-discriminated result union. Written
 * over a naked parameter so the conditional distributes: matching the union
 * itself against `{ ok: true }` would answer `never`.
 */
type ValueOf<S> = S extends { ok: true; value: infer V } ? V : never

/** Success value of an `RpcResponse<T>`-shaped reply. */
type RpcValue<R> = Awaited<R> extends { result: infer S } ? ValueOf<S> : never

/** Success value of a `RemoteResult<T>`-shaped reply. */
type RemoteValue<R> = ValueOf<Awaited<R>>

export type AgentPresetRoster = RpcValue<ReturnType<Api['agentPresets']['list']>>
export type AgentPresetEntry = AgentPresetRoster['presets'][number]
/** The branded session id `select` addresses, taken from its own payload. */
export type PresetSessionId = Parameters<Api['agentPresets']['select']>[0]['sessionId']
export type PluginInventory = RemoteValue<ReturnType<Remote['pluginInventory']['list']>>
export type PluginEntry = PluginInventory['entries'][number]

/** Uniform result of every call in this module. */
export type PresetResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The settings namespace holding the default preset id, and the field inside
 * it. Both are host constants (`dsh-agent-presets` registers
 * `settingsNamespace('agent-presets')` over `{ default: string }`); naming
 * them here keeps the one place a release drift would have to be tracked.
 */
const DEFAULT_PRESET_NS = 'agent-presets'
const DEFAULT_PRESET_FIELD = 'default'

/** The calls the frame makes; every one folds its own failures. */
export interface PresetsWire {
  /** The whole roster, broken entries included (the manager renders them). */
  list(): Promise<PresetResult<AgentPresetRoster>>
  /** Recompose one BLANK session; a started session answers `agent-preset-locked`. */
  select(sessionId: PresetSessionId, agentPreset: string): Promise<PresetResult<string>>
  /** Copy-only authoring: `from` and the new id are both host-resolved ids. */
  copy(from: string, agentPreset: string, name: string): Promise<PresetResult<string>>
  /** Delete a locally authored preset; a shipped one is refused by the host. */
  remove(agentPreset: string): Promise<PresetResult<null>>
  /** Persist the preset sessions created later start from. */
  setDefault(agentPreset: string): Promise<PresetResult<null>>
}

/** Loader inventory, read-only. */
export interface PluginsWire {
  list(): Promise<PresetResult<PluginInventory>>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the preset wire over the connection's api face.
 * @param api - `connection.api`.
 * @returns the five calls the frame makes.
 */
export function createPresetsWire(api: Api): PresetsWire {
  /**
   * Fold one apiproxy call: the transport can reject, and the reply can carry
   * `ok: false`; both mean the same thing to a surface that renders a message.
   */
  const unary = async <T>(run: () => Promise<{ result: { ok: true; value: T } | { ok: false; error: { message: string } } }>): Promise<PresetResult<T>> => {
    try {
      const response = await run()
      return response.result.ok
        ? { ok: true, value: response.result.value }
        : { ok: false, error: response.result.error.message }
    }
    catch (error) {
      return { ok: false, error: messageOf(error) }
    }
  }
  return {
    async list() {
      return await unary(() => api.agentPresets.list({}))
    },
    async select(sessionId, agentPreset) {
      const r = await unary(() => api.agentPresets.select({ sessionId, agentPreset }))
      return r.ok ? { ok: true, value: r.value.agentPreset } : r
    },
    async copy(from, agentPreset, name) {
      const trimmed = name.trim()
      // `exactOptionalPropertyTypes`: an absent name and a `undefined` one are
      // different shapes on the wire, and an empty one would name the row ''.
      const r = await unary(() => api.agentPresets.copy({ from, agentPreset, ...trimmed === '' ? {} : { name: trimmed } }))
      return r.ok ? { ok: true, value: r.value.agentPreset } : r
    },
    async remove(agentPreset) {
      const r = await unary(() => api.agentPresets.remove({ agentPreset }))
      return r.ok ? { ok: true, value: null } : r
    },
    async setDefault(agentPreset) {
      const r = await unary(() => api.settings.update({
        ns: DEFAULT_PRESET_NS,
        patch: { [DEFAULT_PRESET_FIELD]: agentPreset },
      }))
      return r.ok ? { ok: true, value: null } : r
    },
  }
}

/**
 * Build the inventory wire over the typed Remote namespace.
 * @param remote - `ctx.remote`, with `pluginInventory` already mounted.
 * @returns the one read the plugins page makes.
 */
export function createPluginsWire(remote: Remote): PluginsWire {
  return {
    async list() {
      try {
        const result = await remote.pluginInventory.list()
        return result.ok ? { ok: true, value: result.value } : { ok: false, error: `${result.error.code}: ${result.error.message}` }
      }
      catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    },
  }
}

// ── pure view logic (no wire, no React — exercised directly by the tests) ────

/** Display name of one roster row: its published name, else its id. */
export function presetLabel(entry: AgentPresetEntry): string {
  return entry.name ?? entry.id
}

/**
 * The rows a picker offers.
 *
 * A broken preset stays in the roster — its directory occupies the id, so the
 * manager must be able to show and delete it — but it cannot compose a
 * session, and offering it would only defer that discovery to a failed start.
 * @param roster - the host's answer, in root-precedence order.
 * @returns the selectable rows, order untouched.
 */
export function selectablePresets(roster: AgentPresetRoster): AgentPresetEntry[] {
  return roster.presets.filter(p => p.broken === undefined)
}

/** The deployment default, or the first row when the roster declares none. */
export function defaultPresetId(roster: AgentPresetRoster): string | undefined {
  return roster.presets.find(p => p.isDefault)?.id ?? roster.presets[0]?.id
}

/**
 * Whether the mode chip may switch this session's composition.
 *
 * Only a blank session: once a turn has run, its history was produced under
 * that preset's tools, and the gateway answers `agent-preset-locked`. The
 * check lives here rather than in the click handler so the chip renders
 * read-only for exactly the sessions the host would refuse.
 * @param summary - the current session row, or undefined on the empty frame.
 * @returns whether `select` is worth attempting.
 */
export function canSelectPreset(summary: { blank: boolean } | undefined): boolean {
  return summary?.blank === true
}

/**
 * Whether a roster row may be deleted.
 *
 * Only `user` trust: a shipped preset's install is not the user's to manage,
 * and the host refuses it — so the control is absent rather than failing.
 * @param entry - the roster row.
 * @returns whether to offer the delete control.
 */
export function canRemovePreset(entry: AgentPresetEntry): boolean {
  return entry.trust === 'user'
}

/**
 * Why a copy id cannot be submitted yet, or undefined when it can.
 *
 * The id becomes a directory name under the user preset root and a wire
 * identifier, so it is fenced to the characters an id may carry; colliding
 * with an existing row would ask the host to overwrite a preset the roster
 * already offers.
 * @param id - the id typed into the copy dialog.
 * @param roster - the current roster, for the collision check.
 * @returns the message to show under the field, or undefined.
 */
export function copyIdBlocker(id: string, roster: AgentPresetRoster): string | undefined {
  const trimmed = id.trim()
  if (trimmed === '') return '请填写新模式的 id'
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) return 'id 只能用小写字母、数字与连字符，且以字母或数字开头'
  if (roster.presets.some(p => p.id === trimmed)) return `已存在名为 ${trimmed} 的模式`
  return undefined
}

/** Whether the deployment lets a preset be authored at all (`copy` target root). */
export function canAuthorPresets(roster: AgentPresetRoster | null): boolean {
  return roster?.authorable === true
}

/** Chinese label for one Loader entry's fiber phase. */
export function pluginPhaseLabel(entry: PluginEntry): string {
  switch (entry.fiberPhase) {
    case 'active': return '已挂载'
    case 'pending': return '待加载'
    case 'loading': return '加载中'
    case 'failed': return '挂载失败'
    case 'unloading': return '卸载中'
    default: return entry.enabled ? '未挂载' : '已禁用'
  }
}

// ── the preset plane ────────────────────────────────────────────────────────

/**
 * The roster plane both settings and the composer's mode chip render from.
 *
 * Agent presets are DSH domain data, and the surfaces that consume them sit
 * in two features — the settings modes page and the conversation mode chip —
 * so the stateful projection of that domain lives here in the adapter: it
 * folds the wire's failures into one `presetError`, guards every write with
 * one `presetBusy`, and owns the staged-next-session pick (deepbuddy-design-
 * current/DEVELOPMENT_RULES.md §5: the adapter unifies error/loading state
 * and wraps host commands). One instance per plugin fiber.
 */
export class PresetPlane {
  state: {
    /** Whole roster; null until the first successful read. */
    roster: AgentPresetRoster | null
    /** The failure that replaced the roster, rendered in the red-line pattern. */
    presetError: string | null
    /** A select/copy/remove/default write is in flight. */
    presetBusy: boolean
    /**
     * A preset picked for the NEXT session, waiting for one to land on. The
     * new-session screen has no session to switch, and the pick must survive
     * whether the workspace connect creates a session or reuses a blank one.
     */
    stagedPreset: string | null
  } = {
    roster: null,
    presetError: null,
    presetBusy: false,
    stagedPreset: null,
  }

  private readonly dsh: Dsh

  private offList: (() => void) | undefined
  private offRoster: (() => void) | undefined

  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(dsh: Dsh) {
    this.dsh = dsh
  }

  /** Replace state and notify. */
  private setState(next: Partial<PresetPlane['state']>): void {
    this.state = { ...this.state, ...next }
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  /** Summary row of the current session, straight from the live list. */
  private get currentSummary(): SessionSummary | undefined {
    const list = this.dsh.sessions.list.getSnapshot()
    if (list.current === undefined) return undefined
    return (list.byId as Partial<Record<string, SessionSummary>>)[list.current as string]
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    // The staged pick is consumed when a current blank session appears, so
    // the applier follows the live session list.
    this.offList = this.dsh.sessions.list.subscribe(() => { void this.applyStagedPreset() })
    // The default moving on disk (or in another tab) changes what the mode
    // surfaces open on, so the roster follows the settings document.
    this.offRoster = this.dsh.onRosterMoved(() => { void this.loadRoster() })
    void this.loadRoster()
  }

  dispose(): void {
    this.offList?.()
    this.offRoster?.()
  }

  // ── actions ───────────────────────────────────────────────────────────────

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
   * a screen that has no session yet: the pick waits for one to become
   * current and still be blank, whichever way it got created.
   * @param agentPreset - the preset id the user picked.
   */
  selectPreset = (agentPreset: string): void => {
    if (this.state.presetBusy) return
    this.setState({ stagedPreset: agentPreset, presetError: null })
    void this.applyStagedPreset()
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

  /**
   * Delete the preset awaiting confirmation; sessions already composed from
   * it keep running. The caller clears its own pending-delete marker.
   * @param agentPreset - the preset id to remove.
   */
  removePreset = async (agentPreset: string): Promise<void> => {
    if (this.state.presetBusy) return
    this.setState({ presetBusy: true, presetError: null })
    try {
      const r = await this.dsh.presets.remove(agentPreset)
      if (!r.ok) {
        this.setState({ presetBusy: false, presetError: r.error })
        return
      }
      this.setState({ presetBusy: false })
      await this.loadRoster()
    }
    catch (e) {
      this.setState({ presetBusy: false, presetError: e instanceof Error ? e.message : String(e) })
    }
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
    this.setState({ stagedPreset: 'cordis', presetError: null })
    this.dsh.workspaces.startSession()
  }
}
