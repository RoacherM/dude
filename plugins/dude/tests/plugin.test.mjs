/**
 * Contract tests for the dude plugin. The client bundle is checked as
 * an artifact: self-registration, no stray `@deepseek-ai/` requires beyond
 * the platform table, the official frame and hero left alone, no drag
 * surfaces (the shell uses the system title bar), and the removed inspector
 * features absent.
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
  // are the only sidebars, and the system title bar is what moves the window.
  assert.doesNotMatch(bundle, /deepbuddy\.inspector/)
  assert.doesNotMatch(bundle, /deepbuddy-inspector/)
  // Drag rects in the page override official no-drag controls (Electron
  // collects them viewport-wide), and upstream DOM changes silently broke them.
  assert.doesNotMatch(bundle, /app-region/)
  assert.doesNotMatch(bundle, /<style|createElement\("style"\)/)
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

test('the official hero brand mark stays the official whale', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-brand-official fills `conversation.hero.brand.mark`. Dude registers
  // nothing into any slot, so the hero is exactly the official one.
  assert.doesNotMatch(bundle, /conversation\.hero\.brand\.mark/)
  assert.doesNotMatch(bundle, /slots\.register|slots\.inject/)
  assert.doesNotMatch(bundle, /hero-fish|DudeBrandMark/)
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
  assert.doesNotMatch(bundle, /inject = /)
  const host = await readFile(join(root, 'lib/index.js'), 'utf8')
  assert.doesNotMatch(host, /node-pty|WebSocketServer|typert/)
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies, undefined)
})

test('the host half tells the desktop shell whether tasks are running', async () => {
  const { apply } = await import(join(root, 'lib/index.js'))
  const idle = { status: 'idle', id: 'a1', inbox: { nextTurn: [], nextStep: [] } }
  const scenarios = [
    { name: 'nothing running', agents: [idle], jobs: {}, active: false },
    { name: 'an agent generating', agents: [{ ...idle, status: 'running' }], jobs: {}, active: true },
    { name: 'a queued message', agents: [{ ...idle, inbox: { nextTurn: ['hi'], nextStep: [] } }], jobs: {}, active: true },
    { name: "an agent's job stopping", agents: [idle], jobs: { a1: [{ status: 'stopping' }] }, active: true },
    { name: 'a global job running', agents: [], jobs: { global: [{ status: 'running' }] }, active: true },
  ]
  const originalSend = process.send
  const replies = []
  process.send = (message) => replies.push(message)
  try {
    for (const scenario of scenarios) {
      const disposers = []
      apply({
        effect: (install) => disposers.push(install()),
        get: (name) => (name === 'agents'
          ? { list: () => scenario.agents }
          : { list: (owner) => scenario.jobs[owner ?? 'global'] ?? [] }),
      })
      process.emit('message', { type: 'update-tasks', requestId: 1 })
      for (const dispose of disposers) dispose()
      assert.deepEqual(replies.pop(), { type: 'update-tasks', requestId: 1, active: scenario.active }, scenario.name)
    }

    const disposers = []
    apply({ effect: (install) => disposers.push(install()), get: () => undefined })
    process.emit('message', { type: 'update-tasks', requestId: 2 })
    assert.equal(replies.pop().error, 'agents or jobs service is unavailable')
    for (const dispose of disposers) dispose()
    process.emit('message', { type: 'update-tasks', requestId: 3 })
    assert.equal(replies.length, 0, 'unloading the plugin removes the listener')
  } finally {
    process.send = originalSend
  }
})
