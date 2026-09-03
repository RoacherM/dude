/**
 * The three-column frame: the root occupant, the sidebar column and the
 * inspector column. The main (workbench) column is the `conversation` slot,
 * now owned by the enabled ui-conversation row's `ConversationRoot`.
 *
 * The shell owns the window box, the column geometry, the two drag handles,
 * the official slot contract rendering and the window-level overlay — and
 * nothing about sessions, files or presets. Business content arrives through
 * the static catalogs (app/catalog.ts): the sidebar composes the conversation
 * entry plus the official `sidebar.workspaces` seat, and the inspector draws
 * INSPECTOR_VIEW_TYPES with the shell-owned tab ledger. There is no
 * `if (app.id === …)` anywhere — the shell renders whichever entry the
 * catalog and the layout state name (deepbuddy-design-current/
 * DEVELOPMENT_RULES.md §4).
 *
 * The official frame contract (sidebar / conversation / details /
 * shell.overlay) is rendered here too, because the root registration
 * re-declares it in the disabled ui-layout row's place
 * (deepbuddy-design-current/ARCHITECTURE.md §4).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { RenderSlot } from '../dsh/adapter.ts'
import type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
import { INSPECTOR_VIEW_TYPES } from '../app/catalog.ts'
import type { InspectorViewTypeDefinition } from '../app/catalog.ts'
import type { AppDeps } from '../app/context.tsx'
import { AppDepsProvider, useAppDeps } from '../app/context.tsx'
import { useLayoutSelection } from './layout-store.ts'
import type { DockTab, LayoutStore, PaneTabs } from './layout-store.ts'
import { ColumnFrame, Handle, NO_DRAG, PANEL, TrafficLights } from './ColumnFrame.tsx'
import { KIT, ROW_METRICS } from '../ui/kit.tsx'
import { Glyph, Maximize, Minimize, PanelLeft, PanelRight, Plus } from '../ui/icons.tsx'
import { InspectorTabs } from '../ui/InspectorTabs.tsx'
import { METRICS } from '../ui/tokens.ts'
import { ChatNav } from '../features/conversation/index.ts'

/** Details column width when `ctx.layout` opens it (ui-layout's DETAILS_DEFAULT). */
const DETAILS_WIDTH = 480

/**
 * The window's outermost ring stays OUT of the drag region: macOS puts its
 * edge-resize hit zone exactly there, and Electron cannot resize through a
 * draggable rect. Region collection ignores z-order and pointer-events, so
 * four inert strips subtract the edges from the root's full-window drag face
 * while the rest of the gap ring keeps moving the window.
 */
const RESIZE_EDGE = 6
const EDGE_BASE = { position: 'absolute', pointerEvents: 'none', WebkitAppRegion: 'no-drag' } as CSSProperties
const EDGE_STRIPS: readonly CSSProperties[] = [
  { ...EDGE_BASE, top: 0, left: 0, right: 0, height: RESIZE_EDGE },
  { ...EDGE_BASE, bottom: 0, left: 0, right: 0, height: RESIZE_EDGE },
  { ...EDGE_BASE, top: 0, left: 0, bottom: 0, width: RESIZE_EDGE },
  { ...EDGE_BASE, top: 0, right: 0, bottom: 0, width: RESIZE_EDGE },
]

// ── the sidebar column ──────────────────────────────────────────────────────

/**
 * The sidebar occupant: a 268px rail on the darkest ground. The status bar
 * carries the window controls and the left-column toggle; below it the
 * conversation's own entry row, the official workspace browser
 * (`sidebar.workspaces`), and the settings footer. The column draws the
 * container and nothing inside it.
 */
export function DeepBuddySidebar({ renderSlot }: SidebarOwnerProps & { renderSlot: RenderSlot }): ReactNode {
  const { layout } = useAppDeps()
  // The committed width lives in the store, so a collapse/expand unmount
  // cycle cannot silently reset a dragged width back to the default.
  const sidePx = useLayoutSelection(layout, current => current.state.sidePx)
  return (
    <ColumnFrame
      rootRef={layout.sideRef}
      headerPad={12}
      style={{
        width: sidePx,
        flex: '0 0 auto',
        minWidth: 0,
      }}
      header={(
        <>
          {/* Lights, then the wordmark, then the toggle pushed to the
              column's right edge — where the dock's own close control sits,
              so the two column switches mirror each other across the frame. */}
          <TrafficLights />
          <span style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--db-brandfont)',
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: '.02em',
            color: 'var(--db-text)',
            lineHeight: 1.2,
          }}
          >
            DeepBuddy
          </span>
          <span style={{ ...NO_DRAG, marginLeft: 'auto' }}>
            <KIT.IconButton title="收起侧边栏" onClick={layout.toggleSidebar}>
              <PanelLeft size={16} />
            </KIT.IconButton>
          </span>
        </>
      )}
    >
      {/* The conversation entry is the app's own full-width new-task button —
          it carries the app's new-task action, so it ships with the app, not
          with the shell. The 14px below gives the card breathing room before
          the workspace section. */}
      <nav style={{ display: 'flex', flexDirection: 'column', padding: `0 ${ROW_METRICS.gutter}px 14px` }}>
         <ChatNav />
      </nav>

      {/* The official workspace browser rides the revived `sidebar.workspaces`
          slot (search, view options, add-directory, per-row menus). It owns
          its own scrolling, so the region clips instead of scrolling — the
          official regionArea contract. `expandSidebar` is a no-op: DeepBuddy
          unmounts this column when collapsed, so it can never fire here. */}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: `0 ${ROW_METRICS.gutter}px` }}>
        {renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}
      </div>

      {/* The official foot, in the official order: the `sidebar.footer.action`
          list (the Cordis panel trigger — where plugin-run approvals live)
          directly above the `sidebar.settings` root, which owns the settings
          trigger + overlay dialog. */}
      <div style={{ flex: '0 0 auto', padding: `6px ${ROW_METRICS.gutter}px 10px` }}>
        {renderSlot('sidebar.footer.action', { wide: true })}
        {renderSlot('sidebar.settings', { wide: true })}
      </div>
    </ColumnFrame>
  )
}

// ── the main column ─────────────────────────────────────────────────────────

// ── the inspector column ────────────────────────────────────────────────────

const EMPTY_TABS: readonly { id: string; label: string }[] = []
const EMPTY_DOCK_TABS: readonly DockTab[] = []
const FILES_VIEW_ID = 'explorer'
type CloseDelegates = MutableRefObject<Map<string, (id: string) => void>>

/**
 * One memoized keep-alive view. Files is the one explicit exception to the
 * unified resource ledger: its internal tree/preview row keeps the existing
 * per-view ledger, while all other views project their dock resources here.
 */
const InspectorViewMount = memo(function InspectorViewMount({ view, dockTabs, previewTabs, dockActive, visible, layout, closeDelegates }: {
  view: InspectorViewTypeDefinition
  dockTabs: readonly DockTab[]
  previewTabs: PaneTabs | undefined
  dockActive: string | null
  visible: boolean
  layout: LayoutStore
  closeDelegates: CloseDelegates
}): ReactNode {
  const previews = view.id === FILES_VIEW_ID
  const tabs = previews ? previewTabs?.items ?? EMPTY_TABS : dockTabs
  const active = previews
    ? previewTabs?.active ?? null
    : dockTabs.some(tab => tab.id === dockActive) ? dockActive : null
  const onOpenTab = useCallback((tab: { id: string; label: string }) => {
    if (previews) layout.openTab(view.id, tab)
    else layout.openDockTab(view.id, tab)
  }, [layout, previews, view.id])
  const onLabelTab = useCallback((id: string, label: string) => {
    if (previews) layout.openTab(view.id, { id, label })
    else layout.labelDockTab(id, label)
  }, [layout, previews, view.id])
  const onCloseTab = useCallback((id: string) => {
    if (previews) layout.closeTab(view.id, id)
    else layout.closeDockTab(id)
  }, [layout, previews, view.id])
  const onFocusTab = useCallback((id: string) => {
    if (previews) layout.focusTab(view.id, id)
    else layout.focusDockTab(id)
  }, [layout, previews, view.id])
  const onReorderTab = useCallback((id: string, to: number) => {
    if (previews) layout.moveTab(view.id, id, to)
    else layout.moveDockTab(id, to)
  }, [layout, previews, view.id])
  const onRegisterClose = useCallback((close: ((id: string) => void) | null): void => {
    if (close === null) closeDelegates.current.delete(view.id)
    else closeDelegates.current.set(view.id, close)
  }, [closeDelegates, view.id])
  const Component = view.Component
  return (
    <div
      data-inspector-view={view.id}
      style={{ display: visible ? 'flex' : 'none', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}
    >
      <Component
        viewId={view.id}
        tabs={tabs}
        active={active}
        visible={visible}
        onOpenTab={onOpenTab}
        onLabelTab={onLabelTab}
        onCloseTab={onCloseTab}
        onFocusTab={onFocusTab}
        onReorderTab={onReorderTab}
        onRegisterClose={onRegisterClose}
      />
    </div>
  )
})

/** The zero-resource dock state is a direct launcher, not a dead empty card. */
function DockLauncher({ views, onOpen }: {
  views: readonly InspectorViewTypeDefinition[]
  onOpen(view: InspectorViewTypeDefinition): void
}): ReactNode {
  return (
    <div data-dock-launcher style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(320px, calc(100% - 64px))' }}>
        {views.map(view => (
          <button
            key={view.id}
            type="button"
            className="dbdy-dock-launcher-row"
            onClick={() => { onOpen(view) }}
            style={{
              height: 46,
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '0 16px',
              border: 0,
              borderRadius: 'var(--db-r-card)',
              background: 'var(--db-raised)',
              color: 'var(--db-text-2)',
              fontFamily: 'inherit',
              fontSize: 13.5,
              cursor: 'pointer',
              transition: 'background var(--db-tint), color var(--db-tint)',
            }}
          >
            {view.icon === undefined ? undefined : (
              <span className="dbdy-dock-launcher-icon" style={{ display: 'flex', color: 'var(--db-text-3)' }}>
                <Glyph name={view.icon} size={16} />
              </span>
            )}
            <span>{view.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The inspector (dock) column: one unified resource strip over every mounted
 * view. The launcher and the + menu share one open action; tab bodies remain
 * mounted while another resource is focused or the whole dock is hidden.
 */
function InspectorColumn(): ReactNode {
  const { layout } = useAppDeps()
  const dock = useLayoutSelection(layout, current => current.state.dock)
  const dockMax = useLayoutSelection(layout, current => current.state.dockMax)
  const dockPx = useLayoutSelection(layout, current => current.state.dockPx)
  const dockTabs = useLayoutSelection(layout, current => current.state.dockTabs)
  const dockActive = useLayoutSelection(layout, current => current.state.dockActive)
  const tabsByView = useLayoutSelection(layout, current => current.state.tabs)
  const fence = useLayoutSelection(layout, current => current.state.fence)
  const views = INSPECTOR_VIEW_TYPES
  const closeDelegates = useRef(new Map<string, (id: string) => void>())
  const [launcherOpen, setLauncherOpen] = useState(false)
  // ⌘J and the header toggle close the dock without passing through any of
  // the in-column controls, so an open + menu would otherwise survive the
  // close hidden and greet the next open already expanded.
  useEffect(() => {
    if (!dock) setLauncherOpen(false)
  }, [dock])
  // Stable per-view slices: without the memo every InspectorColumn render
  // (a + click, a dockPx commit) would hand each view a fresh array and
  // defeat InspectorViewMount's memo bail-out.
  const dockTabsByView = useMemo(() => {
    const grouped = new Map<string, DockTab[]>()
    for (const tab of dockTabs) {
      const slice = grouped.get(tab.view)
      if (slice === undefined) grouped.set(tab.view, [tab])
      else slice.push(tab)
    }
    return grouped
  }, [dockTabs])
  const activeDockTab = dockActive === null ? undefined : dockTabs.find(tab => tab.id === dockActive)
  const openDockView = useCallback((view: InspectorViewTypeDefinition): void => {
    const existing = dockTabs.filter(tab => tab.view === view.id)
    // openDockTab is an idempotent open: the files singleton's fixed id is
    // focused, a fresh terminal/browser id is appended and focused.
    layout.openDockTab(view.id, view.createTab(existing))
    setLauncherOpen(false)
  }, [dockTabs, layout])
  const closeDockTab = useCallback((tab: DockTab): void => {
    const delegate = closeDelegates.current.get(tab.view)
    if (delegate === undefined) layout.closeDockTab(tab.id)
    else delegate(tab.id)
  }, [layout])
  return (
    <ColumnFrame
      rootRef={layout.dockRef}
      headerPad={10}
      style={!dock
        // Closed is hidden, never an unmount: the keep-alive rule says view
        // bodies survive dock closes, and unmounting the column here would
        // silently cancel every display:none below it (webview history and
        // xterm attachments died this way once).
        ? { display: 'none' }
        : dockMax
          // Maximized: an overlay over the whole frame. The columns underneath
          // stay mounted and laid out, so restoring loses no scroll or state —
          // and the header regains the lights cluster it now covers. The
          // containing block is the root's PADDING box — its edge is the
          // window edge, not the island grid — so the island gap must be
          // re-added here or the panel paves over the window ground
          // (DESIGN_INTENT: everything floats on the ground, measured 0px vs
          // the grid's 10px when this was inset: 0).
          ? { position: 'absolute', inset: 'var(--db-gap)', zIndex: 8, width: 'auto' }
          // The committed width is rendered state — a drag writes the element
          // directly for the gesture and commits on release, so no style-branch
          // swap can strand the island at content width.
          : { flex: `0 0 ${dockPx}px`, minWidth: 0 }}
      header={(
        <>
          {dockMax && (
            <>
              <TrafficLights />
              <span style={{ width: 2 }} />
            </>
          )}
          <InspectorTabs
            tabs={dockTabs}
            active={dockActive}
            onFocus={layout.focusDockTab}
            onClose={(id) => {
              const tab = dockTabs.find(item => item.id === id)
              if (tab !== undefined) closeDockTab(tab)
            }}
            onReorder={layout.moveDockTab}
            variant="dock"
            style={NO_DRAG}
            iconFor={(tab) => {
              const dockTab = dockTabs.find(item => item.id === tab.id)
              const icon = views.find(view => view.id === dockTab?.view)?.icon
              return icon === undefined ? undefined : <Glyph name={icon} size={13} />
            }}
          />
          <span style={{ flex: '1 1 auto', minWidth: 0 }} />
          <KIT.Popover
            open={launcherOpen}
            onClose={() => { setLauncherOpen(false) }}
            align="right"
            style={{ width: 200, top: 'calc(100% + 12px)', borderRadius: 'var(--db-r-popover)' }}
            anchor={(
              <div style={{ ...NO_DRAG, display: 'flex', gap: 2 }}>
                <KIT.IconButton title="打开面板" active={launcherOpen} onClick={() => { setLauncherOpen(open => !open) }}>
                  <Plus size={14} />
                </KIT.IconButton>
                <KIT.IconButton title={dockMax ? '退出全屏' : '全屏显示'} onClick={() => { setLauncherOpen(false); layout.toggleDockMax() }}>
                  {dockMax ? <Minimize size={14} /> : <Maximize size={14} />}
                </KIT.IconButton>
                {!dockMax && (
                  <KIT.IconButton title="关闭停靠栏" onClick={() => { setLauncherOpen(false); layout.closeDock() }}>
                    <PanelRight size={15} />
                  </KIT.IconButton>
                )}
              </div>
            )}
          >
            <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {views.map(view => (
                <button
                  key={view.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { openDockView(view) }}
                  className="dbdy-hv-1"
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '0 10px',
                    border: 0,
                    borderRadius: 'var(--db-r-control)',
                    background: 'transparent',
                    color: 'var(--db-text-2)',
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {view.icon === undefined ? undefined : <Glyph name={view.icon} size={14} />}
                  <span>{view.title}</span>
                </button>
              ))}
            </div>
          </KIT.Popover>
        </>
      )}
    >
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {dockActive === null
          ? <DockLauncher views={views} onOpen={openDockView} />
          // The fence generation in the key is the keep-alive rule's one
          // exception: view bodies survive tab switches and dock closes, but
          // a session change remounts them, so no per-session reset logic
          // exists inside any view.
          // `dock` is part of visibility: the keep-alive column stays mounted
          // behind display:none, so its feature receives `visible` only when
          // its resource is the unified dock selection.
          : views.map(view => {
              const viewTabs = dockTabsByView.get(view.id) ?? EMPTY_DOCK_TABS
              if (viewTabs.length === 0) return null
              return (
                <InspectorViewMount
                  key={`${view.id}:${fence}`}
                  view={view}
                  dockTabs={viewTabs}
                  previewTabs={tabsByView[view.id]}
                  dockActive={dockActive}
                  visible={dock && activeDockTab?.view === view.id}
                  layout={layout}
                  closeDelegates={closeDelegates}
                />
              )
            })}
      </div>
    </ColumnFrame>
  )
}

// ── the root occupant ───────────────────────────────────────────────────────

/** The root chrome's render share: the official four slots. */
type RootProps = PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>

/**
 * Build the 'root' occupant: the window box, the columns, and the official
 * frame seats. The per-fiber stores ride a provider here so every slot tree
 * below — the sidebar and main columns included — reads the same instances
 * without the shell threading them through props.
 * @param deps - the fiber's stores and wires.
 * @returns the component to register into 'root'.
 */
export function createThreeColumnFrame(deps: AppDeps): (props: RootProps) => ReactNode {
  return function DeepBuddyRoot({ renderSlot }: RootProps): ReactNode {
    const sidebar = useLayoutSelection(deps.layout, current => current.state.sidebar)
    const sidePx = useLayoutSelection(deps.layout, current => current.state.sidePx)
    const dock = useLayoutSelection(deps.layout, current => current.state.dock)
    const dockMax = useLayoutSelection(deps.layout, current => current.state.dockMax)
    const sessionStarted = useLayoutSelection(deps.layout, current => current.state.sessionStarted)
    const sessionBound = useLayoutSelection(deps.layout, current => current.state.sessionBound)
    const detailsOpen = useLayoutSelection(deps.layout, current => current.detailsOpen)
    return (
      <AppDepsProvider value={deps}>
        <div
          className={sidebar ? 'dbdy' : 'dbdy dbdy-noside'}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            // The window ground: the deepest layer, and the only separator
            // between the three islands — the padding is the frame's margin
            // and the seams are the same 10px of it showing through
            // (DESIGN_INTENT §10). The ground is also a window drag surface
            // (自由拖动): the frame ring and the island seams move the window,
            // the islands themselves opt out (PANEL) and their top bars opt
            // back in, and the resize handles opt out in tokens.ts so a seam
            // press still resizes.
            WebkitAppRegion: 'drag',
            padding: 'var(--db-gap)',
            background: 'var(--db-window)',
            color: 'var(--db-text)',
            fontFamily: 'var(--db-font)',
            fontSize: 13.5,
            userSelect: 'none',
          } as CSSProperties}
        >
          {EDGE_STRIPS.map((strip, i) => <div key={i} aria-hidden style={strip} />)}
          {/* Deliberately NOT a positioned box: the full-frame dock must
              resolve against the root (whose padding-box edge is the window
              edge, with the island gap re-added via inset), not against this
              wrapper's content area. */}
          <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex' }}>
          {sidebar && (
            <>
              {/* DeepBuddy unmounts the column instead of keeping the official
                  compact rail, so `collapsed` is false wherever this runs.
                  'sidebar' is a reserved surface — the owner share exists for
                  contract fidelity, not for a third party to read; it still
                  must state the REAL width, which is committed drag state,
                  not the 268px default. */}
              {renderSlot('sidebar', { collapsed: false, width: sidePx } satisfies SidebarOwnerProps)}
              <Handle onDown={deps.layout.startSideDrag} onReset={deps.layout.resetSideWidth} title="拖拽调整侧栏宽度 · 双击重置" />
            </>
          )}
          {/* The main (`conversation`) region grows to fill the frame, mirroring
              the official AppFrame's `minmax(0, 1fr)` center column. The
              official ConversationRoot is `flex: 0 1 auto`, so without this
              growing column-flex wrapper (and its `overflow: hidden`) the
              conversation would size to its content max-width and leave the
              rest of the frame black (wave8-fix D1). */}
          <div style={{ position: 'relative', flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', ...PANEL }}>
            {/* The main column's window-drag strip: the official
                ConversationRoot declares no app-region, so without this the
                window can only be moved by the 268px sidebar bar. It sits
                behind the content (negative z, no pointer events) — Electron
                collects app-region rects independent of paint order, and the
                interactive elements above it opt out via the global no-drag
                rule in tokens.ts. */}
            <div
              aria-hidden
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: METRICS.topbar, zIndex: -1, pointerEvents: 'none', WebkitAppRegion: 'drag' } as CSSProperties}
            />
            {/* Collapsing the sidebar unmounts its column — with the lights
                (or their Electron reservation) and the toggle inside it. Both
                regroup here at the main column's top-left, the SAME lockup at
                the SAME 52px centerline the sidebar header drew, so the
                control never moves vertically; the dbdy-noside class indents
                the official header title clear of them (tokens.ts). */}
            {!sidebar && (
              <div style={{ position: 'absolute', top: (METRICS.topbar - 28) / 2, left: 12, zIndex: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                <TrafficLights />
                <KIT.IconButton title="展开侧边栏" onClick={deps.layout.toggleSidebar}>
                  <PanelLeft size={16} />
                </KIT.IconButton>
              </div>
            )}
            {renderSlot('conversation', {})}
          </div>
          {/* Mounted for the whole started session, hidden while closed: a
              dock close must not unmount the column, or the keep-alive rule
              below it (webview documents, xterm attachments) dies with the
              mount. Only the session fence/end may tear this down. */}
          {sessionStarted && (
            <>
              {/* No seam while the dock is closed or overlays the frame. */}
              {dock && !dockMax && <Handle onDown={deps.layout.startDockDrag} onReset={deps.layout.resetDockWidth} title="拖拽调整停靠栏宽度 · 双击重置" />}
              <InspectorColumn />
            </>
          )}
          {/* Official semantics: closed is width 0, never an unmount — an
              occupant keeps its state across open/close. */}
          <div
            style={{
              flex: `0 0 ${detailsOpen ? DETAILS_WIDTH : 0}px`,
              minWidth: 0,
              overflow: 'hidden',
              borderLeft: detailsOpen ? '1px solid var(--db-line)' : 'none',
              WebkitAppRegion: 'no-drag',
            } as CSSProperties}
          >
            {sessionBound ? renderSlot('details', {}) : null}
          </div>
          </div>
          {/* Frame-wide floating layer: click-through, entries opt back in. */}
          <div className="dbdy-overlay">{renderSlot('shell.overlay', {})}</div>
        </div>
      </AppDepsProvider>
    )
  }
}
