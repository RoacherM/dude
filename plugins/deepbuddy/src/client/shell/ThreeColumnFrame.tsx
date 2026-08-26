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
import { memo, useCallback } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { RenderSlot } from '../dsh/adapter.ts'
import type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
import { INSPECTOR_VIEW_TYPES, pickEntry } from '../app/catalog.ts'
import type { InspectorViewTypeDefinition } from '../app/catalog.ts'
import type { AppDeps } from '../app/context.tsx'
import { AppDepsProvider, useAppDeps } from '../app/context.tsx'
import { useLayoutSelection } from './layout-store.ts'
import type { LayoutStore, PaneTabs } from './layout-store.ts'
import { ColumnFrame, Handle, IN_ELECTRON, NO_DRAG, PANEL, TrafficLights } from './ColumnFrame.tsx'
import { KIT, ROW_METRICS } from '../ui/kit.tsx'
import { Glyph, Maximize, Minimize, PanelLeft, PanelRight } from '../ui/icons.tsx'
import { METRICS } from '../ui/tokens.ts'
import { ChatNav } from '../features/conversation/index.ts'

/** Details column width when `ctx.layout` opens it (ui-layout's DETAILS_DEFAULT). */
const DETAILS_WIDTH = 480

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
  return (
    <ColumnFrame
      rootRef={layout.sideRef}
      headerPad={12}
      style={{
        width: METRICS.sidebar,
        flex: '0 0 auto',
        minWidth: 0,
      }}
      header={(
        <>
          {/* Lights, then the wordmark and the one red square on screen, then
              the toggle pushed to the column's right edge — where the dock's
              own close control sits, so the two column switches mirror each
              other across the frame. */}
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
          {/* Brand red, used exactly once in the whole window (DESIGN_INTENT
              §10). Nothing else — no selection, no status — may borrow it. */}
          <span
            aria-hidden
            style={{ width: 7, height: 7, flex: '0 0 7px', borderRadius: 2, background: 'var(--db-brand)' }}
          />
          <span style={{ ...NO_DRAG, marginLeft: 'auto' }}>
            <KIT.IconButton title="收起侧边栏" onClick={layout.toggleSidebar}>
              <PanelLeft size={16} />
            </KIT.IconButton>
          </span>
        </>
      )}
    >
      {/* The muted slogan under the brand line — official muted tier
          (label-tertiary), 12px, tight. */}
      <div style={{ padding: `0 ${ROW_METRICS.gutter + ROW_METRICS.pad}px 12px` }}>
        <div style={{ fontSize: 12, color: 'var(--db-text-3)', lineHeight: 1.4 }}>向着未知出发，把每一步都变成脚印。</div>
      </div>

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

/**
 * One memoized keep-alive view. Stable callbacks and tab-slice identity mean
 * a Browser title update cannot re-render Files or every Terminal pane.
 */
const InspectorViewMount = memo(function InspectorViewMount({ view, tabs, visible, layout }: {
  view: InspectorViewTypeDefinition
  tabs: PaneTabs | undefined
  visible: boolean
  layout: LayoutStore
}): ReactNode {
  const onOpenTab = useCallback((tab: { id: string; label: string }) => { layout.openTab(view.id, tab) }, [layout, view.id])
  const onCloseTab = useCallback((id: string) => { layout.closeTab(view.id, id) }, [layout, view.id])
  const onFocusTab = useCallback((id: string) => { layout.focusTab(view.id, id) }, [layout, view.id])
  const Component = view.Component
  return (
    <div
      data-inspector-view={view.id}
      style={{ display: visible ? 'flex' : 'none', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}
    >
      <Component
        viewId={view.id}
        tabs={tabs?.items ?? EMPTY_TABS}
        active={tabs?.active ?? null}
        visible={visible}
        onOpenTab={onOpenTab}
        onCloseTab={onCloseTab}
        onFocusTab={onFocusTab}
      />
    </div>
  )
})

/**
 * The inspector (dock) column: a segmented control over every registered view
 * type and every view's mounted body. A segment change only changes display;
 * browser documents and terminal attachments therefore stay alive.
 */
function InspectorColumn(): ReactNode {
  const { layout } = useAppDeps()
  const dockMax = useLayoutSelection(layout, current => current.state.dockMax)
  const pane = useLayoutSelection(layout, current => current.state.pane)
  const tabsByView = useLayoutSelection(layout, current => current.state.tabs)
  const fence = useLayoutSelection(layout, current => current.state.fence)
  const views = INSPECTOR_VIEW_TYPES
  const active = pickEntry(views, pane)
  return (
    <ColumnFrame
      rootRef={layout.dockRef}
      headerPad={10}
      style={dockMax
        // Maximized: an overlay over the whole frame. The columns underneath
        // stay mounted and laid out, so restoring loses no scroll or state —
        // and the header regains the lights cluster it now covers. It insets
        // by the gap rather than to zero, so the full-frame panel is still an
        // island floating on the window ground and not a lid over it.
        ? { position: 'absolute', inset: 'var(--db-gap)', zIndex: 8, width: 'auto' }
        : { flex: '0 0 auto', minWidth: 0 }}
      header={(
        <>
          {dockMax && (
            <>
              <TrafficLights />
              <span style={{ width: 2 }} />
            </>
          )}
          {/* A segmented control with one segment is a label wearing a choice's
              clothes. Below two view types the dock states which one it is. */}
          {views.length > 1
            ? (
                <div style={NO_DRAG}>
                  <KIT.Tabs
                    form="segment"
                    value={active?.id ?? ''}
                    tabs={views.map(v => ({
                      id: v.id,
                      label: v.title,
                      icon: v.icon === undefined ? undefined : <Glyph name={v.icon} size={14} />,
                    }))}
                    onChange={(id) => { layout.openDock(id) }}
                  />
                </div>
              )
            : active !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 4, fontSize: 13, color: 'var(--db-text-2)' }}>
                {active.icon === undefined ? undefined : <Glyph name={active.icon} size={14} />}
                {active.title}
              </span>
          )}
          <span style={{ marginLeft: 'auto' }} />
          <div style={{ ...NO_DRAG, display: 'flex', gap: 2 }}>
            <KIT.IconButton title={dockMax ? '退出全屏' : '全屏显示'} onClick={layout.toggleDockMax}>
              {dockMax ? <Minimize size={14} /> : <Maximize size={14} />}
            </KIT.IconButton>
            {!dockMax && (
              <KIT.IconButton title="关闭停靠栏" onClick={layout.closeDock}>
                <PanelRight size={15} />
              </KIT.IconButton>
            )}
          </div>
        </>
      )}
    >
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {active === undefined
          ? (
              <div style={{ padding: 20 }}>
                <KIT.EmptyState>没有装配任何停靠面板。</KIT.EmptyState>
              </div>
            )
          // The fence generation in the key is the keep-alive rule's one
          // exception: view bodies survive tab switches and dock closes, but
          // a session change remounts them, so no per-session reset logic
          // exists inside any view.
          : views.map(view => (
              <InspectorViewMount
                key={`${view.id}:${fence}`}
                view={view}
                tabs={tabsByView[view.id]}
                visible={view.id === active.id}
                layout={layout}
              />
            ))}
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
    const dock = useLayoutSelection(deps.layout, current => current.state.dock)
    const dockMax = useLayoutSelection(deps.layout, current => current.state.dockMax)
    const sessionStarted = useLayoutSelection(deps.layout, current => current.state.sessionStarted)
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
            // (DESIGN_INTENT §10).
            padding: 'var(--db-gap)',
            background: 'var(--db-window)',
            color: 'var(--db-text)',
            fontFamily: 'var(--db-font)',
            fontSize: 13.5,
            userSelect: 'none',
          }}
        >
          {/* Deliberately NOT a positioned box: the full-frame dock insets
              itself by the gap against the root's padding box, which is what
              lands it exactly on the island grid instead of a second gap in
              from it. */}
          <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex' }}>
          {sidebar && (
            <>
              {/* DeepBuddy unmounts the column instead of keeping the official
                  compact rail, so `collapsed` is false wherever this runs.
                  'sidebar' is a reserved surface — the owner share exists for
                  contract fidelity, not for a third party to read. */}
              {renderSlot('sidebar', { collapsed: false, width: METRICS.sidebar } satisfies SidebarOwnerProps)}
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
          {dock && sessionStarted && (
            <>
              {/* No seam to drag while the dock overlays the frame. */}
              {!dockMax && <Handle onDown={deps.layout.startDockDrag} onReset={deps.layout.resetDockWidth} title="拖拽调整停靠栏宽度 · 双击重置" />}
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
            }}
          >
            {renderSlot('details', {})}
          </div>
          </div>
          {/* Frame-wide floating layer: click-through, entries opt back in. */}
          <div className="dbdy-overlay">{renderSlot('shell.overlay', {})}</div>
        </div>
      </AppDepsProvider>
    )
  }
}
