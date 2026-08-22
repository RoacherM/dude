/**
 * The shared column chrome: every column is the same 52px status bar over a
 * content area, and three hand-rolled copies of that would be three chances to
 * disagree about a row the shell already owns (deepbuddy-design-current/
 * DESIGN_INTENT.md §4/§5). Columns differ only in what the status bar carries
 * and what the content area holds — both arrive as props.
 *
 * The status bar is also the column's window drag region: the shell runs
 * `titleBarStyle: 'hiddenInset'`, so the only thing that moves the window is
 * a declared drag surface. Controls inside a bar opt back out with
 * {@link NO_DRAG}.
 */
import type { CSSProperties, ReactNode, Ref } from 'react'
import { METRICS } from '../ui/tokens.ts'

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
 * A column's 52px status bar. Every column draws the same one — and it is
 * always a window drag surface; controls inside opt out.
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
export function Handle({ onDown, onReset, title }: {
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

/**
 * One column: the shared status bar over the shared content frame. Columns
 * provide their own status-bar content through `header`; `rootRef` lets the
 * layout store's drag machinery reach the column element.
 */
export function ColumnFrame({ header, headerPad = 14, rootRef, style, children }: {
  /** The status bar's content — identity, state and structural actions only. */
  header: ReactNode
  /** Status bar horizontal padding (columns align their bars by it). */
  headerPad?: number
  /** Attach the column element (drag measurements, width writes). */
  rootRef?: Ref<HTMLElement>
  /** Column box style: width, flex, ground. */
  style?: CSSProperties
  /** The content area — business content and local actions. */
  children: ReactNode
}): ReactNode {
  return (
    <div
      ref={rootRef as Ref<HTMLDivElement>}
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}
    >
      <TopBar pad={headerPad}>{header}</TopBar>
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
