/**
 * The session list: a sidebar section.
 *
 * It never positions itself, never decides how wide the sidebar is, and never
 * knows there is a dock. It reads the DSH session and workspace snapshots
 * straight through the adapter and draws rows; the shell places it through
 * SIDEBAR_SECTIONS.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Dsh, SessionId, SessionSummary } from '../../dsh/adapter.ts'
import { basename, fmtRel, topSessions } from '../../dsh/adapter.ts'
import { useSnapshot } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'
import { ChevronDown, ChevronRight } from '../../ui/icons.tsx'

function SessionRow({ onOpen, row, indent, current }: {
  onOpen: (id: string) => void
  row: SessionSummary
  indent?: boolean
  current: boolean
}): ReactNode {
  return (
    <KIT.Row
      current={current}
      indent={indent === true}
      title={row.displayTitle}
      onClick={() => { onOpen(row.id) }}
      icon={<KIT.Dot tone={row.running ? 'run' : 'muted'} size={6} />}
      trailing={row.running
        ? <span style={{ color: 'var(--db-run-soft)' }}>运行中</span>
        : fmtRel(row.updatedAt)}
    >
      {row.displayTitle}
    </KIT.Row>
  )
}

/**
 * The session-list section: 任务 group of top-level sessions and 空间 group
 * of workspaces with their members. Expansion is local UI state.
 */
export function SessionList(): ReactNode {
  const { dsh, layout } = useAppDeps()
  const list = useSnapshot(dsh.sessions.list)
  const wsList = useSnapshot(dsh.workspaces.list)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [spacesOpen, setSpacesOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const currentId = list.current
  const sessions = topSessions(list)
  const byId = (list.byId ?? {}) as Partial<Record<string, SessionSummary>>
  const spaces = wsList.items ?? []
  // Clicking a session opens it and reveals the conversation: the main column
  // leaves settings (FEATURE_MAP §2 「点击打开」). The shell owns the
  // workbench-app selection; the session list only requests it.
  const openSession = (id: string): void => {
    layout.closeSettings()
    dsh.sessions.open(id as SessionId)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <KIT.GroupLabel
        onClick={() => { setTasksOpen(!tasksOpen) }}
        trailing={tasksOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      >
        {`任务 (${sessions.length})`}
      </KIT.GroupLabel>
      {tasksOpen && sessions.map(row => (
        <SessionRow key={row.id as string} onOpen={openSession} row={row} current={currentId === row.id} />
      ))}
      {tasksOpen && sessions.length === 0 && (
        <div style={{ padding: '2px 10px 6px', fontSize: 12, color: 'var(--db-text-5)' }}>
          {list ? '还没有任务' : '加载中…'}
        </div>
      )}

      <KIT.GroupLabel
        onClick={() => { setSpacesOpen(!spacesOpen) }}
        trailing={spacesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      >
        {`空间 (${spaces.length})`}
      </KIT.GroupLabel>
      {spacesOpen && spaces.map((w) => {
        const id = w.workspaceId as string
        const open = expanded === id
        const members = (w.sessionIds as readonly string[])
          .map(sid => byId[sid])
          .filter((x): x is SessionSummary => x !== undefined)
        return (
          <div key={id}>
            <KIT.Row
              onClick={() => { setExpanded(open ? null : id) }}
              icon={open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              trailing={members.length === 0 ? undefined : String(members.length)}
            >
              {w.title || basename(w.path)}
            </KIT.Row>
            {open && members.map(m => (
              <SessionRow key={m.id as string} onOpen={openSession} row={m} indent current={currentId === m.id} />
            ))}
            {open && members.length === 0 && (
              <div style={{ padding: '2px 10px 4px 32px', fontSize: 11.5, color: 'var(--db-text-5)' }}>空</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
