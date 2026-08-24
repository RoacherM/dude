/** Shared tab row for inspector resource views. State stays in layout-store. */
import type { ReactNode } from 'react'
import type { TabRef } from '../shell/layout-store.ts'
import { KIT } from './kit.tsx'
import { Close, Plus } from './icons.tsx'

export interface InspectorTabsProps {
  tabs: readonly TabRef[]
  active: string | null
  onFocus(id: string): void
  onClose(id: string): void
  onAdd?: () => void
}

/** The stable 38px row shared by Files, Terminal and Browser. */
export function InspectorTabs({ tabs, active, onFocus, onClose, onAdd }: InspectorTabsProps): ReactNode {
  return (
    <div data-inspector-tabs style={{
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
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => { onFocus(tab.id) }}
          className={tab.id === active ? undefined : 'dbdy-hv-1'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: '0 1 180px',
            minWidth: 74,
            margin: '5px 0',
            padding: '0 6px 0 10px',
            borderRadius: 'var(--db-r-chip)',
            background: tab.id === active ? 'var(--db-fill-4)' : 'transparent',
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
            color: tab.id === active ? 'var(--db-text)' : 'var(--db-text-3)',
          }}
          >
            {tab.label}
          </span>
          <span onClick={(event) => { event.stopPropagation() }}>
            <KIT.IconButton
              title="关闭标签"
              size={26}
              style={{ width: 20, height: 20, flex: '0 0 20px', borderRadius: 6 }}
              onClick={() => { onClose(tab.id) }}
            >
              <Close size={11} />
            </KIT.IconButton>
          </span>
        </div>
      ))}
      {onAdd !== undefined && (
        <div style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', margin: '5px 0' }}>
          <KIT.IconButton title="新建标签" size={28} onClick={onAdd}>
            <Plus size={13} />
          </KIT.IconButton>
        </div>
      )}
    </div>
  )
}
