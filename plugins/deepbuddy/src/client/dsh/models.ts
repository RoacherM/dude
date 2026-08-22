/**
 * Provider / model wire: the DSH ABI face for the settings Models page and
 * the composer model selector.
 *
 * Every call folds its own failure into a `Result<T>`. The host stays the
 * single fact source — the settings page and the composer read through the
 * same unary calls the official model pages use (`llm.providers`,
 * `llm.models`, `sessions.models`, `sessions.selectModel`), and fire every
 * mutation through the same write (`settings.replace` / `credentials.set`),
 * so a switch made in either seat is what the other shows next.
 *
 * API keys never leave the wire in cleartext toward React state beyond the
 * in-flight draft of the set call: reads are existence-only (`credentials.
 * describe` returns `configured`/`source`/`writable`, never the value).
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { Dsh, SessionId } from './adapter.ts'

type Api = ConnectionHandle['api']

type ValueOf<S> = S extends { ok: true; value: infer V } ? V : never
type RpcValue<R> = Awaited<R> extends { result: infer S } ? ValueOf<S> : never

/** One configurable provider the settings page renders (llm.providers). */
export type ProviderView = RpcValue<ReturnType<Api['llm']['providers']>>['providers'][number]
/** One model in a provider's catalog (llm.models). */
export type CatalogModel = RpcValue<ReturnType<Api['llm']['models']>>['groups'][number]['models'][number]
/** One provider group from a model directory. */
export type ModelGroup = RpcValue<ReturnType<Api['sessions']['models']>>['groups'][number]
/** One credential ref's state (configured/source/writable, never the value). */
export type CredentialView = NonNullable<RpcValue<ReturnType<Api['credentials']['describe']>>['credentials'][string]>
/** Complete model selection (provider / model / optional reasoning effort). */
export type ModelSelection = RpcValue<ReturnType<Api['sessions']['selectModel']>>['selected']
/** A provider's profile object inside its settings namespace. */
export type ProviderProfile = { apiKeyEnv?: string; baseURL?: string; models?: unknown }

/** Uniform result of every call in this module. */
export type ModelResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** The settings namespace holding the deployment default model. */
const DEFAULT_MODEL_NS = 'agent-default-model'

/** The calls the settings page and the composer make; every one folds its own failures. */
export interface ModelsWire {
  /** Configurable-provider directory (settings Models page). */
  listProviders(): Promise<ModelResult<ProviderView[]>>
  /** Session-independent model catalog (settings Models page). */
  listModels(): Promise<ModelResult<{ groups: ModelGroup[]; failures: { id: string; message: string }[] }>>
  /** The deployment default model selection (settings Models page). */
  defaultModel(): Promise<ModelResult<ModelSelection>>
  /** Save the deployment default model selection (settings Models page). */
  setDefaultModel(selection: ModelSelection): Promise<ModelResult<null>>
  /** Existence state of one credential ref (settings Models page; never the value). */
  describeCredential(ref: string): Promise<ModelResult<CredentialView>>
  /** Store one credential value (settings Models page). */
  setCredential(ref: string, value: string): Promise<ModelResult<null>>
  /** One provider's profile object (apiKeyEnv / baseURL) from its settings namespace. */
  providerProfile(view: ProviderView): Promise<ModelResult<ProviderProfile>>
  /** Whether the settings mirror is writable. */
  settingsWritable(): Promise<ModelResult<boolean>>
  /** Session model directory + current selection (composer selector). */
  sessionModels(sessionId: SessionId): Promise<ModelResult<{ current: ModelSelection; routable: boolean; groups: ModelGroup[] }>>
  /** Select the model for a session (composer selector; the host applies it live). */
  selectSessionModel(sessionId: SessionId, selection: ModelSelection): Promise<ModelResult<ModelSelection>>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the models wire over the connection's api face.
 * @param api - `connection.api`.
 * @returns the ten calls the settings page and the composer make.
 */
export function createModelsWire(api: Api): ModelsWire {
  /**
   * Fold one apiproxy call: the transport can reject, and the reply can carry
   * `ok: false`; both mean the same thing to a surface that renders a message.
   */
  const unary = async <T>(run: () => Promise<{ result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } } }>): Promise<ModelResult<T>> => {
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
    async listProviders() {
      const r = await unary(() => api.llm.providers({}))
      return r.ok ? { ok: true, value: r.value.providers } : r
    },
    async listModels() {
      const r = await unary(() => api.llm.models({}))
      return r.ok ? { ok: true, value: { groups: r.value.groups, failures: r.value.failures } } : r
    },
    async defaultModel() {
      // The default lives in the `agent-default-model` settings namespace
      // (provider / model / reasoningEffort). Read it from the redacted
      // settings describe.
      const r = await unary(() => api.settings.describe({}))
      if (!r.ok) return r
      const ns = r.value.namespaces.find(n => n.ns === DEFAULT_MODEL_NS)
      const value = ns?.value
      if (typeof value !== 'object' || value === null) {
        return { ok: false, error: `设置命名空间 ${DEFAULT_MODEL_NS} 缺失或不可读` }
      }
      const v = value as { provider?: unknown; model?: unknown; reasoningEffort?: unknown }
      if (typeof v.provider !== 'string' || typeof v.model !== 'string') {
        return { ok: false, error: `默认模型缺少 provider/model 字段（${DEFAULT_MODEL_NS}）` }
      }
      const selection: ModelSelection = {
        provider: v.provider,
        model: v.model,
        ...typeof v.reasoningEffort === 'string' ? { reasoningEffort: v.reasoningEffort } : {},
      }
      return { ok: true, value: selection }
    },
    async setDefaultModel(selection) {
      // `settings.replace` is the wholesale write the official save path uses.
      const r = await unary(() => api.settings.replace({
        ns: DEFAULT_MODEL_NS,
        section: {
          provider: selection.provider,
          model: selection.model,
          ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
        },
      }))
      return r.ok ? { ok: true, value: null } : r
    },
    async describeCredential(ref) {
      const r = await unary(() => api.credentials.describe({ refs: [ref] }))
      if (!r.ok) return r
      const view = r.value.credentials[ref]
      return view === undefined
        ? { ok: false, error: `凭据引用 ${ref} 未被描述` }
        : { ok: true, value: view }
    },
    async setCredential(ref, value) {
      const r = await unary(() => api.credentials.set({ ref, value }))
      return r.ok ? { ok: true, value: null } : r
    },
    async providerProfile(view) {
      // The profile object sits at `settingsPath` inside the provider's
      // settings namespace. DeepSeek's section addresses the whole namespace
      // root (settingsPath = []), so read the redacted namespace value.
      const r = await unary(() => api.settings.describe({}))
      if (!r.ok) return r
      const ns = r.value.namespaces.find(n => n.ns === view.settingsNs)
      const raw = ns?.value
      if (typeof raw !== 'object' || raw === null) return { ok: true, value: {} }
      let cursor: unknown = raw
      for (const key of view.settingsPath) {
        if (typeof cursor !== 'object' || cursor === null) return { ok: true, value: {} }
        cursor = (cursor as Record<string, unknown>)[key]
      }
      if (typeof cursor !== 'object' || cursor === null) return { ok: true, value: {} }
      const profile = cursor as ProviderProfile
      return { ok: true, value: {
        ...typeof profile.apiKeyEnv === 'string' ? { apiKeyEnv: profile.apiKeyEnv } : {},
        ...typeof profile.baseURL === 'string' ? { baseURL: profile.baseURL } : {},
      } }
    },
    async settingsWritable() {
      const r = await unary(() => api.settings.describe({}))
      return r.ok ? { ok: true, value: r.value.writable } : r
    },
    async sessionModels(sessionId) {
      const r = await unary(() => api.sessions.models({ sessionId }))
      return r.ok
        ? { ok: true, value: { current: r.value.current, routable: r.value.routable, groups: r.value.groups } }
        : r
    },
    async selectSessionModel(sessionId, selection) {
      const r = await unary(() => api.sessions.selectModel({
        sessionId,
        provider: selection.provider,
        model: selection.model,
        ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
      }))
      return r.ok ? { ok: true, value: r.value.selected } : r
    },
  }
}

// ── the models plane ───────────────────────────────────────────────────────

/** One provider row the settings page renders, with its profile + credential state. */
export interface ProviderRow {
  view: ProviderView
  /** Models the provider advertises (from the host-scoped catalog). */
  models: CatalogModel[]
  /** Credential configured state when the profile names a ref; null when none. */
  credential: CredentialView | null
  /** The credential ref the provider's profile uses, when it names one. */
  keyRef: string | null
  /** The provider's base URL, when the profile stores one. */
  baseURL: string | null
}

/** The settings Models page snapshot. */
export interface ModelsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  /** The deployment default model selection. */
  defaultModel: ModelSelection | null
  /** Provider rows keyed by provider route, in directory order. */
  providers: ProviderRow[]
  /** A default-model save, or a credential write, is in flight. */
  busy: boolean
  /** A write failed (rendered in the red-line pattern). */
  saveError: string | null
  /** Whether the deployment's settings mirror is writable. */
  writable: boolean
}

/** The session model directory the composer selector renders from. */
export interface SessionModelState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  /** The session's current selection; null before the first read. */
  current: ModelSelection | null
  /** Whether an adapter serves the current provider (null before the first read). */
  routable: boolean | null
  /** Successfully loaded provider groups (last good load). */
  groups: ModelGroup[]
  /** A select write is in flight. */
  selecting: boolean
}

/**
 * The provider/model plane both the settings Models page and the composer
 * model selector render from. It folds the wire's failures into one `error`,
 * guards every write with one `busy`/`selecting`, and keeps the deployment
 * default and the per-session directory as separate snapshots (the composer
 * reads the session one; the settings page reads the default and the catalog).
 * One instance per plugin fiber.
 */
export class ModelsPlane {
  state: ModelsState = {
    status: 'idle',
    error: null,
    defaultModel: null,
    providers: [],
    busy: false,
    saveError: null,
    writable: false,
  }

  /** Per-session directories; disposed with the owning session's component. */
  private readonly sessionDirectories = new Map<string, SessionModelState>()

  private readonly dsh: Dsh
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(dsh: Dsh) {
    this.dsh = dsh
  }

  /** Replace state and notify. */
  private setState(next: Partial<ModelsState>): void {
    this.state = { ...this.state, ...next }
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  // ── settings Models page ─────────────────────────────────────────────────

  /**
   * Refresh the whole settings Models snapshot: the provider directory, the
   * host-scoped model catalog, the deployment default, and — for providers
   * whose profile names a credential ref — that ref's existence (never value).
   */
  load = async (): Promise<void> => {
    this.setState({ status: 'loading', error: null })
    const [providersR, modelsR, defaultR, writableR] = await Promise.all([
      this.dsh.models.listProviders(),
      this.dsh.models.listModels(),
      this.dsh.models.defaultModel(),
      this.dsh.models.settingsWritable(),
    ])
    const firstError = [providersR, modelsR, defaultR].find(r => !r.ok)
    if (firstError !== undefined) {
      this.setState({ status: 'error', error: firstError.error })
      return
    }
    if (!providersR.ok || !modelsR.ok || !defaultR.ok) {
      this.setState({ status: 'error', error: '模型数据读取失败' })
      return
    }

    const groups = modelsR.value.groups
    const rows: ProviderRow[] = []
    for (const view of providersR.value) {
      const group = groups.find(g => g.id === view.provider)
      const profileR = await this.dsh.models.providerProfile(view)
      const profile = profileR.ok ? profileR.value : {}
      const keyRef = profile.apiKeyEnv ?? null
      const credential = keyRef === null ? null : await this.describeOrNull(keyRef)
      rows.push({
        view,
        models: group?.models ?? [],
        credential,
        keyRef,
        baseURL: profile.baseURL ?? null,
      })
    }
    this.setState({
      status: 'ready',
      error: null,
      defaultModel: defaultR.value,
      providers: rows,
      writable: writableR.ok ? writableR.value : false,
    })
  }

  /** Save the deployment default model selection; re-reads on success. */
  saveDefault = async (selection: ModelSelection): Promise<void> => {
    if (this.state.busy) return
    this.setState({ busy: true, saveError: null })
    const r = await this.dsh.models.setDefaultModel(selection)
    if (!r.ok) {
      this.setState({ busy: false, saveError: r.error })
      return
    }
    this.setState({ busy: false })
    await this.load()
  }

  /** Store one provider's API key; never echoes. Re-reads the existence state. */
  saveCredential = async (keyRef: string, value: string): Promise<string | null> => {
    const r = await this.dsh.models.setCredential(keyRef, value)
    if (!r.ok) return r.error
    await this.load()
    return null
  }

  // ── composer model selector ──────────────────────────────────────────────

  /** The per-session directory snapshot; creates it lazily. */
  sessionState(sessionId: SessionId): SessionModelState {
    const key = sessionId as string
    let dir = this.sessionDirectories.get(key)
    if (dir === undefined) {
      dir = { status: 'idle', error: null, current: null, routable: null, groups: [], selecting: false }
      this.sessionDirectories.set(key, dir)
    }
    return dir
  }

  /** Refresh one session's model directory. The composer calls this on open. */
  loadSession = async (sessionId: SessionId): Promise<void> => {
    const dir = this.sessionState(sessionId)
    dir.status = 'loading'
    dir.error = null
    this.bump()
    const r = await this.dsh.models.sessionModels(sessionId)
    if (!r.ok) {
      dir.status = 'error'
      dir.error = r.error
      this.bump()
      return
    }
    dir.current = r.value.current
    dir.routable = r.value.routable
    dir.groups = r.value.groups
    dir.status = 'ready'
    dir.error = null
    this.bump()
  }

  /** Select the model for a session; success updates its current selection. */
  selectSession = async (sessionId: SessionId, selection: ModelSelection): Promise<string | null> => {
    const dir = this.sessionState(sessionId)
    if (dir.selecting) return null
    dir.selecting = true
    dir.error = null
    this.bump()
    const r = await this.dsh.models.selectSessionModel(sessionId, selection)
    if (!r.ok) {
      dir.selecting = false
      dir.error = r.error
      this.bump()
      return r.error
    }
    dir.current = r.value
    dir.routable = true
    dir.selecting = false
    this.bump()
    return null
  }

  /** Drop a session's directory (its component unmounted). */
  disposeSession(sessionId: SessionId): void {
    this.sessionDirectories.delete(sessionId as string)
  }

  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  private async describeOrNull(ref: string): Promise<CredentialView | null> {
    const r = await this.dsh.models.describeCredential(ref)
    return r.ok ? r.value : null
  }
}
