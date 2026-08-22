/**
 * The session list: a `dbdy.sidebar.section` occupant.
 *
 * Temporary and in-package like the chat view — it moves out in M2. Note what
 * it does NOT do: it never positions itself, never decides how wide the
 * sidebar is, and never knows there is a dock. It draws rows.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SeatProps } from '../seats.ts'
import type { AppStore } from '../store.ts'
import type { SessionSummary } from '../dsh.ts'
import { basename, fmtRel, topSessions } from '../dsh.ts'
import { useStore } from './store-hook.ts'
import { ChevronDown, ChevronRight } from '../icons.tsx'

function SessionRow({ store, ui, row, indent }: {
  store: AppStore
  ui: SeatProps['ui']
  row: SessionSummary
  indent?: boolean
}): ReactNode {
  const current = store.state.list?.current === row.id
  return (
    <ui.Row
      current={current}
      indent={indent === true}
      title={row.displayTitle}
      onClick={() => { store.selectTask(row.id) }}
      icon={<ui.Dot tone={row.running ? 'run' : 'muted'} size={6} />}
      trailing={row.running
        ? <span style={{ color: 'var(--db-run-soft)' }}>运行中</span>
        : fmtRel(row.updatedAt)}
    >
      {row.displayTitle}
    </ui.Row>
  )
}

/**
 * Build the session-list section occupant.
 * @param store - the temporary occupants' data plane.
 * @returns the component to register into `dbdy.sidebar.section`.
 */
export function createSessionsSection(store: AppStore): (props: SeatProps) => ReactNode {
  return function SessionsSection({ ui }: SeatProps): ReactNode {
    useStore(store)
    const [tasksOpen, setTasksOpen] = useState(true)
    const [spacesOpen, setSpacesOpen] = useState(false)
    const [expanded, setExpanded] = useState<string | null>(null)
    const s = store.state
    const sessions = s.list ? topSessions(s.list) : []
    const byId = (s.list?.byId ?? {}) as Partial<Record<string, SessionSummary>>
    const spaces = s.wsList?.items ?? []
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ui.GroupLabel
          onClick={() => { setTasksOpen(!tasksOpen) }}
          trailing={tasksOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        >
          {`任务 (${sessions.length})`}
        </ui.GroupLabel>
        {tasksOpen && sessions.map(row => <SessionRow key={row.id as string} store={store} ui={ui} row={row} />)}
        {tasksOpen && sessions.length === 0 && (
          <div style={{ padding: '2px 10px 6px', fontSize: 12, color: 'var(--db-text-5)' }}>
            {s.list ? '还没有任务' : '加载中…'}
          </div>
        )}

        <ui.GroupLabel
          onClick={() => { setSpacesOpen(!spacesOpen) }}
          trailing={spacesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        >
          {`空间 (${spaces.length})`}
        </ui.GroupLabel>
        {spacesOpen && spaces.map((w) => {
          const id = w.workspaceId as string
          const open = expanded === id
          const members = (w.sessionIds as readonly string[])
            .map(sid => byId[sid])
            .filter((x): x is SessionSummary => x !== undefined)
          return (
            <div key={id}>
              <ui.Row
                onClick={() => { setExpanded(open ? null : id) }}
                icon={open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                trailing={members.length === 0 ? undefined : String(members.length)}
              >
                {w.title || basename(w.path)}
              </ui.Row>
              {open && members.map(m => <SessionRow key={m.id as string} store={store} ui={ui} row={m} indent />)}
              {open && members.length === 0 && (
                <div style={{ padding: '2px 10px 4px 32px', fontSize: 11.5, color: 'var(--db-text-5)' }}>空</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }
}
