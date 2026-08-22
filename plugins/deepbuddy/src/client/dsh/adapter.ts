/**
 * The only layer that understands the DSH ABI.
 *
 * Everything here translates the harness's client surface for the rest of the
 * distribution: the session/workspace services, the deepbuddyFiles host wire,
 * the agent-preset api face, the theme registry, and the official root/frame
 * slot contract DeepBuddy inherited from the disabled `ui-layout` row
 * (cordis.patch.yml). Features never parse DSH streams themselves — they read
 * the snapshots and wires this module hands them (deepbuddy-design-current/
 * DEVELOPMENT_RULES.md §5).
 *
 * `ctx.sessions` and `ctx.workspaces` are ordinary cordis services — the same
 * `ObservableSnapshot` objects the stock components consume — so every type
 * here derives from `ClientContext` instead of naming runtime exports, which
 * keeps the plugin compiling across harness release drift.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: ui-layout's Context merge declares `ctx.layout`, and its SlotMap
// merge names the four frame child slots re-declared below. Erased at build
// time — cross-plugin VALUE imports are a bundle-purity error.
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LayoutStore } from '../shell/layout-store.ts'
import { createFilesWire } from './files.ts'
import type { WorkspaceFilesWire } from './files.ts'
import { createPluginsWire, createPresetsWire } from './presets.ts'
import type { PluginsWire, PresetsWire } from './presets.ts'
import { installStyles } from '../ui/tokens.ts'
import { ThemePresenter } from './theme-presenter.ts'

// ── service faces, derived from the client context ──────────────────────────

export type Sessions = ClientContext['sessions']
export type Workspaces = ClientContext['workspaces']

export type SessionList = ReturnType<Sessions['list']['getSnapshot']>
export type SessionId = SessionList['ids'][number]
export type SessionSummary = SessionList['byId'] extends Partial<Record<string, infer S>> ? NonNullable<S> : never
export type SessionBinding = NonNullable<ReturnType<Sessions['binding']>>
export type SessionFace = SessionBinding['session']
export type Conversation = ReturnType<SessionFace['getSnapshot']>
export type ConversationChat = Conversation['chat']
export type ChatSnapshot = ConversationChat
export type ChatNode = NonNullable<ReturnType<ChatSnapshot['nodes']['get']>>
export type AssistantStepNode = Extract<ChatNode, { kind: 'assistant-step' }>
export type ToolCallNode = Extract<ChatNode, { kind: 'tool-call' }>
export type ChatUserNode = Extract<ChatNode, { kind: 'user' | 'steering' | 'context' }>
export type ChatErrorNode = Extract<ChatNode, { kind: 'turn-error' }>
/** The deprecated legacy projection DeepBuddy formerly rendered. */
export type ConversationNode = Conversation['nodes'][number]
export type AssistantNode = Extract<ConversationNode, { kind: 'assistant' }>
export type ToolResultNode = Extract<ConversationNode, { kind: 'tool-result' }>
export type RunningToolCall = Conversation['runningCalls'][number]

export type WorkspaceList = ReturnType<Workspaces['list']['getSnapshot']>
export type WorkspaceView = WorkspaceList['items'][number]
export type WorkspaceId = WorkspaceView['workspaceId']

/** The services every feature reaches through — one bundle per plugin fiber. */
export interface Dsh {
  sessions: Sessions
  workspaces: Workspaces
  /** Workspace file endpoints (see dsh/files.ts); null when the wire is absent. */
  files: WorkspaceFilesWire | null
  /** Agent-preset roster and authoring (see dsh/presets.ts). */
  presets: PresetsWire
  /**
   * Loader inventory. Mutable and initially null: the typed Remote namespace
   * mounts asynchronously, and gating the frame's root registration on it
   * would leave the distribution with no UI at all when it is absent.
   */
  plugins: PluginsWire | null
  /**
   * Subscribe to the host's `agent-presets` settings document moving — a
   * default changed in another tab or edited on disk. Returns the disposer.
   */
  onRosterMoved(handler: () => void): () => void
  /**
   * Resolve the host account's home directory — the default workspace path
   * (wave 4 §3). DSH-side first (`host.listDirectory` returns `home`); falls
   * back to the host process cwd (`host.describe`) when the browse surface is
   * absent. Never hardcodes a user path on the client.
   * @returns the home path, or null when neither surface answers.
   */
  resolveHome(): Promise<string | null>
}

/** The part of the bundle only the adapter's own wiring may touch. */
interface DshInternal extends Dsh {
  /** Fire every `onRosterMoved` subscriber (remote `settings/document-updated`). */
  notifyRosterMoved(): void
}

/**
 * Build the wire bundle for one fiber.
 * @param ctx - the client root context (provides the services).
 * @param connection - the browser `connection` service, reached through
 * `ctx.get` rather than a Context member: the cordis Context type carries the
 * HOST connection under that name, and the runtime plugin resolves the
 * browser one the same way.
 * @returns the bundle.
 */
export function createDsh(ctx: ClientContext, connection: ConnectionHandle): Dsh {
  const rosterListeners = new Set<() => void>()
  const dsh: DshInternal = {
    sessions: ctx.sessions,
    workspaces: ctx.workspaces,
    files: createFilesWire(connection.rpc),
    presets: createPresetsWire(connection.api),
    plugins: null,
    onRosterMoved(handler) {
      rosterListeners.add(handler)
      return () => { rosterListeners.delete(handler) }
    },
    async resolveHome(): Promise<string | null> {
      // The host account's home is the `home` field of the no-path directory
      // listing (the `browse` capability). When that surface is absent, fall
      // back to the host process cwd — still host-provided, never client hardcoded.
      try {
        const listing = await connection.api.host.listDirectory({}, undefined)
        const home = (listing.result as { ok: true; value: { home?: string } } | undefined)?.value?.home
        if (typeof home === 'string' && home !== '') return home
      }
      catch { /* browse absent — fall through */ }
      try {
        const desc = await connection.api.host.describe({}, undefined)
        const cwd = (desc.result as { ok: true; value: { cwd?: string } } | undefined)?.value?.cwd
        if (typeof cwd === 'string' && cwd !== '') return cwd
      }
      catch { /* describe absent — no home */ }
      return null
    },
    notifyRosterMoved() {
      for (const handler of rosterListeners) handler()
    },
  }
  return dsh
}

// ── the official frame contract ─────────────────────────────────────────────

/**
 * The four frame child slots, re-declared verbatim from the disabled
 * `ui-layout` row (`sidebar` / `conversation` / `details` / `shell.overlay`).
 * ui-slots admits exactly one declarer per slot, so DeepBuddy can only take
 * over the frame contract with the official row out of the graph — and it
 * must re-declare all four and actually render them, or every ecosystem seat
 * the official frame offered goes dark (deepbuddy-design-current/
 * ARCHITECTURE.md §4; cordis.patch.yml).
 */
export const FRAME_SLOT_MAP = {
  'sidebar': { kind: 'single', scope: 'root' },
  'conversation': { kind: 'single', scope: 'session-maybe' },
  'details': { kind: 'single', scope: 'session' },
  'shell.overlay': { kind: 'list', scope: 'root' },
} as const

/**
 * Root rank. The official frame's row is disabled, so nothing contests this
 * slot; -1 keeps DeepBuddy the winner anyway (single slots render the LOWEST
 * priority) if a deployment ever patches `ui-layout` back on.
 */
export const ROOT_PRIORITY = -1

/**
 * Shadow rank under the official column occupants' default 0. ui-sidebar and
 * ui-conversation still register; the lowest priority renders, so DeepBuddy's
 * columns win while every service behind the official ones stays alive.
 */
export const OCCUPANT_SHADOW_PRIORITY = -1

/** The settings namespace whose document motion the roster follows. */
const PRESET_SETTINGS_NS = 'agent-presets'

/**
 * Mount every DSH-facing service this distribution owns, each riding its own
 * effect at PLUGIN scope. The layout face, the theme presenter and the styles
 * are the disabled ui-layout row's former duties; the Remote plane rides
 * sub-scopes so a deployment without api-remotes still gets a UI.
 * @param ctx - the client root context.
 * @param dsh - the fiber's wire bundle (its roster listeners are fired here).
 * @param layout - the fiber's layout store, whose face serves `ctx.layout`.
 */
export function mountOfficialServices(ctx: ClientContext, dsh: Dsh, layout: LayoutStore): void {
  // `ctx.layout` before the registrations: ui-sidebar injects it, and the
  // official occupants' apply worlds must find a face where ui-layout's used
  // to be. Provided from the plugin body, so it is live before any entry
  // renders — no store to attach, no wiring hook to wait for.
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout.layoutFace() as ILayout)
    // provide()'s disposer settles asynchronously; teardown is synchronous
    // fire-and-forget, as in the official plugin.
    return () => { void disposeService() }
  }, 'deepbuddy: layout service')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'deepbuddy: theme presenter')

  ctx.effect(() => installStyles(), 'deepbuddy: styles')

  // Window listeners and the live subscriptions ride the fiber, not a React
  // mount: the state outlives any single entry's tree.
  ctx.effect(() => {
    layout.mount()
    return () => { layout.dispose() }
  }, 'deepbuddy: layout store')

  // The Remote plane rides sub-scopes, never the plugin's own `inject`: a
  // deployment without api-remotes must still get the frame, and gating the
  ctx.inject(['remote'], (scope) => {
    scope.effect(() => {
      // Every tab converges on a committed choice, including the one that did
      // not make it — the runtime's own session store is the single record.
      const offSelected = scope.remote.$on('agent-preset/selected', (sessionId, agentPreset) => {
        ctx.sessions.noteAgentPreset(sessionId, agentPreset)
      })
      // The roster-moved channel is fired only by this adapter's own wiring,
      // so the bundle's internal face is safe to reach through.
      const wire = dsh as DshInternal
      const offMoved = scope.remote.$on('settings/document-updated', (ns) => {
        if (ns !== PRESET_SETTINGS_NS) return
        wire.notifyRosterMoved()
      })
      return () => { offSelected(); offMoved() }
    }, 'deepbuddy: agent-preset host events')
  })

  ctx.inject(['remote', 'remote.pluginInventory'], (scope) => {
    scope.effect(() => {
      dsh.plugins = createPluginsWire(scope.remote)
      return () => { dsh.plugins = null }
    }, 'deepbuddy: plugin inventory wire')
  })
}

// ── snapshot helpers ────────────────────────────────────────────────────────

/**
 * Join the text of a content-part array (user message content, tool result
 * content). Non-text parts contribute nothing; a plain string passes through.
 * @param content - host-shaped content value.
 * @returns concatenated text.
 */
export function textOfParts(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(p => (p !== null && typeof p === 'object' && 'text' in p && typeof (p as { text: unknown }).text === 'string')
      ? (p as { text: string }).text
      : '')
    .join('')
}

/**
 * Relative time for the session list rows.
 * @param ts - epoch ms.
 * @returns Chinese relative label, matching the design's row format.
 */
export function fmtRel(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/**
 * Path tail for workspace display names, same rule the runtime's
 * workspaceTitleOf applies (last non-empty segment).
 * @param path - absolute or ~-relative path.
 * @returns final segment, or the input when it has none.
 */
export function basename(path: string): string {
  const seg = path.split(/[\\/]/).filter(Boolean).pop()
  return seg ?? path
}

/** Top-level (non-subagent) sessions in list order. */
export function topSessions(list: SessionList): SessionSummary[] {
  const rows: SessionSummary[] = []
  for (const id of list.ids) {
    const s = (list.byId as Partial<Record<string, SessionSummary>>)[id as string]
    if (!s) continue
    if (s.parentId !== undefined || s.origin === 'subagent') continue
    rows.push(s)
  }
  return rows
}

/** The workspace holding a session, resolved through WorkspaceView.sessionIds. */
export function workspaceOf(ws: WorkspaceList | null, sessionId: SessionId | undefined): WorkspaceView | undefined {
  if (!ws || sessionId === undefined) return undefined
  return ws.items.find(w => (w.sessionIds as readonly SessionId[]).includes(sessionId))
}
