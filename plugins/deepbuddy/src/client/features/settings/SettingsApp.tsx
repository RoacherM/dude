/**
 * The settings dialog: a centered overlay modal, not a workbench page (wave 4
 * §5). Opening it never changes the main column — the current session stays
 * behind it. The rail is the page switcher (模式 / 插件 today, more pages
 * later); which page is open is settings-local UI state. Esc closes through
 * the shared Dialog (DESIGN_INTENT §12), and the main column is untouched.
 */
import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useAppDeps } from '../../app/context.tsx'
import { useLayoutStore } from '../../shell/layout-store.ts'
import { KIT } from '../../ui/kit.tsx'
import { METRICS } from '../../ui/tokens.ts'
import { Close } from '../../ui/icons.tsx'
import { ModesPage } from './ModesPage.tsx'
import { ModelsPage } from './ModelsPage.tsx'
import { PluginsPage } from './PluginsPage.tsx'

/** Settings rail groups, in display order; the id prefix selects one. */
export const SETTINGS_GROUPS = [
  { prefix: 'harness', label: 'Harness' },
  { prefix: 'workspace', label: '工作空间' },
] as const
export const SETTINGS_PAGES = [
  { id: 'harness/models', label: '模型', Component: ModelsPage },
  { id: 'harness/modes', label: '模式', Component: ModesPage },
  { id: 'harness/plugins', label: '插件', Component: PluginsPage },
] as const satisfies readonly { id: string; label: string; Component: ComponentType }[]
/** Group one settings page id by its `<group>/<page>` prefix. */
function groupOf(id: string): string {
  const at = id.indexOf('/')
  return at < 0 ? '' : id.slice(0, at)
}

function RailRow({ row, active, onSelect }: {
  row: (typeof SETTINGS_PAGES)[number]
  active: boolean
  onSelect: (id: string) => void
}): ReactNode {
  return (
    <KIT.Row current={active} onClick={() => { onSelect(row.id) }}>
      {row.label}
    </KIT.Row>
  )
}

/**
 * The settings content: rail left, page right. Mounts fresh each time the
 * dialog opens, so it always starts on the first page.
 */
export function SettingsApp(): ReactNode {
  const [page, setPage] = useState<string>(SETTINGS_PAGES[0]?.id ?? '')
  const active = SETTINGS_PAGES.find(p => p.id === page) ?? SETTINGS_PAGES[0]
  const groups = SETTINGS_GROUPS
    .map(g => ({ ...g, rows: SETTINGS_PAGES.filter(p => groupOf(p.id) === g.prefix) }))
    .filter(g => g.rows.length > 0)
  // A page whose id carries no known prefix still has to be reachable.
  const loose = SETTINGS_PAGES.filter(p => !SETTINGS_GROUPS.some(g => g.prefix === groupOf(p.id)))
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
              {g.rows.map(row => <RailRow key={row.id} row={row} active={row.id === active.id} onSelect={setPage} />)}
            </div>
          ))}
          {loose.map(row => <RailRow key={row.id} row={row} active={row.id === active.id} onSelect={setPage} />)}
        </div>
      </aside>

      <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', userSelect: 'text' }}>
        <div style={{ maxWidth: METRICS.settingsColumn, padding: '28px 32px 48px' }}>
          {active !== undefined && <active.Component />}
        </div>
      </div>
    </div>
  )
}

/**
 * The settings dialog shell: the overlay modal around {@link SettingsApp}.
 * Sized to the WorkBuddy reference — most of the viewport, centered, rounded,
 * with a dimming backdrop that closes on click.
 */
export function SettingsDialog(): ReactNode {
  const { layout } = useAppDeps()
  useLayoutStore(layout)
  return (
    <KIT.Dialog open onClose={layout.closeSettings} style={{ width: 'min(1200px, 90vw)', height: 'min(860px, 90vh)', maxHeight: 'min(860px, 90vh)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', borderBottom: '1px solid var(--db-line)', flex: '0 0 auto' }}>
        <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--db-text)' }}>设置</span>
        <KIT.IconButton title="关闭设置" onClick={layout.closeSettings}>
          <Close size={15} />
        </KIT.IconButton>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <SettingsApp />
      </div>
    </KIT.Dialog>
  )
}
