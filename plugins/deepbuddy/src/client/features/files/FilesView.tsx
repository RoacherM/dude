/**
 * The explorer inspector view: the workspace file tree on the left of the
 * column, the active tab's file body on the right.
 *
 * The view does not draw a tab strip — the shell owns that row and the tab
 * ledger (app/catalog.ts {@link InspectorViewProps}). Opening a file is two
 * calls: read the body (the files store) and open the tab (the shell's
 * callback). Neither knows about the other.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { InspectorViewProps } from '../../app/catalog.ts'
import type { FilesStore } from './store.ts'
import type { DirectoryChild } from '../../dsh/files.ts'
import { basename } from '../../dsh/adapter.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'
import { ChevronDown, ChevronRight, FileText, Folder } from '../../ui/icons.tsx'

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
function TreeLevel({ store, onOpen, active, dirKey, depth }: {
  store: FilesStore
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
              <KIT.Row
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
              </KIT.Row>
              {open && <TreeLevel store={store} onOpen={onOpen} active={active} dirKey={child.path} depth={depth + 1} />}
            </div>
          )
        }
        const current = active === child.path
        return (
          <KIT.Row
            key={child.path}
            dense
            current={current}
            title={child.path}
            onClick={() => { onOpen(child) }}
            style={{ paddingLeft: pad + 17, gap: 6, fontFamily: 'var(--db-mono)', fontSize: 12 }}
            icon={<FileText size={13} />}
          >
            {child.name}
          </KIT.Row>
        )
      })}
    </>
  )
}

function FileBody({ store, path }: { store: FilesStore; path: string }): ReactNode {
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
        <KIT.EmptyState>
          {`二进制文件${body.size === null ? '' : ` · ${(body.size / 1024).toFixed(1)} KB`}`}
        </KIT.EmptyState>
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
 * The explorer view.
 *
 * A session switch fences the file tree; tabs from the old workspace point
 * at paths this session may not have. The store owns the tree reset, the
 * view owns dropping its own tabs — each clears what it opened.
 */
export function FilesView(props: InspectorViewProps): ReactNode {
  const { tabs, active, onOpenTab, onCloseTab } = props
  const { files } = useAppDeps()
  useStore(files)
  const s = files.state

  // Drop this view's tabs when the session changes. The open list rides a ref
  // so the effect is subscribed once: it changes on every tab action, and
  // re-running the effect on each would be churn.
  const first = useRef(true)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const sessionId = s.sessionId
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    for (const tab of tabsRef.current) onCloseTab(tab.id)
  }, [sessionId])

  const onOpen = (child: DirectoryChild): void => {
    files.openFile(child)
    onOpenTab({ id: child.path, label: child.name })
  }

  if (files.dsh.files === null) {
    return <div style={{ padding: 16 }}><KIT.EmptyState>文件服务未装配。</KIT.EmptyState></div>
  }
  if (s.sessionId === undefined) {
    return <div style={{ padding: 16 }}><KIT.EmptyState>还没有会话——发起一个任务，这里显示它的工作空间。</KIT.EmptyState></div>
  }
  // With nothing open the tree IS the view. Splitting first and filling the
  // right half with a dashed placeholder spends the column's whole width on a
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
        <TreeLevel store={files} onOpen={onOpen} active={active} dirKey="root" depth={0} />
      </div>
      {active !== null && (
        <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', userSelect: 'text' }}>
          <FileBody store={files} path={active} />
        </div>
      )}
    </div>
  )
}
