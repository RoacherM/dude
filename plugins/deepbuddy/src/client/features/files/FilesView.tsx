/**
 * The explorer inspector view: the workspace file tree on the left of the
 * column, the active tab's file body on the right.
 *
 * The shared inspector tab row draws this view's shell-owned ledger slice.
 * Opening a file is two calls: read the body and open the tab. Neither store
 * knows about the other.
 */
import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InspectorViewProps } from '../../app/catalog.ts'
import type { FilesStore } from './store.ts'
import type { DirectoryChild } from '../../dsh/files.ts'
import { basename } from '../../dsh/adapter.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'
import { InspectorTabs } from '../../ui/InspectorTabs.tsx'
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

/**
 * A file tree is a monospace list, not a rail: 28px lines, code face, the
 * control radius. Depth, height, face and radius are the tree's own facts and
 * arrive as overrides — the selected fill and the row's structure stay the
 * kit's, so a tree row is still recognisably the same row as a session row.
 */
const TREE_ROW: CSSProperties = {
  height: 28,
  borderRadius: 'var(--db-r-control)',
  fontFamily: 'var(--db-mono)',
  fontSize: 12.5,
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
              <KIT.Row
                dense
                title={child.path}
                onClick={() => { store.toggleFolder(child.path) }}
                style={{ ...TREE_ROW, paddingLeft: pad, gap: 6 }}
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
            style={{ ...TREE_ROW, paddingLeft: pad + 17, gap: 6, fontSize: 12 }}
            icon={<FileText size={13} />}
          >
            {child.name}
          </KIT.Row>
        )
      })}
    </>
  )
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac)$/i
const PDF_EXT = /\.pdf$/i

type MediaMime = 'image' | 'video' | 'audio' | 'pdf'

/** Which media renderer a file path needs, if any — everything Chromium can
 *  paint natively. Formats with no native renderer (office docs, archives)
 *  stay on the text path's binary empty state. */
function mediaKind(path: string): MediaMime | null {
  if (IMAGE_EXT.test(path)) return 'image'
  if (VIDEO_EXT.test(path)) return 'video'
  if (AUDIO_EXT.test(path)) return 'audio'
  if (PDF_EXT.test(path)) return 'pdf'
  return null
}

/**
 * The image/video preview body. Requests the bytes on mount; the blob URL (if
 * the base64 fallback produced one) is store-owned and revoked by the session
 * fence, NOT here — the cache outlives this mount by design, so revoking on
 * unmount would leave the cached entry pointing at a dead URL. The byte size
 * guard lives in the host (returns `binary-too-large` past the cap).
 */
function MediaPreview({ store, path, mime }: { store: FilesStore; path: string; mime: MediaMime }): ReactNode {
  const media = store.state.mediaBodies[path]
  const requested = media !== undefined
  useEffect(() => {
    if (!requested) store.openBinaryFile(path)
  }, [store, path, requested])
  if (media === undefined || media === 'loading') {
    return <div style={{ padding: 16, fontSize: 12.5, color: 'var(--db-text-4)' }}>读取媒体…</div>
  }
  if (media.kind === 'error') {
    // The store treats a cached error as retryable, but the fetch-on-mount
    // effect above never re-fires for a settled entry and the tree row skips
    // media reads entirely — without this button the retry is unreachable.
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--db-await)' }}>{`无法预览：${media.message}`}</span>
        <KIT.Button onClick={() => { store.openBinaryFile(path) }}>重试</KIT.Button>
      </div>
    )
  }
  if (media.kind === 'too-large') {
    return (
      <div style={{ padding: 16 }}>
        <KIT.EmptyState>
          {`文件过大${media.size === null ? '' : ` · ${(media.size / (1024 * 1024)).toFixed(1)} MB`}`}
        </KIT.EmptyState>
      </div>
    )
  }
  // PDF fills the pane (the built-in viewer scrolls itself); the rest center.
  if (mime === 'pdf') {
    return (
      <embed
        src={media.url}
        type="application/pdf"
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    )
  }
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', alignItems: mime === 'audio' ? 'center' : 'flex-start', justifyContent: 'center', overflow: 'auto' }}>
      {mime === 'image' && (
        <img
          src={media.url}
          alt={basename(path)}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--db-r-card)' }}
        />
      )}
      {mime === 'video' && <video src={media.url} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--db-r-card)' }} />}
      {mime === 'audio' && <audio src={media.url} controls style={{ width: '100%', maxWidth: 420 }} />}
    </div>
  )
}

function FileBody({ store, path }: { store: FilesStore; path: string }): ReactNode {
  const body = store.state.fileBodies[path]
  const kind = mediaKind(path)
  const unrequested = kind === null && body === undefined
  useEffect(() => {
    // A restored tab (session round-trip re-hangs the stashed ledger) has an
    // entry but no body — the tree click that normally reads it never
    // happened this mount, so the body request rides the mount instead.
    if (unrequested) store.openFile({ path, name: basename(path), directory: false })
  }, [store, path, unrequested])
  if (kind !== null) {
    return <MediaPreview store={store} path={path} mime={kind} />
  }
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
  if (body.kind === 'binary' || body.kind === 'binary-too-large') {
    return (
      <div style={{ padding: 16 }}>
        <KIT.EmptyState>
          {body.kind === 'binary-too-large'
            ? `文件过大${body.size === null ? '' : ` · ${(body.size / (1024 * 1024)).toFixed(1)} MB`}`
            : `二进制文件${body.size === null ? '' : ` · ${(body.size / 1024).toFixed(1)} KB`}`}
        </KIT.EmptyState>
      </div>
    )
  }
  return (
    <div style={{ padding: 16 }}>
      {/* File text is embedded content, so it sits in the same void block the
          terminal and the browser page do, not on a tinted fill. */}
      <pre style={{
        margin: 0, padding: '14px 16px', border: '1px solid var(--db-line-panel)',
        borderRadius: 'var(--db-r-card)', background: 'var(--db-void)',
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
 * A session switch fences the file tree: the store resets the tree it owns,
 * and the assembly's session fence drops the tab ledger and remounts this
 * view — no per-session logic lives here.
 */
export function FilesView(props: InspectorViewProps): ReactNode {
  const { tabs, active, visible, onOpenTab, onCloseTab, onFocusTab, onReorderTab } = props
  const { files } = useAppDeps()
  useStore(files)
  const s = files.state
  const sessionId = s.sessionId

  const rootState = s.fsChildren['root']
  useEffect(() => {
    if (visible && sessionId !== undefined && rootState === undefined) files.ensureRootLoaded()
  }, [files, visible, sessionId, rootState])

  const onOpen = (child: DirectoryChild): void => {
    // Media paths render from the binary/media plane only (MediaPreview
    // fetches on mount) — reading the text body too would pull every image
    // over the wire twice.
    if (mediaKind(child.path) === null) files.openFile(child)
    onOpenTab({ id: child.path, label: child.name })
    onFocusTab(child.path)
  }

  const frame = (body: ReactNode): ReactNode => (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {tabs.length > 0 && <InspectorTabs tabs={tabs} active={active} onFocus={onFocusTab} onClose={onCloseTab} onReorder={onReorderTab} />}
      {body}
    </div>
  )

  if (files.dsh.files === null) {
    return frame(<div style={{ padding: 16 }}><KIT.EmptyState>文件服务未装配。</KIT.EmptyState></div>)
  }
  if (s.sessionId === undefined) {
    return frame(<div style={{ padding: 16 }}><KIT.EmptyState>还没有会话——发起一个任务，这里显示它的工作空间。</KIT.EmptyState></div>)
  }
  // With nothing open the tree IS the view. Splitting first and filling the
  // right half with a dashed placeholder spends the column's whole width on a
  // box that says "empty" — the tree wants that width.
  const split = active !== null
  return frame(
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
