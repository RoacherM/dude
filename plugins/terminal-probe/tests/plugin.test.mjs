/**
 * Contract tests for the terminal-probe plugin.
 *
 * The probe's job is to prove the `shell.overlay` surface is genuinely open,
 * so what is locked here is exactly that: an ordinary additive registration,
 * a hand-written Remote descriptor, and a client bundle that obeys the same
 * loader rules every other plugin does.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('host half publishes exactly one Remote endpoint', async () => {
  const mod = await import(join(root, 'lib/index.js'))
  assert.equal(mod.name, 'terminal-probe')
  assert.equal(mod.SERVICE_KEY, 'terminalProbe')
  assert.equal(mod.DESCRIPTORS.length, 1)
  const [exec] = mod.DESCRIPTORS
  assert.equal(exec.namespace, 'terminalProbe')
  assert.equal(exec.method, 'exec')
  // The Gateway routes `<namespace>/<method>`; the client wire spells the same
  // string, and a drift between them is a silent 'invocation-unavailable'.
  assert.equal(exec.service, mod.SERVICE_KEY)
  // `shell` is NOT injected: a missing executor is a per-request refusal, so
  // the surface stays mounted on an assembly that composes no shell.
  assert.deepEqual(mod.inject, ['typert'])
})

test('the service carries the binding the Gateway validates', async () => {
  const mod = await import(join(root, 'lib/index.js'))
  // Without a visible `typertRemote` naming this instance, dispatch fails with
  // `binding-invalid` at call time — a runtime-only failure a descriptor test
  // cannot see (api/gateway/src/index.ts, validateBinding).
  const seen = []
  mod.apply({
    effect: (run) => { seen.push(run()) },
    provide: (key, service) => { seen.push({ key, service }); return () => {} },
    typert: { register: () => () => {} },
    get: () => undefined,
  })
  const provided = seen.find(x => x && x.key === 'terminalProbe')
  assert.ok(provided, 'the service is provided under its service key')
  assert.equal(provided.service.typertRemote.serviceKey, 'terminalProbe')
  assert.equal(provided.service.typertRemote.namespace, 'terminalProbe')
  assert.equal(provided.service.typertRemote.service, provided.service)
})

test('client bundle enters through the open surface, additively', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.ok(bundle.startsWith('window.__ModuleLoader__.load({ id: "dsh-plugin-terminal-probe"'))
  // `inject` then `register`: the seat may be declared after this plugin's
  // apply runs, and a bare register would miss a frame that arrives later.
  assert.match(bundle, /slots\.inject\("shell\.overlay"/)
  assert.match(bundle, /ENTRY_ID = "terminal-probe";/)
  assert.match(bundle, /name: "shell\.overlay", id: ENTRY_ID, order: ENTRY_ORDER/)
  // A list-slot id is ADDED beside the shipped entries. Registering into a
  // single slot (or into 'root') would replace the frame instead.
  assert.doesNotMatch(bundle, /name: "root"/)
  assert.match(bundle, /terminalProbe\/exec/)
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

test('the panel styles itself from alias tokens, not literals', async () => {
  const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')
  // The distribution's token bridge is what keeps an ecosystem surface from
  // looking foreign; a probe hard-coding its palette would prove nothing.
  for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-border-l1', '--dsw-alias-label-primary']) {
    assert.match(bundle, new RegExp(token.replace(/-/g, '\\-')))
  }
})
