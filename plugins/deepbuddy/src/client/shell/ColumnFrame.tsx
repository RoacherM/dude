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
export const IN_ELECTRON = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

/**
 * macOS traffic lights: simulated circles in a browser so the layout reads
 * right without the native controls. Inside Electron the native lights sit
 * IN the 52px header row (main.js centers them there), so this renders a
 * same-width spacer instead — whatever follows lands at the same x in both
 * shells, and the native dots never collide with the header content.
 * @returns the lights row, or the reservation spacer under Electron.
 */
export function TrafficLights(): ReactNode {
  if (IN_ELECTRON) return <div style={{ width: 54, flex: '0 0 auto' }} />
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flex: '0 0 auto' }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e', display: 'block' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840', display: 'block' }} />
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

/**
 * The grab target between two islands. It fills the 10px seam exactly — the
 * gap IS the separation, so there is no rule to preserve and no negative
 * margin to preserve it with. Its whole appearance (the seam rule that lights
 * up on hover and through a drag) lives in `.dbdy-handle` in ui/tokens.ts,
 * because hover and the drag class are the two things inline styles cannot
 * express.
 */
export function Handle({ onDown, onReset, title }: {
  onDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onReset: () => void
  title: string
}): ReactNode {
  return (
    <div
      className="dbdy-handle"
      onPointerDown={onDown}
      onDoubleClick={onReset}
      title={title}
    />
  )
}

/**
 * The island: one rounded panel on the window ground, shared by all three
 * columns. Radius, ground and outline are NOT props — the three columns being
 * the same panel is the whole point of the visual (DESIGN_INTENT §10), and a
 * per-column override is how that stops being true.
 */
export const PANEL: CSSProperties = {
  background: 'var(--db-panel)',
  border: '1px solid var(--db-line-panel)',
  borderRadius: 'var(--db-r-panel)',
  overflow: 'hidden',
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
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...PANEL, ...style }}
    >
      <TopBar pad={headerPad}>{header}</TopBar>
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
