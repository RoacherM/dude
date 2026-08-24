/**
 * The 概览 inspector view: the session at a glance, in two collapsible
 * sections stacked in one panel.
 *
 * 概览 — the conversation outline: one row per user prompt, in order.
 * Clicking a row scrolls the official conversation to that message through
 * its own `data-chat-anchor-key` row anchors (the official scroll surface
 * renders one per chat node; DeepBuddy only navigates to them, it never
 * re-renders the chat).
 *
 * 产物 — every file the agent produced this session, aggregated from the
 * official deliverables turn-fold (`turn.data.get('deliverables')`, written
 * by the enabled dsh-client-ui-deliverables definition). Clicking a row
 * opens the file preview in the 文件 view — the dock's existing reader —
 * rather than growing a second preview surface here.
 *
 * Both sections read live snapshots the stores already hold; this file owns
 * no data plane of its own (DEVELOPMENT_RULES §5).
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
// Type-only: merges the `deliverables` key into ConversationTurnDataMap so
// `turn.data.get('deliverables')` types. Erased at build time — cross-plugin
// VALUE imports are a bundle-purity error.
import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'
import type { InspectorViewProps } from '../../app/catalog.ts'
import { useAppDeps } from '../../app/context.tsx'
import { useStore } from '../../dsh/hooks.ts'
import { basename, textOfParts } from '../../dsh/adapter.ts'
import type { ChatSnapshot } from '../../dsh/adapter.ts'
import { KIT, ROW_METRICS } from '../../ui/kit.tsx'
import { ChevronDown, ChevronRight } from '../../ui/icons.tsx'

/** The catalog id of the files view a deliverable opens into. */
const FILES_VIEW_ID = 'explorer'

/** One outline row: the chat anchor key plus the prompt's display text. */
interface OutlineRow {
  key: string
  text: string
}

/**
 * User prompts in chat order. Steering and injected-context rows are not
 * prompts — the outline is what the USER asked, not everything that entered
 * the log.
 */
function outlineOf(chat: ChatSnapshot): OutlineRow[] {
  const rows: OutlineRow[] = []
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    if (node === undefined || node.kind !== 'user') continue
    const text = textOfParts((node.data as { content?: unknown }).content).trim()
    if (text === '') continue
    rows.push({ key, text })
  }
  return rows
}

/** Session-wide produced files, first-seen order, deduplicated across turns. */
function deliverablesOf(chat: ChatSnapshot): string[] {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const turn of chat.timeline.turnOrder) {
    const data = chat.timeline.turns.get(turn)?.data.get('deliverables')
    if (data === undefined) continue
    for (const produced of data.produced) {
      if (seen.has(produced.path)) continue
      seen.add(produced.path)
      paths.push(produced.path)
    }
  }
  return paths
}

/**
 * Scroll the official conversation to one chat row. The official scroll
 * container owns the animation; a missing anchor (virtualized-out or an
 * unloaded older page) is a silent no-op rather than an error surface.
 */
function scrollToAnchor(key: string): void {
  const row = document.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** One collapsible section: caret + label header over an indented body. */
function Section({ label, open, onToggle, children }: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <KIT.GroupLabel
        onClick={onToggle}
        trailing={open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        style={{ padding: `16px ${ROW_METRICS.pad}px 6px`, fontSize: 12.5, color: 'var(--db-text-2)', userSelect: 'none' }}
      >
        {label}
      </KIT.GroupLabel>
      {open && children}
    </div>
  )
}

/** Muted per-section placeholder, the reference's 暂无内容. */
function Empty(): ReactNode {
  return (
    <div style={{ padding: `2px ${ROW_METRICS.pad}px 6px`, fontSize: 12.5, color: 'var(--db-text-5)' }}>
      暂无内容
    </div>
  )
}

export function OverviewView(_props: InspectorViewProps): ReactNode {
  const { conversation, files, layout } = useAppDeps()
  useStore(conversation)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [producedOpen, setProducedOpen] = useState(true)

  const chat = conversation.state.conv?.chat
  const outline = chat === undefined ? [] : outlineOf(chat)
  const produced = chat === undefined ? [] : deliverablesOf(chat)

  const openDeliverable = (path: string): void => {
    const name = basename(path)
    files.openFile({ name, path, directory: false })
    layout.openDock(FILES_VIEW_ID)
    layout.openTab(FILES_VIEW_ID, { id: path, label: name })
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: `0 ${ROW_METRICS.gutter}px 14px` }}>
      <Section label="概览" open={outlineOpen} onToggle={() => { setOutlineOpen(o => !o) }}>
        {outline.length === 0
          ? <Empty />
          : outline.map((row, i) => (
            <div
              key={row.key}
              onClick={() => { scrollToAnchor(row.key) }}
              className="dbdy-hv-1"
              title={row.text}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                padding: `5px ${ROW_METRICS.pad}px`, borderRadius: 'var(--db-r-chip)', cursor: 'pointer',
              }}
            >
              <span style={{ flex: '0 0 auto', fontSize: 11.5, color: 'var(--db-text-5)', fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </span>
              <span style={{
                flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', fontSize: 13, color: 'var(--db-text-2)',
              }}
              >
                {row.text}
              </span>
            </div>
          ))}
      </Section>

      <Section label="产物" open={producedOpen} onToggle={() => { setProducedOpen(o => !o) }}>
        {produced.length === 0
          ? <Empty />
          : produced.map(path => (
            <div
              key={path}
              onClick={() => { openDeliverable(path) }}
              className="dbdy-hv-1"
              title={path}
              style={{
                display: 'flex', flexDirection: 'column', gap: 1,
                padding: `5px ${ROW_METRICS.pad}px`, borderRadius: 'var(--db-r-chip)', cursor: 'pointer',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--db-text-2)' }}>
                {basename(path)}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--db-text-5)' }}>
                {path}
              </span>
            </div>
          ))}
      </Section>
    </div>
  )
}
