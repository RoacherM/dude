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
 * (and their services) alive underneath (design/LAW.md COMPAT-1).
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { LayoutController, SlotReader } from './frame.ts'
import { pickEntry, useFrame, useSeatEntries } from './frame.ts'
import { KIT } from './kit.tsx'
import { NO_DRAG, TopBar, TrafficLights } from './Chrome.tsx'
import { PanelLeft, PanelRight } from './icons.tsx'

type MainProps = PropsRenderSlots<'dbdy.main.view'>

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
    const panes = useSeatEntries(slots, 'dbdy.dock.pane')
    const active = pickEntry(views, s.view)
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
            {s.title ?? active?.label ?? ''}
          </span>
          <span style={{ marginLeft: 'auto' }} />
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
          {renderSlot('dbdy.main.view', {}, {
            ...active === undefined ? {} : { only: active.id },
            fallback: (
              <div style={{ padding: 32 }}>
                <KIT.EmptyState>没有装配任何主视图。</KIT.EmptyState>
              </div>
            ),
          })}
        </div>
      </main>
    )
  }
}
