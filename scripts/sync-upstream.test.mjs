import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readUpstream, smokeChecks } from './sync-upstream.mjs'

function withMockNpm(responses, check) {
  const dir = mkdtempSync(join(tmpdir(), 'dude-sync-npm-'))
  const path = process.env.PATH
  try {
    writeFileSync(join(dir, 'npm'), `#!${process.execPath}
const responses = ${JSON.stringify(responses)}
const response = responses[process.argv[4]]
if (!response) throw new Error('Unexpected npm arguments: ' + process.argv.slice(2).join(' '))
process.stdout.write(response.stdout ?? '')
process.stderr.write(response.stderr ?? '')
process.exitCode = response.code ?? 0
`, { mode: 0o755 })
    process.env.PATH = `${dir}:${path ?? ''}`
    check()
  } finally {
    if (path === undefined) delete process.env.PATH
    else process.env.PATH = path
    rmSync(dir, { recursive: true, force: true })
  }
}

test('registry JSON ignores npm warnings on stderr for versions and dist-tags', () => {
  const warning = 'npm warn Unknown env config "http-proxy".\n'
  withMockNpm({
    versions: { stdout: '["0.1.7", "0.1.8-rc.1"]\n', stderr: warning },
    'dist-tags': { stdout: '{"latest":"0.1.7","next":"0.1.8-rc.1"}\n', stderr: warning },
  }, () => {
    assert.deepEqual(readUpstream(), {
      latest: '0.1.8-rc.1',
      all: ['0.1.7', '0.1.8-rc.1'],
      distTags: { latest: '0.1.7', next: '0.1.8-rc.1' },
    })
  })
})

for (const failedQuery of ['versions', 'dist-tags']) {
  test(`registry ${failedQuery} failures retain stdout and stderr diagnostics`, () => {
    const responses = { versions: { stdout: '["0.1.7"]\n' } }
    responses[failedQuery] = { code: 1, stdout: 'registry response detail\n', stderr: 'npm error EAI_AGAIN\n' }
    withMockNpm(responses, () => {
      assert.throws(readUpstream, (error) => {
        assert.match(error.message, /npm view @deepseek-ai\/dsh.*failed:/)
        assert.match(error.message, /registry response detail\nnpm error EAI_AGAIN/)
        return true
      })
    })
  })
}

const bundlePath = '/plugins/??dsh-plugin-dude/client.js&rev=8db969d852fd'
const banner = 'window.__ModuleLoader__.load({ id: "dsh-plugin-dude"'

async function smokeFixture(t, { entryUrl, bundleStatus = 200, bundleBody = banner }) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ url: req.url, cookie: req.headers.cookie })
    if (req.url === '/') {
      const entry = { id: 'dsh-plugin-dude', url: entryUrl(base) }
      res.end(`<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify({ entries: [entry] })}</script>`)
    } else if (req.url === '/api/agentPresets/list') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ result: { ok: true, value: {
        presets: ['standard', 'ptc', 'minimal', 'cordis'].map(id => ({ id })),
      } } }))
    } else if (req.url === bundlePath || req.url === bundlePath.split('&')[0]) {
      res.writeHead(bundleStatus)
      res.end(bundleBody)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  return { checks: await smokeChecks(base, 'trust=fixture'), requests }
}

for (const [name, entryUrl, expected] of [
  ['document-relative URL with revision', () => bundlePath.slice(1), bundlePath],
  ['dot-relative URL', () => `.${bundlePath}`, bundlePath],
  ['root-relative URL with revision', () => bundlePath, bundlePath],
  ['absolute URL', base => `${base}${bundlePath}`, bundlePath],
  ['missing URL fallback', () => undefined, bundlePath.split('&')[0]],
]) {
  test(`smoke fetches ${name}`, async t => {
    const { checks, requests } = await smokeFixture(t, { entryUrl })
    assert.equal(checks.length, 3)
    assert.deepEqual(checks.map(check => check.verdict), ['PASS', 'PASS', 'PASS'])
    assert.deepEqual(requests.find(req => req.url === expected), {
      url: expected, cookie: 'trust=fixture',
    })
  })
}

for (const [name, options] of [
  ['bundle HTTP error', { bundleStatus: 404 }],
  ['missing ModuleLoader banner', { bundleBody: 'not a module' }],
]) {
  test(`smoke still rejects ${name}`, async t => {
    const { checks } = await smokeFixture(t, { entryUrl: () => bundlePath.slice(1), ...options })
    assert.equal(checks[0].verdict, 'FAIL')
    assert.deepEqual(checks.slice(1).map(check => check.verdict), ['PASS', 'PASS'])
  })
}
