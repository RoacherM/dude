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
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createRef, useSyncExternalStore } from 'react'
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
    // A maximized dock is an overlay — column-fit arithmetic does not apply.
    if (this.state.dock && !this.state.dockMax && (vw < DOCK_BREAKPOINT || !dockFits(vw, this.sideWidth()))) {
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
    if (el === null || !this.state.dock || this.state.dockMax) return
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
    this.patch({ dock: false, dockMax: false })
  }

  /** Grow the open dock to cover the frame, or shrink it back. */
  toggleDockMax = (): void => {
    if (!this.state.dock) return
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
    const exists = cur.items.some(t => t.id === tab.id)
    this.writeTabs(pane, {
      items: exists ? cur.items.map(item => item.id === tab.id ? tab : item) : [...cur.items, tab],
      active: exists ? cur.active : tab.id,
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
