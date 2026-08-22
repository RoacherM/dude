/**
 * The session list: a sidebar section.
 *
 * It never positions itself, never decides how wide the sidebar is, and never
 * knows there is a dock. It reads the DSH session and workspace snapshots
 * straight through the adapter and draws rows grouped by workspace; the shell
 * places it through SIDEBAR_SECTIONS.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Dsh, SessionId, SessionSummary, WorkspaceView } from '../../dsh/adapter.ts'
import { basename, fmtRel, topSessions, workspaceOf } from '../../dsh/adapter.ts'
import { useSnapshot } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'
import { ChevronDown, ChevronRight, Folder, Plus, Search } from '../../ui/icons.tsx'

/** Sessions shown per workspace before the 「显示更多」 row (ref 10). */
const PER_GROUP = 5

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
 * One workspace group: a collapsible workspace row (folder icon + name) over
 * its member sessions, capped at {@link PER_GROUP} with a 「显示更多」 row.
 * The group holding the current session starts expanded.
 */
function WorkspaceGroup({ ws, byId, currentId, open, onToggle, onOpen, onShowMore }: {
  ws: WorkspaceView
  byId: Partial<Record<string, SessionSummary>>
  currentId: string | undefined
  open: boolean
  onToggle: () => void
  onOpen: (id: string) => void
  onShowMore: () => void
}): ReactNode {
  const members = (ws.sessionIds as readonly string[])
    .map(sid => byId[sid])
    .filter((x): x is SessionSummary => x !== undefined)
  const visible = members.slice(0, PER_GROUP)
  const overflow = members.length - visible.length
  return (
    <div>
      <KIT.Row
        onClick={onToggle}
        icon={open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        trailing={members.length === 0 ? undefined : String(members.length)}
        title={ws.title || basename(ws.path)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Folder size={14} style={{ flex: '0 0 14px', color: 'var(--db-text-3)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ws.title || basename(ws.path)}
          </span>
        </span>
      </KIT.Row>
      {open && visible.map(m => (
        <SessionRow key={m.id as string} onOpen={onOpen} row={m} indent current={currentId === m.id} />
      ))}
      {open && overflow > 0 && (
        <KIT.Row
          onClick={onShowMore}
          indent
          title={`显示更多会话（还有 ${overflow} 个）`}
          style={{ color: 'var(--db-text-4)' }}
        >
          {`显示更多会话（${overflow}）`}
        </KIT.Row>
      )}
      {open && members.length === 0 && (
        <div style={{ padding: '2px 10px 4px 32px', fontSize: 11.5, color: 'var(--db-text-5)' }}>空</div>
      )}
    </div>
  )
}

/**
 * The session-list section: the 「工作空间」 header with search + add actions,
 * then one group per workspace, then an 「未分组」 group for sessions that
 * belong to no workspace. The group holding the current session expands by
 * default. Expansion is local UI state.
 */
export function SessionList(): ReactNode {
  const { dsh } = useAppDeps()
  const list = useSnapshot(dsh.sessions.list)
  const wsList = useSnapshot(dsh.workspaces.list)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [shownMore, setShownMore] = useState<ReadonlySet<string>>(() => new Set())
  const currentId = list.current ?? undefined
  const sessions = topSessions(list)
  const byId = (list.byId ?? {}) as Partial<Record<string, SessionSummary>>
  const spaces = wsList.items ?? []
  const grouped = spaces.map(w => ({ ws: w, members: (w.sessionIds as readonly string[]).map(sid => byId[sid]).filter((x): x is SessionSummary => x !== undefined) }))
  const listedIds = new Set(grouped.flatMap(g => g.members.map(m => m.id as string)))
  const ungrouped = sessions.filter(s => !listedIds.has(s.id as string))
  const q = query.trim().toLowerCase()

  const openSession = (id: string): void => {
    dsh.sessions.open(id as SessionId)
  }
  const toggle = (id: string): void => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }
  const showMore = (id: string): void => {
    const next = new Set(shownMore)
    next.add(id)
    setShownMore(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <KIT.GroupLabel>
        工作空间
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
          <KIT.IconButton
            size={28}
            title={searching ? '关闭搜索' : '搜索会话'}
            active={searching}
            onClick={() => { setSearching(!searching); if (searching) setQuery('') }}
          >
            <Search size={13} />
          </KIT.IconButton>
          <KIT.IconButton
            size={28}
            title="添加工作空间"
            onClick={() => { void dsh.workspaces.pickDirectory() }}
          >
            <Plus size={13} />
          </KIT.IconButton>
        </span>
      </KIT.GroupLabel>

      {searching && (
        <div style={{ padding: '2px 8px 8px' }}>
          <KIT.Input value={query} onChange={setQuery} placeholder="搜索会话" size={30} />
        </div>
      )}

      {grouped.map(({ ws, members }) => {
        const id = ws.workspaceId as string
        const open = expanded.has(id) || currentId !== undefined && (ws.sessionIds as readonly string[]).includes(currentId)
        const limit = shownMore.has(id) ? members.length : PER_GROUP
        const visible = q === '' ? members.slice(0, limit) : members.filter(m => m.displayTitle.toLowerCase().includes(q))
        const overflow = members.length - Math.min(members.length, limit)
        return (
          <div key={id}>
            <KIT.Row
              onClick={() => { toggle(id) }}
              icon={open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              trailing={members.length === 0 ? undefined : String(members.length)}
              title={ws.title || basename(ws.path)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <Folder size={14} style={{ flex: '0 0 14px', color: 'var(--db-text-3)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ws.title || basename(ws.path)}
                </span>
              </span>
            </KIT.Row>
            {open && visible.map(m => (
              <SessionRow key={m.id as string} onOpen={openSession} row={m} indent current={currentId === m.id} />
            ))}
            {open && q === '' && overflow > 0 && (
              <KIT.Row
                onClick={() => { showMore(id) }}
                indent
                title={`显示更多会话（还有 ${overflow} 个）`}
                style={{ color: 'var(--db-text-4)' }}
              >
                {`显示更多会话（${overflow}）`}
              </KIT.Row>
            )}
            {open && members.length === 0 && (
              <div style={{ padding: '2px 10px 4px 32px', fontSize: 11.5, color: 'var(--db-text-5)' }}>空</div>
            )}
          </div>
        )
      })}

      {(ungrouped.length > 0 || spaces.length === 0) && (
        <>
          <KIT.GroupLabel>未分组</KIT.GroupLabel>
          {ungrouped.map(row => (
            <SessionRow key={row.id as string} onOpen={openSession} row={row} current={currentId === row.id} />
          ))}
          {ungrouped.length === 0 && (
            <div style={{ padding: '2px 10px 6px', fontSize: 12, color: 'var(--db-text-5)' }}>
              {list ? '还没有会话' : '加载中…'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
