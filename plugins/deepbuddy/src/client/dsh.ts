/**
 * The frame's view of the dsh client data plane.
 *
 * `ctx.sessions` and `ctx.workspaces` are ordinary cordis services — the same
 * `ObservableSnapshot` objects the stock components consume through slot
 * standard props (deepseek-harness `packages/client/runtime/src/client/
 * sessions/service.ts:348`, `workspaces/service.ts:82`) — so the frame
 * subscribes to them directly. Every type here derives from ClientContext
 * instead of naming runtime exports, which keeps the plugin compiling across
 * harness release drift.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export type Sessions = ClientContext['sessions']
export type Workspaces = ClientContext['workspaces']

export type SessionList = ReturnType<Sessions['list']['getSnapshot']>
export type SessionId = SessionList['ids'][number]
export type SessionSummary = SessionList['byId'] extends Partial<Record<string, infer S>> ? NonNullable<S> : never
export type SessionBinding = NonNullable<ReturnType<Sessions['binding']>>
export type SessionFace = SessionBinding['session']
export type Conversation = ReturnType<SessionFace['getSnapshot']>
export type ConversationNode = Conversation['nodes'][number]
export type AssistantNode = Extract<ConversationNode, { kind: 'assistant' }>
export type ToolResultNode = Extract<ConversationNode, { kind: 'tool-result' }>
export type RunningToolCall = Conversation['runningCalls'][number]

export type WorkspaceList = ReturnType<Workspaces['list']['getSnapshot']>
export type WorkspaceView = WorkspaceList['items'][number]
export type WorkspaceId = WorkspaceView['workspaceId']

/** The services the frame receives from apply(). */
export interface Dsh {
  sessions: Sessions
  workspaces: Workspaces
  /** Workspace file endpoints (see files.ts); null when the wire is absent. */
  files: import('./files.ts').WorkspaceFilesWire | null
  /** Agent-preset roster and authoring (see presets.ts). */
  presets: import('./presets.ts').PresetsWire
  /**
   * Loader inventory. Mutable and initially null: the typed Remote namespace
   * mounts asynchronously, and gating the frame's root registration on it
   * would leave the distribution with no UI at all when it is absent.
   */
  plugins: import('./presets.ts').PluginsWire | null
  /**
   * Subscribe to the host's `agent-presets` settings document moving — a
   * default changed in another tab or edited on disk. Returns the disposer.
   */
  onRosterMoved(handler: () => void): () => void
}

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
