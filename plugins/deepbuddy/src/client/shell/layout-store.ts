/**
 * The layout store: exactly the facts that decide where things are.
 *
 * Which workbench app the main column shows, whether the sidebar and the
 * inspector (dock) columns are open, which inspector view type is active, the
 * dock's tab ledger, and the top-bar title. Nothing about sessions, files,
 * models or presets lives here — those belong to the features, and the Shell
 * never branches on them (deepbuddy-design-current/DEVELOPMENT_RULES.md §4).
 * The workbench app and view-type ids are strings; the catalogs
 * (app/catalog.ts) resolve them to components.
 *
 * Widths are the one thing deliberately kept OUT of the state object. A drag
 * writes the column's inline width directly and re-reads it from the DOM,
 * because routing sixty pointermove events per second through a store that every
 * column subscribes to would re-render every panel in the window to move one
 * divider. The state object carries booleans and ids; the geometry lives where
 * the browser already keeps it.
 */
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createRef, useCallback, useRef, useSyncExternalStore } from 'react'
import {
  GAP, SIDEBAR_BREAKPOINT, SIDEBAR_DEFAULT,
  canSplitDock, clampDock, clampSidebar, dockDefault,
} from './geometry.ts'
import { dblog } from '../log.ts'

/** One tab of a dock pane, as the shell's strip knows it. */
export interface TabRef {
  id: string
  label: string
}

/** One view type's tab state, as the layout store carries it. */
export interface PaneTabs {
  items: readonly TabRef[]
  active: string | null
}

/** The pointer facts a resize handle passes into the layout owner. */
interface DragStartEvent {
  readonly clientX: number
  readonly pointerId: number
  readonly currentTarget: HTMLElement
  preventDefault(): void
}

/** The read-only layout facts every column renders from. */
export interface LayoutState {
  /** Current workbench app key (catalog WORKBENCH_APPS). */
  view: string
  /** Whether the sidebar column is rendered at all. */
  sidebar: boolean
  /** Whether the inspector column is open. */
  dock: boolean
  /**
   * Whether the open inspector covers the whole frame. An overlay, not a
   * layout change: the columns underneath stay mounted and laid out, so
   * restoring loses no scroll position or view state.
   */
  dockMax: boolean
  /** Active inspector view-type key; null while the dock is closed. */
  pane: string | null
  /**
   * Whether a non-blank (started) session is the conversation's subject.
   * Contributed by the conversation view (the only workbench app) so the shell
   * can hide the dock whose content belongs to a running/historical session.
   * A blank/new-task page shows neither the dock nor its toggle.
   */
  sessionStarted: boolean
  /**
   * Top-bar title contributed by the active workbench app; null falls back to
   * the app entry's title.
   *
   * A title is content, not geometry, so the app contributes it rather than
   * the shell inventing it — the conversation view is the only thing that
   * knows a session is called 「重构缓存层」. Only the ACTIVE app renders, so
   * only the active app can set it, and switching apps clears it.
   */
  title: string | null
  /**
   * Tab state per inspector view type. Each view draws the shared strip from
   * this fact and renders whatever its active tab means.
   */
  tabs: Readonly<Record<string, PaneTabs>>
  /**
   * The session-fence generation. The assembly bumps it (with the ledgers
   * dropped) when the conversation's subject changes; the inspector keys its
   * kept-alive view bodies on it, so every view's local state dies with the
   * session it belonged to. The store never reads session ids — the number is
   * a remount token, not a session fact.
   */
  fence: number
}

const NO_TABS: PaneTabs = { items: [], active: null }

/** The layout store: one per plugin fiber. */
export class LayoutStore {
  state: LayoutState = {
    view: 'chat',
    sidebar: true,
    dock: false,
    dockMax: false,
    pane: null,
    title: null,
    sessionStarted: false,
    tabs: {},
    fence: 0,
  }

  /**
   * The official frame contract's right details column. Kept OFF
   * {@link LayoutState}: the frame renders its width, but nothing in the
   * distribution opens it (the former `ctx.layout.openDetails` consumer is
   * disabled), so it stays closed.
   */
  detailsOpen = false

  /**
   * The outward `ctx.layout` face (ILayout) that the enabled ui-conversation
   * row injects. DeepBuddy owns the layout store, so the stub forwards the
   * three panel verbs to it. `openDetails`/`closeDetails` are the only
   * panel-transition verbs the official row calls; the details column width
   * itself is a DeepBuddy file/media column, not the official `details` slot,
   * so the verbs stay off {@link LayoutState} (the frame renders its width).
   */
  layoutFace(): ILayout {
    return {
      toggleSidebar: () => { this.toggleSidebar() },
      openDetails: () => { this.detailsOpen = true; this.bump() },
      closeDetails: () => { this.detailsOpen = false; this.bump() },
    }
  }

  readonly sideRef = createRef<HTMLElement>()
  readonly dockRef = createRef<HTMLElement>()

  /** uSES projection subscribers from the independent slot trees. */
  private readonly listeners = new Set<() => void>()

  /** A hand-closed dock stays closed when the window grows back. */
  private userClosedDock = false

  // ── store plumbing ────────────────────────────────────────────────────────

  private patch(next: Partial<LayoutState>): void {
    this.state = { ...this.state, ...next }
    this.bump()
  }

  /** Notify without replacing state — for the chrome-only facts above. */
  private bump(): void {
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKeyDown)
    this.onResize()
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  /**
   * Collapse ordering under a shrinking window: the dock goes first, the
   * sidebar second. A dock the user closed by hand stays closed when the
   * window grows back — the automatic reopen is for the automatic close only.
   *
   * Only the SPLIT shape answers to this. A full-frame dock is an overlay: it
   * spends none of the column budget, so nothing about a narrowing window
   * makes it not fit, and closing it would be the shell overriding a choice
   * the user can undo themselves with the control right there in its bar.
   */
  private onResize = (): void => {
    const vw = window.innerWidth
    if (this.state.dock && !this.state.dockMax && !canSplitDock(vw, this.sideWidth())) {
      this.patch({ dock: false })
    }
    if (vw < SIDEBAR_BREAKPOINT && this.state.sidebar) this.patch({ sidebar: false })
    this.clampDockWidth()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey)) return
    // ⌘J toggles the dock. The handoff's other shortcuts (⌘K, ⌘N, ⌘T, ⌘,)
    // belong to surfaces the store does not own — settings is now the
    // official slot's own trigger. Esc is handled by the floating layers
    // themselves (DESIGN_INTENT §12: Popover first, then Dialog) — the shell
    // never swallows it.
    if (e.key === 'j') {
      e.preventDefault()
      this.toggleDock()
    }
  }

  // ── measurements ──────────────────────────────────────────────────────────

  /**
   * Rendered sidebar width including its seam; 0 while collapsed. The seam is
   * the full gap now: the handle fills it edge to edge instead of straddling
   * a 1px rule.
   */
  private sideWidth(): number {
    const el = this.sideRef.current
    if (!this.state.sidebar || el === null) return 0
    const dragged = Number.parseFloat(el.style.width)
    return (Number.isFinite(dragged) ? dragged : SIDEBAR_DEFAULT) + GAP
  }

  /** Hold the dock inside its range after the window changed size. */
  private clampDockWidth(): void {
    const el = this.dockRef.current
    if (el === null || !this.state.dock || this.state.dockMax) return
    const now = el.getBoundingClientRect().width
    const next = clampDock(now, window.innerWidth, this.sideWidth())
    if (Math.abs(next - now) > 0.5) this.writeDockWidth(el, next)
  }

  private writeDockWidth(el: HTMLElement, w: number): void {
    const width = `${w}px`
    const flex = `0 0 ${width}`
    if (el.style.width === width && el.style.flex === flex) return
    el.style.flex = flex
    el.style.width = width
  }

  /**
   * Keep loaded guest pages at one viewport size while their dock moves.
   * Electron webviews and fallback iframes can relayout/repaint an entire page
   * for every width tick; clipping a fixed viewport makes the divider cheap,
   * then restoring the inline styles performs exactly one final resize.
   */
  private freezeDockEmbeds(el: HTMLElement): () => void {
    const embeds = [...el.querySelectorAll<HTMLElement>('webview, iframe')]
    if (embeds.length === 0) return () => {}
    const overflow = el.style.overflow
    const frozen = embeds
      .map((embed) => ({
        embed,
        width: embed.style.width,
        minWidth: embed.style.minWidth,
        maxWidth: embed.style.maxWidth,
        pointerEvents: embed.style.pointerEvents,
        measuredWidth: embed.getBoundingClientRect().width,
      }))
      .filter(item => Number.isFinite(item.measuredWidth) && item.measuredWidth > 0)
    if (frozen.length === 0) return () => {}
    el.style.overflow = 'hidden'
    for (const item of frozen) {
      const width = `${item.measuredWidth}px`
      item.embed.style.width = width
      item.embed.style.minWidth = width
      item.embed.style.maxWidth = width
      item.embed.style.pointerEvents = 'none'
    }
    let thawed = false
    return () => {
      if (thawed) return
      thawed = true
      el.style.overflow = overflow
      for (const item of frozen) {
        item.embed.style.width = item.width
        item.embed.style.minWidth = item.minWidth
        item.embed.style.maxWidth = item.maxWidth
        item.embed.style.pointerEvents = item.pointerEvents
      }
    }
  }

  // ── verbs ─────────────────────────────────────────────────────────────────

  /** Switch the main column to another workbench app. */
  setView = (view: string): void => {
    // The title belongs to the app that set it; the next app contributes its
    // own (or falls back to its catalog title). The started-session fact also
    // belongs to the conversation view, so clearing it here keeps the dock
    // rule from leaking across apps.
    if (this.state.view === view && !this.state.sessionStarted && this.state.title === null) return
    this.patch({ view, sessionStarted: false, title: null })
  }

  /** Contribute the main top bar's title. Call it from an effect, never from
   *  a render body — it writes store state, and a write during render is the
   *  classic re-entrant loop. */
  setTitle = (title: string | null): void => {
    if (this.state.title === title) return
    this.patch({ title })
  }

  toggleSidebar = (): void => {
    this.patch({ sidebar: !this.state.sidebar })
  }

  /**
   * Open the dock on `pane` — always. A window too narrow for the split gets
   * the dock as a full-frame overlay instead of a toggle that does nothing:
   * the intent is satisfied, the conversation column is never squeezed under
   * its reserve, and there is no dead switch on screen (DESIGN_INTENT §2
   * rule 5).
   */
  openDock = (pane: string): void => {
    this.userClosedDock = false
    if (this.state.dock && this.state.pane === pane) return
    // An open dock switching view types is a pane change, not an opening: the
    // shape it is already in (split or maximized) is the user's, and picking
    // Terminal must not drop the dock out of full frame.
    if (this.state.dock) {
      this.patch({ pane })
      return
    }
    const overlay = !canSplitDock(window.innerWidth, this.sideWidth())
    if (overlay) dblog('layout', 'dock opened as overlay — split does not fit', { vw: window.innerWidth, side: this.sideWidth() })
    this.patch({ dock: true, pane, dockMax: overlay })
    // The element mounts on this same synchronous commit, so its opening width
    // is set on the next frame rather than read back as zero here.
    requestAnimationFrame(() => {
      const el = this.dockRef.current
      if (el !== null && el.style.width === '') {
        this.writeDockWidth(el, dockDefault(window.innerWidth, this.sideWidth()))
      }
    })
  }

  closeDock = (): void => {
    this.userClosedDock = true
    this.patch({ dock: false, dockMax: false })
  }

  /**
   * Grow the open dock to cover the frame, or shrink it back — except that
   * leaving full frame on a window that cannot host the split closes the dock
   * instead. That window is exactly why it opened full-frame; restoring it to
   * a column would squeeze the conversation under its reserve, and the button
   * would have to refuse the click it just accepted.
   */
  toggleDockMax = (): void => {
    if (!this.state.dock) return
    if (this.state.dockMax && !canSplitDock(window.innerWidth, this.sideWidth())) {
      dblog('layout', 'overlay exit closed the dock — split still does not fit', { vw: window.innerWidth, side: this.sideWidth() })
      this.patch({ dock: false, dockMax: false })
      return
    }
    this.patch({ dockMax: !this.state.dockMax })
  }

  /** The main bar's own dock button; `fallback` is the first registered view. */
  toggleDock = (fallback?: string): void => {
    if (this.state.dock) {
      this.closeDock()
      return
    }
    const pane = this.state.pane ?? fallback
    if (pane !== undefined) this.openDock(pane)
  }


  /**
   * Contribute whether the conversation's subject is a started (non-blank)
   * session. The dock only renders for a started session, so the conversation
   * view is the sole owner of this fact; the shell just reads it.
   */
  setSessionStarted = (started: boolean): void => {
    if (this.state.sessionStarted === started) return
    this.patch({ sessionStarted: started })
  }

  // ── inspector tabs ────────────────────────────────────────────────────────

  private tabsOf(pane: string): PaneTabs {
    return this.state.tabs[pane] ?? NO_TABS
  }

  private writeTabs(pane: string, next: PaneTabs): void {
    this.patch({ tabs: { ...this.state.tabs, [pane]: next } })
  }

  /** Open and focus a new tab, or update an existing tab's presentation. */
  openTab = (pane: string, tab: TabRef): void => {
    const cur = this.tabsOf(pane)
    const at = cur.items.findIndex(item => item.id === tab.id)
    if (at >= 0 && cur.items[at]?.label === tab.label) return
    this.writeTabs(pane, {
      items: at >= 0 ? cur.items.map(item => item.id === tab.id ? tab : item) : [...cur.items, tab],
      active: at >= 0 ? cur.active : tab.id,
    })
  }

  /** Close one tab; focus falls to its neighbour. */
  closeTab = (pane: string, id: string): void => {
    const cur = this.tabsOf(pane)
    const at = cur.items.findIndex(t => t.id === id)
    if (at < 0) return
    const items = cur.items.filter(t => t.id !== id)
    // Focus falls to the neighbour that took the closed tab's place, then
    // to the one before it — the browser-tab rule users already have.
    const next = cur.active === id ? (items[at] ?? items[at - 1] ?? null) : cur.items.find(t => t.id === cur.active) ?? null
    this.writeTabs(pane, { items, active: next === null ? null : next.id })
  }

  /** Focus an existing tab. */
  focusTab = (pane: string, id: string): void => {
    const cur = this.tabsOf(pane)
    if (cur.active === id) return
    if (!cur.items.some(t => t.id === id)) return
    this.writeTabs(pane, { ...cur, active: id })
  }

  /**
   * The session fence: drop every view's ledger and bump the fence generation
   * in one notification. Called by the assembly's session watch, never by a
   * view — a view carries no per-session reset logic of its own.
   */
  fenceTabs = (): void => {
    this.patch({ tabs: {}, fence: this.state.fence + 1 })
  }

  // ── drag handles ──────────────────────────────────────────────────────────

  private trackDrag(handle: HTMLElement, pointerId: number, move: (e: PointerEvent) => void, done?: () => void): void {
    // Trackpads can emit faster than the display refreshes. Keep only the
    // latest pointer position and perform at most one layout write per frame.
    let queued: PointerEvent | null = null
    let frame: number | null = null
    let finished = false
    const flush = (): void => {
      frame = null
      const next = queued
      queued = null
      if (next !== null) move(next)
    }
    const onMove = (e: PointerEvent): void => {
      if (finished || e.pointerId !== pointerId) return
      queued = e
      if (frame === null) frame = window.requestAnimationFrame(flush)
    }
    const finish = (): void => {
      if (finished) return
      finished = true
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
      flush()
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onCancel)
      handle.removeEventListener('lostpointercapture', onLostPointerCapture)
      window.removeEventListener('blur', finish)
      document.body.style.cursor = ''
      handle.classList.remove('dragging')
      done?.()
    }
    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return
      queued = e
      finish()
    }
    const onCancel = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish()
    }
    const onLostPointerCapture = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish()
    }
    document.body.style.cursor = 'col-resize'
    // The seam's rule stays lit for the whole gesture, including after the
    // pointer has left the 10px handle (tokens.ts `.dbdy-handle.dragging`).
    handle.classList.add('dragging')
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onCancel)
    handle.addEventListener('lostpointercapture', onLostPointerCapture)
    window.addEventListener('blur', finish)
    try {
      handle.setPointerCapture(pointerId)
    }
    catch (error) {
      finish()
      throw error
    }
  }

  startSideDrag = (e: DragStartEvent): void => {
    e.preventDefault()
    const el = this.sideRef.current
    if (el === null) return
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    this.trackDrag(e.currentTarget, e.pointerId, (ev) => {
      el.style.width = `${clampSidebar(startW + (ev.clientX - startX))}px`
    }, () => { this.clampDockWidth() })
  }

  resetSideWidth = (): void => {
    const el = this.sideRef.current
    if (el !== null) el.style.width = `${SIDEBAR_DEFAULT}px`
  }

  startDockDrag = (e: DragStartEvent): void => {
    e.preventDefault()
    const el = this.dockRef.current
    if (el === null) return
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    const thawEmbeds = this.freezeDockEmbeds(el)
    this.trackDrag(e.currentTarget, e.pointerId, (ev) => {
      this.writeDockWidth(el, clampDock(startW + (startX - ev.clientX), window.innerWidth, this.sideWidth()))
    }, thawEmbeds)
  }

  resetDockWidth = (): void => {
    const el = this.dockRef.current
    if (el !== null) this.writeDockWidth(el, dockDefault(window.innerWidth, this.sideWidth()))
  }

}

// ── render-side helpers ─────────────────────────────────────────────────────

/**
 * Subscribe to one layout projection. Notifications whose selected value is
 * `Object.is`-equal do not re-render this tree, so tab metadata cannot repaint
 * the conversation frame or sidebar.
 */
export function useLayoutSelection<T>(store: LayoutStore, select: (store: LayoutStore) => T): T {
  const selectRef = useRef(select)
  selectRef.current = select
  const getSnapshot = useCallback(() => selectRef.current(store), [store])
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
