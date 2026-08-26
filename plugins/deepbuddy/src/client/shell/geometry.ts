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

/** Sidebar drag range. The handoff fixes one width; the drag keeps the
 *  reading column usable on a narrow window without letting the rail grow
 *  into a second content column. */
export const SIDEBAR_MIN = 232
export const SIDEBAR_MAX = 380

/** The island gap: window padding on each side, and one per column seam. */
export const GAP = METRICS.gap

/** Dock share of the WINDOW: default, and the ends of its drag range. */
export const DOCK_DEFAULT_RATIO = 0.30
export const DOCK_MIN_RATIO = 0.30
/** The dock never takes more than a third of the window (DESIGN_INTENT §2). */
export const DOCK_MAX_RATIO = 1 / 3

/** Dock floor in pixels: below this the panel's own top bar stops fitting
 *  its three segments plus the two trailing controls. Where the third-of-a-
 *  window cap and this floor disagree — a narrow window — the floor wins. */
export const DOCK_MIN = 416

/** Conversation column reservation held back during a dock drag. */
export const CHAT_RESERVE = 460

/** Below these window widths the dock leaves the split, then the sidebar
 *  collapses. */
export const DOCK_BREAKPOINT = 1100
export const SIDEBAR_BREAKPOINT = 860

/**
 * Clamp a sidebar drag candidate.
 * @param w - candidate width in px.
 * @returns width within [232, 380].
 */
export function clampSidebar(w: number): number {
  return Math.min(Math.max(w, SIDEBAR_MIN), SIDEBAR_MAX)
}

/**
 * What the dock has to spend: the window minus its own padding, minus the
 * sidebar with its seam, minus the dock's own seam.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns the horizontal budget the dock and the conversation column share.
 */
function dockBudget(vw: number, side: number): number {
  return vw - 2 * GAP - side - GAP
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
 * The upper bound is the stricter of a third of the window and what the
 * conversation column can survive; the lower bound is the stricter-in-the-
 * other-direction of 30% and the panel's own 416px floor, so a very narrow
 * window never lets the range collapse below a usable panel.
 * @param w - candidate width in px.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its seam (0 when collapsed).
 * @returns the width to apply.
 */
export function clampDock(w: number, vw: number, side: number): number {
  const min = Math.max(vw * DOCK_MIN_RATIO, DOCK_MIN)
  const max = Math.max(min, Math.min(vw * DOCK_MAX_RATIO, dockBudget(vw, side) - CHAT_RESERVE))
  return Math.min(Math.max(w, min), max)
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
  return dockBudget(vw, side) - CHAT_RESERVE >= DOCK_MIN
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
