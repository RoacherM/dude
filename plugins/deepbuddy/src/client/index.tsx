/**
 * Browser half of the deepbuddy plugin — the distribution's layout kernel.
 *
 * Two contracts are assembled here.
 *
 * The OFFICIAL one, inherited from the disabled `ui-layout` row
 * (cordis.patch.yml): the 'root' occupant, the declaration of the four frame
 * child slots, the `ctx.layout` service and the theme presenter. Slot
 * declaration admits exactly one declarer, which is why the takeover is
 * all-or-nothing — and why those four seats are re-declared with the official
 * names, kinds and scopes, and actually rendered (design/LAW.md COMPAT-1). That is
 * what keeps `shell.overlay` (and the official workspace drawer that lands in
 * it) lit.
 *
 * DeepBuddy's OWN one, the `dbdy.*` seats (seats.ts): main view, sidebar nav,
 * sidebar section, dock pane, settings page. Each is declared by the container
 * that renders it — the root chrome declares the two root-level seats it draws
 * itself, the sidebar container declares its two, the main container declares
 * the view seat — because declaring is claiming and the declarer must render.
 *
 * Everything in `occupants/` is TEMPORARY. M1's contract is that the window
 * stays usable while the kernel lands; M2 lifts each occupant into its own
 * package and this file loses the corresponding registration, nothing else.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: ui-layout's Context merge declares `ctx.layout`, and its SlotMap
// merge names the four child slots re-declared below. Erased at build time —
// cross-plugin VALUE imports are a bundle-purity error.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SlotReader } from './frame.ts'
import { LayoutController } from './frame.ts'
import { AppStore } from './store.ts'
import { createChrome } from './Chrome.tsx'
import { createSidebar } from './Sidebar.tsx'
import { createMain } from './Main.tsx'
import { createChatNav, createChatView } from './occupants/Chat.tsx'
import { createSessionsSection } from './occupants/Sessions.tsx'
import { createExplorerPane } from './occupants/Explorer.tsx'
import { createModesPage, createPluginsPage } from './occupants/Settings.tsx'
import type { Dsh } from './dsh.ts'
import { createFilesWire } from './files.ts'
import { createPluginsWire, createPresetsWire } from './presets.ts'
import { installStyles } from './styles.ts'
import { ThemePresenter } from './theme.ts'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-deepbuddy'

/**
 * Required client services: slot registry, RPC, the two data services, and —
 * since the kernel took the presenter over — the theme registry. All five are
 * base-layer rows of any web assembly; optional services ride sub-scopes below
 * so a deployment missing one still gets a UI.
 */
export const inject = ['slots', 'connection', 'sessions', 'workspaces', 'theme']

/**
 * Root rank. The official frame's row is disabled, so nothing contests this
 * slot; -1 keeps DeepBuddy the winner anyway (single slots render the LOWEST
 * priority) if a deployment ever patches `ui-layout` back on.
 */
const ROOT_PRIORITY = -1

/**
 * Shadow rank under the official column occupants' default 0. ui-sidebar and
 * ui-conversation still register; the lowest priority renders, so DeepBuddy's
 * columns win while every service behind the official ones stays alive.
 */
const OCCUPANT_SHADOW_PRIORITY = -1

/** The settings namespace whose document motion the roster follows. */
const PRESET_SETTINGS_NS = 'agent-presets'

/**
 * Mount the layout kernel as the distribution's shell.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The browser `connection` service is reached through `ctx.get`, not a
  // Context member: the cordis Context type carries the HOST connection under
  // that name, and the runtime plugin resolves the browser one the same way.
  const connection = ctx.get('connection') as ConnectionHandle
  const rosterListeners = new Set<() => void>()
  const dsh: Dsh = {
    sessions: ctx.sessions,
    workspaces: ctx.workspaces,
    files: createFilesWire(connection.rpc),
    presets: createPresetsWire(connection.api),
    plugins: null,
    onRosterMoved(handler) {
      rosterListeners.add(handler)
      return () => { rosterListeners.delete(handler) }
    },
  }

  // One controller and one store per fiber, at PLUGIN scope: the containers
  // and the occupants below are separate React trees that must share state.
  const frame = new LayoutController()
  const store = new AppStore(dsh)
  const slots = ctx.slots as unknown as SlotReader

  // `ctx.layout` before the registrations: ui-sidebar injects it, and the
  // official occupants' apply worlds must find a face where ui-layout's used
  // to be. Provided from the plugin body, so it is live before any entry
  // renders — no store to attach, no wiring hook to wait for.
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', frame.layoutFace())
    // provide()'s disposer settles asynchronously; teardown is synchronous
    // fire-and-forget, as in the official plugin.
    return () => { void disposeService() }
  }, 'deepbuddy: layout service')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'deepbuddy: theme presenter')

  ctx.effect(() => installStyles(), 'deepbuddy: styles')

  // Window listeners and the live subscriptions ride the fiber, not a React
  // mount: the state outlives any single entry's tree.
  ctx.effect(() => {
    frame.mount()
    return () => { frame.dispose() }
  }, 'deepbuddy: layout controller')

  ctx.effect(() => {
    store.mount()
    return () => { store.dispose() }
  }, 'deepbuddy: occupant store')

  // The Remote plane rides sub-scopes, never the plugin's own `inject`: a
  // deployment without api-remotes must still get the frame, and gating the
  // root registration on an optional service would leave it with no UI.
  ctx.inject(['remote'], (scope) => {
    scope.effect(() => {
      // Every tab converges on a committed choice, including the one that did
      // not make it — the runtime's own session store is the single record.
      const offSelected = scope.remote.$on('agent-preset/selected', (sessionId, agentPreset) => {
        ctx.sessions.noteAgentPreset(sessionId, agentPreset)
      })
      const offMoved = scope.remote.$on('settings/document-updated', (ns) => {
        if (ns !== PRESET_SETTINGS_NS) return
        for (const handler of rosterListeners) handler()
      })
      return () => { offSelected(); offMoved() }
    }, 'deepbuddy: agent-preset host events')
  })

  ctx.inject(['remote', 'remote.pluginInventory'], (scope) => {
    scope.effect(() => {
      dsh.plugins = createPluginsWire(scope.remote)
      return () => { dsh.plugins = null }
    }, 'deepbuddy: plugin inventory wire')
  })

  // ── the containers ────────────────────────────────────────────────────────
  //
  // Registration order matters: a register() into an undeclared slot throws,
  // so every container lands before the occupants that seat in it.

  ctx.effect(
    () => ctx.slots.register({
      name: 'root',
      priority: ROOT_PRIORITY,
      children: {
        // The official frame contract, re-declared verbatim.
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        // DeepBuddy's two root-level seats — both drawn by the chrome itself,
        // and both open to the application ring.
        'dbdy.dock.pane': { kind: 'list', scope: 'root', inject: frame.dockPaneFace },
        'dbdy.settings.page': { kind: 'list', scope: 'root', inject: frame.seatFace },
      },
    }, createChrome(frame, slots)),
    'deepbuddy: root chrome',
  )

  ctx.effect(
    () => ctx.slots.register({
      name: 'sidebar',
      priority: OCCUPANT_SHADOW_PRIORITY,
      children: {
        'dbdy.sidebar.nav': { kind: 'list', scope: 'root', inject: frame.seatFace },
        'dbdy.sidebar.section': { kind: 'list', scope: 'root', inject: frame.seatFace },
      },
    }, createSidebar(frame, slots)),
    'deepbuddy: sidebar container',
  )

  ctx.effect(
    () => ctx.slots.register({
      name: 'conversation',
      priority: OCCUPANT_SHADOW_PRIORITY,
      children: {
        'dbdy.main.view': { kind: 'list', scope: 'session-maybe', inject: frame.seatFace },
      },
    }, createMain(frame, slots)),
    'deepbuddy: main container',
  )

  // ── temporary in-package occupants (M2 lifts each into its own package) ────

  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.main.view', id: 'chat', order: 10, label: '对话' }, createChatView(store)),
    'deepbuddy: chat view',
  )
  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.sidebar.nav', id: 'chat', order: 10 }, createChatNav(store)),
    'deepbuddy: chat nav row',
  )
  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.sidebar.section', id: 'sessions', order: 10 }, createSessionsSection(store)),
    'deepbuddy: sessions section',
  )
  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.dock.pane', id: 'explorer', order: 10, label: '文件' }, createExplorerPane(store)),
    'deepbuddy: explorer pane',
  )
  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.settings.page', id: 'harness/modes', order: 10, label: '模式' }, createModesPage(store)),
    'deepbuddy: modes settings page',
  )
  ctx.effect(
    () => ctx.slots.register({ name: 'dbdy.settings.page', id: 'harness/plugins', order: 20, label: '插件' }, createPluginsPage(store)),
    'deepbuddy: plugins settings page',
  )
}
