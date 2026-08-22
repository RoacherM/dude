/**
 * The layout kernel's rendered surfaces: the window box, the two drag handles,
 * the dock column, and the full-window settings shell.
 *
 * Everything here draws frame — grounds, columns, top bars, seams — and
 * dispatches into a `dbdy.*` seat for the content. There is no business data
 * in this file on purpose: if the kernel ever needs to know what a session is,
 * a boundary has been drawn in the wrong place.
 *
 * The official frame contract (sidebar / conversation / details / shell.overlay)
 * is rendered here too, because the root registration re-declares it in the
 * disabled ui-layout row's place (design/LAW.md COMPAT-1).
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LayoutController, SeatEntry, SlotReader } from './frame.ts'
import { pickEntry, useFrame, useSeatEntries } from './frame.ts'
import { SETTINGS_GROUPS } from './seats.ts'
import { KIT } from './kit.tsx'
import { METRICS } from './styles.ts'
import { ArrowLeft, Close, Collapse, Expand, Explorer, Globe, PanelRight, Terminal } from './icons.tsx'

/** Details column width when `ctx.layout` opens it (ui-layout's DETAILS_DEFAULT). */
const DETAILS_WIDTH = 480

/** Inside the Electron shell the native inset controls draw the lights. */
const IN_ELECTRON = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

/**
 * macOS traffic lights: a reservation under Electron's `hiddenInset` native
 * controls, simulated circles in a browser so the layout reads the same in
 * both.
 * @returns the lights row.
 */
export function TrafficLights(): ReactNode {
  if (IN_ELECTRON) return <span style={{ width: 52, height: 12, flex: '0 0 52px', display: 'block' }} />
  return (
    <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', display: 'block' }} />
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', display: 'block' }} />
    </div>
  )
}

/**
 * A column's 52px top bar. Every column draws its own, and every one of them
 * is a window drag surface — controls inside opt out.
 */
export function TopBar({ pad = 14, children, style }: { pad?: number; children: ReactNode; style?: CSSProperties }): ReactNode {
  return (
    <div
      style={{
        height: METRICS.topbar,
        flex: `0 0 ${METRICS.topbar}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: `0 ${pad}px`,
        borderBottom: '1px solid var(--db-line)',
        minWidth: 0,
        WebkitAppRegion: 'drag',
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}

/** Controls inside a top bar must opt out of the window drag region. */
export const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** The 1px seam between two columns, doubling as a drag handle. */
function Handle({ onDown, onReset, title }: {
  onDown: (e: React.MouseEvent) => void
  onReset: () => void
  title: string
}): ReactNode {
  return (
    <div
      onMouseDown={onDown}
      onDoubleClick={onReset}
      title={title}
      style={{
        flex: '0 0 1px',
        width: 1,
        cursor: 'col-resize',
        background: 'var(--db-line)',
        // The seam stays 1px; the grab area is the padding drawn around it.
        boxShadow: '0 0 0 3px transparent',
        zIndex: 5,
      }}
    />
  )
}

// ── the dock ────────────────────────────────────────────────────────────────

/** Glyph per known dock pane; an unknown pane gets no icon, only its label. */
const PANE_ICON: Record<string, (p: { size?: number }) => ReactNode> = {
  explorer: Explorer,
  browser: Globe,
  terminal: Terminal,
}

/**
 * The dock column: a segmented control over every registered pane, the shared
 * tab strip, and the active pane's body.
 *
 * Tabs live here rather than in the panes because the handoff draws the same
 * 38px strip inside Explorer, Browser and Terminal alike — three panes each
 * re-implementing one would be three chances to disagree about a row the
 * kernel already owns (seats.ts {@link DockTabs}).
 */
function Dock({ frame, slots, renderSlot }: {
  frame: LayoutController
  slots: SlotReader
  renderSlot: PropsRenderSlots<'dbdy.dock.pane'>['renderSlot']
}): ReactNode {
  const s = frame.state
  const panes = useSeatEntries(slots, 'dbdy.dock.pane')
  const active = pickEntry(panes, s.pane)
  const tabs = active === undefined ? undefined : s.tabs[active.id]
  return (
    <section
      ref={frame.dockRef as React.RefObject<HTMLElement>}
      style={{
        flex: '0 0 auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--db-window)',
      }}
    >
      <TopBar pad={10}>
        {s.maximized && (
          <div style={{ ...NO_DRAG, display: 'flex', alignItems: 'center', paddingRight: 6 }}>
            <TrafficLights />
          </div>
        )}
        {/* A segmented control with one segment is a label wearing a choice's
            clothes. Below two panes the dock states which pane it is. */}
        {panes.length > 1
          ? (
              <div style={NO_DRAG}>
                <KIT.Tabs
                  form="segment"
                  value={active?.id ?? ''}
                  tabs={panes.map(p => ({
                    id: p.id,
                    label: p.label ?? p.id,
                    icon: PANE_ICON[p.id]?.({ size: 14 }),
                  }))}
                  onChange={(id) => { frame.openDock(id) }}
                />
              </div>
            )
          : active !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 4, fontSize: 13, color: 'var(--db-text-2)' }}>
              {PANE_ICON[active.id]?.({ size: 14 })}
              {active.label ?? active.id}
            </span>
          )}
        <span style={{ marginLeft: 'auto' }} />
        <div style={{ ...NO_DRAG, display: 'flex', gap: 2 }}>
          <KIT.IconButton
            title={s.maximized ? '还原停靠栏' : '最大化停靠栏'}
            onClick={frame.toggleMax}
          >
            {s.maximized ? <Collapse size={15} /> : <Expand size={15} />}
          </KIT.IconButton>
          <KIT.IconButton title="关闭停靠栏" onClick={frame.closeDock}>
            <PanelRight size={15} />
          </KIT.IconButton>
        </div>
      </TopBar>

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
              onClick={() => { frame.dockPaneFace.tabs.focus(active.id, tab.id) }}
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
                onClick={() => { frame.dockPaneFace.tabs.close(active.id, tab.id) }}
              >
                <Close size={11} />
              </KIT.IconButton>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderSlot('dbdy.dock.pane', {}, {
          ...active === undefined ? {} : { only: active.id },
          fallback: (
            <div style={{ padding: 20 }}>
              <KIT.EmptyState>没有装配任何停靠面板。</KIT.EmptyState>
            </div>
          ),
        })}
      </div>
    </section>
  )
}

// ── settings ────────────────────────────────────────────────────────────────

/** Group one settings page id by its `<group>/<page>` prefix. */
function groupOf(id: string): string {
  const at = id.indexOf('/')
  return at < 0 ? '' : id.slice(0, at)
}

/**
 * The settings shell: a full-window surface over the app, 268px rail plus an
 * 820px content column.
 *
 * Full-window rather than a dialog because settings is a place, not a
 * confirmation — the handoff reserves the centered modal for destructive
 * confirmations, and a settings dialog would be the one modal users keep open.
 */
function Settings({ frame, slots, renderSlot }: {
  frame: LayoutController
  slots: SlotReader
  renderSlot: PropsRenderSlots<'dbdy.settings.page'>['renderSlot']
}): ReactNode {
  const pages = useSeatEntries(slots, 'dbdy.settings.page')
  const active = pickEntry(pages, frame.state.settings)
  const groups = SETTINGS_GROUPS
    .map(g => ({ ...g, rows: pages.filter(p => groupOf(p.id) === g.prefix) }))
    .filter(g => g.rows.length > 0)
  // A page whose id carries no known prefix still has to be reachable.
  const loose = pages.filter(p => !SETTINGS_GROUPS.some(g => g.prefix === groupOf(p.id)))
  return (
    <div
      className="dbdy-fade"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        display: 'flex',
        background: 'var(--db-window)',
      }}
    >
      <aside style={{
        flex: `0 0 ${METRICS.sidebar}px`,
        width: METRICS.sidebar,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--db-rail)',
        borderRight: '1px solid var(--db-line)',
      }}
      >
        <TopBar pad={12}>
          <div style={{ ...NO_DRAG, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrafficLights />
            <KIT.IconButton title="返回" onClick={frame.closeSettings}>
              <ArrowLeft size={16} />
            </KIT.IconButton>
          </div>
          <span style={{ fontSize: 13.5, color: 'var(--db-text)' }}>设置</span>
        </TopBar>
        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '10px 10px 16px' }}>
          {groups.map(g => (
            <div key={g.prefix} style={{ paddingBottom: 10 }}>
              <KIT.GroupLabel>{g.label}</KIT.GroupLabel>
              {g.rows.map(row => <RailRow key={row.id} frame={frame} row={row} active={row.id === active?.id} />)}
            </div>
          ))}
          {loose.map(row => <RailRow key={row.id} frame={frame} row={row} active={row.id === active?.id} />)}
        </div>
      </aside>

      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar pad={16}>
          <span style={{ fontSize: 13.5, color: 'var(--db-text)' }}>{active?.label ?? ''}</span>
          <span style={{ marginLeft: 'auto' }} />
          <div style={NO_DRAG}>
            <KIT.IconButton title="关闭设置" onClick={frame.closeSettings}>
              <Close size={15} />
            </KIT.IconButton>
          </div>
        </TopBar>
        <div style={{ flex: '1 1 auto', overflowY: 'auto', userSelect: 'text' }}>
          <div style={{ maxWidth: METRICS.settingsColumn, padding: '28px 32px 48px' }}>
            {renderSlot('dbdy.settings.page', {}, {
              ...active === undefined ? {} : { only: active.id },
              fallback: <KIT.EmptyState>没有装配任何设置页。</KIT.EmptyState>,
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function RailRow({ frame, row, active }: { frame: LayoutController; row: SeatEntry; active: boolean }): ReactNode {
  return (
    <KIT.Row current={active} onClick={() => { frame.openSettings(row.id) }}>
      {row.label ?? row.id}
    </KIT.Row>
  )
}

// ── the root occupant ───────────────────────────────────────────────────────

/** The root chrome's render share: the official four plus our two root seats. */
type ChromeProps = PropsRenderSlots<
  'sidebar' | 'conversation' | 'details' | 'shell.overlay' | 'dbdy.dock.pane' | 'dbdy.settings.page'
>

/**
 * Build the 'root' occupant: the window box, the columns, and the seats.
 * @param frame - the plugin-scope layout controller.
 * @param slots - the slot reader the dock and settings enumerate through.
 * @returns the component to register into 'root'.
 */
export function createChrome(frame: LayoutController, slots: SlotReader): (props: ChromeProps) => ReactNode {
  return function DeepBuddyChrome({ renderSlot }: ChromeProps): ReactNode {
    useFrame(frame)
    const s = frame.state
    // A maximized dock takes the window: the other columns unmount rather than
    // being squeezed, and the dock grows its own traffic-light strip.
    const framed = !(s.dock && s.maximized)
    return (
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
        {framed && s.sidebar && (
          <>
            {/* DeepBuddy unmounts the column instead of keeping the official
                compact rail, so `collapsed` is false wherever this runs.
                'sidebar' is a reserved surface — the owner share exists for
                contract fidelity, not for a third party to read. */}
            {renderSlot('sidebar', { collapsed: false, width: METRICS.sidebar } satisfies SidebarOwnerProps)}
            <Handle onDown={frame.startSideDrag} onReset={frame.resetSideWidth} title="拖拽调整侧栏宽度 · 双击重置" />
          </>
        )}
        {framed && renderSlot('conversation', {})}
        {s.dock && (
          <>
            {!s.maximized && (
              <Handle onDown={frame.startDockDrag} onReset={frame.resetDockWidth} title="拖拽调整停靠栏宽度 · 双击重置" />
            )}
            <Dock frame={frame} slots={slots} renderSlot={renderSlot} />
          </>
        )}
        {/* Official semantics: closed is width 0, never an unmount — an
            occupant keeps its state across open/close. */}
        <div
          style={{
            flex: `0 0 ${frame.detailsOpen ? DETAILS_WIDTH : 0}px`,
            minWidth: 0,
            overflow: 'hidden',
            borderLeft: frame.detailsOpen ? '1px solid var(--db-line)' : 'none',
          }}
        >
          {renderSlot('details', {})}
        </div>
        {/* Frame-wide floating layer: click-through, entries opt back in. */}
        <div className="dbdy-overlay">{renderSlot('shell.overlay', {})}</div>
        {s.settings !== null && <Settings frame={frame} slots={slots} renderSlot={renderSlot} />}
      </div>
    )
  }
}
