/**
 * The settings app: a workbench page like any other, with its own rail.
 *
 * The rail is the page switcher — two navigations at one level is the thing
 * the handoff's tab rule forbids, so the rail replaces the old two-tab modal.
 * Which page is open is settings-local UI state; the shell only knows whether
 * settings is the main column's surface at all (Esc and the close button
 * belong to the layout store).
 */
import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { KIT } from '../../ui/kit.tsx'
import { METRICS } from '../../ui/tokens.ts'
import { ModesPage } from './ModesPage.tsx'
import { PluginsPage } from './PluginsPage.tsx'

/** Settings rail groups, in display order; the id prefix selects one. */
export const SETTINGS_GROUPS = [
  { prefix: 'harness', label: 'Harness' },
  { prefix: 'workspace', label: '工作空间' },
] as const
/** The settings pages, in rail order — a tuple so the first page is definite. */
export const SETTINGS_PAGES = [
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
 * The settings app body: rail left, page right. Mounts fresh each time
 * settings opens, so it always starts on the first page — matching the
 * shell's old `openSettings('')` resolution.
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
