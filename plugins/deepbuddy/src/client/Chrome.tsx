/**
 * The layout kernel's rendered surfaces: the window box, the two drag handles,
 * the dock column.
 *
 * Everything here draws frame — grounds, columns, top bars, seams — and
 * dispatches into a `dbdy.*` seat for the content. There is no business data
 * in this file on purpose: if the kernel ever needs to know what a session is,
 * a boundary has been drawn in the wrong place.
 *
 * The official frame contract (sidebar / conversation / details / shell.overlay)
 * is rendered here too, because the root registration re-declares it in the
 * disabled ui-layout row's place (deepbuddy-design-current/ARCHITECTURE.md §4).
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LayoutController, SlotReader } from './frame.ts'
import { pickEntry, useFrame, useSeatEntries } from './frame.ts'
import { KIT } from './kit.tsx'
import { METRICS } from './styles.ts'
import { Close, Explorer, Globe, PanelRight, Terminal } from './icons.tsx'

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

// ── the root occupant ───────────────────────────────────────────────────────

/** The root chrome's render share: the official four plus the dock seat. */
type ChromeProps = PropsRenderSlots<
  'sidebar' | 'conversation' | 'details' | 'shell.overlay' | 'dbdy.dock.pane'
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
        {s.sidebar && (
          <>
            {/* DeepBuddy unmounts the column instead of keeping the official
                compact rail, so `collapsed` is false wherever this runs.
                'sidebar' is a reserved surface — the owner share exists for
                contract fidelity, not for a third party to read. */}
            {renderSlot('sidebar', { collapsed: false, width: METRICS.sidebar } satisfies SidebarOwnerProps)}
            <Handle onDown={frame.startSideDrag} onReset={frame.resetSideWidth} title="拖拽调整侧栏宽度 · 双击重置" />
          </>
        )}
        {renderSlot('conversation', {})}
        {s.dock && (
          <>
            <Handle onDown={frame.startDockDrag} onReset={frame.resetDockWidth} title="拖拽调整停靠栏宽度 · 双击重置" />
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
      </div>
    )
  }
}
