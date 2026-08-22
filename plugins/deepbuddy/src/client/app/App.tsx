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
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createDsh, FRAME_SLOT_MAP, mountOfficialServices, OCCUPANT_SHADOW_PRIORITY, ROOT_PRIORITY } from '../dsh/adapter.ts'
import { PresetPlane } from '../dsh/presets.ts'
import { LayoutStore } from '../shell/layout-store.ts'
import { DeepBuddyMain, DeepBuddySidebar, createThreeColumnFrame } from '../shell/ThreeColumnFrame.tsx'
import { ConversationStore } from '../features/conversation/index.ts'
import { FilesStore } from '../features/files/index.ts'
import { SettingsStore } from '../features/settings/index.ts'
import type { AppDeps } from './context.tsx'

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
  const conversation = new ConversationStore(dsh)
  const files = new FilesStore(dsh)
  const settings = new SettingsStore(dsh, presets)
  const deps: AppDeps = { dsh, layout, presets, conversation, files, settings }

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
    conversation.mount()
    return () => { conversation.dispose() }
  }, 'deepbuddy: conversation store')
  ctx.effect(() => {
    files.mount()
    return () => { files.dispose() }
  }, 'deepbuddy: files store')

  // ── the containers ────────────────────────────────────────────────────────
  //
  // The root registration re-declares the official frame slots from
  // dsh/adapter.ts; the sidebar and main columns shadow the official
  // occupants per-slot (lowest priority renders) so every service behind the
  // official surfaces stays alive.

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
      priority: OCCUPANT_SHADOW_PRIORITY,
    }, DeepBuddySidebar),
    'deepbuddy: sidebar column',
  )

  ctx.effect(
    () => ctx.slots.register({
      name: 'conversation',
      priority: OCCUPANT_SHADOW_PRIORITY,
    }, DeepBuddyMain),
    'deepbuddy: main column',
  )
}
