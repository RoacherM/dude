/**
 * The sidebar container: a 268px rail on the darkest ground, holding the
 * window controls, the brand row, the navigation seat and the section seat.
 *
 * The kernel draws the container and nothing inside it. Navigation rows are
 * registered BY the view plugins they open (`dbdy.sidebar.nav`), so installing
 * a view installs its entry point and removing it removes both — the sidebar
 * never carries a list of destinations that might not exist. Everything below
 * the nav is `dbdy.sidebar.section`, placed by `order`.
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { LayoutController, SlotReader } from './frame.ts'
import { useFrame, useSeatEntries } from './frame.ts'
import { KIT, ROW_METRICS } from './kit.tsx'
import { METRICS } from './styles.ts'
import { NO_DRAG, TopBar, TrafficLights } from './Chrome.tsx'
import { Gear, PanelLeft } from './icons.tsx'

type SidebarProps = PropsRenderSlots<'dbdy.sidebar.nav' | 'dbdy.sidebar.section'>

/**
 * Build the 'sidebar' occupant.
 * @param frame - the plugin-scope layout controller.
 * @param slots - the slot reader the nav enumerates through.
 * @returns the component to register into 'sidebar'.
 */
export function createSidebar(frame: LayoutController, slots: SlotReader): (props: SidebarProps) => ReactNode {
  return function DeepBuddySidebar({ renderSlot }: SidebarProps): ReactNode {
    useFrame(frame)
    const nav = useSeatEntries(slots, 'dbdy.sidebar.nav')
    return (
      <aside
        ref={frame.sideRef as React.RefObject<HTMLElement>}
        style={{
          width: METRICS.sidebar,
          flex: '0 0 auto',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--db-rail)',
        }}
      >
        <TopBar pad={12}>
          <TrafficLights />
          <span style={{ marginLeft: 'auto' }} />
          <div style={NO_DRAG}>
            <KIT.IconButton title="折叠侧栏" onClick={frame.toggleSidebar}>
              <PanelLeft size={16} />
            </KIT.IconButton>
          </div>
        </TopBar>

        {/* 14.5/600, left edge flush with the row text below it (gutter 8 +
            row pad 8), so the brand and the nav share one optical margin. */}
        <div style={{ padding: `2px ${ROW_METRICS.gutter + ROW_METRICS.pad}px 14px` }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--db-text)' }}>DeepBuddy</span>
        </div>

        {/* One renderSlot call per entry: the owner share carries `current`,
            which differs per row, and a list dispatch hands ONE owner object
            to every entry. `only` is exactly the escape from that. */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: ROW_METRICS.gap, padding: `0 ${ROW_METRICS.gutter}px` }}>
          {nav.map(row => (
            <div key={row.id}>
              {renderSlot('dbdy.sidebar.nav', { current: row.id === frame.state.view }, { only: row.id })}
            </div>
          ))}
        </nav>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: `0 ${ROW_METRICS.gutter}px 12px` }}>
          {renderSlot('dbdy.sidebar.section', {})}
        </div>

        {/* The footer carries no hairline: separation here is the rail's own
            ground against the row below it, and a rule would be the fourth
            horizontal line in a 268px column. */}
        <div style={{ flex: '0 0 auto', padding: `6px ${ROW_METRICS.gutter}px 10px` }}>
          <KIT.Row icon={<Gear size={16} />} onClick={() => { frame.openSettings('') }}>设置</KIT.Row>
        </div>
      </aside>
    )
  }
}
