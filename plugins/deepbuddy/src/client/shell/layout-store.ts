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
 * because routing sixty mousemove events per second through a store that every
 * column subscribes to would re-render every panel in the window to move one
 * divider. The state object carries booleans and ids; the geometry lives where
 * the browser already keeps it.
 */
import { createRef, useSyncExternalStore } from 'react'
// Type-only: the ctx.layout contract this store serves in ui-layout's place.
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DOCK_BREAKPOINT, SIDEBAR_BREAKPOINT, SIDEBAR_DEFAULT,
  clampDock, clampSidebar, dockDefault, dockFits,
} from './geometry.ts'

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

/** The read-only layout facts every column renders from. */
export interface LayoutState {
  /** Current workbench app key (catalog WORKBENCH_APPS). */
  view: string
  /** Whether the sidebar column is rendered at all. */
  sidebar: boolean
  /** Whether the inspector column is open. */
  dock: boolean
  /** Active inspector view-type key; null while the dock is closed. */
  pane: string | null
  /** Whether the settings dialog overlay is open. */
  settingsOpen: boolean
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
   * Tab state per inspector view type. The shell draws the strip from this
   * fact; the view renders whatever its active tab means.
   */
  tabs: Readonly<Record<string, PaneTabs>>
}

const NO_TABS: PaneTabs = { items: [], active: null }

/** The layout store: one per plugin fiber. */
export class LayoutStore {
  state: LayoutState = {
    view: 'chat',
    sidebar: true,
    dock: false,
    pane: null,
    settingsOpen: false,
    sessionStarted: false,
    title: null,
    tabs: {},
  }

  /**
   * The official frame contract's right details column. Kept OFF
   * {@link LayoutState} because nothing but `ctx.layout.openDetails` moves it
   * and no column of ours needs to know.
   */
  detailsOpen = false

  readonly sideRef = createRef<HTMLElement>()
  readonly dockRef = createRef<HTMLElement>()

  /** uSES subscribers: one per slot tree rendering from this state. */
  private readonly listeners = new Set<() => void>()
  /** uSES snapshot: a counter, because `state` is replaced on every update. */
  private version = 0

  /** A hand-closed dock stays closed when the window grows back. */
  private userClosedDock = false

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
      this.patch({ dock: false })
    }
    if (vw < SIDEBAR_BREAKPOINT && this.state.sidebar) this.patch({ sidebar: false })
    this.clampDockWidth()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey)) return
    // ⌘J toggles the dock; ⌘, opens settings. The handoff's other shortcuts
    // (⌘K, ⌘N, ⌘T) belong to surfaces the store does not own. Esc is handled
    // by the floating layers themselves (DESIGN_INTENT §12: Popover first,
    // then Dialog) — the shell never swallows it.
    if (e.key === 'j') {
      e.preventDefault()
      this.toggleDock()
    }
    else if (e.key === ',') {
      e.preventDefault()
      if (this.state.settingsOpen) this.closeSettings()
      else this.openSettings()
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
    if (el === null || !this.state.dock) return
    const now = el.getBoundingClientRect().width
    const next = clampDock(now, window.innerWidth, this.sideWidth())
    if (Math.abs(next - now) > 0.5) this.writeDockWidth(el, next)
  }

  private writeDockWidth(el: HTMLElement, w: number): void {
    el.style.flex = `0 0 ${w}px`
    el.style.width = `${w}px`
  }

  // ── verbs ─────────────────────────────────────────────────────────────────

  /** Switch the main column to another workbench app. */
  setView = (view: string): void => {
    // The title belongs to the app that set it; the next app contributes its
    // own (or falls back to its catalog title). The started-session fact also
    // belongs to the conversation view, so clearing it here keeps the dock
    // rule from leaking across apps.
    this.patch({ view, settingsOpen: false, sessionStarted: false, title: null })
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

  openDock = (pane: string): void => {
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
    this.patch({ dock: false })
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

  /** Open the settings dialog overlay. The main column keeps its current
   *  surface — settings is never a workbench page (wave 4 §5). */
  openSettings = (): void => {
    this.patch({ settingsOpen: true })
  }

  closeSettings = (): void => {
    this.patch({ settingsOpen: false })
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

  /** Open a tab of a view type, or focus it when the id already exists. */
  openTab = (pane: string, tab: TabRef): void => {
    const cur = this.tabsOf(pane)
    const exists = cur.items.some(t => t.id === tab.id)
    this.writeTabs(pane, {
      items: exists ? cur.items : [...cur.items, tab],
      active: tab.id,
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
    if (!cur.items.some(t => t.id === id)) return
    this.writeTabs(pane, { ...cur, active: id })
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

  // ── the official face ─────────────────────────────────────────────────────

  /**
   * The `ctx.layout` face DeepBuddy serves in the disabled ui-layout row's
   * place. Three methods, no store: the official controller forwards to a
   * slot store because its geometry lives there, while ours lives right here.
   * @returns the ILayout implementation to provide.
   */
  layoutFace(): ILayout {
    return {
      toggleSidebar: () => { this.toggleSidebar() },
      openDetails: () => { this.detailsOpen = true; this.bump() },
      closeDetails: () => { this.detailsOpen = false; this.bump() },
    }
  }
}

// ── render-side helpers ─────────────────────────────────────────────────────

/**
 * Re-render a column component whenever the layout state moves. Each slot
 * tree is a separate React boundary, so they subscribe rather than share a
 * parent.
 * @param store - the plugin-scope layout store.
 */
export function useLayoutStore(store: LayoutStore): void {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
}


