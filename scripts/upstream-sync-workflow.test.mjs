import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/upstream-sync.yml', import.meta.url), 'utf8')

function step(name) {
  const block = workflow.split(/^      - name: /m).find((part) => part.startsWith(`${name}\n`))
  assert.ok(block, `workflow step exists: ${name}`)
  return block
}

// Run the actual workflow shell rather than a second implementation of its logic.
function script(name) {
  const lines = step(name).split('\n')
  const start = lines.indexOf('        run: |')
  assert.notEqual(start, -1, `workflow step has a shell script: ${name}`)
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith('          ')) break
    body.push(line.slice(10))
  }
  return body.join('\n')
}

function setup(t, labelState, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dude-sync-label-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    GH_REPO: 'example/dude',
    GITHUB_OUTPUT: join(dir, 'output'),
    RUNNER_TEMP: dir,
    REPORT: '# Sync failed\n\nContract failure with `details`.',
    GH_MOCK_LOG: join(dir, 'calls.jsonl'),
    GH_MOCK_LABEL_STATE: labelState,
    GH_MOCK_CREATE_FAILED: '',
    GH_MOCK_EDIT_FAILED: '',
    ...overrides,
  }
  writeFileSync(join(dir, 'gh'), `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs')
const args = process.argv.slice(2)
const call = { args }
if (args[0] === 'issue' && args[1] === 'create') {
  call.body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8')
}
appendFileSync(process.env.GH_MOCK_LOG, JSON.stringify(call) + '\\n')
if (args[0] === 'api') process.exit(process.env.GH_MOCK_LABEL_STATE === 'existing' ? 0 : 1)
if (args[0] === 'label' && args[1] === 'create') {
  process.exit(process.env.GH_MOCK_LABEL_STATE === 'missing' ? 0 : 1)
}
if (args[0] === 'issue' && args[1] === 'create') {
  if (process.env.GH_MOCK_CREATE_FAILED) process.exit(1)
  console.log('https://github.com/example/dude/issues/42')
  process.exit(0)
}
if (args[0] === 'issue' && args[1] === 'edit') process.exit(process.env.GH_MOCK_EDIT_FAILED ? 1 : 0)
console.error('Unexpected gh call: ' + JSON.stringify(args))
process.exit(2)
`, { mode: 0o755 })
  const run = (name) => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script(name)], {
    env, encoding: 'utf8',
  })
  return {
    env,
    prepare() {
      const result = run('准备 upstream-sync 标签')
      assert.equal(result.status, 0, result.stderr)
      const output = readFileSync(env.GITHUB_OUTPUT, 'utf8').match(/^name=(.*)$/m)
      assert.ok(output, 'label output is always published')
      env.SYNC_LABEL = output[1]
      return result
    },
    notify: () => run('红了 → 开 issue'),
    calls: () => readFileSync(env.GH_MOCK_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
  }
}

test('workflow keeps existing permissions and passes the prepared label to the PR action', () => {
  assert.equal(workflow.match(/^permissions:\n((?:  .+\n)+)/m)?.[1],
    '  contents: write\n  pull-requests: write\n  issues: write\n')
  assert.match(step('绿了 → 开 bump PR'), /^          labels: \$\{\{ steps\.sync-label\.outputs\.name \}\}$/m)
  assert.match(step('红了 → 开 issue'), /^          SYNC_LABEL: \$\{\{ steps\.sync-label\.outputs\.name \}\}$/m)
  assert.match(step('准备 upstream-sync 标签'), /^        if: steps\.check\.outputs\.behind == 'true'$/m)
  assert.match(step('同步脚本回归测试'), /^        run: node --test scripts\/\*\.test\.mjs$/m)
})

for (const labelState of ['existing', 'missing', 'unavailable']) {
  test(`failure notification works when the label is ${labelState}`, (t) => {
    const fixture = setup(t, labelState)
    const preparation = fixture.prepare()
    const expectedLabel = labelState === 'unavailable' ? '' : 'upstream-sync'
    assert.equal(fixture.env.SYNC_LABEL, expectedLabel)
    if (!expectedLabel) assert.match(preparation.stdout, /::warning::.*continuing without it/)

    const notification = fixture.notify()
    assert.equal(notification.status, 0, notification.stderr)
    assert.match(notification.stdout, /https:\/\/github\.com\/example\/dude\/issues\/42/)
    const calls = fixture.calls()
    assert.deepEqual(calls[0].args, ['api', 'repos/example/dude/labels/upstream-sync'])
    const creations = calls.filter(({ args }) => args[0] === 'label')
    assert.equal(creations.length, labelState === 'existing' ? 0 : 1)
    if (creations.length) {
      assert.deepEqual(creations[0].args.slice(0, 5), ['label', 'create', 'upstream-sync', '--repo', 'example/dude'])
      assert.ok(!creations[0].args.includes('--force'), 'existing label metadata is not overwritten')
    }
    const issues = calls.filter(({ args }) => args[0] === 'issue' && args[1] === 'create')
    assert.equal(issues.length, 1)
    assert.ok(!issues[0].args.includes('--label'), 'issue creation must never depend on a label')
    assert.ok(issues[0].body.includes(fixture.env.REPORT), 'notification preserves the failure report')
    const edits = calls.filter(({ args }) => args[0] === 'issue' && args[1] === 'edit')
    assert.equal(edits.length, expectedLabel ? 1 : 0)
    if (edits.length) {
      assert.deepEqual(edits[0].args, ['issue', 'edit', 'https://github.com/example/dude/issues/42',
        '--repo', 'example/dude', '--add-label', 'upstream-sync'])
    }
  })
}

test('a label disappearing after preparation cannot suppress or duplicate the failure issue', (t) => {
  const fixture = setup(t, 'existing', { GH_MOCK_EDIT_FAILED: '1' })
  fixture.prepare()
  const notification = fixture.notify()
  assert.equal(notification.status, 0, notification.stderr)
  assert.match(notification.stdout, /::warning::Failure issue created/)
  assert.equal(fixture.calls().filter(({ args }) => args[0] === 'issue' && args[1] === 'create').length, 1)
})

test('issue creation errors remain visible and do not attempt labeling', (t) => {
  const fixture = setup(t, 'existing', { GH_MOCK_CREATE_FAILED: '1' })
  fixture.prepare()
  const notification = fixture.notify()
  assert.equal(notification.status, 1)
  assert.equal(fixture.calls().filter(({ args }) => args[0] === 'issue' && args[1] === 'edit').length, 0)
})
