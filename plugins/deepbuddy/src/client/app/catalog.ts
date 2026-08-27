/**
 * The static composition catalog: every surface DeepBuddy ships, as thin
 * definitions in flat arrays.
 *
 * A feature owns its component and exports a Definition (features/<name>/
 * index.ts); the catalog imports them all and hands the arrays to the shell.
 * The shell renders whatever the arrays and the layout store name — adding a
 * panel is one line here, removing one deletes its feature with no edits
 * inside any other (deepbuddy-design-current/ARCHITECTURE.md §3, §12). The
 * arrays are `as const` on purpose: a future dynamic Registry may replace
 * them only if the Definitions stay exactly this thin.
 */
import type { ComponentType } from 'react'
import { FilesViewDefinition } from '../features/files/index.ts'
import { TerminalViewDefinition } from '../features/terminal/index.ts'
import { BrowserViewDefinition } from '../features/browser/index.ts'
import type { IconName } from '../ui/icons.tsx'
import type { TabRef } from '../shell/layout-store.ts'

/**
 * What a view type's component receives from the shell: its own id and the
 * shell-owned tab ledger slice for it. Instances (which files, which
 * terminals) are shell state; the view renders and edits them through these
 * props rather than writing the layout store itself
 * (deepbuddy-design-current/DEVELOPMENT_RULES.md §4, §6).
 */
export interface InspectorViewProps {
  /** The view type's id — the key its tabs live under. */
  viewId: string
  /** The open instances, in order. */
  tabs: readonly TabRef[]
  /** The focused instance id, or null. */
  active: string | null
  /** Whether this view type and its active resource are currently visible. */
  visible: boolean
  /** Open and focus a new instance; an existing id is just focused. */
  onOpenTab(tab: TabRef): void
  /** Rename an existing instance without touching focus; missing id no-ops. */
  onLabelTab(id: string, label: string): void
  /** Close an instance; focus falls to its neighbour. */
  onCloseTab(id: string): void
  /** Focus an existing instance. */
  onFocusTab(id: string): void
  /**
   * Register a close path that owns an underlying resource. Terminal uses this
   * to preserve its PTY kill-before-ledger-removal protocol; ordinary views
   * leave it unregistered.
   */
  onRegisterClose(fn: ((id: string) => void) | null): void
}

/** One inspector surface: Files, and later Terminal and File Preview. */
export interface InspectorViewTypeDefinition {
  id: string
  title: string
  icon?: IconName
  Component: ComponentType<InspectorViewProps>
  /** Create this view's next unified dock resource tab from its own open tabs. */
  createTab(existing: readonly TabRef[]): TabRef
  /**
   * Stash/restore the feature's module-level per-session resources. The
   * assembly's session fence calls it on a current-session change, right
   * after the shell ledgers are swapped; component-local state dies by
   * remount instead (the inspector keys view bodies on the fence generation).
   * The ledger swap restores the arriving session's tabs, so a feature that
   * keeps module state per tab stashes it under `from` and restores `to`'s.
   * @param from - the departing session id.
   * @param to - the arriving session id.
   * @param live - session ids that still exist; stale stashes are pruned.
   */
  onSessionFence?: (from: string | undefined, to: string | undefined, live: ReadonlySet<string>) => void
}

/** Inspector view types, in the dock launcher/menu order. */
export const INSPECTOR_VIEW_TYPES = [
  TerminalViewDefinition,
  BrowserViewDefinition,
  FilesViewDefinition,
] as const

/**
 * Resolve the entry a dispatching surface should render: the requested id
 * when it is registered, else the first one, else undefined.
 *
 * The shell refuses to render an app or view that nobody shipped rather than
 * showing an empty column.
 * @param rows - the catalog slice.
 * @param want - the id the layout state asks for.
 * @returns the entry to render.
 */
export function pickEntry<T extends { id: string }>(rows: readonly T[], want: string | null): T | undefined {
  if (want !== null && want !== '') {
    const exact = rows.find(r => r.id === want)
    if (exact !== undefined) return exact
  }
  return rows[0]
}
