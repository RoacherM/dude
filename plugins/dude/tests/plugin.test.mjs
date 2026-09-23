/**
 * Contract tests for the dude plugin. The client bundle is checked as
 * an artifact: self-registration, no stray `@deepseek-ai/` requires beyond
 * the platform table, the official frame left alone, the drag surfaces and
 * the hero mark present, and the removed inspector features absent.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('client bundle self-registers under the package name', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.ok(bundle.startsWith('window.__ModuleLoader__.load({ id: "dsh-plugin-dude"'))
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
  ])
  for (const [, spec] of bundle.matchAll(/require\("([^"]+)"\)/g)) {
    assert.ok(PLATFORM.has(spec), `non-platform require in client bundle: ${spec}`)
  }
})

test('the bundle patch only inserts the dude row', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  // Restating, disabling or replacing an official row would make every
  // upstream layout change Dude's problem. The official rows stay as shipped.
  const rows = patch.split('\n').filter(line => line.trim() !== '' && !line.startsWith('#'))
  assert.deepEqual(rows, ['- insert:', '    - id: dude', '      name: dsh-plugin-dude'])
})

test('client bundle does not redeclare the official frame', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.doesNotMatch(bundle, /name: "root"/)
  assert.doesNotMatch(bundle, /DeepBuddySidebar/)
  assert.doesNotMatch(bundle, /deepbuddy:shell/)
  // Terminal and browser are not a second sidebar. The official columns
  // are the only sidebars, and the title bar is what moves the window.
  assert.doesNotMatch(bundle, /deepbuddy\.inspector/)
  assert.doesNotMatch(bundle, /deepbuddy-inspector/)
  assert.match(bundle, /padding-top: 36px/)
  assert.match(bundle, /-webkit-app-region: drag/)
})

test('client bundle lets the official columns own sidebar and conversation', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.doesNotMatch(bundle, /OCCUPANT_SHADOW_PRIORITY/)
  assert.doesNotMatch(bundle, /name: "sidebar"[,}]/)
  assert.doesNotMatch(bundle, /name: "main"[,}]/)
  assert.doesNotMatch(bundle, /reflect\.provide\("layout"\)/)
})

test('conversation folding is the official apply\'s job; Dude does not stub layout', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The chat-fold definitions (conv.chat.order / chat.nodes.get) are registered
  // by the enabled ui-conversation row. Official ui-layout provides `layout`.
  // A second provider here is the stub that deadlocked boot on the 0.1.5 bump.
  assert.doesNotMatch(bundle, /conv\.chat\.order/)
  assert.doesNotMatch(bundle, /\bhasChat\b/)
  assert.doesNotMatch(bundle, /reflect\.provide\("layout"\)/)
  assert.doesNotMatch(bundle, /layoutFace\(\)/)
})

test('client bundle follows the official theme and does not present a second one', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // Official ui-layout owns the theme. Dude does not install a second
  // presenter.
  assert.doesNotMatch(bundle, /theme\.getTheme\(\)/)
  assert.doesNotMatch(bundle, /on\("theme\/change"/)
})

test('the window drag surface does not cover official controls', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // Drag lives on the sidebar column and the conversation header. Buttons
  // inside those elements opt out. There is no full-window drag overlay.
  assert.match(bundle, /\$\{IDLE\} header:has\(\[data-conversation-header-corner\]\) \{\s*-webkit-app-region: drag;/)
  assert.match(bundle, /-webkit-app-region: drag;/)
  assert.doesNotMatch(bundle, /WebkitAppRegion: "drag"/)
  assert.match(bundle, /\[role="treeitem"\]/)
  // Right sidebar fullscreen covers the conversation, not an open sidebar.
  // With the sidebar collapsed it covers the window and its tab strip clears
  // the traffic lights. The strip keeps its official row either way.
  assert.match(bundle, /anchor-name: --db-sidebar;/)
  assert.match(bundle, /:not\(\[data-sidebar-collapsed\]\) > \[data-rightbar-col\] \[data-sidebar-right-panel\]\[data-sidebar-right-panel="fullscreen"\] \{\s*left: anchor\(--db-sidebar right\);\s*max-width: calc\(100vw - anchor-size\(--db-sidebar width\)\);/)
  // The strip keeps its official height in both modes, so icons stay put.
  assert.doesNotMatch(bundle, /\[data-dockkit-strip\] \{ padding-top/)
  assert.match(bundle, /\[data-sidebar-collapsed\] \[data-sidebar-right-panel="fullscreen"\] \[data-dockkit-pane\]:not\(\[data-dockkit-cell\]:not\(:first-child\) \*\) \[data-dockkit-strip\] \{\s*padding-left: 80px;/)
  assert.doesNotMatch(bundle, /\[data-rightbar-fullscreen\] \[data-sidebar-right-panel\]/)
  assert.match(bundle, /\[data-sidebar-collapsed\]:has\(\[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\]\) > div:first-of-type \{\s*-webkit-app-region: no-drag;/)
  assert.match(bundle, /\[data-rightbar-fullscreen\] header:has\(\[data-conversation-header-corner\]\) \{\s*-webkit-app-region: no-drag;/)
  assert.match(bundle, /-webkit-app-region: no-drag/)
})

test('every drag surface stands down while a modal dialog is open', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The official Settings overlay sits inside the sidebar column, and later
  // drag rects win over its no-drag in Electron. A drag rule without the
  // guard makes Settings unclickable.
  assert.match(bundle, /var IDLE = ':where\(html:not\(:has\(\[aria-modal="true"\]\)\)\)'/)
  const css = /var CSS = `([\s\S]*?)`/.exec(bundle)[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll('${IDLE}', 'IDLE')
  const dragSelectors = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /-webkit-app-region:\s*drag\b/.test(body))
    .map(([, selector]) => selector.trim())
  assert.equal(dragSelectors.length, 4)
  for (const selector of dragSelectors) {
    assert.ok(selector.startsWith('IDLE ') && !selector.includes(','), `unguarded drag surface: ${selector}`)
  }
})

test('slots: official sidebar and conversation own their seats', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-sidebar declares settings, the footer and the workspace browser.
  // Dude must not declare them again.
  assert.doesNotMatch(bundle, /"sidebar\.settings"\s*:\s*\{ kind: "single", scope: "root" \}/)
  assert.doesNotMatch(bundle, /"conversation\.input\.attachments"/)
  assert.doesNotMatch(bundle, /"conversation\.input\.plan"/)
  assert.doesNotMatch(bundle, /"conversation\.input\.model"/)
})

test('slots: no second sidebar and no hand-rolled new-task button', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.doesNotMatch(bundle, /renderSlot\("sidebar\.settings"/)
  assert.doesNotMatch(bundle, /SettingsDialog/)
  assert.doesNotMatch(bundle, /ModelsPage|ModesPage|PluginsPage/)
  assert.doesNotMatch(bundle, /\\u65B0\\u5EFA\\u4EFB\\u52A1/)
  assert.doesNotMatch(bundle, /deepbuddy\.inspector/)
  assert.doesNotMatch(bundle, /\\u6253\\u5F00\\u68C0\\u67E5\\u5668/)
})

test('slots: Dude registers its brand into the official hero mark', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The official hero brand mark seat is filled by Dude at priority -1
  // (the ui-brand-official fish registers at 0). The mark carries the
  // Dude name. The official hero's brand cell is a fixed 34px grid
  // column and its headline/preview texts are a single-occupant locale NS
  // (ui-conversation owns it), so the Dude slogan cannot replace the
  // official headline without breaking ui-conversation — the name is the
  // achievable override.
  assert.match(bundle, /name: "conversation\.hero\.brand\.mark"/)
  assert.match(bundle, /priority: -1/)
  assert.match(bundle, /"aria-label": "Dude"/)
  // The mark is Dude's own fish, not the official whale path.
  assert.doesNotMatch(bundle, /M22\.9168 1\.43018/)
  // Dude no longer renders the composer chrome (the official apply does).
  assert.doesNotMatch(bundle, /renderSlot\("conversation\.input\.model", \{ locked \}\)/)
  assert.doesNotMatch(bundle, /ModelChip/)
})

test('the removed inspector features and their host half are gone', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // Terminal, Browser and Files left with Dude's own right column; the
  // official right sidebar is the only one.
  assert.doesNotMatch(bundle, /xterm/i)
  // The Archivo typeface never applied over the official styles and left.
  assert.doesNotMatch(bundle, /Archivo|font\/woff2|--dsw-font-family/)
  assert.doesNotMatch(bundle, /deepbuddyFiles/)
  assert.doesNotMatch(bundle, /\/deepbuddy\/terminal/)
  assert.match(bundle, /inject = \["slots"\]/)
  const host = await readFile(join(root, 'lib/index.js'), 'utf8')
  assert.doesNotMatch(host, /node-pty|WebSocketServer|typert/)
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies, undefined)
})
