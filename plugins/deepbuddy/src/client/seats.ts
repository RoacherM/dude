/**
 * The distribution's own seat contract: the `dbdy.*` slots the layout kernel
 * declares, and the face it hands every occupant.
 *
 * ## Why the face exists
 *
 * A seat plugin cannot import this package. The client bundle is checked as an
 * artifact — only platform modules may stay external (see
 * `tests/plugin.test.mjs`) — so a cross-plugin value import is a build-time
 * purity failure, not a style preference. ui-slots' answer is the `inject`
 * member of a child-slot declaration: the DECLARING entry supplies one face,
 * and every registrant into that slot receives it bound
 * (`dsh-client-ui-slots` `SlotEntryDef.inject` / `SlotInjectFace`). That face
 * is therefore the distribution's entire seat-facing API.
 *
 * ## What the face deliberately withholds
 *
 * Verbs, never geometry. A seat may ASK for the dock to open; it cannot learn
 * or set how wide the dock is, which side it lives on, or what covers what.
 * Layout sovereignty (design/LAW.md LAYOUT-1) stops being a rule people remember
 * and becomes a type error — which is the only form of it that survives a
 * plugin written by a model at 3am.
 *
 * Design tokens travel the other channel: the kernel installs the stylesheet,
 * occupants read `var(--db-*)` and the `.dbdy-*` classes (styles.ts). Between
 * the two, a seat plugin that wants an off-system colour has to hand-write a
 * hex literal — visible in review, which is the point.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { HostObservable, SlotInjectFace } from '@deepseek-ai/dsh-client-ui-slots'

// ── layout state and verbs ──────────────────────────────────────────────────

/** Which surface the main column shows; keys of the `dbdy.main.view` seat. */
export type MainViewId = string

/** Which pane the dock shows; keys of the `dbdy.dock.pane` seat. */
export type DockPaneId = string

/** Which page settings shows; keys of the `dbdy.settings.page` seat. */
export type SettingsPageId = string

/**
 * The read-only layout facts a seat may need to render itself correctly — a
 * dock pane wants to know it is the active one, a nav row wants to know it is
 * current. Sizes are absent on purpose (see the module doc).
 */
export interface LayoutState {
  /** Current main view key. */
  view: MainViewId
  /** Whether the sidebar column is rendered at all. */
  sidebar: boolean
  /** Whether the dock column is open. */
  dock: boolean
  /** Active dock pane key; null while the dock is closed. */
  pane: DockPaneId | null
  /** Whether the dock covers the whole window. */
  maximized: boolean
  /** Current settings page key, or null when settings is closed. */
  settings: SettingsPageId | null
  /**
   * Top-bar title contributed by the active main view; null falls back to the
   * view entry's registered label.
   *
   * A title is content, not geometry, so it travels the seat face rather than
   * being invented by the kernel — the chat view is the only thing that knows
   * a session is called 「重构缓存层」. Only the ACTIVE view renders, so only
   * the active view can set it, and switching views clears it.
   */
  title: string | null
  /**
   * Tab state per dock pane. A pane reads its own entry to decide what to
   * render; the kernel draws the strip from the same fact.
   */
  tabs: Readonly<Record<DockPaneId, PaneTabs>>
}

/**
 * Layout verbs. Every one is a request the kernel may refuse — `openDock` on
 * a window too narrow to host one is a no-op, not an error, and a caller that
 * needs to know reads {@link LayoutState} back.
 */
export interface LayoutVerbs {
  /** Switch the main column to another registered view. */
  setView(view: MainViewId): void
  /** Open the dock on one pane (opens the dock when it is closed). */
  openDock(pane: DockPaneId): void
  closeDock(): void
  /** Open settings on one registered page (settings takes the whole window). */
  openSettings(page: SettingsPageId): void
  closeSettings(): void
  /**
   * Contribute the main top bar's title. Call it from an effect, never from a
   * render body — it writes kernel state, and a write during render is the
   * classic re-entrant loop.
   */
  setTitle(title: string | null): void
}

/** One tab of a dock pane, as the kernel's strip knows it. */
export interface TabRef {
  id: string
  label: string
}

/** One pane's tab state, as {@link LayoutState} carries it. */
export interface PaneTabs {
  items: readonly TabRef[]
  active: string | null
}

/**
 * Dock tab management, handed only to dock panes.
 *
 * Tabs are a DOCK capability rather than a per-pane one: the handoff draws a
 * tab strip inside Explorer, Browser and Terminal alike, and three panes each
 * re-implementing one would be three chances to disagree about a 38px row the
 * kernel already owns. The strip, its geometry, its overflow and its close
 * affordance stay here.
 *
 * The kernel owns tab IDENTITY and ORDER; the pane owns tab CONTENT and
 * renders whatever its active tab means. Bodies are deliberately not passed
 * in: a `ReactNode` handed over at open time freezes at that moment, and a
 * file whose text arrives later would show the loading state forever.
 */
export interface DockTabs {
  /** Open a tab of the calling pane, or focus it when the id already exists. */
  open(pane: DockPaneId, tab: TabRef): void
  /** Close one tab; focus falls to its neighbour. */
  close(pane: DockPaneId, id: string): void
  /** Focus an existing tab. */
  focus(pane: DockPaneId, id: string): void
}

// ── the component kit ───────────────────────────────────────────────────────

/** Shared props every kit component accepts. */
interface Common {
  style?: CSSProperties
  title?: string
}

/** Kit component faces — the shapes COMPONENTS.md specifies, nothing more. */
export interface Kit {
  /**
   * `primary` is capped at one per screen by convention and by review, not by
   * the type; `secondary` is the outline pill; `text` is the borderless one.
   */
  Button: (p: Common & {
    kind?: 'primary' | 'secondary' | 'text'
    size?: 30 | 34 | 36
    disabled?: boolean
    onClick?: () => void
    children: ReactNode
  }) => ReactNode
  IconButton: (p: Common & {
    size?: 26 | 28 | 30 | 34
    active?: boolean
    disabled?: boolean
    onClick?: () => void
    /** Required: an icon with no name is unusable by anyone not looking at it. */
    title: string
    children: ReactNode
  }) => ReactNode
  Input: (p: Common & {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    /** Identifiers (paths, ids, keys, model names) render in JetBrains Mono. */
    mono?: boolean
    size?: 30 | 38 | 44
    type?: 'text' | 'password'
    autoFocus?: boolean
    onKeyDown?: (e: React.KeyboardEvent) => void
  }) => ReactNode
  Select: <T extends string>(p: Common & {
    value: T
    options: readonly { id: T; label: string; detail?: string }[]
    onChange: (v: T) => void
    /** Pill form sizes to content; form form is a fixed 340px field. */
    form?: 'pill' | 'field'
    disabled?: boolean
    /** Above this many options the menu grows a search row. */
    placeholder?: string
  }) => ReactNode
  Switch: (p: Common & { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) => ReactNode
  Badge: (p: Common & { tone?: 'neutral' | 'run' | 'await' | 'outline'; children: ReactNode }) => ReactNode
  StatusPill: (p: Common & { tone: 'run' | 'await' | 'offline' | 'neutral'; children: ReactNode }) => ReactNode
  Card: (p: Common & { onClick?: () => void; children: ReactNode }) => ReactNode
  /** Anchored floating surface; closes on outside click, Esc, or another opening. */
  Popover: (p: Common & { open: boolean; onClose: () => void; anchor: ReactNode; align?: 'left' | 'right'; direction?: 'down' | 'up'; children: ReactNode }) => ReactNode
  /** Centered modal — destructive confirmations only, per the handoff. */
  Dialog: (p: Common & { open: boolean; onClose: () => void; width?: number; children: ReactNode }) => ReactNode
  /** Dashed empty state: one sentence about the consequence, no art, no button. */
  EmptyState: (p: Common & { children: ReactNode }) => ReactNode
  /** `underline` for content sections, `segment` for surface switching. Never both at one level. */
  Tabs: <T extends string>(p: Common & { form: 'underline' | 'segment'; value: T; tabs: readonly { id: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) => ReactNode
  /**
   * A list row — the shape every rail in the window is made of: sidebar nav,
   * session rows, settings rail, dock tree entries.
   *
   * It exists because the alternative was each seat picking its own height,
   * and three seats disagreeing by 6px is exactly the drift a shipped kit is
   * supposed to make impossible. Height, radius, padding and the selected
   * fill are not props.
   */
  Row: (p: Common & {
    /** Selected state: the fill, not a border and not a colour. */
    current?: boolean
    icon?: ReactNode
    /** Right-hand metadata (timestamp, badge, count) — muted by default. */
    trailing?: ReactNode
    /** One nesting step, for tree children and grouped rows. */
    indent?: boolean
    /** Compact rows for dense trees; the default is the rail row. */
    dense?: boolean
    onClick?: () => void
    children: ReactNode
  }) => ReactNode
  /** Group label above a run of rows: the quietest text step, no uppercase. */
  GroupLabel: (p: Common & { onClick?: () => void; trailing?: ReactNode; children: ReactNode }) => ReactNode
  /** Settings row: title + description left, control right, hairline below. */
  SettingRow: (p: Common & { label: string; description?: string; children: ReactNode }) => ReactNode
  /** Status dot. */
  Dot: (p: Common & { tone?: 'run' | 'await' | 'offline' | 'primary' | 'muted'; size?: number }) => ReactNode
  /** Monospace inline text — identifiers, paths, shortcuts. */
  Mono: (p: Common & { children: ReactNode }) => ReactNode
}

// ── the seat faces ──────────────────────────────────────────────────────────

/** What every `dbdy.*` occupant receives. */
export interface SeatFace {
  ui: Kit
  layout: LayoutVerbs
  hooks: { layoutState: HostObservable<LayoutState> }
}

/** Dock panes additionally own a tab strip. */
export interface DockPaneFace extends SeatFace {
  tabs: DockTabs
}

/** Owner share of one sidebar nav row: whether it is the current view. */
export interface NavOwnerProps {
  current: boolean
}

/**
 * What a seat component actually receives from the face: the `hooks`
 * compartment arrives bound as `use<Name>` selector hooks, everything else
 * passes through. Seat components type their props against these rather than
 * re-typing the face by hand.
 */
export type SeatProps = SlotInjectFace<SeatFace>

/** The dock-pane flavour of {@link SeatProps}. */
export type DockPaneProps = SlotInjectFace<DockPaneFace>

/**
 * Every dispatching seat below is `list`, not `keyed`, and the kernel renders
 * exactly one of them through `RenderOpts.only`.
 *
 * The reason is mechanical: keyed registration options carry `{ key, priority }`
 * and nothing else, while list options carry `{ id, order, label }`
 * (`dsh-client-ui-slots` `KindOptions`). The dock's segmented control and the
 * settings rail have to DRAW a title and put the entries in a stable order —
 * with keyed slots there is nowhere for that title to live, and a parallel
 * label registry would be a second source of truth for the same fact. The
 * kernel enumerates through `ctx.slots.entries(key)` and dispatches the active
 * one with `only`, which is what that option exists for.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The main column's body. A view owns everything between the 52px top bar
     * and the window's bottom edge — including its own composer if it has one
     * (chat does; a board does not).
     *
     * `id` is the view id the sidebar nav row switches to; `label` is unused
     * by the kernel (the nav row carries the name) but keeps inspection
     * readable.
     */
    'dbdy.main.view': {
      kind: 'list'
      scope: 'session-maybe'
      inject: SeatFace
    }
    /**
     * One sidebar navigation row. Registered BY the view plugin it opens, so
     * installing a view installs its entry point and removing it removes both
     * — the sidebar never carries a list of things that might not exist.
     *
     * `order` places the row; `id` should match the view's id so the kernel
     * can mark the current one.
     */
    'dbdy.sidebar.nav': {
      kind: 'list'
      scope: 'root'
      owner: NavOwnerProps
      inject: SeatFace
    }
    /** A sidebar group below the nav (session list, projects, …), placed by `order`. */
    'dbdy.sidebar.section': {
      kind: 'list'
      scope: 'root'
      inject: SeatFace
    }
    /**
     * One dock pane. `label` is the segment's title and `order` its position;
     * the handoff fixes Explorer / Browser / Terminal in that sequence, which
     * is `order` 10 / 20 / 30 rather than registration luck.
     *
     * Open to the application ring — this is the seat the handoff's
     * "Mount a plugin panel" affordance points at.
     */
    'dbdy.dock.pane': {
      kind: 'list'
      scope: 'root'
      inject: DockPaneFace
    }
    /**
     * One settings page: `label` names it in the left rail, `order` places it.
     *
     * The rail groups pages under Harness / Workspace headings, so the id
     * carries the group as a prefix (`harness/models`, `workspace/appearance`).
     * A prefix beats a registration field the framework does not have and
     * beats an order-band convention nobody can see: the grouping is legible
     * in `ctx.slots.snapshot()` output.
     *
     * Open to the application ring.
     */
    'dbdy.settings.page': {
      kind: 'list'
      scope: 'root'
      inject: SeatFace
    }
  }
}

/** Settings rail groups, in display order; the id prefix selects one. */
export const SETTINGS_GROUPS = [
  { prefix: 'harness', label: 'Harness' },
  { prefix: 'workspace', label: '工作空间' },
] as const
