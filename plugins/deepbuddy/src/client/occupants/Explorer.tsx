/**
 * The explorer dock pane: the workspace file tree on the left of the pane, the
 * active tab's file body on the right.
 *
 * The pane does not draw a tab strip — the dock owns that row for every pane
 * (seats.ts {@link DockTabs}). Opening a file is two calls: read the body
 * (data plane) and open the tab (kernel). Neither knows about the other, which
 * is the boundary M2 will move this file across.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { DockPaneProps, TabRef } from '../seats.ts'
import type { AppStore } from '../store.ts'
import type { DirectoryChild } from '../files.ts'
import { basename } from '../dsh.ts'
import { useStore } from './store-hook.ts'
import { ChevronDown, ChevronRight, FileText, Folder } from '../icons.tsx'

/** The pane id this occupant registers under; the kernel keys tabs by it. */
const PANE = 'explorer'

/**
 * One stable empty array. A selector that builds `[]` on every call hands
 * useSyncExternalStore a new snapshot each render, which is an infinite loop
 * rather than an empty list.
 */
const NO_TABS: readonly TabRef[] = []

/** Sort one listed level: directories first, then case-insensitive by name. */
function sortEntries(entries: readonly DirectoryChild[]): DirectoryChild[] {
  return [...entries].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

function Note({ pad, tone, children }: { pad: number; tone?: 'error'; children: ReactNode }): ReactNode {
  return (
    <div style={{
      padding: `4px 10px 4px ${pad}px`, fontSize: 11.5, wordBreak: 'break-all',
      color: tone === 'error' ? 'var(--db-await)' : 'var(--db-text-5)',
    }}
    >
      {children}
    </div>
  )
}

/** One expanded directory level of the live tree (root at depth 0). */
function TreeLevel({ store, ui, onOpen, active, dirKey, depth }: {
  store: AppStore
  ui: DockPaneProps['ui']
  onOpen: (child: DirectoryChild) => void
  active: string | null
  dirKey: string
  depth: number
}): ReactNode {
  const children = store.state.fsChildren[dirKey]
  const pad = 8 + depth * 14
  if (children === undefined || children === 'loading') return <Note pad={pad + 16}>读取中…</Note>
  if (!Array.isArray(children)) return <Note pad={pad + 16} tone="error">{`读取失败：${children.error}`}</Note>
  if (children.length === 0) return <Note pad={pad + 16}>空目录</Note>
  return (
    <>
      {sortEntries(children).map((child) => {
        if (child.directory) {
          const open = store.state.fsExpanded[child.path] === true
          return (
            <div key={child.path}>
              {/* Depth is the tree's own fact, so it arrives as a padding
                  override; height, radius and the selected fill stay the
                  kit's. */}
              <ui.Row
                dense
                title={child.path}
                onClick={() => { store.toggleFolder(child.path) }}
                style={{ paddingLeft: pad, gap: 6 }}
                icon={(
                  <>
                    {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Folder size={13} style={{ marginLeft: 6 }} />
                  </>
                )}
              >
                {child.name}
              </ui.Row>
              {open && <TreeLevel store={store} ui={ui} onOpen={onOpen} active={active} dirKey={child.path} depth={depth + 1} />}
            </div>
          )
        }
        const current = active === child.path
        return (
          <ui.Row
            key={child.path}
            dense
            current={current}
            title={child.path}
            onClick={() => { onOpen(child) }}
            style={{ paddingLeft: pad + 17, gap: 6, fontFamily: 'var(--db-mono)', fontSize: 12 }}
            icon={<FileText size={13} />}
          >
            {child.name}
          </ui.Row>
        )
      })}
    </>
  )
}

function FileBody({ store, ui, path }: { store: AppStore; ui: DockPaneProps['ui']; path: string }): ReactNode {
  const body = store.state.fileBodies[path]
  if (body === undefined || body === 'loading') {
    return <div style={{ padding: 16, fontSize: 12.5, color: 'var(--db-text-4)' }}>读取中…</div>
  }
  if ('error' in body) {
    return (
      <div style={{ padding: 16, fontSize: 12.5, color: 'var(--db-await)' }}>
        {`无法读取：${body.error.message ?? body.error.kind}`}
      </div>
    )
  }
  if (body.kind === 'binary') {
    return (
      <div style={{ padding: 16 }}>
        <ui.EmptyState>
          {`二进制文件${body.size === null ? '' : ` · ${(body.size / 1024).toFixed(1)} KB`}`}
        </ui.EmptyState>
      </div>
    )
  }
  return (
    <div style={{ padding: 16 }}>
      <pre style={{
        margin: 0, padding: 14, borderRadius: 'var(--db-r-card)', background: 'var(--db-fill-1)',
        fontFamily: 'var(--db-mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--db-text-2)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
      >
        {body.text}
      </pre>
      {body.truncated && (
        <div style={{ paddingTop: 8, fontSize: 11.5, color: 'var(--db-text-5)' }}>文件过大，已截断显示</div>
      )}
    </div>
  )
}

/**
 * Build the explorer pane occupant.
 * @param store - the temporary occupants' data plane.
 * @returns the component to register into `dbdy.dock.pane`.
 */
export function createExplorerPane(store: AppStore): (props: DockPaneProps) => ReactNode {
  return function ExplorerPane({ ui, tabs, useLayoutState }: DockPaneProps): ReactNode {
    useStore(store)
    const active = useLayoutState(s => s.tabs[PANE]?.active ?? null)
    const open = useLayoutState(s => s.tabs[PANE]?.items ?? NO_TABS)
    const s = store.state

    // A session switch fences the file tree; tabs from the old workspace point
    // at paths this session may not have. The store owns the tree reset, the
    // pane owns dropping its own tabs — each clears what it opened.
    // The open list rides a ref so the subscription is set up once: it changes
    // on every tab action, and re-subscribing on each would be churn.
    const openRef = useRef(open)
    openRef.current = open
    useEffect(() => store.onSessionChange(() => {
      for (const tab of openRef.current) tabs.close(PANE, tab.id)
    }), [tabs])

    const onOpen = (child: DirectoryChild): void => {
      store.openFile(child)
      tabs.open(PANE, { id: child.path, label: child.name })
    }

    if (store.dsh.files === null) {
      return <div style={{ padding: 16 }}><ui.EmptyState>文件服务未装配。</ui.EmptyState></div>
    }
    if (s.list?.current === undefined) {
      return <div style={{ padding: 16 }}><ui.EmptyState>还没有会话——发起一个任务，这里显示它的工作空间。</ui.EmptyState></div>
    }
    // With nothing open the tree IS the pane. Splitting first and filling the
    // right half with a dashed placeholder spends the dock's whole width on a
    // box that says "empty" — the tree wants that width.
    const split = active !== null
    return (
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <div style={{
          ...split ? { flex: '0 0 232px', width: 232 } : { flex: '1 1 auto' },
          minWidth: 0,
          overflowY: 'auto',
          ...split ? { borderRight: '1px solid var(--db-line)' } : {},
          padding: '8px 6px 16px',
        }}
        >
          {/* The tail is what identifies a workspace, but `direction: rtl`
              would move the leading slash to the end and read as a different
              path — so the row shows the last segment and keeps the whole
              path in the tooltip. */}
          <div
            title={s.fsRoot ?? undefined}
            style={{
              padding: '0 8px 6px', fontFamily: 'var(--db-mono)', fontSize: 11, color: 'var(--db-text-5)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {s.fsRoot === null ? '…' : basename(s.fsRoot)}
          </div>
          <TreeLevel store={store} ui={ui} onOpen={onOpen} active={active} dirKey="root" depth={0} />
        </div>
        {active !== null && (
          <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', userSelect: 'text' }}>
            <FileBody store={store} ui={ui} path={active} />
          </div>
        )}
      </div>
    )
  }
}
