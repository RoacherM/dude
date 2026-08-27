/**
 * The layout store: exactly the facts that decide where things are.
 *
 * Which workbench app the main column shows, whether the sidebar and the
 * inspector (dock) columns are open, the dock's unified resource ledger, and
 * the top-bar title. Nothing about sessions, files,
 * models or presets lives here — those belong to the features, and the Shell
 * never branches on them (deepbuddy-design-current/DEVELOPMENT_RULES.md §4).
 * The workbench app and view-type ids are strings; the catalogs
 * (app/catalog.ts) resolve them to components.
 *
 * Column widths are state with a drag-time fast path. The COMMITTED width
 * (`sidePx`/`dockPx`) lives in the state object and is what React renders —
 * so a remount or a style-branch swap can never lose it (the dock once
 * degraded to content-width exactly this way). During a drag the gesture
 * writes the element's inline width directly and commits ONCE on release,
 * because routing sixty pointermove events per second through a store that
 * every column subscribes to would re-render every panel to move one divider.
 */
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createRef, useSyncExternalStore } from 'react'
import {
  GAP, SIDEBAR_BREAKPOINT, SIDEBAR_DEFAULT,
  canSplitDock, clampDock, clampSidebar, dockDefault,
} from './geometry.ts'
import { dblog } from '../log.ts'
/** One strip tab of the dock's unified resource ledger: an opened file
 *  singleton, terminal instance or browser page. Terminal and browser tabs
 *  live here (the strip is their only tab row); a file's preview tabs stay
 *  in its own per-view ledger below. */
export interface DockTab {
  id: string
  /** The inspector view type this tab belongs to. */
  view: string
  label: string
}

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
  /**
   * The unified dock tab ledger: every opened resource, in order. A file is
   * a singleton (one tab, keep-alive), a terminal instance and a browser
   * page each get one. `dockActive` is the focused tab id; null shows the
   * dock's launcher empty state.
   */
  dockTabs: readonly DockTab[]
  dockActive: string | null
  /**
   * Whether a non-blank (started) session is the conversation's subject.
   * Contributed by the conversation view (the only workbench app) so the shell
   * can hide the dock whose content belongs to a running/historical session.
   * A blank/new-task page shows neither the dock nor its toggle.
   */
  sessionStarted: boolean
  /**
   * Committed sidebar width in px. React renders it; a drag writes the DOM
   * directly and commits here on release, so the width survives the collapse/
   * expand unmount cycle.
   */
  sidePx: number
  /**
   * Committed dock width in px; 0 until the dock first opens (the opening
   * width is the 30%-of-window default). Same ownership rule as `sidePx` —
   * rendered by React, so the dockMax style-branch swap that once cleared a
   * hand-written inline pin cannot lose it.
   */
  dockPx: number
  /**
   * Per-view preview-tab ledgers. Only Files' internal preview tabs use this
   * now; terminal and browser tabs live in the unified {@link dockTabs}.
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

/**
 * Reorder a tab list: lift `id` out and reinsert it at `to` (clamped).
 * @returns the new array, or null when the move is a no-op (missing id or
 * unchanged position) so callers can skip the patch entirely.
 */
function moveById<T extends { id: string }>(items: readonly T[], id: string, to: number): T[] | null {
  const at = items.findIndex(item => item.id === id)
  if (at < 0) return null
  const clamped = Math.max(0, Math.min(Math.trunc(to), items.length - 1))
  if (clamped === at) return null
  const next = [...items]
  const [tab] = next.splice(at, 1)
  next.splice(clamped, 0, tab as T)
  return next
}

/** The layout store: one per plugin fiber. */
export class LayoutStore {
  state: LayoutState = {
    view: 'chat',
    sidebar: true,
    dock: false,
    dockMax: false,
    dockTabs: [],
    dockActive: null,
    sessionStarted: false,
    sidePx: SIDEBAR_DEFAULT,
    dockPx: 0,
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

  /**
   * True while the split dock is closed by reflow's own space check rather
   * than the user. Not rendered state: it exists so the next reflow that
   * fits can undo the shell's close — a USER close (closeDock, overlay
   * exit) clears it and sticks.
   */
  private dockAutoClosed = false

  /** The sidebar's twin of {@link dockAutoClosed}, set only by onResize's
   *  breakpoint collapse; toggleSidebar (the user) clears it. */
  private sidebarAutoClosed = false

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
   * sidebar second.
   *
   * Only the SPLIT shape answers to this. A full-frame dock is an overlay: it
   * spends none of the column budget, so nothing about a narrowing window
   * makes it not fit, and closing it would be the shell overriding a choice
   * the user can undo themselves with the control right there in its bar.
   */
  private onResize = (): void => {
    const patch: Partial<LayoutState> = {}
    if (window.innerWidth < SIDEBAR_BREAKPOINT && this.state.sidebar) {
      patch.sidebar = false
      this.sidebarAutoClosed = true
    }
    // The shell's own collapse is responsive both ways, for BOTH columns.
    // The sidebar restores first (its patch lands before reflow's dock
    // check), matching the collapse ordering in reverse: dock went first,
    // so the sidebar comes back first and the dock only if it still fits.
    else if (window.innerWidth >= SIDEBAR_BREAKPOINT && !this.state.sidebar && this.sidebarAutoClosed) {
      patch.sidebar = true
      this.sidebarAutoClosed = false
    }
    this.reflow(patch, true)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
    // ⌘J toggles the dock (⇧/⌥ chords like DevTools' ⌥⌘J pass through). The
    // handoff's other shortcuts (⌘K, ⌘N, ⌘T, ⌘,) belong to surfaces the
    // store does not own — settings is now the official slot's own trigger.
    // Esc is handled by the floating layers themselves (DESIGN_INTENT §12:
    // Popover first, then Dialog) — the shell never swallows it.
    if (e.key === 'j') {
      e.preventDefault()
      this.toggleDock()
    }
  }

  // ── geometry ──────────────────────────────────────────────────────────────

  /** The sidebar's spend including its seam; 0 while collapsed. */
  private sideBudget(sidebar = this.state.sidebar, sidePx = this.state.sidePx): number {
    return sidebar ? sidePx + GAP : 0
  }

  /** The dock's spend including its seam; 0 while closed or full-frame —
   *  the mirror of {@link sideBudget}, feeding the sidebar's drag clamp. */
  private dockSpend(): number {
    return this.state.dock && !this.state.dockMax ? this.state.dockPx + GAP : 0
  }

  /**
   * Re-establish the geometry invariants after ANY budget change — window
   * resize, sidebar toggle, or a width drag committing. `extra` is the change
   * being applied; the invariants are computed against it so one patch (one
   * notification) carries both the change and its consequences. Invariants:
   * a split dock that no longer fits closes (the conversation column's 460px
   * reserve holds on every path, not just window resize), and the dock width
   * stays inside its clamp.
   */
  private reflow(extra: Partial<LayoutState> = {}, resize = false): void {
    const vw = window.innerWidth
    const patch: Partial<LayoutState> = { ...extra }
    const side = this.sideBudget(patch.sidebar ?? this.state.sidebar, patch.sidePx ?? this.state.sidePx)
    const dockMax = patch.dockMax ?? this.state.dockMax
    if ((patch.dock ?? this.state.dock) && !dockMax && !canSplitDock(vw, side)) {
      patch.dock = false
      // The SHELL closed this, not the user — remember that, so growing the
      // window back undoes it (responsive rule 3: only user closes stick).
      this.dockAutoClosed = true
    }
    // Reopen ONLY on a window resize. Any other reflow that frees space —
    // collapsing the sidebar, narrowing it — is the user rearranging columns,
    // and having the dock eat the space they just freed inverts their intent.
    else if (resize && !(patch.dock ?? this.state.dock) && this.dockAutoClosed && canSplitDock(vw, side)) {
      patch.dock = true
      this.dockAutoClosed = false
    }
    // Clamp only a width that is actually RENDERING as a split column. While
    // the dock is closed or full-frame, dockPx is a dormant preference —
    // re-clamping it against a transient window size would overwrite what the
    // user chose (DESIGN_INTENT responsive rule 4); openDock and the overlay
    // exit re-clamp at the moment the width matters again.
    const dockPx = patch.dockPx ?? this.state.dockPx
    if (dockPx > 0 && (patch.dock ?? this.state.dock) && !dockMax) {
      const next = clampDock(dockPx, vw, side)
      if (Math.abs(next - dockPx) > 0.5) patch.dockPx = next
    }
    for (const key of Object.keys(patch) as (keyof LayoutState)[]) {
      if (patch[key] === this.state[key]) delete patch[key]
    }
    if (Object.keys(patch).length > 0) this.patch(patch)
  }

  /** Drag-time fast path: inline width per frame, no store notification.
   *  Only `flex` — the key the split branch renders. A second `width` key
   *  would outlive the drag with no render branch owning it. */
  private writeDockWidth(el: HTMLElement, w: number): void {
    const flex = `0 0 ${w}px`
    if (el.style.flex === flex) return
    el.style.flex = flex
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

  /** Switch the main column to another workbench app. The started-session
   *  fact belongs to the conversation view, so clearing it here keeps the
   *  dock rule from leaking across apps (新建任务 relies on this). */
  setView = (view: string): void => {
    if (this.state.view === view && !this.state.sessionStarted) return
    this.patch({ view, sessionStarted: false })
  }

  toggleSidebar = (): void => {
    // The sidebar's seam is column budget: opening it can push a split dock
    // below the conversation reserve, so the toggle reflows like a resize.
    this.sidebarAutoClosed = false
    this.reflow({ sidebar: !this.state.sidebar })
  }

  /**
   * Open the dock — always. The content the dock shows is decided entirely
   * by {@link dockTabs} (the launcher when `dockActive` is null); this verb
   * only opens the column and picks the shape it opens in. A window too
   * narrow for the split gets the dock as a full-frame overlay instead of a
   * toggle that does nothing: the intent is satisfied, the conversation
   * column is never squeezed under its reserve, and there is no dead switch
   * on screen (DESIGN_INTENT §2 rule 5).
   */
  openDock = (): void => {
    this.dockAutoClosed = false
    if (this.state.dock) return
    const vw = window.innerWidth
    const side = this.sideBudget()
    const overlay = !canSplitDock(vw, side)
    if (overlay) dblog('layout', 'dock opened as overlay — split does not fit', { vw, side })
    // The opening width: the remembered committed width re-clamped for the
    // current window, or the 30%-of-window default on the first open ever.
    // An overlay open leaves a remembered width untouched — it is not being
    // rendered, and this window's clamp must not overwrite the preference.
    const dockPx = this.state.dockPx > 0
      ? (overlay ? this.state.dockPx : clampDock(this.state.dockPx, vw, side))
      : dockDefault(vw, side)
    this.patch({ dock: true, dockMax: overlay, dockPx })
  }

  closeDock = (): void => {
    this.dockAutoClosed = false
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
    if (this.state.dockMax && !canSplitDock(window.innerWidth, this.sideBudget())) {
      dblog('layout', 'overlay exit closed the dock — split still does not fit', { vw: window.innerWidth, side: this.sideBudget() })
      this.dockAutoClosed = false
      this.patch({ dock: false, dockMax: false })
      return
    }
    // Exiting full frame re-enters the split, so the dormant width preference
    // meets the current window here — reflow re-clamps it for rendering.
    if (this.state.dockMax) this.reflow({ dockMax: false })
    else this.patch({ dockMax: true })
  }

  /** The main bar's own dock button. */
  toggleDock = (): void => {
    if (this.state.dock) {
      this.closeDock()
      return
    }
    this.openDock()
  }

  /** Contribute whether the conversation's subject is a started (non-blank)
   *  session. The dock only renders for a started session, so the conversation
   *  view is the sole owner of this fact; the shell just reads it. */
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

  /** Open and focus a new preview tab, or update an existing tab's label. */
  openTab = (pane: string, tab: TabRef): void => {
    const cur = this.tabsOf(pane)
    const at = cur.items.findIndex(item => item.id === tab.id)
    if (at >= 0 && cur.items[at]?.label === tab.label) return
    this.writeTabs(pane, {
      items: at >= 0 ? cur.items.map(item => item.id === tab.id ? tab : item) : [...cur.items, tab],
      active: at >= 0 ? cur.active : tab.id,
    })
  }

  /** Close one preview tab; focus falls to its neighbour. */
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

  /** Move one preview tab to a new index without touching focus. */
  moveTab = (pane: string, id: string, to: number): void => {
    const cur = this.tabsOf(pane)
    const items = moveById(cur.items, id, to)
    if (items === null) return
    this.writeTabs(pane, { ...cur, items })
  }

  /** Focus an existing preview tab. */
  focusTab = (pane: string, id: string): void => {
    const cur = this.tabsOf(pane)
    if (cur.active === id) return
    if (!cur.items.some(t => t.id === id)) return
    this.writeTabs(pane, { ...cur, active: id })
  }

  // ── the unified dock ledger ───────────────────────────────────────────────

  /**
   * Open and focus a dock tab. A new resource is appended and focused; an
   * existing id is just focused (idempotent open — the files singleton path).
   * Label changes go through {@link labelDockTab}: keeping renames out of the
   * open verb means a late title event for a closed tab can never resurrect
   * it as a ghost entry.
   */
  openDockTab = (view: string, tab: TabRef): void => {
    if (this.state.dockTabs.some(t => t.id === tab.id)) {
      this.focusDockTab(tab.id)
      return
    }
    this.patch({ dockTabs: [...this.state.dockTabs, { id: tab.id, view, label: tab.label }], dockActive: tab.id })
  }

  /**
   * Rename an existing dock tab without touching focus. A missing id is a
   * no-op — title events race tab closes (webview listeners detach in the
   * passive effect phase, after the ledger removal has already committed).
   * An unchanged label is a no-op too, so navigation hot-paths cannot
   * repaint every subscriber.
   */
  labelDockTab = (id: string, label: string): void => {
    const at = this.state.dockTabs.findIndex(t => t.id === id)
    if (at < 0) return
    if (this.state.dockTabs[at]?.label === label) return
    this.patch({ dockTabs: this.state.dockTabs.map(t => t.id === id ? { ...t, label } : t) })
  }

  /**
   * Move one dock tab to a new index. Focus is untouched — reordering is a
   * pure ledger permutation, so `dockActive` and every view's keep-alive
   * body survive the drag unchanged.
   */
  moveDockTab = (id: string, to: number): void => {
    const items = moveById(this.state.dockTabs, id, to)
    if (items === null) return
    this.patch({ dockTabs: items })
  }

  /** Focus an existing dock tab; no-op when already active or absent. */
  focusDockTab = (id: string): void => {
    if (this.state.dockActive === id) return
    if (!this.state.dockTabs.some(t => t.id === id)) return
    this.patch({ dockActive: id })
  }

  /**
   * Close one dock tab. Focus falls to the neighbour that took the closed
   * tab's place, then to the one before it. Deleting the last tab clears
   * `dockActive` so the dock shows its launcher empty state — the dock stays
   * open (the last-tab auto-collapse rule is retired).
   */
  closeDockTab = (id: string): void => {
    const at = this.state.dockTabs.findIndex(t => t.id === id)
    if (at < 0) return
    const items = this.state.dockTabs.filter(t => t.id !== id)
    const next = this.state.dockActive === id
      ? (items[at] ?? items[at - 1] ?? null)
      : this.state.dockTabs.find(t => t.id === this.state.dockActive) ?? null
    this.patch({ dockTabs: items, dockActive: next === null ? null : next.id })
  }

  /**
   * The dock ledger stashed per departed session. The host keeps a session's
   * PTYs until the session is disposed, so the tabs pointing at them must
   * survive the fence too — dropping them outright would orphan every
   * terminal but the first one (nothing could ever reattach term-2+). Keyed
   * by session id, pruned against the live list on every fence.
   */
  private tabStash = new Map<string, {
    tabs: Readonly<Record<string, PaneTabs>>
    dockTabs: readonly DockTab[]
    dockActive: string | null
  }>()

  /**
   * The session fence: stash the departing session's ledgers (per-view and
   * unified dock), restore the arriving session's (its terminals reattach,
   * its files re-read on mount) and bump the fence generation in one
   * notification. Called by the assembly's session watch, never by a view —
   * a view carries no per-session reset logic of its own.
   * @param from - the departing session id; its ledgers are stashed.
   * @param to - the arriving session id; its stash (if any) is restored.
   * @param live - session ids that still exist; stale stashes are pruned.
   */
  fenceTabs = (from?: string, to?: string, live?: ReadonlySet<string>): void => {
    if (from !== undefined) {
      this.tabStash.set(from, { tabs: this.state.tabs, dockTabs: this.state.dockTabs, dockActive: this.state.dockActive })
    }
    if (live !== undefined) {
      for (const key of [...this.tabStash.keys()]) {
        if (!live.has(key)) this.tabStash.delete(key)
      }
    }
    const restored = to === undefined ? undefined : this.tabStash.get(to)
    this.patch({
      tabs: restored?.tabs ?? {},
      dockTabs: restored?.dockTabs ?? [],
      dockActive: restored?.dockActive ?? null,
      fence: this.state.fence + 1,
    })
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
    let last = startW
    this.trackDrag(e.currentTarget, e.pointerId, (ev) => {
      last = clampSidebar(startW + (ev.clientX - startX), window.innerWidth, this.dockSpend())
      el.style.width = `${last}px`
    }, () => { this.reflow({ sidePx: last }) })
  }

  resetSideWidth = (): void => {
    this.reflow({ sidePx: SIDEBAR_DEFAULT })
  }

  startDockDrag = (e: DragStartEvent): void => {
    e.preventDefault()
    const el = this.dockRef.current
    if (el === null) return
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    let last = startW
    const thawEmbeds = this.freezeDockEmbeds(el)
    this.trackDrag(e.currentTarget, e.pointerId, (ev) => {
      last = clampDock(startW + (startX - ev.clientX), window.innerWidth, this.sideBudget())
      this.writeDockWidth(el, last)
    }, () => {
      thawEmbeds()
      this.reflow({ dockPx: last })
    })
  }

  resetDockWidth = (): void => {
    this.reflow({ dockPx: dockDefault(window.innerWidth, this.sideBudget()) })
  }

}

// ── render-side helpers ─────────────────────────────────────────────────────

/**
 * Subscribe to one layout projection. Notifications whose selected value is
 * `Object.is`-equal do not re-render this tree, so tab metadata cannot repaint
 * the conversation frame or sidebar.
 */
export function useLayoutSelection<T>(store: LayoutStore, select: (store: LayoutStore) => T): T {
  // Inline getSnapshot, no ref: writing a ref during render is a concurrent-
  // render tear (a thrown-away render's selector leaks into the kept one).
  // A fresh closure per render is safe — useSyncExternalStore re-reads on a
  // getSnapshot change and bails out when the selected value is `Object.is`-
  // equal, and every selector here returns a primitive or a stable state ref.
  return useSyncExternalStore(store.subscribe, () => select(store), () => select(store))
}
