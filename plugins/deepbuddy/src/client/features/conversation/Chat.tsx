/**
 * The conversation surface: the workbench's chat view and its sidebar entry
 * row.
 *
 * Everything here renders from the conversation store and the shared preset
 * plane; the shell draws the column chrome around it. The permission chip the
 * old composer carried is gone rather than faked: it was reading a mock
 * table, and the real plane
 * (`session.projections.faceOf('permissions')` + `/permission`) arrives with
 * the approvals work.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PresetPlane } from '../../dsh/presets.ts'
import type {
  AssistantNode, ChatNode, Conversation, ConversationNode, RunningToolCall, ToolResultNode, WorkspaceView, WorkspaceId,
} from '../../dsh/adapter.ts'
import { basename, textOfParts, workspaceOf } from '../../dsh/adapter.ts'
import { canSelectPreset, defaultPresetId, presetLabel, selectablePresets } from '../../dsh/presets.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { useLayoutStore } from '../../shell/layout-store.ts'
import { KIT } from '../../ui/kit.tsx'
import { METRICS } from '../../ui/tokens.ts'
import { ArrowUp, ChevronDown, ChevronUp, Compose, Folder, Plus, Stop } from '../../ui/icons.tsx'
import type { ConversationStore } from './store.ts'

/** The app's catalog id; the shell resolves it through WORKBENCH_APPS. */
export const CONVERSATION_APP_ID = 'chat'

/**
 * The chat content column. Always centered — a wide-screen message column
 * pulled to the screen edge is the one layout the user vetoed (wave 4 §1).
 * With the dock open the conversation stays on the handoff's 720px centered
 * column; with the dock closed it widens to 880px and still centers, but the
 * stream and composer never stretch to the window's full width.
 */
function columnStyle(dockOpen: boolean): { width: string; maxWidth: number; margin: string } {
  return {
    width: '100%',
    maxWidth: dockOpen ? METRICS.chatColumn : METRICS.chatColumnWide,
    margin: '0 auto',
  }
}

/**
 * The one-line argument summary the handoff puts beside the tool name
 * (`read · src/auth/session.ts`).
 *
 * The prototype hand-writes that string; here it has to come out of the raw
 * argument JSON, so the reading is "the argument a human would have named the
 * call by" — a path, a pattern, a command — and failing that the first string
 * the object carries. Unparseable input degrades to its first line: the row is
 * a summary, and a summary that occasionally says less is better than one that
 * pushes the metric off the end.
 */
const SUMMARY_KEYS = ['path', 'file_path', 'filePath', 'pattern', 'command', 'cmd', 'query', 'url', 'name'] as const

function argSummary(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return clip(raw.split('\n', 1)[0] ?? '')
  }
  if (typeof parsed === 'string') return clip(parsed)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
  const obj = parsed as Record<string, unknown>
  for (const key of SUMMARY_KEYS) {
    const v = obj[key]
    if (typeof v === 'string' && v !== '') return clip(v)
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v !== '') return clip(v)
  }
  return ''
}

function clip(s: string): string {
  const line = s.replace(/\s+/g, ' ').trim()
  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}

/** `time - callTime` as the handoff's `0.4s`-style label. */
function durationOf(time: number, callTime: number | null): string | null {
  if (callTime === null) return null
  return `${Math.max(0, (time - callTime) / 1000).toFixed(1)}s`
}

/** Whether a node continues the assistant turn group started above it. */
function inTurnGroup(node: ConversationNode | undefined): boolean {
  return node !== undefined && (node.kind === 'assistant' || node.kind === 'tool-result')
}

function ToolBlock({ store, callId, name, argsRaw, result }: {
  store: ConversationStore
  callId: string
  name: string
  argsRaw: string
  /** Settled node, or null while running. */
  result: ToolResultNode | null
}): ReactNode {
  const open = store.state.openCalls[callId] === true
  const running = result === null
  const failed = result !== null && result.isError
  const duration = result === null ? null : durationOf(result.time, result.callTime)
  const summary = argSummary(argsRaw)
  return (
    <div style={{
      border: '1px solid var(--db-line-card)', background: 'var(--db-fill-1)',
      borderRadius: 12, overflow: 'hidden', width: '100%',
    }}
    >
      {/* The handoff's header is one mono line: name, then the argument that
          identifies the call, then the metric flush right. The row reads
          left-to-right as "what ran · on what · how it went". */}
      <div
        onClick={() => { store.toggleCall(callId) }}
        className="dbdy-hv-1"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
          fontFamily: 'var(--db-mono)', fontSize: 11.5,
          cursor: 'pointer', transition: 'background var(--db-tint)',
        }}
      >
        <KIT.Dot
          tone={running ? 'run' : failed ? 'await' : 'muted'}
          size={7}
          style={running ? { animation: 'dbdy-pulse 1.1s ease-in-out infinite' } : {}}
        />
        <span style={{ flex: '0 0 auto', color: 'var(--db-text)' }}>{name}</span>
        {summary !== '' && (
          <span
            title={summary}
            style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--db-text-4)' }}
          >
            {summary}
          </span>
        )}
        {/* The metric is the duration, not a row count: `84 lines` in the
            prototype is hand-written mock data, and a harness that guessed it
            from a tool result would be guessing. */}
        <span style={{ marginLeft: 'auto', flex: '0 0 auto', color: failed ? 'var(--db-await)' : 'var(--db-text-4)' }}>
          {running ? '运行中' : failed ? '失败' : duration ?? ''}
        </span>
        {open
          ? <ChevronUp size={12} color="var(--db-text-5)" style={{ flex: '0 0 12px' }} />
          : <ChevronDown size={12} color="var(--db-text-5)" style={{ flex: '0 0 12px' }} />}
      </div>
      {open && (
        <div style={{ padding: '9px 12px', borderTop: '1px solid var(--db-line)', fontFamily: 'var(--db-mono)', fontSize: 11.5, lineHeight: 1.7 }}>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--db-text-5)' }}>{argsRaw}</div>
          {result !== null && (
            <div style={{
              marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 190, overflowY: 'auto',
              color: failed ? 'var(--db-await)' : 'var(--db-text-3)',
            }}
            >
              {failed && result.error ? `${result.error.name} (${result.error.code})\n` : ''}
              {textOfParts(result.content) || (failed ? '' : '（无文本输出）')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One assistant node: its blocks, with reasoning set behind a quiet rule. */
function AssistantTurn({ node }: { node: AssistantNode }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {node.blocks.map((b, i) => {
        if (b.kind === 'text') {
          return <div key={i} style={{ fontSize: 14, lineHeight: 1.62, whiteSpace: 'pre-wrap', color: '#dcdcdc' }}>{b.text}</div>
        }
        if (b.kind === 'reasoning') {
          return (
            <div
              key={i}
              style={{
                borderLeft: '1px solid var(--db-line-card)', paddingLeft: 12, fontSize: 12.5,
                lineHeight: 1.7, color: 'var(--db-text-4)', whiteSpace: 'pre-wrap',
              }}
            >
              {b.text}
            </div>
          )
        }
        if (b.kind === 'image') {
          return <div key={i} style={{ fontSize: 12, color: 'var(--db-text-4)' }}>图片输出（暂不预览）</div>
        }
        return null
      })}
      {node.interrupted === true && <div style={{ fontSize: 12, color: 'var(--db-text-4)' }}>已停止</div>}
    </div>
  )
}
// ── chat-node data shapes ───────────────────────────────────────────────────

/** The `assistant-step` view vertex, mirroring the harness's projection data. */
interface AssistantStepData {
  status: 'running' | 'interrupted' | 'settled'
  turn: number
  step: number
  blocks: AssistantNode['blocks']
  time: number
  usage?: unknown
  /** The settled assistant node, present once the step closed with a message. */
  finalNode?: AssistantNode
}

/** The `tool-call` view vertex: its root call, running or settled. */
interface ToolCallData {
  root: RunningToolCall | ToolResultNode
}

/** A message vertex (user / steering / context). */
interface ChatMessageData {
  content: unknown
  role?: string
}

/** The `turn-error` vertex. */
interface TurnErrorData {
  code?: string
  message: string
}

/** Render the order of a Chat snapshot, dispatching each vertex by kind. */
function renderChatNodes(conv: Conversation, store: ConversationStore): ReactNode[] {
  const chat = conv.chat
  const rows: ReactNode[] = []
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    if (node === undefined) continue
    const data = (node as { data: unknown }).data
    switch (node.kind) {
      case 'user':
      case 'steering':
      case 'context': {
        const text = textOfParts((data as ChatMessageData | undefined)?.content)
        if (text === '') continue
        rows.push(
          <div key={node.key} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              maxWidth: '76%', background: 'var(--db-fill-4)', borderRadius: 'var(--db-r-card)',
              padding: '10px 14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--db-text)',
            }}
            >
              {text}
            </div>
          </div>,
        )
        break
      }
      case 'assistant-step': {
        rows.push(<AssistantStep key={node.key} data={data as AssistantStepData} />)
        break
      }
      case 'tool-call': {
        const root = (data as ToolCallData | undefined)?.root
        if (root === undefined) break
        // A settled call carries `isError`/`call`; a running one is a
        // RunningToolCall with name/argsRaw at the top level.
        const settled = 'isError' in root
        const result = settled ? root as ToolResultNode : null
        const name = settled ? root.call?.name ?? root.callId : root.name
        const argsRaw = settled ? root.call?.argsRaw ?? '' : root.argsRaw
        rows.push(
          <ToolBlock
            key={node.key}
            store={store}
            callId={root.callId}
            name={name}
            argsRaw={argsRaw}
            result={result}
          />,
        )
        break
      }
      case 'turn-error': {
        const err = data as TurnErrorData
        rows.push(
          <div
            key={node.key}
            style={{
              borderRadius: 'var(--db-r-card)', background: 'var(--db-await-wash)', padding: '10px 14px',
              fontSize: 13, color: 'var(--db-await)', lineHeight: 1.6,
            }}
          >
            {`回合失败${err.code === undefined ? '' : ` (${err.code})`}：${err.message}`}
          </div>,
        )
        break
      }
      // command / compaction / turn-max-tokens / model-retry / turn-tail are
      // control-plane rows the handoff's minimal list does not surface.
      default:
        break
    }
  }
  return rows
}

/**
 * Whether the live chat snapshot already shows running content — a running
 * assistant-step with visible blocks, or a running tool-call. Used to decide
 * the 「正在思考…」 indicator in the chat path, where live content lives in
 * the snapshot rather than the legacy `partial`/`runningCalls` projections.
 */
/** Whether an unknown-valued blocks field carries visible text/reasoning. */
function blocksShowVisible(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some(b => typeof b === 'object' && b !== null && 'kind' in b && (b.kind === 'text' || b.kind === 'reasoning'))
}

function chatHasVisibleRunning(conv: Conversation): boolean {
  const chat = conv.chat
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    if (node === undefined) continue
    if (node.kind === 'tool-call') return true
    if (node.kind !== 'assistant-step') continue
    const data: unknown = node.data
    if (typeof data !== 'object' || data === null) continue
    if (!('status' in data) || data.status !== 'running') continue
    if ('finalNode' in data && data.finalNode !== null && blocksShowVisible(data.finalNode)) return true
    if ('blocks' in data && blocksShowVisible(data.blocks)) return true
  }
  return false
}

/** Render one assistant-step vertex: settled via its final node, else its live blocks. */
function AssistantStep({ data }: { data: AssistantStepData }): ReactNode {
  // A closed step carries the durable finalized node; stream live blocks only
  // while it is still running (the legacy projection dropped these — the bug
  // this renderer exists to avoid).
  const node = data.finalNode
  const blocks = node?.blocks ?? data.blocks
  const interrupted = node?.interrupted ?? (data.status === 'interrupted')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          return <div key={i} style={{ fontSize: 14, lineHeight: 1.62, whiteSpace: 'pre-wrap', color: '#dcdcdc' }}>{b.text}</div>
        }
        if (b.kind === 'reasoning') {
          return (
            <div
              key={i}
              style={{
                borderLeft: '1px solid var(--db-line-card)', paddingLeft: 12, fontSize: 12.5,
                lineHeight: 1.7, color: 'var(--db-text-4)', whiteSpace: 'pre-wrap',
              }}
            >
              {b.text}
            </div>
          )
        }
        if (b.kind === 'image') {
          return <div key={i} style={{ fontSize: 12, color: 'var(--db-text-4)' }}>图片输出（暂不预览）</div>
        }
        return null
      })}
      {interrupted && <div style={{ fontSize: 12, color: 'var(--db-text-4)' }}>已停止</div>}
    </div>
  )
}


/**
 * Render the active conversation's history.
 *
 * The story is read from the shipping `conv.chat` snapshot (order + nodes),
 * the authoritative source the harness's own body uses. The deprecated legacy
 * `conv.nodes` projection drops running and interrupted assistant steps, so a
 * transcript whose steps are streamed-but-not-yet-finalized would render blank
 * from it; `chat` retains what is visible.
 */
function Stream({ store, dockOpen }: { store: ConversationStore; dockOpen: boolean }): ReactNode {
  const conv = store.state.conv
  if (conv === null) {
    return <div style={{ ...columnStyle(dockOpen), padding: '24px 0', fontSize: 12.5, color: 'var(--db-text-4)' }}>加载会话…</div>
  }
  if (conv.openState === 'error') {
    // A session whose log failed to open (e.g. `corrupt session log: seq gap`)
    // must not render as a blank page — say what happened and why.
    const detail = conv.openError?.message ?? conv.openError?.code ?? '未知错误'
    return (
      <div style={{ ...columnStyle(dockOpen), padding: '24px 0' }}>
        <div style={{
          border: '1px solid var(--db-await-wash)', background: 'var(--db-await-wash)',
          borderRadius: 'var(--db-r-card)', padding: '14px 16px', lineHeight: 1.6,
        }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--db-await)' }}>会话历史无法加载</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--db-text-3)' }}>{detail}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--db-text-4)' }}>请重试，或换一个会话继续。</div>
        </div>
      </div>
    )
  }
  if (conv.openState === 'loading' || conv.openState === 'cold') {
    return <div style={{ ...columnStyle(dockOpen), padding: '24px 0', fontSize: 12.5, color: 'var(--db-text-4)' }}>加载会话…</div>
  }
  const hasChat = conv.chat.order.length > 0
  const partial = conv.partial
  const partialBlocks = partial === null ? [] : partial.blocks.filter(b => b.kind === 'text' || b.kind === 'reasoning')
  // The chat snapshot already renders running assistant steps and tool-calls
  // (renderChatNodes), so the live `runningCalls`/`partial` tail is only for the
  // discontinued legacy path — rendering it again would duplicate content.
  // 「正在思考…」 reads the same source as the body it sits under.
  const showLiveTail = !hasChat
  const thinking = conv.running && (hasChat
    ? !chatHasVisibleRunning(conv)
    : partialBlocks.length === 0 && conv.runningCalls.length === 0)
  return (
    <div style={{ ...columnStyle(dockOpen), display: 'flex', flexDirection: 'column', gap: 26, padding: '24px 0 40px' }}>
      {conv.hasMore && (
        <span style={{ alignSelf: 'flex-start' }}>
          <KIT.Button kind="text" onClick={store.loadOlder}>
            {conv.loadingOlder ? '加载中…' : '加载更早的消息'}
          </KIT.Button>
        </span>
      )}
      {hasChat
        ? renderChatNodes(conv, store)
        : conv.nodes.map((node, i) => {
            const prev = conv.nodes[i - 1]
            switch (node.kind) {
              case 'user':
              case 'steering':
                return (
                  <div key={node.seq} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      maxWidth: '76%', background: 'var(--db-fill-4)', borderRadius: 'var(--db-r-card)',
                      padding: '10px 14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--db-text)',
                    }}
                    >
                      {textOfParts(node.content)}
                    </div>
                  </div>
                )
              case 'assistant':
                return (
                  <div key={node.seq} style={inTurnGroup(prev) ? { marginTop: -12 } : undefined}>
                    <AssistantTurn node={node} />
                  </div>
                )
              case 'tool-result':
                return (
                  <ToolBlock
                    key={node.seq}
                    store={store}
                    callId={node.callId}
                    name={node.call?.name ?? node.callId}
                    argsRaw={node.call?.argsRaw ?? ''}
                    result={node}
                  />
                )
              case 'turn-error':
                return (
                  <div
                    key={node.seq}
                    style={{
                      borderRadius: 'var(--db-r-card)', background: 'var(--db-await-wash)', padding: '10px 14px',
                      fontSize: 13, color: 'var(--db-await)', lineHeight: 1.6,
                    }}
                  >
                    {`回合失败${node.code === undefined ? '' : ` (${node.code})`}：${node.message}`}
                  </div>
                )
              default:
                return null
            }
          })}
      {showLiveTail && conv.runningCalls.map(rc => (
        <ToolBlock key={rc.callId} store={store} callId={rc.callId} name={rc.name} argsRaw={rc.argsRaw} result={null} />
      ))}
      {showLiveTail && partialBlocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {partialBlocks.map((b, i) => b.kind === 'text'
            ? <div key={i} style={{ lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{b.text}</div>
            : (
                <div key={i} style={{ borderLeft: '1px solid var(--db-line-card)', paddingLeft: 12, fontSize: 12.5, lineHeight: 1.7, color: 'var(--db-text-4)', whiteSpace: 'pre-wrap' }}>
                  {b.text}
                </div>
              ))}
        </div>
      )}
      {thinking && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--db-text-4)' }}>
          <KIT.Dot tone="run" size={7} style={{ animation: 'dbdy-pulse 1.1s ease-in-out infinite' }} />
          正在思考…
        </div>
      )}
    </div>
  )
}

/** Whether a session has started (blank === false) and so locked its workspace. */
function sessionLocked(store: ConversationStore): boolean {
  const cur = store.state.list?.current
  if (cur === undefined) return false
  const conv = store.state.conv
  if (conv !== null && conv.blank === false) return true
  const summary = store.currentSummary
  return summary !== undefined && summary.blank === false
}

/** The synthetic workspace shown when nothing is armed, recent or listed: the
 *  host-home default (wave 4 §3). Its id is a sentinel so picker matching and
 *  `workspaceOf` never confuse it with a real workspace record. */
const DEFAULT_WORKSPACE_ID = '__default__'

/**
 * Current workspace of the composer. On a blank or no-session page the armed
 * pick wins (it is where the next prompt opens a session); once the session
 * has started its own workspace is locked and shown. With neither armed nor a
 * real workspace, a synthetic default (host home) is shown so the user can
 * send without picking a folder.
 */
function currentWorkspace(store: ConversationStore): WorkspaceView | undefined {
  const s = store.state
  const items = s.wsList?.items ?? []
  if (sessionLocked(store)) {
    const own = workspaceOf(s.wsList, s.list?.current)
    if (own) return own
    // Locked but the session's workspace is not in the list: fall through to
    // the armed/recent project rather than showing nothing.
  }
  const real = items.find(w => w.workspaceId === s.pickedWs)
    ?? workspaceOf(s.wsList, s.list?.current)
    ?? items.find(w => w.workspaceId === s.wsList?.recentWorkspaceId)
    ?? items[0]
  if (real !== undefined) return real
  // Nothing armed and no workspace at all: show the default (host home). It is
  // not a real workspace yet — send creates it on demand.
  const home = s.homePath
  if (home !== null) {
    return {
      workspaceId: DEFAULT_WORKSPACE_ID as unknown as WorkspaceId,
      path: home,
      title: '默认空间',
      sessionIds: [],
      createdAt: '',
      updatedAt: '',
    }
  }
  return undefined
}

function wsLabel(w: WorkspaceView): string {
  return w.title || basename(w.path)
}

/**
 * The preset the mode surfaces show: the staged pick first (it is what the
 * next turn runs under), then what the session was composed from, then the
 * deployment default.
 */
function currentPresetId(store: ConversationStore, plane: PresetPlane): string | undefined {
  const s = plane.state
  return s.stagedPreset
    ?? store.currentSummary?.agentPreset
    ?? (s.roster === null ? undefined : defaultPresetId(s.roster))
}

/**
 * The mode chip. Switching is offered only while the session is blank — the
 * gateway refuses a started one with `agent-preset-locked`, so a chip that
 * opened there would be a control whose every use fails.
 */
function ModeChip({ store, plane }: { store: ConversationStore; plane: PresetPlane }): ReactNode {
  const s = plane.state
  const roster = s.roster
  const current = currentPresetId(store, plane)
  if (current === undefined || roster === null) return null
  const switchable = store.currentSummary === undefined || canSelectPreset(store.currentSummary)
  const options = selectablePresets(roster).map(p => ({
    id: p.id,
    label: presetLabel(p),
    ...p.description === undefined ? {} : { detail: p.description },
  }))
  if (!switchable) {
    const entry = roster.presets.find(p => p.id === current)
    return (
      <KIT.StatusPill tone="neutral" title="会话的模式在第一回合后锁定">
        {entry === undefined ? current : presetLabel(entry)}
      </KIT.StatusPill>
    )
  }
  return (
    <KIT.Select
      value={current}
      options={options}
      disabled={s.presetBusy}
      onChange={(id) => { plane.selectPreset(id) }}
      title="选择模式"
    />
  )
}

function WorkspaceChip({ store }: { store: ConversationStore }): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ws = currentWorkspace(store)
  const items = store.state.wsList?.items ?? []
  const q = query.trim().toLowerCase()
  const matches = items.filter(w => q === '' || wsLabel(w).toLowerCase().includes(q) || w.path.toLowerCase().includes(q))
  if (sessionLocked(store)) {
    // A started session's workspace is locked at creation; a picker here would
    // be a control whose every use is refused (mirrors ModeChip's lock).
    return (
      <KIT.StatusPill tone="neutral" title="会话的工作区在创建时锁定，无法在对话开始后切换">
        <Folder size={12} style={{ flex: '0 0 12px', marginRight: -3 }} />
        {ws === undefined ? '工作空间已锁定' : wsLabel(ws)}
      </KIT.StatusPill>
    )
  }
  return (
    <KIT.Popover
      open={open}
      onClose={() => { setOpen(false); setQuery('') }}
      style={{ width: 360 }}
      anchor={(
        <button
          type="button"
          title={ws?.workspaceId === DEFAULT_WORKSPACE_ID ? `默认空间：${ws.path}` : '选择工作空间（新会话将在此文件夹中开始）'}
          onClick={() => { setOpen(!open) }}
          className="dbdy-hv-outline"
          style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 32, maxWidth: 240, padding: '0 11px',
            borderRadius: 16, border: '1px solid var(--db-line-input)', background: 'transparent',
            color: 'var(--db-text)', fontSize: 13, cursor: 'pointer', minWidth: 0,
            transition: 'background var(--db-tint), border-color var(--db-tint)',
          }}
        >
          <Folder size={14} style={{ flex: '0 0 14px' }} />
          <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            {ws ? wsLabel(ws) : '选择工作空间'}
          </span>
          <ChevronUp size={12} style={{ flex: '0 0 12px' }} />
        </button>
      )}
    >
      <div style={{ padding: '2px 4px 8px' }}>
        <KIT.Input value={query} onChange={setQuery} placeholder="搜索工作空间" size={30} />
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {matches.map(w => (
          <div
            key={w.workspaceId as string}
            onClick={() => { store.pickWorkspace(w.workspaceId); setOpen(false); setQuery('') }}
            className="dbdy-hv-2"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, padding: '6px 10px',
              borderRadius: 'var(--db-r-swatch)', cursor: 'pointer',
              background: ws?.workspaceId === w.workspaceId ? 'var(--db-fill-5)' : 'transparent',
              transition: 'background var(--db-tint)',
            }}
          >
            <span style={{ flex: '1 0 auto', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
              {wsLabel(w)}
            </span>
            <KIT.Mono style={{ flex: '0 1 auto', minWidth: 0, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'rtl', whiteSpace: 'nowrap' }}>
              {w.path}
            </KIT.Mono>
          </div>
        ))}
        {matches.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--db-text-4)' }}>没有匹配的工作空间</div>
        )}
      </div>
      <div
        onClick={() => { store.openLocalFolder(); setOpen(false) }}
        className="dbdy-hv-2"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, minHeight: 34, padding: '6px 10px', marginTop: 4,
          borderTop: '1px solid var(--db-line)', borderRadius: 'var(--db-r-swatch)', cursor: 'pointer', fontSize: 13,
        }}
      >
        <Plus size={14} />
        打开本地文件夹…
      </div>
    </KIT.Popover>
  )
}

function Composer({ store, plane, dockOpen }: { store: ConversationStore; plane: PresetPlane; dockOpen: boolean }): ReactNode {
  const s = store.state
  const running = s.conv?.running === true
  const errorText = s.sendError
    ?? (s.conv?.promptError
      ? `${s.conv.promptError.op === 'stop' ? '停止失败' : '发送失败'}：${s.conv.promptError.error.message}`
      : null)
  return (
    <div style={{ ...columnStyle(dockOpen), paddingBottom: 18 }}>
      {errorText !== null && (
        <div style={{ padding: '0 2px 8px', fontSize: 12.5, color: 'var(--db-await)' }}>{errorText}</div>
      )}
      <div style={{
        borderRadius: 'var(--db-r-editor)',
        border: '1px solid var(--db-line-input)',
        background: 'var(--db-fill-3)',
        padding: '4px 4px 8px',
      }}
      >
        <input
          value={s.draft}
          onChange={(e) => { store.patch({ draft: e.target.value }) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) store.send() }}
          placeholder={running ? '正在运行 — 发送将插话引导本回合' : '交代一件事，@ 引用文件，/ 调用技能'}
          style={{
            width: '100%', border: 0, background: 'transparent', outline: 'none',
            padding: '13px 12px 9px', fontSize: 14, color: 'var(--db-text)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <WorkspaceChip store={store} />
          <ModeChip store={store} plane={plane} />
          <span style={{ marginLeft: 'auto' }} />
          {running && (
            <KIT.IconButton title="停止本回合" size={30} onClick={store.stop}>
              <Stop size={14} />
            </KIT.IconButton>
          )}
          <KIT.IconButton
            title={running ? '插话' : '发送'}
            size={30}
            onClick={store.send}
            style={{ background: '#ededed', color: '#141414' }}
          >
            <ArrowUp size={15} />
          </KIT.IconButton>
        </div>
      </div>
      <div style={{ paddingTop: 8, fontSize: 11.5, color: 'var(--db-text-5)' }}>内容由 AI 生成，请核实重要信息</div>
    </div>
  )
}

function Hero({ store, plane, dockOpen }: { store: ConversationStore; plane: PresetPlane; dockOpen: boolean }): ReactNode {
  return (
    <div style={{ ...columnStyle(dockOpen) }}>
      <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--db-text)' }}>今天跑点什么？</div>
      <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--db-text-3)', lineHeight: 1.65, maxWidth: '52ch' }}>
        这是一个本地 harness：会话在这里，运行产物在停靠栏里。
      </div>
      {plane.state.presetError !== null && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--db-await)' }}>{`模式：${plane.state.presetError}`}</div>
      )}
    </div>
  )
}

/**
 * The workbench's chat view.
 *
 * The shell draws the top bar; the session's name is ours to contribute. In
 * an effect, never in the body: setTitle writes layout state.
 */
export function ChatView(): ReactNode {
  const { conversation, layout, presets } = useAppDeps()
  useStore(conversation)
  useLayoutStore(layout)
  const summary = conversation.currentSummary
  const title = summary?.displayTitle
  const started = !conversation.isBlank
  useEffect(() => { layout.setTitle(title ?? null) }, [layout, title])
  // The dock exists only for a started session (wave 4 §4). Contribute the
  // fact here — the conversation view is the sole owner; the shell just
  // reads it to gate the dock surface and its toggle.
  useEffect(() => { layout.setSessionStarted(started) }, [layout, started])
  // The default workspace is home-based; resolve the host home once while the
  // page is blank so the composer chip can show 「默认空间」 (wave 4 §3).
  useEffect(() => {
    if (!conversation.empty) return
    void conversation.resolveHome()
  }, [conversation])
  const dockOpen = layout.state.dock

  const body = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const conv = conversation.state.conv
  useEffect(() => {
    const el = body.current
    if (el !== null && stick.current) el.scrollTop = el.scrollHeight
  }, [conv])

  if (conversation.empty) {
    // Blank/new-session page: the greeting and the composer are one group,
    // vertically centered in the main column (official DSH layout). Once the
    // first message is sent the conversation is no longer blank and switches
    // to the message stream + bottom composer.
    return (
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '0 32px' }}>
        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <Hero store={conversation} plane={presets} dockOpen={dockOpen} />
          <div style={{ marginTop: 28 }}>
            <Composer store={conversation} plane={presets} dockOpen={dockOpen} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={body}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
        style={{ flex: '1 1 auto', overflowY: 'auto', userSelect: 'text', padding: '0 32px' }}
      >
        <Stream store={conversation} dockOpen={dockOpen} />
      </div>
      <div style={{ flex: '0 0 auto', padding: '0 32px' }}>
        <Composer store={conversation} plane={presets} dockOpen={dockOpen} />
      </div>
    </div>
  )
}
/**
 * The chat app's own sidebar row. The row ships with the app, so installing
 * one installs the other — the sidebar never lists a destination that might
 * not be there. The whole row is the new-task entry (wave 4 §2): clicking it
 * (or pressing Enter/Space while focused) opens a fresh task and reveals the
 * conversation it lands in. The row is a button semantically so a keyboard
 * user gets the same action.
 * @param current - whether this app is the main column's selection.
 */
export function ChatNav({ current }: { current: boolean }): ReactNode {
  const { conversation, layout } = useAppDeps()
  useStore(conversation)
  const newTask = (): void => {
    // Reveal the conversation the new session lands in — same rule as
    // clicking a session row (FEATURE_MAP §2).
    layout.setView(CONVERSATION_APP_ID)
    conversation.newTask()
  }
  return (
    <KIT.Row
      current={current}
      icon={<Compose size={16} />}
      onClick={newTask}
      title="新建任务"
      style={{ cursor: 'pointer' }}
    >
      对话
    </KIT.Row>
  )
}
