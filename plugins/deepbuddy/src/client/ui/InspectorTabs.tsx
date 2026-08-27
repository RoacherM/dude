/** Shared tab row for the dock strip and file-preview views. State stays in layout-store. */
import { useState } from 'react'
import type { CSSProperties, DragEvent, ReactNode } from 'react'
import type { TabRef } from '../shell/layout-store.ts'
import { KIT } from './kit.tsx'
import { Close, Plus } from './icons.tsx'

export interface InspectorTabsProps {
  tabs: readonly TabRef[]
  active: string | null
  onFocus(id: string): void
  onClose(id: string): void
  onAdd?: () => void
  /** Move a tab to a new index — enables drag-to-reorder when provided. */
  onReorder?: (id: string, to: number) => void
  /** The dock chrome is a compact 28px strip; preview tabs retain their 38px row. */
  variant?: 'resource' | 'dock'
  /** A catalog-resolved glyph for a compact dock resource tab. */
  iconFor?: (tab: TabRef) => ReactNode
  style?: CSSProperties
}

/** One tab visual shared by the dock resource strip and Files' preview ledger. */
export function InspectorTabs({ tabs, active, onFocus, onClose, onAdd, onReorder, variant = 'resource', iconFor, style }: InspectorTabsProps): ReactNode {
  const dock = variant === 'dock'
  // The tab id under drag, or null. Reordering is LIVE (Sortable-style): the
  // ledger permutes as the pointer crosses a neighbour's midpoint, so the row
  // itself is the drop preview and drop/dragend only clear the drag state.
  const [dragId, setDragId] = useState<string | null>(null)
  const dragOverTab = (event: DragEvent, overId: string): void => {
    if (onReorder === undefined || dragId === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragId === overId) return
    const from = tabs.findIndex(tab => tab.id === dragId)
    const over = tabs.findIndex(tab => tab.id === overId)
    if (from < 0 || over < 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientX < rect.left + rect.width / 2
    // Where the dragged tab lands once lifted out: crossing the hovered tab's
    // midpoint claims its slot, which the removal shift collapses back to the
    // hovered index itself on a left-to-right move.
    const to = before ? (from < over ? over - 1 : over) : (from < over ? over : over + 1)
    if (to !== from) onReorder(dragId, to)
  }
  return (
    <div
      data-inspector-tabs
      data-dock-tabs={dock ? '' : undefined}
      className={dock ? 'dbdy-dock-tabs' : undefined}
      style={{
      height: dock ? 28 : 38,
      flex: dock ? '0 1 auto' : '0 0 38px',
      display: 'flex',
      alignItems: dock ? 'center' : 'stretch',
      gap: 2,
      minWidth: 0,
      padding: dock ? 0 : '0 8px',
      borderBottom: dock ? 0 : '1px solid var(--db-line)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      ...style,
    }}
    >
      {tabs.map(tab => (
        <div
          key={tab.id}
          draggable={onReorder !== undefined}
          onDragStart={(event) => {
            if (onReorder === undefined) return
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', tab.id)
            setDragId(tab.id)
          }}
          onDragOver={(event) => { dragOverTab(event, tab.id) }}
          onDrop={(event) => { event.preventDefault(); setDragId(null) }}
          onDragEnd={() => { setDragId(null) }}
          onClick={() => { onFocus(tab.id) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onFocus(tab.id)
            }
          }}
          role="tab"
          aria-selected={tab.id === active}
          tabIndex={0}
          className={tab.id === active ? undefined : dock ? 'dbdy-dock-tab' : 'dbdy-hv-1'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: dock ? 5 : 6,
            flex: dock ? '0 1 156px' : '0 1 180px',
            minWidth: dock ? 56 : 74,
            maxWidth: dock ? 156 : undefined,
            height: dock ? 28 : undefined,
            margin: dock ? 0 : '5px 0',
            padding: dock ? '0 4px 0 7px' : '0 6px 0 10px',
            borderRadius: 'var(--db-r-control)',
            background: tab.id === active ? dock ? 'var(--db-fill-3)' : 'var(--db-fill-4)' : 'transparent',
            cursor: 'pointer',
            transition: 'background var(--db-tint)',
            opacity: tab.id === dragId ? 0.45 : undefined,
          }}
        >
          {iconFor !== undefined && (
            <span style={{ flex: '0 0 auto', display: 'flex', color: tab.id === active ? 'var(--db-text-2)' : 'var(--db-text-4)' }}>
              {iconFor(tab)}
            </span>
          )}
          <span style={{
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: dock ? 12 : 12.5,
            color: tab.id === active ? 'var(--db-text)' : 'var(--db-text-3)',
          }}
          >
            {tab.label}
          </span>
          {/* Stop BOTH activation channels at the boundary: the tab container's
              keydown handler calls preventDefault, which would cancel the close
              button's Enter/Space default activation and turn × into focus. */}
          <span
            onClick={(event) => { event.stopPropagation() }}
            onKeyDown={(event) => { event.stopPropagation() }}
          >
            <KIT.IconButton
              title="关闭标签"
              size={26}
              style={{ width: dock ? 15 : 16, height: dock ? 15 : 16, flex: `0 0 ${dock ? 15 : 16}px`, borderRadius: 5 }}
              onClick={() => { onClose(tab.id) }}
            >
              <Close size={dock ? 10 : 11} />
            </KIT.IconButton>
          </span>
        </div>
      ))}
      {!dock && onAdd !== undefined && (
        <div style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', margin: '5px 0' }}>
          <KIT.IconButton title="新建标签" size={28} onClick={onAdd}>
            <Plus size={13} />
          </KIT.IconButton>
        </div>
      )}
    </div>
  )
}
