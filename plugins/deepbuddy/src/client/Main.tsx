/**
 * The main column container: a 52px top bar and, below it, whichever
 * `dbdy.main.view` the layout state selects.
 *
 * A view owns everything under the bar — its own scrolling, its own composer
 * if it has one (chat does; a board does not). The kernel keeps the bar
 * because the bar carries window controls, the column seam and the dock
 * toggle: chrome, not content. The one piece of content in it is the title,
 * which the active view contributes through `layout.setTitle`.
 *
 * This registers into the OFFICIAL 'conversation' slot: the frame contract
 * DeepBuddy inherited from the disabled ui-layout row names the center column
 * that, and re-declaring it faithfully is what keeps the official occupants
 * (and their services) alive underneath (deepbuddy-design-current/ARCHITECTURE.md §4).
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { LayoutController, SeatEntry, SlotReader } from './frame.ts'
import { pickEntry, useFrame, useSeatEntries } from './frame.ts'
import { SETTINGS_GROUPS } from './seats.ts'
import { KIT } from './kit.tsx'
import { NO_DRAG, TopBar, TrafficLights } from './Chrome.tsx'
import { Close, PanelLeft, PanelRight } from './icons.tsx'
import { METRICS } from './styles.ts'

type MainProps = PropsRenderSlots<'dbdy.main.view' | 'dbdy.settings.page'>

/**
 * Build the 'conversation' occupant.
 * @param frame - the plugin-scope layout controller.
 * @param slots - the slot reader the view and dock lookups go through.
 * @returns the component to register into 'conversation'.
 */
export function createMain(frame: LayoutController, slots: SlotReader): (props: MainProps) => ReactNode {
  return function DeepBuddyMain({ renderSlot }: MainProps): ReactNode {
    useFrame(frame)
    const s = frame.state
    const views = useSeatEntries(slots, 'dbdy.main.view')
    const pages = useSeatEntries(slots, 'dbdy.settings.page')
    const panes = useSeatEntries(slots, 'dbdy.dock.pane')
    const active = pickEntry(views, s.view)
    const settings = s.settings === null ? undefined : pickEntry(pages, s.settings)
    const firstPane = panes[0]
    return (
      <main style={{
        flex: '1 1 auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--db-window)',
      }}
      >
        <TopBar pad={14}>
          {!s.sidebar && (
            <div style={{ ...NO_DRAG, display: 'flex', alignItems: 'center', gap: 10, paddingRight: 4 }}>
              <TrafficLights />
              <KIT.IconButton title="展开侧栏" onClick={frame.toggleSidebar}>
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
            {s.settings === null ? s.title ?? active?.label ?? '' : '设置'}
          </span>
          <span style={{ marginLeft: 'auto' }} />
          {s.settings !== null && (
            <div style={NO_DRAG}>
              <KIT.IconButton title="关闭设置" onClick={frame.closeSettings}>
                <Close size={15} />
              </KIT.IconButton>
            </div>
          )}
          {firstPane !== undefined && !s.dock && (
            <div style={NO_DRAG}>
              <KIT.IconButton
                title="打开停靠栏"
                onClick={() => { frame.toggleDock(firstPane.id) }}
              >
                <PanelRight size={16} />
              </KIT.IconButton>
            </div>
          )}
        </TopBar>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {s.settings === null
            ? renderSlot('dbdy.main.view', {}, {
                ...active === undefined ? {} : { only: active.id },
                fallback: (
                  <div style={{ padding: 32 }}>
                    <KIT.EmptyState>没有装配任何主视图。</KIT.EmptyState>
                  </div>
                ),
              })
            : <Settings frame={frame} pages={pages} active={settings} renderSlot={renderSlot} />}
        </div>
      </main>
    )
  }
}

/** Group one settings page id by its `<group>/<page>` prefix. */
function groupOf(id: string): string {
  const at = id.indexOf('/')
  return at < 0 ? '' : id.slice(0, at)
}

/** The settings page body rendered inside the workbench column. */
function Settings({ frame, pages, active, renderSlot }: {
  frame: LayoutController
  pages: readonly SeatEntry[]
  active: SeatEntry | undefined
  renderSlot: MainProps['renderSlot']
}): ReactNode {
  const groups = SETTINGS_GROUPS
    .map(g => ({ ...g, rows: pages.filter(p => groupOf(p.id) === g.prefix) }))
    .filter(g => g.rows.length > 0)
  // A page whose id carries no known prefix still has to be reachable.
  const loose = pages.filter(p => !SETTINGS_GROUPS.some(g => g.prefix === groupOf(p.id)))
  return (
    <div className="dbdy-fade" style={{ flex: '1 1 auto', minHeight: 0, minWidth: 0, display: 'flex' }}>
      <aside style={{
        flex: `0 0 ${METRICS.sidebar}px`,
        width: METRICS.sidebar,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--db-rail)',
        borderRight: '1px solid var(--db-line)',
      }}
      >
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

      <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', userSelect: 'text' }}>
        <div style={{ maxWidth: METRICS.settingsColumn, padding: '28px 32px 48px' }}>
          {renderSlot('dbdy.settings.page', {}, {
            ...active === undefined ? {} : { only: active.id },
            fallback: <KIT.EmptyState>没有装配任何设置页。</KIT.EmptyState>,
          })}
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
