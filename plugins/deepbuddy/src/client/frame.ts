/**
 * The layout kernel's state machine.
 *
 * It owns exactly the facts that decide where things are — which view the main
 * column shows, whether the sidebar and dock are open, which pane and which
 * settings page are current, and the dock's tab ledger. Nothing about
 * sessions, files, models or presets lives here: those belong to the seats.
 *
 * Widths are the one thing deliberately kept OUT of the state object. A drag
 * writes the column's inline width directly and re-reads it from the DOM,
 * because routing sixty mousemove events per second through a store that every
 * seat subscribes to would re-render every panel in the window to move one
 * divider. The state object carries booleans and ids; the geometry lives where
 * the browser already keeps it.
 */
import { createRef, useSyncExternalStore } from 'react'
import type { HostObservable, SlotLabel, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ctx.layout contract this kernel serves in ui-layout's place.
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  DockPaneFace, DockPaneId, DockTabs, LayoutState, LayoutVerbs, MainViewId,
  PaneTabs, SeatFace, SettingsPageId, TabRef,
} from './seats.ts'
import { KIT } from './kit.tsx'
import {
  DOCK_BREAKPOINT, SIDEBAR_BREAKPOINT, SIDEBAR_DEFAULT,
  clampDock, clampSidebar, dockDefault, dockFits,
} from './geometry.ts'

const NO_TABS: PaneTabs = { items: [], active: null }

/** The layout kernel's controller: one per plugin fiber. */
export class LayoutController {
  state: LayoutState = {
    view: 'chat',
    sidebar: true,
    dock: false,
    pane: null,
    maximized: false,
    settings: null,
    title: null,
    tabs: {},
  }

  /**
   * The official frame contract's right details column. Kept OFF
   * {@link LayoutState} because it is not a `dbdy.*` fact: nothing but
   * `ctx.layout.openDetails` moves it, and no seat of ours needs to know.
   */
  detailsOpen = false

  readonly sideRef = createRef<HTMLElement>()
  readonly dockRef = createRef<HTMLElement>()

  /** uSES subscribers: one per slot entry rendering from this state. */
  private readonly listeners = new Set<() => void>()
  /** uSES snapshot: a counter, because `state` is replaced on every update. */
  private version = 0

  /** A hand-closed dock stays closed when the window grows back. */
  private userClosedDock = false
  /** Dock width remembered across a maximize round trip. */
  private savedDockWidth = ''

  // ── store plumbing ────────────────────────────────────────────────────────

  private patch(next: Partial<LayoutState>): void {
    this.state = { ...this.state, ...next }
    this.bump()
  }

  /** Notify without replacing state — for the chrome-only facts above. */
  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  getState = (): LayoutState => this.state

  /** The observable the seat face publishes as `useLayoutState`. */
  private readonly observable: HostObservable<LayoutState> = {
    getSnapshot: () => this.state,
    subscribe: (listener: () => void) => this.subscribe(listener),
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
   */
  private onResize = (): void => {
    const vw = window.innerWidth
    if (this.state.dock && (vw < DOCK_BREAKPOINT || !dockFits(vw, this.sideWidth()))) {
      this.patch({ dock: false, maximized: false })
    }
    if (vw < SIDEBAR_BREAKPOINT && this.state.sidebar) this.patch({ sidebar: false })
    this.clampDockWidth()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.state.settings !== null) {
      this.closeSettings()
      return
    }
    if (!(e.metaKey || e.ctrlKey)) return
    // ⌘J toggles the dock; ⌘, opens settings. The handoff's other shortcuts
    // (⌘K, ⌘N, ⌘T) belong to surfaces the kernel does not own, and are
    // registered by those seats when they exist.
    if (e.key === 'j') {
      e.preventDefault()
      this.toggleDock()
    }
    else if (e.key === ',') {
      e.preventDefault()
      if (this.state.settings === null) this.openSettings(null)
      else this.closeSettings()
    }
  }

  // ── measurements ──────────────────────────────────────────────────────────

  /** Rendered sidebar width including its handle; 0 while collapsed. */
  private sideWidth(): number {
    const el = this.sideRef.current
    if (!this.state.sidebar || el === null) return 0
    const dragged = Number.parseFloat(el.style.width)
    return (Number.isFinite(dragged) ? dragged : SIDEBAR_DEFAULT) + 1
  }

  /** Hold the dock inside its range after the window changed size. */
  private clampDockWidth(): void {
    const el = this.dockRef.current
    if (el === null || !this.state.dock || this.state.maximized) return
    const now = el.getBoundingClientRect().width
    const next = clampDock(now, window.innerWidth, this.sideWidth())
    if (Math.abs(next - now) > 0.5) this.writeDockWidth(el, next)
  }

  private writeDockWidth(el: HTMLElement, w: number): void {
    el.style.flex = `0 0 ${w}px`
    el.style.width = `${w}px`
  }

  // ── verbs (the seat-facing face) ──────────────────────────────────────────

  setView = (view: MainViewId): void => {
    // The title belongs to the view that set it; the next view contributes
    // its own (or falls back to its label).
    this.patch({ view, settings: null, title: null })
  }

  setTitle = (title: string | null): void => {
    if (this.state.title === title) return
    this.patch({ title })
  }

  toggleSidebar = (): void => {
    this.patch({ sidebar: !this.state.sidebar })
  }

  openDock = (pane: DockPaneId): void => {
    this.userClosedDock = false
    if (this.state.dock && this.state.pane === pane) return
    if (!dockFits(window.innerWidth, this.sideWidth())) return
    this.patch({ dock: true, pane })
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
    this.patch({ dock: false, maximized: false })
  }

  /** The kernel's own dock button; `fallback` is the first registered pane. */
  toggleDock = (fallback?: DockPaneId): void => {
    if (this.state.dock) {
      this.closeDock()
      return
    }
    const pane = this.state.pane ?? fallback
    if (pane !== undefined) this.openDock(pane)
  }

  toggleMax = (): void => {
    const el = this.dockRef.current
    const goingMax = !this.state.maximized
    if (el !== null) {
      if (goingMax) {
        this.savedDockWidth = el.style.width
        el.style.flex = '1 1 auto'
        el.style.width = 'auto'
      }
      else {
        const restored = Number.parseFloat(this.savedDockWidth)
        this.writeDockWidth(el, Number.isFinite(restored) ? restored : dockDefault(window.innerWidth, this.sideWidth()))
      }
    }
    this.patch({ maximized: goingMax })
  }

  /** `null` opens whatever page the rail resolves first. */
  openSettings = (page: SettingsPageId | null): void => {
    this.patch({ settings: page ?? '' })
  }

  closeSettings = (): void => {
    this.patch({ settings: null })
  }

  // ── dock tabs ─────────────────────────────────────────────────────────────

  private tabsOf(pane: DockPaneId): PaneTabs {
    return this.state.tabs[pane] ?? NO_TABS
  }

  private writeTabs(pane: DockPaneId, next: PaneTabs): void {
    this.patch({ tabs: { ...this.state.tabs, [pane]: next } })
  }

  private readonly tabs: DockTabs = {
    open: (pane, tab: TabRef) => {
      const cur = this.tabsOf(pane)
      const exists = cur.items.some(t => t.id === tab.id)
      this.writeTabs(pane, {
        items: exists ? cur.items : [...cur.items, tab],
        active: tab.id,
      })
    },
    close: (pane, id) => {
      const cur = this.tabsOf(pane)
      const at = cur.items.findIndex(t => t.id === id)
      if (at < 0) return
      const items = cur.items.filter(t => t.id !== id)
      // Focus falls to the neighbour that took the closed tab's place, then
      // to the one before it — the browser-tab rule users already have.
      const next = cur.active === id ? (items[at] ?? items[at - 1] ?? null) : cur.items.find(t => t.id === cur.active) ?? null
      this.writeTabs(pane, { items, active: next === null ? null : next.id })
    },
    focus: (pane, id) => {
      const cur = this.tabsOf(pane)
      if (!cur.items.some(t => t.id === id)) return
      this.writeTabs(pane, { ...cur, active: id })
    },
  }

  // ── drag handles ──────────────────────────────────────────────────────────

  private trackDrag(move: (e: MouseEvent) => void, done?: () => void): void {
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      done?.()
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  startSideDrag = (e: { clientX: number; preventDefault(): void }): void => {
    e.preventDefault()
    const el = this.sideRef.current
    if (el === null) return
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    this.trackDrag((ev) => {
      el.style.width = `${clampSidebar(startW + (ev.clientX - startX))}px`
    }, () => { this.clampDockWidth() })
  }

  resetSideWidth = (): void => {
    const el = this.sideRef.current
    if (el !== null) el.style.width = `${SIDEBAR_DEFAULT}px`
  }

  startDockDrag = (e: { clientX: number; preventDefault(): void }): void => {
    e.preventDefault()
    const el = this.dockRef.current
    if (el === null) return
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    this.trackDrag((ev) => {
      this.writeDockWidth(el, clampDock(startW + (startX - ev.clientX), window.innerWidth, this.sideWidth()))
    })
  }

  resetDockWidth = (): void => {
    const el = this.dockRef.current
    if (el !== null) this.writeDockWidth(el, dockDefault(window.innerWidth, this.sideWidth()))
  }

  // ── the seat faces ────────────────────────────────────────────────────────

  private readonly verbs: LayoutVerbs = {
    setView: (v) => { this.setView(v) },
    openDock: (p) => { this.openDock(p) },
    closeDock: () => { this.closeDock() },
    openSettings: (p) => { this.openSettings(p) },
    closeSettings: () => { this.closeSettings() },
    setTitle: (t) => { this.setTitle(t) },
  }

  /**
   * The `ctx.layout` face DeepBuddy serves in the disabled ui-layout row's
   * place. Three methods, no store: the official controller forwards to a slot
   * store because its geometry lives there, while ours lives right here.
   * @returns the ILayout implementation to provide.
   */
  layoutFace(): ILayout {
    return {
      toggleSidebar: () => { this.toggleSidebar() },
      openDetails: () => { this.detailsOpen = true; this.bump() },
      closeDetails: () => { this.detailsOpen = false; this.bump() },
    }
  }

  /**
   * The face handed to ordinary seats. Frozen and built once: an occupant
   * receives capability, not a mutable handle on the kernel.
   */
  readonly seatFace: SeatFace = Object.freeze({
    ui: KIT,
    layout: Object.freeze(this.verbs),
    hooks: { layoutState: this.observable },
  })

  /** The face handed to dock panes: the seat face plus the tab strip. */
  readonly dockPaneFace: DockPaneFace = Object.freeze({
    ...this.seatFace,
    tabs: Object.freeze(this.tabs),
  })
}

// ── render-side helpers ─────────────────────────────────────────────────────

/**
 * Re-render a kernel component whenever the layout state moves. Each `dbdy.*`
 * container is a separate React tree under its own slot entry, so they
 * subscribe rather than share a parent.
 * @param frame - the plugin-scope controller.
 */
export function useFrame(frame: LayoutController): void {
  useSyncExternalStore(frame.subscribe, frame.getVersion, frame.getVersion)
}

/**
 * The slice of `ctx.slots` the kernel's containers read. Typed structurally so
 * the kernel never names the runtime Service class and keeps compiling across
 * harness release drift.
 */
export interface SlotReader {
  /** Shadowing winners for a key — a render-body read, not a uSES source. */
  entriesOfSlot(key: string): readonly StoredEntry[]
  /** Registration changes for a key (microtask-batched). */
  subscribe(key: string, fn: () => void): () => void
  /** Monotonic per-key version — bumped synchronously, so it is the uSES snapshot. */
  getVersion(key: string): number
}

/** One list-slot entry as a kernel container needs it: identity and title. */
export interface SeatEntry {
  id: string
  label: string | undefined
  order: number
}

/**
 * Read a list slot's live entries, sorted by `order` then registration.
 *
 * The subscribe/getVersion pair is the uSES source (the version bumps
 * synchronously per mutation); the projection itself runs in the render body,
 * because `entriesOfSlot` builds a fresh array per call and would make React
 * see a new snapshot forever.
 * @param slots - the reader.
 * @param key - list slot key.
 * @returns the entries in display order.
 */
export function useSeatEntries(slots: SlotReader, key: string): SeatEntry[] {
  useSyncExternalStore(
    fn => slots.subscribe(key, fn),
    () => slots.getVersion(key),
    () => slots.getVersion(key),
  )
  const rows = slots.entriesOfSlot(key).map((entry, i) => ({
    id: entry.options.id ?? '',
    label: resolveSlotLabel(entry.options.label as SlotLabel | undefined),
    order: entry.options.order ?? i,
  }))
  return rows.sort((a, b) => a.order - b.order)
}

/**
 * Resolve the entry a dispatching seat should render: the requested id when it
 * is registered, else the first one, else undefined.
 *
 * The kernel refuses to render a view/pane/page that nobody registered rather
 * than showing an empty column — a plugin that failed to load looks like a
 * plugin that failed to load.
 * @param rows - the seat's live entries.
 * @param want - the id the layout state asks for.
 * @returns the entry to render.
 */
export function pickEntry(rows: readonly SeatEntry[], want: string | null): SeatEntry | undefined {
  if (want !== null && want !== '') {
    const exact = rows.find(r => r.id === want)
    if (exact !== undefined) return exact
  }
  return rows[0]
}
