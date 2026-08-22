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
  assert.deepEqual(mod.inject, ['typert', 'sessions'])

  const provided = []
  const registered = []
  const disposers = []
  const ctx = {
    effect(fn, label) {
      assert.equal(typeof label, 'string', 'every effect is labeled')
      disposers.push(fn())
    },
    provide(key, service) { provided.push([key, service]) },
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

test('the bundle patch disables the official layout row and nothing else', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  // R1「换行不改包」: the takeover is a disabled row in our own patch layer,
  // never an edit to @deepseek-ai/dsh-web-app. Slot declaration admits one
  // declarer, so leaving ui-layout on would make the frame re-declaration throw.
  assert.match(patch, /^- id: ui-layout\n {2}disabled: true$/m)
  // The plugin's own row still rides the same patch.
  assert.match(patch, /- insert:\n {4}- id: deepbuddy\n {6}name: dsh-plugin-deepbuddy/)
  // P4b / P4c, not P4a: the official column plugins keep their rows and their
  // registrations — DeepBuddy outranks them per-slot instead (see below).
  assert.doesNotMatch(patch, /id: ui-sidebar/)
  assert.doesNotMatch(patch, /id: ui-conversation/)
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

test('client bundle seats DeepBuddy\'s own columns as shadow occupants', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // Single slots render the LOWEST priority: the official ui-sidebar /
  // ui-conversation occupants stay registered at the default 0 (their services
  // alive, their surfaces unrendered) — the reserved-surface behavior the
  // charter defines, not a disabled plugin.
  assert.match(bundle, /OCCUPANT_SHADOW_PRIORITY = -1;/)
  assert.match(bundle, /name: "sidebar",\s*\n\s*priority: OCCUPANT_SHADOW_PRIORITY/)
  assert.match(bundle, /name: "conversation",\s*\n\s*priority: OCCUPANT_SHADOW_PRIORITY/)
})

test('client bundle composes first-party surfaces from the static catalogs', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The dbdy.* seat contract is retired: no seat is declared, injected or
  // rendered — surfaces are thin Definitions in three static arrays.
  assert.doesNotMatch(bundle, /dbdy\./, 'no dbdy.* seat remains in the bundle')
  assert.doesNotMatch(bundle, /seatFace|dockPaneFace|useSeatEntries|SlotReader/, 'no seat-face plumbing remains')
  // The catalogs exist and hold the shipped definitions (ARCHITECTURE §3).
  assert.match(bundle, /WORKBENCH_APPS = \[\s*\n\s*ConversationAppDefinition,\s*\n\s*SettingsAppDefinition\s*\n\]/)
  assert.match(bundle, /SIDEBAR_SECTIONS = \[\s*\n\s*SessionListSectionDefinition\s*\n\]/)
  assert.match(bundle, /INSPECTOR_VIEW_TYPES = \[\s*\n\s*FilesViewDefinition\s*\n\]/)
  // The definitions carry their ids — the catalog is the single composition
  // point the shell renders from.
  assert.match(bundle, /SettingsAppDefinition = \{\s*\n\s*id: "settings",/)
  assert.match(bundle, /SessionListSectionDefinition = \{\s*\n\s*id: "sessions",/)
  assert.match(bundle, /FilesViewDefinition = \{\s*\n\s*id: "explorer",/)
  // The shell dispatches components generically from the catalogs — no
  // feature-id branch exists (DEVELOPMENT_RULES §4).
  assert.match(bundle, /jsx\)\(active\.Component/)
  assert.match(bundle, /jsx\)\(section\.Component/)
  // Layout sovereignty holds without the seat face: no geometry setter is
  // reachable from a surface. (`\b` matters: the store's own private
  // writeDockWidth / resetDockWidth are not verbs a surface may call.)
  assert.doesNotMatch(bundle, /\bsetDockWidth|\bsetSidebarWidth|\bsetColumnWidth/)
})

test('conversation renders the shipping chat snapshot, not the legacy nodes projection', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The deprecated legacy `conv.nodes` projection drops running and interrupted
  // assistant steps, so a transcript with streamed-but-unfinalized steps would
  // render blank from it. The story is read from the authoritative `conv.chat`
  // snapshot (order + nodes) the harness's own body uses, with `conv.nodes`
  // only as a fallback when `chat` holds nothing.
  assert.match(bundle, /conv\.chat\.order/)
  assert.match(bundle, /chat\.nodes\.get/)
  assert.match(bundle, /hasChat/)
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

test('client bundle carries the services the disabled layout row used to own', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // ui-sidebar injects `layout`; with ui-layout gone, an unprovided face means
  // the official plugins' apply worlds never resolve.
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

test('every column\'s top bar is one drag region, declared once', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The shell runs `titleBarStyle: 'hiddenInset'`, so the only thing that
  // moves the window is a declared drag region: a column that forgets one
  // leaves a dead strip the user cannot grab. Every column now draws the same
  // ColumnFrame top bar, so there is exactly ONE declaration.
  const drag = bundle.match(/WebkitAppRegion: "drag"/g) ?? []
  assert.equal(drag.length, 1, 'the shared ColumnFrame top bar is the single drag surface')
  assert.match(bundle, /height: METRICS\.topbar/)
  // Controls sitting inside those rows must opt back out, or they stop
  // answering clicks and drag the window instead.
  assert.match(bundle, /NO_DRAG = \{ WebkitAppRegion: "no-drag" \}/)
  const optOut = bundle.match(/NO_DRAG/g) ?? []
  assert.ok(optOut.length >= 6, `controls opt out of the drag rows: ${optOut.length}`)
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

test('geometry: the dock opens at 46% and drags between 30% and 70%', async () => {
  const g = await import(join(root, 'src/client/shell/geometry.ts'))
  // 1440px window, 269px sidebar (268 + its 1px seam).
  assert.equal(g.dockDefault(1440, 269), Math.round(1440 * 0.46))
  // Upper bound is the stricter of 70% (1008) and what the chat column can
  // survive (1440 - 269 - 460 = 711).
  assert.equal(g.clampDock(10_000, 1440, 269), 711)
  // Lower bound is the stricter-in-the-other-direction of 30% (432) and the
  // panel's own 416px floor.
  assert.equal(g.clampDock(0, 1440, 269), 432)
  // On a very wide window the 416px floor stops mattering; 30% binds.
  assert.equal(g.clampDock(0, 2560, 0), 768)
  // Without a sidebar the 70% cap binds: min(1008, 1440 - 460 = 980) = 980.
  assert.equal(g.clampDock(10_000, 1440, 0), 980)
  // The dock is refused rather than opened at an unusable width.
  assert.equal(g.dockFits(1440, 269), true)
  assert.equal(g.dockFits(1100, 269), false)
  assert.equal(g.dockFits(1145, 269), true)
})
