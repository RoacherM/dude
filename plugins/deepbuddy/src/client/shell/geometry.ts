/**
 * Pure layout arithmetic for the two drag handles and the responsive collapse
 * ordering — extracted so the clamps are testable without a DOM.
 *
 * The frame is three islands floating on the window ground, so the horizontal
 * budget loses `2 × GAP` to the window padding plus one `GAP` per seam. Two
 * rules follow from DESIGN_INTENT §2 and hold everywhere below:
 *
 * 1. **Ratios are measured against the WINDOW**, not against what is left
 *    after the sidebar — 30% of the window reads as 30% of the window no
 *    matter which columns are open.
 * 2. **The gap budget only enters the subtraction**, i.e. the "can the
 *    conversation column still keep its 460px" side of the upper bound.
 */

import { METRICS } from '../ui/tokens.ts'

/** Sidebar default width; it collapses to 0, never to an icon rail. */
export const SIDEBAR_DEFAULT = METRICS.sidebar

/** Sidebar drag range: a 232px floor (a session row's title plus its
 *  timestamp stays readable) up to a quarter of the WINDOW — the rail may
 *  scale with the screen but never grows into a second content column. */
export const SIDEBAR_MIN = 232
export const SIDEBAR_MAX_RATIO = 1 / 4

/** The island gap: window padding on each side, and one per column seam. */
export const GAP = METRICS.gap

/** The dock OPENS at 30% of the window; the drag range below is wider. */
export const DOCK_DEFAULT_RATIO = 0.30
/** The dock never takes more than half of the window (DESIGN_INTENT §2). */
export const DOCK_MAX_RATIO = 1 / 2

/** Dock floor in pixels — also the drag's lower bound: below this the
 *  panel's own top bar stops fitting its resource strip plus the trailing
 *  controls. A fixed floor, not a window ratio, so a wide screen does not
 *  inflate how narrow the user may drag the panel. */
export const DOCK_MIN = 416

/** Conversation column reservation held back during a dock drag. */
export const CHAT_RESERVE = 460

/** Below these window widths the dock leaves the split, then the sidebar
 *  collapses. */
export const DOCK_BREAKPOINT = 1100
export const SIDEBAR_BREAKPOINT = 860

/**
 * The ONE shared drag invariant: the widest a side column may grow while the
 * conversation column keeps its 460px. Window, minus its own padding, minus
 * the OTHER column with its seam, minus this column's own seam, minus the
 * reserve. Both clamps below take their upper bound from here and add only
 * their own taste range — which is what keeps a drag on one handle from ever
 * writing a debt some other column must repay on release.
 * @param vw - window inner width.
 * @param other - the other side column's rendered width including its seam
 * (0 when collapsed or overlaying).
 * @returns the ceiling for this column's drag.
 */
function dragCeiling(vw: number, other: number): number {
  return vw - 2 * GAP - other - GAP - CHAT_RESERVE
}

/**
 * Clamp a sidebar drag candidate — the mirror of {@link clampDock}: its own
 * taste range (232px floor, quarter-of-the-window cap), further capped by
 * the shared ceiling so the drag stops where the conversation column would
 * start paying. Where the caps and the 232px floor disagree — a narrow
 * window — the floor wins, same as the dock's rule.
 * @param w - candidate width in px.
 * @param vw - window inner width.
 * @param dock - rendered dock width including its seam (0 when closed or
 * full-frame).
 * @returns the width to apply.
 */
export function clampSidebar(w: number, vw: number, dock: number): number {
  const max = Math.max(SIDEBAR_MIN, Math.min(vw * SIDEBAR_MAX_RATIO, dragCeiling(vw, dock)))
  return Math.min(Math.max(w, SIDEBAR_MIN), max)
}

/**
 * The dock's opening width: 30% of the window, held inside the drag range.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns the width to open the dock at.
 */
export function dockDefault(vw: number, side: number): number {
  return clampDock(Math.round(vw * DOCK_DEFAULT_RATIO), vw, side)
}

/**
 * Clamp a dock drag candidate.
 *
 * The upper bound is the stricter of half of the window and what the
 * conversation column can survive; the lower bound is the panel's own 416px
 * floor, so a very narrow window never lets the range collapse below a
 * usable panel.
 * @param w - candidate width in px.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns the width to apply.
 */
export function clampDock(w: number, vw: number, side: number): number {
  const max = Math.max(DOCK_MIN, Math.min(vw * DOCK_MAX_RATIO, dragCeiling(vw, side)))
  return Math.min(Math.max(w, DOCK_MIN), max)
}

/**
 * Whether this window can host the dock BESIDE the conversation column.
 *
 * No longer a veto on opening: a dock that does not fit the split opens as a
 * full-frame overlay instead (see {@link canSplitDock}), so the answer here
 * only decides which of the two shapes the dock takes.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns whether the split shape holds both minimums.
 */
export function dockFits(vw: number, side: number): boolean {
  return dragCeiling(vw, side) >= DOCK_MIN
}

/**
 * Whether the dock should open as a column rather than as an overlay.
 *
 * Two conditions, and they are different questions: the breakpoint is the
 * design's judgement that a window under 1100px belongs to one column at a
 * time, and {@link dockFits} is the arithmetic. Failing either means the
 * dock still opens — the intent is always satisfied — just full-frame
 * (DESIGN_INTENT §2 rule 5).
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns whether to use the split shape.
 */
export function canSplitDock(vw: number, side: number): boolean {
  return vw >= DOCK_BREAKPOINT && dockFits(vw, side)
}
