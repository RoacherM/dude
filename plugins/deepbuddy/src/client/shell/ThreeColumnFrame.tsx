/**
 * The three-column frame: the root occupant, the sidebar column, the main
 * (workbench) column and the inspector column.
 *
 * The shell owns the window box, the column geometry, the two drag handles,
 * the official slot contract rendering and the window-level overlay — and
 * nothing about sessions, files or presets. Business content arrives through
 * the static catalogs (app/catalog.ts): the sidebar composes the conversation
 * entry plus every SIDEBAR_SECTIONS row, the main column dispatches
 * WORKBENCH_APPS by the layout store's selection, and the inspector draws
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
import type { ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { RenderSlot } from '../dsh/adapter.ts'
import type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
import { INSPECTOR_VIEW_TYPES, SIDEBAR_SECTIONS, WORKBENCH_APPS, pickEntry } from '../app/catalog.ts'
import type { AppDeps } from '../app/context.tsx'
import { AppDepsProvider, useAppDeps } from '../app/context.tsx'
import { useLayoutStore } from './layout-store.ts'
import { ColumnFrame, Handle, NO_DRAG, TrafficLights } from './ColumnFrame.tsx'
import { KIT, ROW_METRICS } from '../ui/kit.tsx'
import { Close, Gear, Glyph, PanelLeft, PanelRight } from '../ui/icons.tsx'
import { METRICS } from '../ui/tokens.ts'
import { ChatNav, ConversationAppDefinition } from '../features/conversation/index.ts'

/** Details column width when `ctx.layout` opens it (ui-layout's DETAILS_DEFAULT). */
const DETAILS_WIDTH = 480

// ── the sidebar column ──────────────────────────────────────────────────────

/**
 * The sidebar occupant: a 268px rail on the darkest ground. The status bar
 * carries the window controls and the left-column toggle; below it the
 * conversation's own entry row, every SIDEBAR_SECTIONS section, and the
 * settings footer. The column draws the container and nothing inside it —
 * each row and section is a feature component from the catalogs.
 */
export function DeepBuddySidebar({ renderSlot }: SidebarOwnerProps & { renderSlot: RenderSlot }): ReactNode {
  const { layout } = useAppDeps()
  useLayoutStore(layout)
  return (
    <ColumnFrame
      rootRef={layout.sideRef}
      headerPad={12}
      style={{
        width: METRICS.sidebar,
        flex: '0 0 auto',
        minWidth: 0,
        background: 'var(--db-rail)',
      }}
      header={(
        <>
          <TrafficLights />
          <span style={{ marginLeft: 'auto' }} />
          <div style={NO_DRAG}>
            <KIT.IconButton title="折叠侧栏" onClick={layout.toggleSidebar}>
              <PanelLeft size={16} />
            </KIT.IconButton>
          </div>
        </>
      )}
    >
      {/* 14.5/600, left edge flush with the row text below it (gutter 8 +
          row pad 8), so the brand and the nav share one optical margin. */}
      <div style={{ padding: `2px ${ROW_METRICS.gutter + ROW_METRICS.pad}px 14px` }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--db-text)' }}>DeepBuddy</span>
      </div>

      {/* The conversation entry is the app's own full-width new-task button —
          it carries the app's new-task action, so it ships with the app, not
          with the shell. The 14px below gives the card breathing room before
          the workspace section. */}
      <nav style={{ display: 'flex', flexDirection: 'column', padding: `0 ${ROW_METRICS.gutter}px 14px` }}>
         <ChatNav current={layout.state.view === ConversationAppDefinition.id} />
      </nav>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: `0 ${ROW_METRICS.gutter}px 12px` }}>
        {SIDEBAR_SECTIONS.map(section => <section.Component key={section.id} />)}
      </div>

      {/* The official settings root rides the revived `sidebar.settings`
          slot. It owns the settings trigger + overlay dialog; DeepBuddy no
          longer carries its own settings row or dialog. */}
      <div style={{ flex: '0 0 auto', padding: `6px ${ROW_METRICS.gutter}px 10px` }}>
        {renderSlot('sidebar.settings', { wide: true })}
      </div>
    </ColumnFrame>
  )
}

// ── the main column ─────────────────────────────────────────────────────────

/**
 * The 'conversation' occupant: the workbench column. The status bar carries
 * the window controls (when the sidebar is gone), the current page or session
 * title, and the structural actions; the body is whichever WORKBENCH_APPS
 * entry the layout state selects — or settings, which is a workbench page
 * like any other.
 */
export function DeepBuddyMain({ renderSlot }: { renderSlot: RenderSlot }): ReactNode {
  const { layout } = useAppDeps()
  useLayoutStore(layout)
  const s = layout.state
  const active = pickEntry(WORKBENCH_APPS, s.view)
  const firstView = INSPECTOR_VIEW_TYPES[0]
  return (
    <ColumnFrame
      headerPad={14}
      style={{ flex: '1 1 auto', minWidth: 0, background: 'var(--db-window)' }}
      header={(
        <>
          {!s.sidebar && (
            <div style={{ ...NO_DRAG, display: 'flex', alignItems: 'center', gap: 10, paddingRight: 4 }}>
              <TrafficLights />
              <KIT.IconButton title="展开侧栏" onClick={layout.toggleSidebar}>
                <PanelLeft size={16} />
              </KIT.IconButton>
            </div>
          )}
          <span style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13.5,
            color: 'var(--db-text)',
          }}
          >
            {s.title ?? active?.title ?? ''}
          </span>
          <span style={{ marginLeft: 'auto' }} />
          {/* The dock toggle only appears for a started session — a blank/new
              task page has no session to inspect (wave 4 §4). */}
          {firstView !== undefined && s.sessionStarted && !s.dock && (
            <div style={NO_DRAG}>
              <KIT.IconButton
                title="打开停靠栏"
                onClick={() => { layout.toggleDock(firstView.id) }}
              >
                <PanelRight size={16} />
              </KIT.IconButton>
            </div>
          )}
        </>
      )}
    >
      {active === undefined
        ? (
            <div style={{ padding: 32 }}>
              <KIT.EmptyState>没有装配任何主视图。</KIT.EmptyState>
            </div>
          )
        : <active.Component renderSlot={renderSlot} />}
    </ColumnFrame>
  )
}

// ── the inspector column ────────────────────────────────────────────────────

/**
 * The inspector (dock) column: a segmented control over every registered view
 * type, the shell-owned tab strip, and the active view's body.
 *
 * Tabs live here rather than in the views because the handoff draws the same
 * 38px strip inside Explorer, Browser and Terminal alike — several views each
 * re-implementing one would be several chances to disagree about a row the
 * shell already owns. The shell keeps the ledger in the layout store and
 * hands the active view its slice through props; the view never writes the
 * store itself.
 */
function InspectorColumn(): ReactNode {
  const { layout } = useAppDeps()
  useLayoutStore(layout)
  const s = layout.state
  const views = INSPECTOR_VIEW_TYPES
  const active = pickEntry(views, s.pane)
  const tabs = active === undefined ? undefined : s.tabs[active.id]
  return (
    <ColumnFrame
      rootRef={layout.dockRef}
      headerPad={10}
      style={{ flex: '0 0 auto', minWidth: 0, background: 'var(--db-window)' }}
      header={(
        <>
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
            <KIT.IconButton title="关闭停靠栏" onClick={layout.closeDock}>
              <PanelRight size={15} />
            </KIT.IconButton>
          </div>
        </>
      )}
    >
      {active !== undefined && tabs !== undefined && tabs.items.length > 0 && (
        <div style={{
          height: 38,
          flex: '0 0 38px',
          display: 'flex',
          alignItems: 'stretch',
          gap: 2,
          padding: '0 8px',
          borderBottom: '1px solid var(--db-line)',
          overflowX: 'auto',
        }}
        >
          {tabs.items.map(tab => (
            <div
              key={tab.id}
              onClick={() => { layout.focusTab(active.id, tab.id) }}
              className={tab.id === tabs.active ? undefined : 'dbdy-hv-1'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: '0 1 180px',
                minWidth: 74,
                margin: '5px 0',
                padding: '0 6px 0 10px',
                borderRadius: 'var(--db-r-chip)',
                background: tab.id === tabs.active ? 'var(--db-fill-4)' : 'transparent',
                cursor: 'pointer',
                transition: 'background var(--db-tint)',
              }}
            >
              <span style={{
                flex: '1 1 auto',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12.5,
                color: tab.id === tabs.active ? 'var(--db-text)' : 'var(--db-text-3)',
              }}
              >
                {tab.label}
              </span>
              <KIT.IconButton
                title="关闭标签"
                size={26}
                style={{ width: 20, height: 20, flex: '0 0 20px', borderRadius: 6 }}
                onClick={() => { layout.closeTab(active.id, tab.id) }}
              >
                <Close size={11} />
              </KIT.IconButton>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {active === undefined
          ? (
              <div style={{ padding: 20 }}>
                <KIT.EmptyState>没有装配任何停靠面板。</KIT.EmptyState>
              </div>
            )
          : (
              <active.Component
                viewId={active.id}
                tabs={tabs?.items ?? EMPTY_TABS}
                active={tabs?.active ?? null}
                onOpenTab={(tab) => { layout.openTab(active.id, tab) }}
                onCloseTab={(id) => { layout.closeTab(active.id, id) }}
                onFocusTab={(id) => { layout.focusTab(active.id, id) }}
              />
            )}
      </div>
    </ColumnFrame>
  )
}

/**
 * One stable empty array: a tab slice built per render would hand
 * useSyncExternalStore a fresh snapshot every time.
 */
const EMPTY_TABS: readonly { id: string; label: string }[] = []

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
    useLayoutStore(deps.layout)
    const s = deps.layout.state
    return (
      <AppDepsProvider value={deps}>
        <div
          className="dbdy"
          style={{
            position: 'relative',
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            background: 'var(--db-window)',
            color: 'var(--db-text)',
            fontFamily: 'var(--db-font)',
            fontSize: 13.5,
            userSelect: 'none',
          }}
        >
          {s.sidebar && (
            <>
              {/* DeepBuddy unmounts the column instead of keeping the official
                  compact rail, so `collapsed` is false wherever this runs.
                  'sidebar' is a reserved surface — the owner share exists for
                  contract fidelity, not for a third party to read. */}
              {renderSlot('sidebar', { collapsed: false, width: METRICS.sidebar } satisfies SidebarOwnerProps)}
              <Handle onDown={deps.layout.startSideDrag} onReset={deps.layout.resetSideWidth} title="拖拽调整侧栏宽度 · 双击重置" />
            </>
          )}
          {renderSlot('conversation', {})}
          {s.dock && s.sessionStarted && (
            <>
              <Handle onDown={deps.layout.startDockDrag} onReset={deps.layout.resetDockWidth} title="拖拽调整停靠栏宽度 · 双击重置" />
              <InspectorColumn />
            </>
          )}
          {/* Official semantics: closed is width 0, never an unmount — an
              occupant keeps its state across open/close. */}
          <div
            style={{
              flex: `0 0 ${deps.layout.detailsOpen ? DETAILS_WIDTH : 0}px`,
              minWidth: 0,
              overflow: 'hidden',
              borderLeft: deps.layout.detailsOpen ? '1px solid var(--db-line)' : 'none',
            }}
          >
            {renderSlot('details', {})}
          </div>
          {/* Frame-wide floating layer: click-through, entries opt back in. */}
          <div className="dbdy-overlay">{renderSlot('shell.overlay', {})}</div>
        </div>
      </AppDepsProvider>
    )
  }
}
