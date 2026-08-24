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
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: ui-layout's SlotMap merge names the four frame child slots
// re-declared below. Its Context merge (`ctx.layout`) is no longer consumed by
// any live row, so only the SlotMap merge is pulled in here. Erased at build
// time — cross-plugin VALUE imports are a bundle-purity error.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LayoutStore } from '../shell/layout-store.ts'
import brandMarkUrl from '../assets/brand-mark.png'
import { createFilesWire } from './files.ts'
import type { WorkspaceFilesWire } from './files.ts'
import { createPluginsWire, createPresetsWire } from './presets.ts'
import type { PluginsWire, PresetsWire } from './presets.ts'
import { installStyles } from '../ui/tokens.ts'
import { FONT_CSS } from '../ui/fonts.ts'
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
 * The child slots DeepBuddy's own column occupants declare, re-declared
 * verbatim from the disabled `ui-sidebar` / `ui-conversation` rows. The two
 * disabled rows were the declarers of these slots; with them gone, the
 * official ecosystem registrants (settings-general, model-selection,
 * attachment) park on `slots.inject` until a declarer appears — so DeepBuddy
 * must declare them and render them, exactly like the frame contract above.
 *
 * Declaring a slot here is the exclusive render authority for it; any seat
 * the official column used to open stays open across the takeover.
 */
export const SIDEBAR_SLOT_MAP = {
  'sidebar.settings': { kind: 'single', scope: 'root' },
  // The official workspace browser (ui-workspace's WorkspaceBrowser: search,
  // view options, add-directory, rename/fork/archive/delete). Its registration
  // waits on this declaration; it in turn declares
  // `sidebar.workspaces.directoryFlow`, which the directory-picker-browse
  // plugin's nested inject needs before it fills BOTH directoryFlow seats —
  // so this one line also lights up 「选择其他目录」 in the hero picker.
  'sidebar.workspaces': { kind: 'single', scope: 'root' },
} as const


/**
 * The runtime render-slot face DeepBuddy's column occupants receive for their
 * declared child slots. Untyped per-key (the SlotMap type-merge for the
 * revived `conversation.*` seats is not in this bundle's type graph), but the
 * owner object is whatever the official registrant's slot declares.
 */
export type RenderSlot = (key: string, owner: Record<string, unknown>) => ReactNode

/**
 * Root rank. The official frame's row is disabled, so nothing contests this
 * slot; -1 keeps DeepBuddy the winner anyway (single slots render the LOWEST
 * priority) if a deployment ever patches `ui-layout` back on.
 */
export const ROOT_PRIORITY = -1


/** The settings namespace whose document motion the roster follows. */
const PRESET_SETTINGS_NS = 'agent-presets'

/**
 * The DeepBuddy identity rendered in the official conversation hero's
 * `conversation.hero.brand.mark` seat. Replaces the official fish logo
 * (registered at priority 0 by ui-brand-official) at priority -1.
 *
 * The whale mark plus the animated headline: 「探索未至之境」 pops out one
 * character at a time on a loop (no 预览版 badge). The official headline and
 * badge spans are static siblings of this slot and locale-locked (single
 * occupant per NS), so tokens.ts hides them by their stable class suffixes
 * and this component renders the text instead — metrics copied from the
 * official headline (26px/500/32px, 10px row gap). Chars are aria-hidden
 * behind one labelled span so the animation never reaches screen readers.
 */
function DeepBuddyBrandMark(): ReactNode {
  const HEADLINE = '探索未至之境'
  return createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 12 } },
    createElement('img', {
      src: brandMarkUrl,
      alt: 'DeepBuddy',
      style: { display: 'block', width: 34, height: 34 },
    }),
    createElement('span', {
      'aria-label': HEADLINE,
      style: { fontSize: 26, fontWeight: 500, lineHeight: '32px', color: 'var(--db-text)', whiteSpace: 'nowrap' },
    }, ...[...HEADLINE].map((ch, i) => createElement('span', {
      'key': i,
      'aria-hidden': true,
      'className': 'dbdy-hero-char',
      'style': { animationDelay: `${i * 0.22}s` },
    }, ch))),
  )
}

/**
 * Mount every DSH-facing service this distribution owns, each riding its own
 * effect at PLUGIN scope. The theme presenter and the styles are the disabled
 * ui-layout row's former duties. The `layout` service is provided here: the
 * ui-layout row that used to own it is disabled, but ui-conversation (now
 * enabled) injects it, so DeepBuddy's store face stands in. The Remote plane
 * rides sub-scopes so a deployment without api-remotes still gets a UI.
 * @param ctx - the client root context.
 * @param dsh - the fiber's wire bundle (its roster listeners are fired here).
 */
export function mountOfficialServices(ctx: ClientContext, dsh: Dsh, layout: LayoutStore): void {

  // `ctx.layout` before the ui-conversation row's apply: it injects `layout`,
  // and ui-layout (the original provider) is disabled. Provide DeepBuddy's
  // store face, so the official apply activates (registering the chat-fold
  // definitions) instead of parking on "waiting for service: layout".
  // The official `layout` consumers only call toggleSidebar/openDetails/
  // closeDetails, which layoutFace() forwards to DeepBuddy's store.
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout.layoutFace())
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

  ctx.effect(() => installStyles(FONT_CSS), 'deepbuddy: styles')


  // DeepBuddy's brand in the revived official conversation hero. The
  // ui-brand-official row registers a `FishLogo` into
  // `conversation.hero.brand.mark` at priority 0; DeepBuddy registers at -1
  // so the single slot renders the DeepBuddy name (lowest priority wins).
  // The hero's headline/preview texts are ui-conversation-owned (one occupant
  // per locale NS), so the DeepBuddy slogan is carried by the sidebar brand
  // line rather than a locale override here.
  const slots = ctx.slots as unknown as {
    inject(key: string, cb: () => (() => void) | void): () => void
    register(options: { name: string; priority?: number }, comp: () => ReactNode): () => void
  }
  slots.inject('conversation.hero.brand.mark', () => slots.register({
    name: 'conversation.hero.brand.mark',
    priority: -1,
  }, DeepBuddyBrandMark))


  // Window listeners and the live subscriptions ride the fiber, not a React
  // mount: the state outlives any single entry's tree.
  ctx.effect(() => {
    layout.mount()
    return () => { layout.dispose() }
  }, 'deepbuddy: layout store')

  // The dock renders only for a started session. The conversation view that
  // used to contribute `sessionStarted` is gone (the official ConversationRoot
  // owns the main column), so DeepBuddy observes the current session itself:
  // a real (non-blank) session sets the dock gate; a blank or no session
  // clears it. The official session service is the single record.
  let watchedSessionId: string | undefined
  let sessionOff: (() => void) | undefined
  const syncSessionStarted = (): void => {
    const list = ctx.sessions.list.getSnapshot()
    const cur = list.current
    const session = cur === undefined ? undefined : ctx.sessions.binding(cur)?.session
    const snapshot = session?.getSnapshot()
    const started = snapshot !== undefined && snapshot.blank !== true
    layout.setSessionStarted(started)
    // Follow the current session's own snapshot: a blank session that starts
    // (blank flips false on the first send) must open the dock gate without a
    // list notification. Re-subscribe on a current-id change.
    if (cur !== watchedSessionId || (cur !== undefined && session !== undefined && sessionOff === undefined)) {
      sessionOff?.()
      sessionOff = undefined
      watchedSessionId = cur
      if (cur !== undefined && session !== undefined) {
        sessionOff = session.subscribe(syncSessionStarted)
      }
      else if (cur !== undefined && session === undefined) {
        // Binding not hydrated yet: re-check on the next tick — the session
        // hydration does not re-notify `list`, so poll once shortly after.
        queueMicrotask(syncSessionStarted)
      }
    }
  }
  const offList = ctx.sessions.list.subscribe(syncSessionStarted)
  syncSessionStarted()
  ctx.effect(() => () => { offList(); sessionOff?.() }, 'deepbuddy: session-started watch')

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
 * Path tail for workspace display names, same rule the runtime's
 * workspaceTitleOf applies (last non-empty segment).
 * @param path - absolute or ~-relative path.
 * @returns final segment, or the input when it has none.
 */
export function basename(path: string): string {
  const seg = path.split(/[\\/]/).filter(Boolean).pop()
  return seg ?? path
}

/** The workspace holding a session, resolved through WorkspaceView.sessionIds. */
export function workspaceOf(ws: WorkspaceList | null, sessionId: SessionId | undefined): WorkspaceView | undefined {
  if (!ws || sessionId === undefined) return undefined
  return ws.items.find(w => (w.sessionIds as readonly SessionId[]).includes(sessionId))
}
