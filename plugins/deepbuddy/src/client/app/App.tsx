/**
 * The plugin entry and assembly: one apply() per fiber builds the wire
 * bundle, the layout store and the per-feature data planes, mounts the
 * DSH-facing services, and registers the three column occupants.
 *
 * What this file does NOT do anymore: declare any `dbdy.*` seat or register
 * occupants into one. First-party surfaces are thin Definitions in
 * app/catalog.ts, composed by the shell from the static arrays — the seat
 * contract is retired, and the only slot machinery left is the official
 * root/frame takeover (dsh/adapter.ts), which is the DSH boundary and stays
 * (deepbuddy-design-current/ARCHITECTURE.md §3/§4).
 */
import type { ReactNode } from 'react'
import type { ChildrenDecl } from '@deepseek-ai/dsh-client-ui-slots'

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createDsh, FRAME_SLOT_MAP, mountOfficialServices, ROOT_PRIORITY, SIDEBAR_SLOT_MAP } from '../dsh/adapter.ts'
import { PresetPlane } from '../dsh/presets.ts'
import { LayoutStore, useLayoutSelection } from '../shell/layout-store.ts'
import { DeepBuddySidebar, createThreeColumnFrame } from '../shell/ThreeColumnFrame.tsx'
import { FilesStore } from '../features/files/index.ts'
import { INSPECTOR_VIEW_TYPES } from './catalog.ts'
import { useAppDeps } from './context.tsx'
import type { AppDeps } from './context.tsx'
import { KIT } from '../ui/kit.tsx'
import { PanelRight } from '../ui/icons.tsx'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-deepbuddy'

/**
 * Required client services: slot registry, RPC, the two data services, and —
 * since the frame took the presenter over — the theme registry. All five are
 * base-layer rows of any web assembly; optional services ride sub-scopes below
 * so a deployment missing one still gets a UI.
 */
export const inject = ['slots', 'connection', 'sessions', 'workspaces', 'theme']

/**
 * The dock-toggle action in the official session header. The old dock toggle
 * lived in DeepBuddy's retired main-column header; with the official
 * ConversationRoot owning the main column, the toggle rides the official
 * `conversation.session.header.utilities` slot — the header's right-edge
 * cluster, where a panel toggle belongs (the left `actions` cluster crowds
 * the title). It opens the DeepBuddy files/media column (the dock) — the
 * toggle is gated to a started session by the official header only rendering
 * for one, and it yields while the dock is open: the dock column's own
 * close control is then the one panel toggle on screen, not a twin icon
 * one column over.
 */
function DeepBuddyDockToggle(): ReactNode {
  const { layout } = useAppDeps()
  const dock = useLayoutSelection(layout, current => current.state.dock)
  const sessionStarted = useLayoutSelection(layout, current => current.state.sessionStarted)
  if (dock && sessionStarted) return null
  const firstView = INSPECTOR_VIEW_TYPES[0]
  return (
    <KIT.IconButton
      title="打开停靠栏"
      onClick={() => { layout.toggleDock(firstView?.id) }}
    >
      <PanelRight size={15} />
    </KIT.IconButton>
  )
}

/**
 * Mount the distribution as the shell.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The browser `connection` service is reached through `ctx.get`, not a
  // Context member: the cordis Context type carries the HOST connection under
  // that name, and the runtime plugin resolves the browser one the same way.
  const connection = ctx.get('connection') as ConnectionHandle

  // One bundle, one layout store and one data plane per feature per fiber, at
  // PLUGIN scope: the columns and the features below are separate React trees
  // that must share state.
  const dsh = createDsh(ctx, connection)
  const layout = new LayoutStore()
  const presets = new PresetPlane(dsh)
  const files = new FilesStore(dsh)
  const deps: AppDeps = { dsh, layout, presets, files }

  // The DSH-facing services and the layout store's own lifecycle: the
  // `ctx.layout` face, the theme presenter, the stylesheet, the Remote-plane
  // wiring, and the window listeners.
  mountOfficialServices(ctx, dsh, layout)

  // The remaining per-fiber data planes ride the fiber, not a React mount:
  // their state outlives any single entry's tree.
  ctx.effect(() => {
    presets.mount()
    return () => { presets.dispose() }
  }, 'deepbuddy: preset plane')
  ctx.effect(() => {
    files.mount()
    return () => { files.dispose() }
  }, 'deepbuddy: files store')

  // The one session fence. A current-session change drops the shell's tab
  // ledgers (which also remounts the kept-alive view bodies via the fence
  // generation) and each feature's module-level resources. It lives in the
  // assembly because it needs both worlds: the session wire and the catalog.
  ctx.effect(() => {
    let fenced = dsh.sessions.list.getSnapshot().current
    return dsh.sessions.list.subscribe(() => {
      const cur = dsh.sessions.list.getSnapshot().current
      if (cur === fenced) return
      fenced = cur
      layout.fenceTabs()
      for (const view of INSPECTOR_VIEW_TYPES) view.onSessionFence?.()
    })
  }, 'deepbuddy: session fence')

  // ── the containers ────────────────────────────────────────────────────────
  //
  // The root registration re-declares the official frame slots from
  // dsh/adapter.ts. ui-layout and ui-sidebar are disabled (ui-sidebar
  // injected the now-absent layout service), so DeepBuddy's sidebar column is
  // the only sidebar occupant. ui-conversation is ENABLED (wave 8) — DeepBuddy
  // provides its `layout` service, and its ConversationRoot owns the
  // `conversation` seat, so DeepBuddy registers no conversation occupant.

  ctx.effect(
    () => ctx.slots.register({
      name: 'root',
      priority: ROOT_PRIORITY,
      children: FRAME_SLOT_MAP,
    }, createThreeColumnFrame(deps)),
    'deepbuddy: root chrome',
  )

  ctx.effect(
    () => ctx.slots.register({
      name: 'sidebar',
      children: SIDEBAR_SLOT_MAP as unknown as ChildrenDecl,
    }, DeepBuddySidebar as never),
    'deepbuddy: sidebar column',
  )

  // The dock-file-column toggle rides the official session header's
  // right-edge utilities cluster, so it appears only for a started session
  // (the official header renders per-session). It forwards to DeepBuddy's
  // layout store.
  const headerSlot = ctx.slots as unknown as {
    inject(key: string, cb: () => (() => void) | void): () => void
    register(options: { name: string; id: string; order?: number }, comp: () => ReactNode): () => void
  }
  ctx.effect(() =>
    headerSlot.inject('conversation.session.header.utilities', () =>
      headerSlot.register({ name: 'conversation.session.header.utilities', id: 'deepbuddy-dock', order: 30 }, DeepBuddyDockToggle),
    ),
  'deepbuddy: dock toggle header utility')
}
