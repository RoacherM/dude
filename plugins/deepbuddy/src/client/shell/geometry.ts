/**
 * Pure layout arithmetic for the two drag handles and the responsive collapse
 * ordering — extracted so the clamps are testable without a DOM.
 *
 * Numbers come from the Synara handoff
 * (`design/synara/design_handoff_dsh_desktop/README.md` §Screens 1 and 3):
 * sidebar 268px collapsing to zero, dock at 30% of the shell and draggable
 * between 30% and 70%.
 */

import { METRICS } from '../ui/tokens.ts'

/** Sidebar default width; it collapses to 0, never to an icon rail. */
export const SIDEBAR_DEFAULT = METRICS.sidebar

/** Sidebar drag range. The handoff fixes one width; the drag keeps the
 *  reading column usable on a narrow window without letting the rail grow
 *  into a second content column. */
export const SIDEBAR_MIN = 232
export const SIDEBAR_MAX = 380

/** Dock share of the shell: default, and the ends of its drag range. */
export const DOCK_DEFAULT_RATIO = 0.30
export const DOCK_MIN_RATIO = 0.30
export const DOCK_MAX_RATIO = 0.70

/** Dock floor in pixels: below this the panel's own top bar stops fitting
 *  its three segments plus the two trailing controls. */
export const DOCK_MIN = 416

/** Conversation column reservation held back during a dock drag. */
export const CHAT_RESERVE = 460

/** Below these window widths the dock closes, then the sidebar collapses. */
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
 * The dock's opening width: 30% of the shell, held inside the drag range.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its handle (0 when collapsed).
 * @returns the width to open the dock at.
 */
export function dockDefault(vw: number, side: number): number {
  return clampDock(Math.round(vw * DOCK_DEFAULT_RATIO), vw, side)
}

/**
 * Clamp a dock drag candidate.
 *
 * The upper bound is the stricter of the design's 70% and what the
 * conversation column can survive; the lower bound is the stricter-in-the-
 * other-direction of 30% and the panel's own 416px floor, so a very wide
 * window never lets the range collapse below a usable panel.
 * @param w - candidate width in px.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its handle (0 when collapsed).
 * @returns the width to apply.
 */
export function clampDock(w: number, vw: number, side: number): number {
  const min = Math.max(vw * DOCK_MIN_RATIO, DOCK_MIN)
  const max = Math.max(min, Math.min(vw * DOCK_MAX_RATIO, vw - side - CHAT_RESERVE))
  return Math.min(Math.max(w, min), max)
}

/**
 * Whether this window can host the dock at all.
 *
 * Asked before opening rather than after: a dock that opens and immediately
 * clamps to a width the panel cannot draw is worse than a refused toggle.
 * @param vw - window inner width.
 * @param side - rendered sidebar width including its handle (0 when collapsed).
 * @returns whether to allow the dock open.
 */
export function dockFits(vw: number, side: number): boolean {
  return vw - side - CHAT_RESERVE >= DOCK_MIN
}
