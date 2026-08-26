/**
 * Contract and pure-logic tests for the deepbuddy plugin.
 *
 * The host half's fencing behavior lives in host.test.mjs; here only its
 * registration contract is checked. The client bundle is checked as an
 * artifact (self-registration banner, no stray `@deepseek-ai/` requires
 * beyond the platform table, the retired `dbdy.*` seat contract absent, the
 * static catalogs present). Layout arithmetic is tested against the numbers
 * in the design handoff README.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('host half registers the file service and its three endpoints', async () => {
  const mod = await import(join(root, 'lib/index.js'))
  assert.equal(mod.name, 'deepbuddy')
  assert.deepEqual(mod.inject, ['typert', 'sessions', 'webServer'])

  const provided = []
  const registered = []
  const disposers = []
  const ctx = {
    effect(fn, label) {
      assert.equal(typeof label, 'string', 'every effect is labeled')
      disposers.push(fn())
    },
    provide(key, service) { provided.push([key, service]) },
    get() { return undefined /* no webServer in the contract test */ },
    on() { return () => {} },
    typert: { register(contribution) { registered.push(contribution); return () => {} } },
  }
  mod.apply(ctx, { previewMaxChars: 262_144, previewMaxBytes: 50_102_400 })

  assert.equal(provided.length, 1)
  assert.equal(provided[0][0], 'deepbuddyFiles')
  assert.equal(registered.length, 1)
  assert.deepEqual(
    registered[0].invocations.map(d => `${d.namespace}/${d.method}`),
    ['deepbuddyFiles/readFile', 'deepbuddyFiles/readBinary', 'deepbuddyFiles/listDirectory'],
  )
  // The Gateway invokes descriptor.method on the provided service; a rename
  // on either side would strand the wire.
  for (const d of registered[0].invocations) {
    assert.equal(typeof provided[0][1][d.method], 'function')
  }
})

test('host half owns one session-fenced terminal WebSocket route', async () => {
  const mod = await import(join(root, 'lib/index.js'))
  const routes = []
  const upgrades = []
  const ctx = {
    effect(fn) { fn() },
    provide() {},
    get(key) {
      if (key !== 'webServer') return undefined
      return {
        register(route) { routes.push(route); return () => {} },
        registerUpgrade(route) { upgrades.push(route); return () => {} },
      }
    },
    on() { return () => {} },
    typert: { register() { return () => {} } },
  }
  mod.apply(ctx, { previewMaxChars: 262_144, previewMaxBytes: 50_102_400 })
  assert.deepEqual(routes.map(route => [route.kind, route.path]), [['prefix', '/deepbuddy/media']])
  assert.deepEqual(upgrades.map(route => route.path), ['/deepbuddy/terminal'])
})

test('client bundle self-registers under the package name', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.ok(bundle.startsWith('window.__ModuleLoader__.load({ id: "dsh-plugin-deepbuddy"'))
  assert.doesNotMatch(bundle, /\bmaximized\b/, 'obsolete dock-maximized state is absent')
  // The factory footer sits ahead of esbuild's trailing sourcemap comment.
  const tail = bundle.replace(/\/\/# sourceMappingURL=\S*\s*$/, '').trimEnd()
  assert.ok(tail.endsWith('return module.exports; } });'))
})

test('client bundle keeps only platform modules external', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  const PLATFORM = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-schema-form',
    '@deepseek-ai/dsh-client-runtime/client',
  ])
  for (const [, spec] of bundle.matchAll(/require\("([^"]+)"\)/g)) {
    assert.ok(PLATFORM.has(spec), `non-platform require in client bundle: ${spec}`)
  }
})

test('the bundle patch disables the frame/sidebar rows but enables ui-conversation', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  // R1「换行不改包」: the takeover is disabled rows in our own patch layer,
  // never an edit to @deepseek-ai/dsh-web-app. Slot declaration admits one
  // declarer, so leaving ui-layout on would make the frame re-declaration throw.
  assert.match(patch, /^- id: ui-layout\n {2}disabled: true$/m)
  // ui-sidebar injects `layout`, which lived in the disabled ui-layout row —
  // it can never activate, so it stays disabled; DeepBuddy renders the sidebar.
  assert.match(patch, /^- id: ui-sidebar\n {2}disabled: true$/m)
  // ui-conversation is ENABLED (wave 8): DeepBuddy provides the `layout`
  // service it injects, so the official apply activates and registers the
  // chat-fold definitions. the row must not be disabled.
  assert.match(patch, /^- id: ui-conversation\n {2}name: '@deepseek-ai\/dsh-client-ui-conversation'$/m)
  assert.doesNotMatch(patch, /id: ui-conversation\n {2}disabled: true/)
  // The plugin's own row still rides the same patch.
  assert.match(patch, /- insert:\n {4}- id: deepbuddy\n {6}name: dsh-plugin-deepbuddy/)
})
test('client bundle takes over the frame contract and renders all four seats', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // Resident mount: one root registration, no dual-shell switch machinery.
  assert.match(bundle, /ROOT_PRIORITY = -1;/)
  assert.match(bundle, /name: "root",\s*\n\s*priority: ROOT_PRIORITY,/)
  assert.doesNotMatch(bundle, /deepbuddy:shell/)

  // R2「影子继承合同」: the four child slots re-declared with the official
  // names, kinds and scopes (ui-layout/src/client/index.ts). A drifting kind
  // or scope here silently breaks every ecosystem plugin aiming at the seat.
  assert.match(bundle, /"sidebar": \{ kind: "single", scope: "root" \}/)
  assert.match(bundle, /"conversation": \{ kind: "single", scope: "session-maybe" \}/)
  assert.match(bundle, /"details": \{ kind: "single", scope: "session" \}/)
  assert.match(bundle, /"shell\.overlay": \{ kind: "list", scope: "root" \}/)

  // Declaring is claiming: an open surface that is declared but never rendered
  // is a dead seat. ui-slots enforces this at compile time; this is the
  // shipped-artifact evidence.
  for (const key of ['sidebar', 'conversation', 'details', 'shell\\.overlay']) {
    assert.match(bundle, new RegExp(`renderSlot\\("${key}"`), `frame renders the '${key}' seat`)
  }
  // The overlay layer is click-through, or an empty layer would swallow every
  // click meant for the app underneath.
  assert.match(bundle, /\.dbdy-overlay \{[^}]*pointer-events: none;/)
})

test('client bundle seats its own sidebar and lets the official column own conversation', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-sidebar is a disabled row, so DeepBuddy's sidebar column is the sole
  // occupant of the `sidebar` seat. The `conversation` seat is now owned by
  // the enabled ui-conversation row's `ConversationRoot` (its apply declares
  // the whole conversation slot family) — DeepBuddy no longer registers a
  // `conversation` occupant, only re-declares the frame's four child slots.
  assert.doesNotMatch(bundle, /OCCUPANT_SHADOW_PRIORITY/)
  assert.match(bundle, /name: "sidebar"[\s\S]{0,120}?DeepBuddySidebar/)
  assert.doesNotMatch(bundle, /name: "conversation"[\s\S]{0,200}?DeepBuddyMain/)
})

test('client bundle composes first-party surfaces from the static catalogs', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The dbdy.* seat contract is retired: no seat is declared, injected or
  // rendered — surfaces are thin Definitions in the static arrays.
  assert.doesNotMatch(bundle, /dbdy\./, 'no dbdy.* seat remains in the bundle')
  assert.doesNotMatch(bundle, /seatFace|dockPaneFace|useSeatEntries|SlotReader/, 'no seat-face plumbing remains')
  // The workbench-app catalog is retired with DeepBuddyMain (wave 8), and the
  // sidebar-section catalog with the hand-rolled SessionList (the official
  // WorkspaceBrowser owns the revived `sidebar.workspaces` seat instead). The
  // inspector catalog still composes the shipped surfaces (ARCHITECTURE §3).
  assert.doesNotMatch(bundle, /WORKBENCH_APPS = \[/)
  assert.doesNotMatch(bundle, /SIDEBAR_SECTIONS = \[/)
  assert.doesNotMatch(bundle, /SessionListSectionDefinition/)
  assert.doesNotMatch(bundle, /OverviewViewDefinition|textOfParts|outlineOf\(/)
  assert.match(bundle, /INSPECTOR_VIEW_TYPES = \[\s*\n\s*FilesViewDefinition,\s*\n\s*TerminalViewDefinition,\s*\n\s*BrowserViewDefinition\s*\n\]/)
  // The definitions carry their ids — the catalog is the single composition
  // point the shell renders from. Settings is no longer a workbench app (it
  // is a dialog overlay, wave 4 §5), so it is deliberately absent here.
  assert.match(bundle, /FilesViewDefinition = \{\s*\n\s*id: "explorer",/)
  assert.match(bundle, /TerminalViewDefinition = \{\s*\n\s*id: "terminal",/)
  assert.match(bundle, /BrowserViewDefinition = \{\s*\n\s*id: "browser",/)
  // The workspace region is the official seat, not a first-party section list.
  assert.match(bundle, /renderSlot\("sidebar\.workspaces"/)
  assert.match(bundle, /"sidebar\.workspaces": \{ kind: "single", scope: "root" \}/)
  // The inspector dispatches generically from the catalog — no feature-id
  // branch exists (DEVELOPMENT_RULES §4). `active.Component` (the retired
  // workbench dispatch) is gone.
  assert.doesNotMatch(bundle, /jsx\)\(active\.Component/)
  // Layout sovereignty holds without the seat face: no geometry setter is
  // reachable from a surface. (`\b` matters: the store's own private
  // writeDockWidth / resetDockWidth are not verbs a surface may call.)
  assert.doesNotMatch(bundle, /\bsetDockWidth|\bsetSidebarWidth|\bsetColumnWidth/)
})

test('inspector views and resource tabs use display keep-alive instead of conditional mounts', async () => {
  const shell = await readFile(join(root, 'src/client/shell/ThreeColumnFrame.tsx'), 'utf8')
  const terminal = await readFile(join(root, 'src/client/features/terminal/TerminalView.tsx'), 'utf8')
  const browser = await readFile(join(root, 'src/client/features/browser/BrowserView.tsx'), 'utf8')

  // All registered view components are mapped into the tree together; only
  // their display changes when the segmented control changes.
  assert.match(shell, /views\.map\(view =>/)
  assert.match(shell, /data-inspector-view=\{view\.id\}/)
  assert.match(shell, /display: visible \? 'flex' : 'none'/)
  assert.match(shell, /InspectorViewMount = memo/)
  assert.doesNotMatch(shell, /<active\.Component/)

  // Resource tabs repeat that same keep-alive rule, so an inactive webview or
  // xterm attachment remains mounted rather than becoming a second lifecycle.
  assert.match(terminal, /data-terminal-tab=\{tab\.id\}/)
  assert.match(terminal, /display: tab\.id === active \? 'flex' : 'none'/)
  assert.match(terminal, /if \(visible\) requestAnimationFrame\(\(\) => \{ fitRef\.current\(\) \}\)/)
  assert.match(terminal, /if \(!visibleRef\.current\) return/)
  assert.match(terminal, /new ResizeObserver\(scheduleFitAndResize\)/)
  assert.match(terminal, /\}, 80\)/)
  assert.match(browser, /data-browser-tab=\{tabId\}/)
  assert.match(browser, /display: active \? 'flex' : 'none'/)
  assert.match(browser, /BrowserTabMount = memo/)
  assert.match(browser, /\}, \[webview, tabId\]\)/)
  assert.match(browser, /const browserResources = new Map/)
})

test('layout tab updates suppress no-ops and clear a pane in one notification', async () => {
  const { LayoutStore } = await import(join(root, 'src/client/shell/layout-store.ts'))
  const layout = new LayoutStore()
  let notifications = 0
  const off = layout.subscribe(() => { notifications += 1 })

  layout.openTab('browser', { id: 'browser-1', label: '新标签页' })
  assert.equal(notifications, 1)

  // Title events and active-tab clicks are common hot-path duplicates. They
  // must not repaint every layout subscriber when the ledger is unchanged.
  layout.openTab('browser', { id: 'browser-1', label: '新标签页' })
  layout.focusTab('browser', 'browser-1')
  assert.equal(notifications, 1)

  layout.openTab('browser', { id: 'browser-2', label: '新标签页' })
  layout.focusTab('browser', 'browser-1')
  assert.equal(notifications, 3)

  // A session fence drops the whole Files ledger atomically, rather than
  // closing N tabs and publishing N intermediate states.
  layout.clearTabs('browser')
  assert.equal(notifications, 4)
  assert.deepEqual(layout.state.tabs.browser, { items: [], active: null })
  layout.clearTabs('browser')
  assert.equal(notifications, 4)
  off()
})

test('dock drag captures its pointer, coalesces writes, and terminates every gesture path', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const windowListeners = new Map()
  let nextFrame = null

  globalThis.window = {
    // Wide enough that the gesture's 600–660px range sits INSIDE the drag
    // clamp (30% = 594, a third = 660): this test is about coalescing and
    // termination, and a window where every candidate pinned to the same
    // bound would stop telling the two apart.
    innerWidth: 1980,
    addEventListener(type, listener) { windowListeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (windowListeners.get(type) === listener) windowListeners.delete(type)
    },
    requestAnimationFrame(callback) {
      nextFrame = () => { nextFrame = null; callback() }
      return 1
    },
    cancelAnimationFrame() { nextFrame = null },
  }
  globalThis.document = {
    body: { style: { cursor: '' } },
  }

  try {
    const { LayoutStore } = await import(join(root, 'src/client/shell/layout-store.ts'))
    const beginGesture = (pointerId = 7) => {
      let capturedPointer = null
      let styleWrites = 0
      const handleListeners = new Map()
      // The seam's lit state is a class the gesture owns, so every exit path
      // below is also asserting that the handle does not stay lit.
      const classes = new Set()
      const handle = {
        classList: { add(name) { classes.add(name) }, remove(name) { classes.delete(name) } },
        addEventListener(type, listener) { handleListeners.set(type, listener) },
        removeEventListener(type, listener) {
          if (handleListeners.get(type) === listener) handleListeners.delete(type)
        },
        setPointerCapture(id) { capturedPointer = id },
      }
      const dockStyle = new Proxy({ width: '600px', flex: '0 0 600px', overflow: '' }, {
        set(target, key, value) {
          if (key === 'width' || key === 'flex') styleWrites += 1
          target[key] = value
          return true
        },
      })
      const visibleStyle = { width: '100%', minWidth: '', maxWidth: '', pointerEvents: '' }
      const hiddenStyle = { width: '0px', minWidth: '', maxWidth: '', pointerEvents: 'auto' }
      const layout = new LayoutStore()
      layout.sideRef.current = { style: { width: '268px' } }
      layout.dockRef.current = {
        style: dockStyle,
        getBoundingClientRect() { return { width: 600 } },
        querySelectorAll() {
          return [
            { style: visibleStyle, getBoundingClientRect() { return { width: 584 } } },
            { style: hiddenStyle, getBoundingClientRect() { return { width: 0 } } },
          ]
        },
      }
      let prevented = false
      layout.startDockDrag({
        clientX: 800,
        pointerId,
        currentTarget: handle,
        preventDefault() { prevented = true },
      })
      return {
        capturedPointer,
        classes,
        dockStyle,
        handleListeners,
        hiddenStyle,
        pointerId,
        prevented,
        styleWrites: () => styleWrites,
        visibleStyle,
      }
    }

    const drag = beginGesture()
    assert.equal(drag.prevented, true)
    assert.equal(drag.capturedPointer, drag.pointerId)
    assert.equal(document.body.style.cursor, 'col-resize')
    assert.deepEqual([...drag.classes], ['dragging'], 'the seam lights up for the gesture')
    assert.equal(drag.dockStyle.overflow, 'hidden')
    assert.deepEqual(drag.visibleStyle, {
      width: '584px', minWidth: '584px', maxWidth: '584px', pointerEvents: 'none',
    })
    assert.deepEqual(drag.hiddenStyle, {
      width: '0px', minWidth: '', maxWidth: '', pointerEvents: 'auto',
    }, 'zero-width embeds are not frozen')

    drag.handleListeners.get('pointermove')({ pointerId: 99, clientX: 700 })
    drag.handleListeners.get('pointermove')({ pointerId: 7, clientX: 780 })
    drag.handleListeners.get('pointermove')({ pointerId: 7, clientX: 760 })
    assert.equal(drag.dockStyle.width, '600px', 'pointermove does not write ahead of the frame')
    nextFrame()
    assert.equal(drag.dockStyle.width, '640px', 'the frame applies only the latest matching pointer')
    assert.equal(drag.styleWrites(), 2)

    drag.handleListeners.get('pointermove')({ pointerId: 7, clientX: 1200 })
    nextFrame()
    assert.equal(drag.dockStyle.width, '594px', 'rightward shrink still respects the 30%-of-window floor')
    assert.equal(drag.styleWrites(), 4)
    drag.handleListeners.get('pointermove')({ pointerId: 7, clientX: 1300 })
    nextFrame()
    assert.equal(drag.styleWrites(), 4, 'moves beyond the floor do not repeat identical style writes')

    const staleCancel = drag.handleListeners.get('pointercancel')
    const staleLostCapture = drag.handleListeners.get('lostpointercapture')
    const staleBlur = windowListeners.get('blur')
    drag.handleListeners.get('pointerup')({ pointerId: 7, clientX: 740 })
    assert.equal(drag.dockStyle.width, '660px', 'pointerup flushes the final pointer position')
    assert.equal(document.body.style.cursor, '')
    assert.equal(drag.dockStyle.overflow, '')
    assert.deepEqual(drag.visibleStyle, {
      width: '100%', minWidth: '', maxWidth: '', pointerEvents: '',
    })
    assert.deepEqual([...drag.handleListeners.keys()], [])
    assert.deepEqual([...drag.classes], [], 'the seam goes dark when the gesture ends')
    assert.equal(windowListeners.has('blur'), false)

    drag.visibleStyle.width = 'after-finish'
    staleCancel({ pointerId: 7 })
    staleLostCapture({ pointerId: 7 })
    staleBlur()
    assert.equal(drag.visibleStyle.width, 'after-finish', 'finish and thaw remain idempotent')

    for (const terminalEvent of ['pointercancel', 'lostpointercapture', 'blur']) {
      const ended = beginGesture(11)
      ended.handleListeners.get('pointermove')({ pointerId: 11, clientX: 780 })
      if (terminalEvent === 'blur') windowListeners.get('blur')()
      else ended.handleListeners.get(terminalEvent)({ pointerId: 11 })
      assert.equal(ended.dockStyle.width, '620px', `${terminalEvent} flushes the queued move`)
      assert.equal(ended.dockStyle.overflow, '')
      assert.equal(document.body.style.cursor, '')
      assert.deepEqual([...ended.handleListeners.keys()], [])
      assert.deepEqual([...ended.classes], [], `${terminalEvent} unlights the seam`)
    }
  }
  finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})

test('drag structure uses Pointer Events without a shield and fills the column seam', async () => {
  const layout = await readFile(join(root, 'src/client/shell/layout-store.ts'), 'utf8')
  const column = await readFile(join(root, 'src/client/shell/ColumnFrame.tsx'), 'utf8')
  const tokens = await readFile(join(root, 'src/client/ui/tokens.ts'), 'utf8')

  assert.match(layout, /setPointerCapture\(pointerId\)/)
  assert.match(layout, /addEventListener\('pointercancel', onCancel\)/)
  assert.match(layout, /addEventListener\('lostpointercapture', onLostPointerCapture\)/)
  assert.match(layout, /if \(finished\) return/)
  assert.match(layout, /item\.measuredWidth > 0/)
  assert.doesNotMatch(layout, /deepbuddyResizeShield|ensureResizeShield|addEventListener\('mousemove'|addEventListener\('mouseup'/)
  // The seam rule stays lit for the whole gesture, not just while the pointer
  // is over the 10px strip — added on capture, removed on every exit path.
  assert.match(layout, /handle\.classList\.add\('dragging'\)/)
  assert.match(layout, /handle\.classList\.remove\('dragging'\)/)

  // The handle is the seam: the gap's full width, no negative margins, and no
  // resting rule to preserve — the window ground between the islands is the
  // separator (DESIGN_INTENT §10).
  assert.match(column, /onPointerDown=\{onDown\}/)
  assert.match(column, /className="dbdy-handle"/)
  assert.doesNotMatch(column, /margin: '0 -3\.5px'/)
  assert.match(tokens, /\.dbdy-handle \{[^}]*width: var\(--db-gap\)/s)
  assert.match(tokens, /\.dbdy-handle \{[^}]*cursor: col-resize/s)
  assert.match(tokens, /\.dbdy-handle \{[^}]*touch-action: none/s)
  assert.match(tokens, /\.dbdy-handle::after \{[^}]*background: transparent/s)
  assert.match(tokens, /\.dbdy-handle:hover::after,\s*\n\.dbdy-handle\.dragging::after \{ background: var\(--db-primary\); \}/)
  assert.doesNotMatch(column, /boxShadow/)
})

test('files defer the root request until the visible view asks for it', async () => {
  let listListener = () => {}
  let directoryRequests = 0
  const dsh = {
    sessions: {
      list: {
        subscribe(listener) { listListener = listener; return () => {} },
        getSnapshot() { return { current: 'session-a' } },
      },
    },
    files: {
      async listDirectory() {
        directoryRequests += 1
        return { path: '/workspace', entries: [] }
      },
    },
  }
  const { FilesStore } = await import(join(root, 'src/client/features/files/store.ts'))
  const files = new FilesStore(dsh)
  files.mount()

  assert.equal(directoryRequests, 0, 'session changes alone do not list the workspace')
  listListener()
  assert.equal(directoryRequests, 0, 'duplicate session snapshots remain idle')

  files.ensureRootLoaded()
  files.ensureRootLoaded()
  assert.equal(directoryRequests, 1, 'loading state coalesces duplicate visibility effects')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(files.state.fsRoot, '/workspace')
  files.ensureRootLoaded()
  assert.equal(directoryRequests, 1, 'a loaded root is not fetched again')
  files.dispose()
})

test('performance hot paths subscribe to narrow projections', async () => {
  const app = await readFile(join(root, 'src/client/app/App.tsx'), 'utf8')
  const shell = await readFile(join(root, 'src/client/shell/ThreeColumnFrame.tsx'), 'utf8')
  const terminal = await readFile(join(root, 'src/client/features/terminal/TerminalView.tsx'), 'utf8')
  const browser = await readFile(join(root, 'src/client/features/browser/BrowserView.tsx'), 'utf8')
  const files = await readFile(join(root, 'src/client/features/files/store.ts'), 'utf8')

  assert.doesNotMatch(app, /ConversationStore/)
  assert.match(app, /useLayoutSelection/)
  assert.match(shell, /useLayoutSelection/)
  assert.doesNotMatch(shell, /useLayoutStore/)
  assert.match(terminal, /useSyncExternalStore\(dsh\.sessions\.list\.subscribe/)
  assert.match(browser, /const onLabelRef = useRef\(onLabel\)/)
  const watchSessionBody = files.slice(files.indexOf('private watchSession'), files.indexOf('ensureRootLoaded'))
  assert.doesNotMatch(watchSessionBody, /loadDir/)
})

test('terminal and browser views ship their required interaction paths', async () => {
  const client = await readFile(join(root, 'lib/client.js'), 'utf8')
  const host = await readFile(join(root, 'lib/index.js'), 'utf8')
  const desktop = await readFile(join(root, '../../apps/desktop/main.js'), 'utf8')

  // Terminal: xterm + fit are bundled client-side; the host owns a bounded,
  // session+term keyed PTYs over a native webServer upgrade route.
  assert.match(client, /const terminal = new [\w$]+\(\{\s*\n\s*allowProposedApi: false,/)
  assert.match(client, /const fit = new [\w$]+\(\);\s*\n\s*terminal\.loadAddon\(fit\)/)
  assert.match(client, /new WebSocket\(terminalSocketUrl\(sessionId, termId\)\)/)
  assert.match(client, /new URLSearchParams\(\{ sessionId, termId \}\)/)
  assert.match(client, /data-inspector-tabs/)
  assert.match(client, /data-terminal-tab/)
  assert.match(client, /data-browser-tab/)
  assert.match(client, /type: "resize"/)
  assert.match(client, /type: "kill"/)
  assert.match(host, /spawnPty\(shell, \[\]/)
  assert.match(host, /TERMINAL_SCROLLBACK_BYTES = 64 \* 1024/)
  assert.match(host, /TERMINAL_MAX_PER_SESSION = 6/)
  assert.match(host, /keyOf\(sessionId, termId\)/)
  assert.match(host, /searchParams\.get\("termId"\)/)
  assert.match(host, /terminal-limit-reached: max \$\{TERMINAL_MAX_PER_SESSION\} per session/)
  assert.match(host, /webServer\.registerUpgrade\(/)
  assert.match(host, /ctx\.on\("session\/disposed"/)

  // Browser: desktop gets webview navigation events; web gets iframe plus an
  // explicit refusal/open-external state. Localhost normalization stays HTTP.
  assert.match(client, /"webview"/)
  assert.match(client, /"did-navigate"/)
  assert.match(client, /"did-start-loading"/)
  assert.match(client, /"did-fail-load"/)
  assert.match(client, /"page-title-updated"/)
  assert.match(client, /"iframe"/)
  assert.match(client, /\\u8BE5\\u7AD9\\u70B9\\u62D2\\u7EDD\\u5D4C\\u5165/)
  assert.match(client, /local \? "http" : "https"/)
  assert.match(desktop, /webviewTag: true/)
  // window.open/_blank inside a guest must navigate the same webview, never
  // vanish (the webview default) and never spawn a popup.
  assert.match(desktop, /contents\.getType\(\) !== "webview"|contents\.getType\(\) !== 'webview'/)
  assert.match(desktop, /contents\.setWindowOpenHandler/)
  assert.match(desktop, /void contents\.loadURL\(url\)/)
})

test('conversation folding is the official apply\'s job; DeepBuddy only provides layout', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The chat-fold definitions (conv.chat.order / chat.nodes.get) are registered
  // by the enabled ui-conversation row's `registerConversationNodes`, not by
  // DeepBuddy. DeepBuddy supports that lifecycle by providing the `layout`
  // service the row injects — the one thing ui-layout used to own.
  assert.doesNotMatch(bundle, /conv\.chat\.order/)
  assert.doesNotMatch(bundle, /\bhasChat\b/)
  assert.match(bundle, /reflect\.provide\("layout"/)
  assert.match(bundle, /layoutFace\(\)/)
})

test('the list row is the kit\'s fact, not each surface\'s', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The prototype's navBase: 31px tall, 8px pad, radius 10, 1px between rows.
  // Every rail row in the distribution — nav, sessions, settings pages, tree —
  // takes these; a surface that invented its own would be one disagreeing with
  // the distribution by a few pixels, which is exactly what shipping a kit is
  // supposed to make impossible.
  assert.match(bundle, /ROW_METRICS = \{ height: 31, dense: 26, radius: 10, pad: 8, indent: 20, gutter: 8, gap: 1 \}/)
  // Both row primitives must reach the surfaces through the frozen kit, or a
  // surface has no way to draw a row that matches the sidebar it sits in.
  assert.match(bundle, /KIT = Object\.freeze\(\{[\s\S]{0,400}?Row: RowImpl/)
  assert.match(bundle, /KIT = Object\.freeze\(\{[\s\S]{0,400}?GroupLabel/)
})

test('client bundle provides the layout service the enabled ui-conversation injects', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-conversation is enabled and injects `layout`; ui-layout (the original
  // provider) is disabled, so the adapter provides DeepBuddy's store face.
  assert.match(bundle, /reflect\.provide\("layout"/)
  // Theme projection: without a presenter every --dsw-* consumer in an open
  // seat reads the light base palette forever.
  assert.match(bundle, /theme\.getTheme\(\)/)
  assert.match(bundle, /on\("theme\/change"/)
  assert.match(bundle, /data-ds-dark-theme/)
})

test('client bundle reaches the preset plane without gating the root shadow', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The plugin's own inject list stays the five services the frame cannot do
  // without — `theme` joined them when the frame took the presenter over from
  // the disabled ui-layout row. An assembly with no api-remotes must still get
  // a UI, so everything optional rides a sub-scope instead.
  assert.match(bundle, /inject = \["slots", "connection", "sessions", "workspaces", "theme"\]/)
  // The Remote plane rides sub-scopes instead.
  assert.match(bundle, /inject\(\["remote"\]/)
  assert.match(bundle, /inject\(\["remote", "remote.pluginInventory"\]/)
  // Both host events the roster follows are subscribed.
  assert.match(bundle, /\$on\("agent-preset\/selected"/)
  assert.match(bundle, /\$on\("settings\/document-updated"/)
})

test('the window drag surfaces are exactly the three declared ones', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The shell runs `titleBarStyle: 'hiddenInset'`, so the only thing that
  // moves the window is a declared drag region: a column that forgets one
  // leaves a dead strip the user cannot grab. Two surfaces declare drag:
  // the shared ColumnFrame top bar (the single 52px header line every
  // column draws — the native lights ride it too) and the main column's
  // strip (the official ConversationRoot declares no app-region of its own).
  const drag = bundle.match(/WebkitAppRegion: "drag"/g) ?? []
  assert.equal(drag.length, 2, 'top bar + main-column strip')
  assert.match(bundle, /height: METRICS\.topbar/)
  // Controls sitting inside those rows must opt back out, or they stop
  // answering clicks and drag the window instead.
  assert.match(bundle, /NO_DRAG = \{ WebkitAppRegion: "no-drag" \}/)
  const optOut = bundle.match(/NO_DRAG/g) ?? []
  assert.ok(optOut.length >= 4, `controls opt out of the drag rows: ${optOut.length}`)
})

test('presets: the roster folds to what each surface may offer', async () => {
  // Same trick as the geometry case: dsh/presets.ts is valid JS after type
  // stripping, which node performs natively.
  const p = await import(join(root, 'src/client/dsh/presets.ts'))
  const roster = {
    authorable: true,
    hasDocument: true,
    presets: [
      { id: 'standard', trust: 'system', isDefault: true, name: '标准模式', description: '功能完整。' },
      { id: 'minimal', trust: 'system', isDefault: false, name: '极简模式' },
      { id: 'mine', trust: 'user', isDefault: false },
      { id: 'rotten', trust: 'user', isDefault: false, broken: 'composition failed to load' },
    ],
  }

  // Order is root precedence, not a sort: a picker must not reshuffle it.
  assert.deepEqual(p.selectablePresets(roster).map(x => x.id), ['standard', 'minimal', 'mine'])
  assert.equal(p.defaultPresetId(roster), 'standard')
  assert.equal(p.defaultPresetId({ ...roster, presets: roster.presets.map(x => ({ ...x, isDefault: false })) }), 'standard')
  assert.equal(p.defaultPresetId({ ...roster, presets: [] }), undefined)

  // Label falls back to the id; a published name never becomes a second identity.
  assert.equal(p.presetLabel(roster.presets[0]), '标准模式')
  assert.equal(p.presetLabel(roster.presets[2]), 'mine')

  // Delete is a user-trust control only; shipped installs are not the user's.
  assert.deepEqual(roster.presets.map(p.canRemovePreset), [false, false, true, true])
  assert.equal(p.canAuthorPresets(roster), true)
  assert.equal(p.canAuthorPresets({ ...roster, authorable: false }), false)
  assert.equal(p.canAuthorPresets(null), false)
})

test('presets: switching is offered exactly where the gateway allows it', async () => {
  const p = await import(join(root, 'src/client/dsh/presets.ts'))
  assert.equal(p.canSelectPreset({ blank: true }), true)
  // A started session would answer `agent-preset-locked`.
  assert.equal(p.canSelectPreset({ blank: false }), false)
  assert.equal(p.canSelectPreset(undefined), false)
})

test('presets: the copy id is fenced before it reaches the host', async () => {
  const p = await import(join(root, 'src/client/dsh/presets.ts'))
  const roster = { authorable: true, hasDocument: true, presets: [{ id: 'standard', trust: 'system', isDefault: true }] }
  assert.equal(p.copyIdBlocker('my-mode', roster), undefined)
  assert.equal(p.copyIdBlocker('  my-mode  ', roster), undefined)
  assert.ok(p.copyIdBlocker('', roster))
  assert.ok(p.copyIdBlocker('   ', roster))
  assert.ok(p.copyIdBlocker('My Mode', roster), 'uppercase and spaces are refused')
  assert.ok(p.copyIdBlocker('-leading', roster), 'a leading hyphen is refused')
  assert.ok(p.copyIdBlocker('../escape', roster), 'the id becomes a directory name')
  assert.ok(p.copyIdBlocker('standard', roster), 'an existing id would ask the host to overwrite')
})

test('presets: every inventory phase has a label', async () => {
  const p = await import(join(root, 'src/client/dsh/presets.ts'))
  const labels = ['pending', 'loading', 'active', 'failed', 'unloading', null]
    .map(fiberPhase => p.pluginPhaseLabel({ fiberPhase, enabled: true }))
  assert.deepEqual(labels, ['待加载', '加载中', '已挂载', '挂载失败', '卸载中', '未挂载'])
  // A disabled entry has no fiber at all, which is a different fact.
  assert.equal(p.pluginPhaseLabel({ fiberPhase: null, enabled: false }), '已禁用')
})

test('geometry: the sidebar clamp follows the handoff', async () => {
  // The client sources are TS; shell/geometry.ts is valid JS after type
  // stripping, which node >= 22.6 performs natively, so the arithmetic is
  // exercised directly instead of through the bundle.
  const g = await import(join(root, 'src/client/shell/geometry.ts'))
  // 268 is the handoff's one sidebar width; the drag range brackets it.
  assert.equal(g.SIDEBAR_DEFAULT, 268)
  assert.equal(g.clampSidebar(100), 232)
  assert.equal(g.clampSidebar(268), 268)
  assert.equal(g.clampSidebar(9999), 380)
})

test('geometry: the dock opens at 30% of the window and never passes a third of it', async () => {
  const g = await import(join(root, 'src/client/shell/geometry.ts'))
  // 1440px window, 278px sidebar contribution (268 + its 10px seam). The
  // dock's budget is the window less its own 2×10 padding, the sidebar with
  // its seam, and the dock's own seam: 1440 - 20 - 278 - 10 = 1132.
  assert.equal(g.GAP, 10)
  assert.equal(g.dockDefault(1440, 278), Math.round(1440 * 0.30))
  // Upper bound is the stricter of a third of the WINDOW (480) and what the
  // chat column can survive (1132 - 460 = 672). The third binds.
  assert.equal(g.clampDock(10_000, 1440, 278), 480)
  // Lower bound is the stricter-in-the-other-direction of 30% (432) and the
  // panel's own 416px floor.
  assert.equal(g.clampDock(0, 1440, 278), 432)
  // On a very wide window the 416px floor stops mattering; 30% binds.
  assert.equal(g.clampDock(0, 2560, 0), 768)
  // Ratios are measured against the window, so collapsing the sidebar does
  // NOT widen the cap — it is still a third of 1440.
  assert.equal(g.clampDock(10_000, 1440, 0), 480)
  // Where the third and the 416px floor disagree — a narrow window — the
  // floor wins and the drag range collapses onto it: at 1240 a third is
  // 413.3, so both ends of the range are the floor.
  assert.equal(g.clampDock(10_000, 1240, 278), 416)
  assert.equal(g.clampDock(0, 1240, 278), 416)
})

test('geometry: fitting the split is a shape question, not a veto', async () => {
  const g = await import(join(root, 'src/client/shell/geometry.ts'))
  // The split needs chat's 460 and the dock's 416 inside the gap budget, so
  // it turns over at 416 + 460 + 20 + 278 + 10 = 1184 with the sidebar open.
  assert.equal(g.dockFits(1440, 278), true)
  assert.equal(g.dockFits(1184, 278), true)
  assert.equal(g.dockFits(1183, 278), false)
  assert.equal(g.dockFits(1100, 278), false)
  // Collapsing the sidebar buys back its width and its seam.
  assert.equal(g.dockFits(906, 0), true)
  // canSplitDock adds the design's own floor: under 1100px the window belongs
  // to one column at a time even when the arithmetic would fit.
  assert.equal(g.canSplitDock(1440, 278), true)
  assert.equal(g.canSplitDock(1183, 278), false)
  assert.equal(g.canSplitDock(1000, 0), false)
  assert.equal(g.canSplitDock(1100, 0), true)
})

test('slots: DeepBuddy declares sidebar.settings; the official apply owns conversation.*', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-sidebar is a disabled row, so DeepBuddy re-declares its `sidebar.settings`
  // child seat and renders the official settings registrants, which park on
  // slots.inject until a declarer appears.
  assert.match(bundle, /"sidebar\.settings"\s*:\s*\{ kind: "single", scope: "root" \}/)
  // The conversation input seats (`conversation.input.attachments/plan/model`)
  // are now declared by the enabled ui-conversation row's own apply, not by
  // DeepBuddy — DeepBuddy no longer declares them.
  assert.doesNotMatch(bundle, /"conversation\.input\.attachments"/)
  assert.doesNotMatch(bundle, /"conversation\.input\.plan"/)
  assert.doesNotMatch(bundle, /"conversation\.input\.model"/)
})

test('slots: the sidebar renders the official settings seat and the new-task button', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The official settings root rides the revived sidebar.settings seat; the
  // custom settings dialog is gone entirely.
  assert.match(bundle, /renderSlot\("sidebar\.settings"/)
  assert.doesNotMatch(bundle, /SettingsDialog/)
  assert.doesNotMatch(bundle, /ModelsPage|ModesPage|PluginsPage/)
  // The conversation nav is now a full-width new-task button.
  assert.match(bundle, /\\u65B0\\u5EFA\\u4EFB\\u52A1/)
})

test('slots: DeepBuddy registers its brand into the official hero mark', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The official hero brand mark seat is filled by DeepBuddy at priority -1
  // (the ui-brand-official fish registers at 0). The mark carries the
  // DeepBuddy name. The official hero's brand cell is a fixed 34px grid
  // column and its headline/preview texts are a single-occupant locale NS
  // (ui-conversation owns it), so the DeepBuddy slogan cannot replace the
  // official headline without breaking ui-conversation — the name is the
  // achievable override.
  assert.match(bundle, /name: "conversation\.hero\.brand\.mark"/)
  assert.match(bundle, /priority: -1/)
  assert.match(bundle, /DeepBuddy/)
  // DeepBuddy no longer renders the composer chrome (the official apply does).
  assert.doesNotMatch(bundle, /renderSlot\("conversation\.input\.model", \{ locked \}\)/)
  assert.doesNotMatch(bundle, /ModelChip/)
})
