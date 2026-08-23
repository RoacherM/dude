/**
 * The session list: a sidebar section.
 *
 * It never positions itself, never decides how wide the sidebar is, and never
 * knows there is a dock. It reads the DSH session and workspace snapshots
 * straight through the adapter and draws rows grouped by workspace; the shell
 * places it through SIDEBAR_SECTIONS.
 *
 * ui-unify (wave): the tree matches the official sidebar — folder open/closed
 * icons (no chevron, no count badge), no session dot, short zh times
 * (「12小时」「5天」), current-session rounded pill, and 「未分组」 as a
 * collapsible group row at the same level as workspace groups.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Dsh, SessionId, SessionSummary } from '../../dsh/adapter.ts'
import { basename, fmtRel, topSessions } from '../../dsh/adapter.ts'
import { useSnapshot } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'
import { Folder, FolderOpen, Plus, Search } from '../../ui/icons.tsx'

/** Sessions shown per workspace before the 「展开其余」 row (ref 10). */
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
      dense
      trailing={row.running
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--db-run-soft)' }}>
            <KIT.Dot tone="run" size={5} />
          </span>
        : fmtRel(row.updatedAt)}
    >
      {row.displayTitle}
    </KIT.Row>
  )
}

/**
 * One collapsible tree group: a folder row (open/closed icon + name) over its
 * member sessions, capped at {@link PER_GROUP} with a 「展开其余」 row. The
 * group holding the current session starts expanded. `variant` distinguishes
 * a workspace row from the 「未分组」 row (same presentation).
 */
function TreeGroup({ label, members, currentId, open, onToggle, onOpen, onShowMore, overflow }: {
  label: string
  members: SessionSummary[]
  currentId: string | undefined
  open: boolean
  onToggle: () => void
  onOpen: (id: string) => void
  onShowMore: () => void
  overflow: number
}): ReactNode {
  return (
    <div>
      <KIT.Row
        onClick={onToggle}
        icon={open ? <FolderOpen size={14} /> : <Folder size={14} />}
        title={label}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </KIT.Row>
      {open && members.map(m => (
        <SessionRow key={m.id as string} onOpen={onOpen} row={m} indent current={currentId === m.id} />
      ))}
      {open && overflow > 0 && (
        <KIT.Row
          onClick={onShowMore}
          indent
          dense
          title={`展开其余 ${overflow} 个会话`}
          style={{ color: 'var(--db-text-4)' }}
        >
          {`展开其余 ${overflow} 个会话`}
        </KIT.Row>
      )}
      {open && members.length === 0 && (
        <div style={{ padding: '2px 10px 4px 28px', fontSize: 11.5, color: 'var(--db-text-5)' }}>空</div>
      )}
    </div>
  )
}

/**
 * The session-list section: the 「工作区」 header with search + add actions,
 * then one tree group per workspace, then a 「未分组」 tree group. The group
 * holding the current session expands by default. Expansion is local UI state.
 */
export function SessionList(): ReactNode {
  const { dsh } = useAppDeps()
  const list = useSnapshot(dsh.sessions.list)
  const wsList = useSnapshot(dsh.workspaces.list)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  // Per-group expansion override. Absent = default (the group holding the
  // current session shows open, others closed); present = the user's explicit
  // choice, which wins — so the current group can still be collapsed by hand.
  const [expanded, setExpanded] = useState<Readonly<Partial<Record<string, boolean>>>>(() => ({}))
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
  const toggle = (id: string, open: boolean): void => {
    setExpanded({ ...expanded, [id]: !open })
  }
  const showMore = (id: string): void => {
    const next = new Set(shownMore)
    next.add(id)
    setShownMore(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <KIT.GroupLabel>
        工作区
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
            title="添加工作区"
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
        const open = expanded[id] ?? (currentId !== undefined && (ws.sessionIds as readonly string[]).includes(currentId))
        const limit = shownMore.has(id) ? members.length : PER_GROUP
        const visible = q === '' ? members.slice(0, limit) : members.filter(m => m.displayTitle.toLowerCase().includes(q))
        const overflow = members.length - Math.min(members.length, limit)
        return (
          <TreeGroup
            key={id}
            label={ws.title || basename(ws.path)}
            members={visible}
            currentId={currentId}
            open={open}
            onToggle={() => { toggle(id, open) }}
            onOpen={openSession}
            onShowMore={() => { showMore(id) }}
            overflow={q === '' ? overflow : 0}
          />
        )
      })}

      {(ungrouped.length > 0 || spaces.length === 0) && (
        <TreeGroup
          label="未分组"
          members={ungrouped}
          currentId={currentId}
          open={expanded['__ungrouped__'] ?? true}
          onToggle={() => { toggle('__ungrouped__', expanded['__ungrouped__'] ?? true) }}
          onOpen={openSession}
          onShowMore={() => {}}
          overflow={0}
        />
      )}
    </div>
  )
}
