#!/usr/bin/env node
/**
 * Upstream sync for the Dude distribution.
 *
 * Dude is "the best distribution of the DeepSeek Harness: every official
 * capability, a curated UI, curated plugins". The official packages are never
 * patched, so an upgrade is exactly three moves — bump the pinned versions, run
 * the contract tests, smoke the assembled profile — and any incompatibility the
 * bump exposes is fixed in this repo's own plugin layer, never upstream.
 *
 * Three modes, one per flag:
 *
 *   --check   compare the npm registry against the versions this repo pins.
 *             exit 0 when already current, exit 1 when a newer release exists.
 *   --apply   short-circuit when current; otherwise bump every pinned
 *             `@deepseek-ai/*` dependency across `plugins/*`, install, run the
 *             build gates, and finish with --smoke. Any failure restores the
 *             manifests and the lockfile byte-for-byte and exits 1.
 *   --smoke   boot a throwaway `dsh --profile dude` on its own port and
 *             assert the three facts that make the distribution a distribution.
 *
 * Every mode appends its result to `reports/upstream-sync/<date>.md` and prints
 * that path. Only Node built-ins are used; there is no dependency to install
 * before the tool that manages dependencies can run.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

/** The harness release: the CLI and runtime the distribution ships. */
const ANCHOR = '@deepseek-ai/dsh'

/** The root manifest pins the anchor; the packaged app installs that version. */
const LOCK_MANIFEST = join(REPO, 'package.json')

/** The plugin's own `@deepseek-ai/*` pins must match the anchor. */
const PLUGIN_MANIFEST = join(REPO, 'plugins', 'dude', 'package.json')

/** Dude's isolated harness home; smoke must never touch the official ~/.dsh. */
const DUDE_HOME = join(homedir(), '.dude')

/** Port for the throwaway smoke server — never 3081, which is the dev server. */
const SMOKE_PORT = Number(process.env.SMOKE_PORT ?? 3082)

/** Profile the distribution is assembled into. */
const PROFILE = process.env.DSH_PROFILE ?? 'dude'

/** Seconds to wait for the smoke server to answer its first request. */
const BOOT_TIMEOUT_MS = 30_000

/** The four presets a stock install must offer. */
const BUILTIN_PRESETS = ['standard', 'ptc', 'minimal', 'cordis']

/** The plugin entries that make the boot manifest Dude's, not stock. */
const BOOT_ENTRIES = ['dsh-plugin-dude']

// ---------------------------------------------------------------------------
// version arithmetic
// ---------------------------------------------------------------------------

/**
 * Split a semver string into its comparable parts.
 * @param v - a version such as `0.1.0-rc.6`.
 * @returns release triple plus the dot-separated prerelease identifiers.
 */
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v)
  if (m === null) return null
  return {
    release: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] === undefined ? [] : m[4].split('.'),
  }
}

/**
 * Order two versions by the semver precedence rules, prereleases included:
 * `0.1.0-rc.6` sorts above `0.1.0-rc.2` (numeric identifiers compare
 * numerically) and below `0.1.0`.
 * @param a - left version.
 * @param b - right version.
 * @returns negative, zero or positive in the usual comparator sense.
 */
function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b)
  if (pa === null || pb === null) return a === b ? 0 : (a < b ? -1 : 1)
  for (let i = 0; i < 3; i += 1) {
    if (pa.release[i] !== pb.release[i]) return pa.release[i] - pb.release[i]
  }
  // A version without a prerelease outranks any prerelease of the same triple.
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i += 1) {
    const x = pa.pre[i], y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// process and file helpers
// ---------------------------------------------------------------------------

/**
 * Run a command to completion, capturing both streams.
 * @param cmd - executable name or path.
 * @param args - argument vector.
 * @param opts - `cwd` override.
 * @returns exit status and the merged output.
 */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? REPO, encoding: 'utf8', env: process.env })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.error !== undefined) return { code: -1, out: `${out}${r.error.message}` }
  return { code: r.status ?? -1, out }
}

/**
 * Keep the last lines of a command's output, which is where the verdict is.
 * @param text - raw output.
 * @param n - how many lines to keep.
 * @returns the tail, trimmed.
 */
function tail(text, n = 12) {
  const lines = text.replace(/\s+$/, '').split('\n')
  return lines.length <= n ? lines.join('\n') : lines.slice(-n).join('\n')
}

/** @returns the parsed JSON at `path`. */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Locate the `dsh` binary. It ships via npx, so the cache directory name is a
 * hash that differs per machine; `DSH` overrides the search outright.
 * @returns an absolute path, or null when nothing was found.
 */
function resolveDsh() {
  if (process.env.DSH !== undefined && process.env.DSH !== '') return process.env.DSH
  // The repo pins its own runtime (root devDependency) — prefer it over
  // whatever a PATH or npx cache happens to hold.
  const local = join(REPO, 'node_modules', '.bin', 'dsh')
  if (existsSync(local)) return local
  const onPath = spawnSync('sh', ['-lc', 'command -v dsh'], { encoding: 'utf8' })
  if (onPath.status === 0 && onPath.stdout.trim() !== '') return onPath.stdout.trim()
  const cache = join(homedir(), '.npm', '_npx')
  if (!existsSync(cache)) return null
  for (const entry of readdirSync(cache)) {
    const bin = join(cache, entry, 'node_modules', '.bin', 'dsh')
    if (existsSync(bin)) return bin
  }
  return null
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

/**
 * The run's transcript. Everything printed to the operator is also kept here
 * and appended to a dated file, so a scheduled run leaves the same evidence a
 * hand run does.
 */
class Report {
  /** @param mode - the flag this run was invoked with. */
  constructor(mode) {
    this.mode = mode
    this.lines = []
    this.dir = join(REPO, 'reports', 'upstream-sync')
    this.path = join(this.dir, `${new Date().toISOString().slice(0, 10)}.md`)
  }

  /** @param line - a markdown line for the report only. */
  add(line) { this.lines.push(line) }

  /** @param line - a line for both the operator and the report. */
  say(line) { console.log(line); this.lines.push(line) }

  /**
   * Record a command's outcome with an output tail.
   * @param label - human name of the gate.
   * @param result - what {@link run} returned.
   */
  gate(label, result) {
    const verdict = result.code === 0 ? 'PASS' : 'FAIL'
    console.log(`  [${verdict}] ${label} (exit ${result.code})`)
    this.lines.push('', `**${verdict}** \`${label}\` — exit ${result.code}`, '', '```', tail(result.out), '```')
  }

  /** Write the accumulated transcript and print where it went. */
  flush() {
    mkdirSync(this.dir, { recursive: true })
    const stamp = new Date().toISOString()
    appendFileSync(this.path, `\n## ${stamp} — \`--${this.mode}\`\n\n${this.lines.join('\n')}\n`, 'utf8')
    console.log(`\n报告：${this.path}`)
  }
}

// ---------------------------------------------------------------------------
// version state
// ---------------------------------------------------------------------------

/**
 * Read the version this repo is locked to.
 *
 * The lock is the anchor's exact pin in the root manifest. The plugin's
 * exact `@deepseek-ai/*` pins ride the same line and are reported when they
 * drift. Ranged entries (`@deepseek-ai/cordis: ^4.0.1`) are a separate
 * versioning line and are not part of the lock.
 * @returns the pinned version and the dependency names carrying it.
 */
function readLocked() {
  const version = readJson(LOCK_MANIFEST).devDependencies?.[ANCHOR]
  if (version === undefined || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`${LOCK_MANIFEST} pins no exact ${ANCHOR}; nothing anchors the lock`)
  }
  const pinned = [[ANCHOR, version], ...Object.entries(readJson(PLUGIN_MANIFEST).devDependencies ?? {})
    .filter(([name, spec]) => name.startsWith('@deepseek-ai/') && /^\d+\.\d+\.\d+/.test(spec))]
  const strays = pinned.filter(([, spec]) => spec !== version).map(([name, spec]) => `${name}@${spec}`)
  return { version, names: pinned.map(([name]) => name), strays }
}

/**
 * Ask the registry what upstream has published.
 * @returns the newest anchor version, the full list, and its dist-tags.
 */
function readUpstream() {
  const versions = run('npm', ['view', ANCHOR, 'versions', '--json'])
  if (versions.code !== 0) throw new Error(`npm view ${ANCHOR} failed:\n${tail(versions.out)}`)
  const list = JSON.parse(versions.out)
  const all = Array.isArray(list) ? list : [list]
  // The release line is what `latest` / `next` point at. `alpha` builds are
  // published to the same registry but are not something a distribution
  // tracks, so the newest *tagged* release wins over the highest semver.
  const anchorTags = run('npm', ['view', ANCHOR, 'dist-tags', '--json'])
  if (anchorTags.code !== 0) throw new Error(`npm view ${ANCHOR} dist-tags failed:\n${tail(anchorTags.out)}`)
  const tagged = JSON.parse(anchorTags.out)
  const latest = [tagged.latest, tagged.next].filter(v => typeof v === 'string').sort(compareVersions).at(-1)
  if (latest === undefined) throw new Error(`${ANCHOR} has neither a latest nor a next dist-tag`)
  return { latest, all, distTags: tagged }
}

/**
 * Compare the registry against the lock and write the version pair to the report.
 * @param report - the run transcript.
 * @returns the lock state, the registry state, and whether a bump is due.
 */
function survey(report) {
  const locked = readLocked()
  const upstream = readUpstream()
  const behind = compareVersions(locked.version, upstream.latest) < 0

  report.add('| | 版本 |')
  report.add('|---|---|')
  report.add(`| repo 锁定（${ANCHOR}） | \`${locked.version}\` |`)
  report.add(`| npm 最新（latest/next 中较新者；${upstream.all.length} 个已发布版本） | \`${upstream.latest}\` |`)
  report.add(`| dist-tags | \`${JSON.stringify(upstream.distTags)}\` |`)
  report.add('')
  report.add(`锁定的包（${locked.names.length}）：${locked.names.map(n => `\`${n}\``).join('、')}`)
  if (locked.strays.length > 0) {
    report.add('')
    report.add(`⚠️ 与锚点版本不一致的固定依赖：${locked.strays.join('、')}`)
  }
  return { locked, upstream, behind }
}

// ---------------------------------------------------------------------------
// smoke
// ---------------------------------------------------------------------------

/**
 * POST one RPC through the api gateway.
 * @param base - server origin.
 * @param method - the wire method, which is also the path segment.
 * @param payload - method payload.
 * @param cookie - 0.1.2 browser-trust cookie from the token handshake.
 * @returns the parsed server response envelope.
 */
async function rpc(base, method, args, cookie) {
  const res = await fetch(`${base}/api/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: randomUUID(),
      method,
      payload: { args },
    }),
  })
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
  return await res.json()
}

/**
 * 0.1.2 serves the UI behind a one-shot `?token=` handshake that 303s to `/`
 * and sets an HttpOnly cookie. Bare `/` is 401 until that cookie is present.
 * @param log - the child's collected stdout/stderr.
 * @returns the token, or null when the log has not printed the URL yet.
 */
function tokenFromLog(log) {
  const m = /dsh web: https?:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/.exec(log)
  return m === null ? null : m[1]
}

/**
 * Trade the printed token for the session cookie subsequent fetches need.
 * @param base - server origin.
 * @param token - value of `?token=` from the boot URL.
 * @returns a `name=value` Cookie header, or null when the handshake is not ready.
 */
async function handshakeCookie(base, token) {
  const res = await fetch(`${base}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  if (res.status !== 303 && res.status !== 200) return null
  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') === null ? [] : [res.headers.get('set-cookie')])
  const parts = setCookie.map(entry => entry.split(';')[0]).filter(Boolean)
  return parts.length === 0 ? null : parts.join('; ')
}

/**
 * Refuse to smoke a port somebody else is already serving.
 *
 * Without this the boot wait is satisfied by the *occupant's* 200 while the
 * child dies of EADDRINUSE, and the whole smoke silently grades a server this
 * run never assembled — the dev server on 3081 would grade its own build.
 * @param port - the port about to be bound.
 * @throws when anything already answers there.
 */
async function assertPortFree(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    throw new Error(`端口 ${port} 已被占用（HTTP ${res.status}）：`
      + '冒烟必须验证自己起的服务。换 SMOKE_PORT，或先停掉占用者。')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('端口 ')) throw error
    // Anything else is the connection being refused, which is what we want.
  }
}

/**
 * Start a server against Dude's isolated home.
 * @param dsh - path to the CLI.
 * @param port - the port to bind.
 * @param logPath - file collecting the server's own output.
 * @returns the child, which the caller must stop whether or not boot succeeds.
 */
async function startServer(dsh, port, logPath) {
  writeFileSync(logPath, '')
  await assertPortFree(port)
  const child = spawn(dsh, ['--profile', PROFILE, '--port', String(port), '--no-open'], {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DSH_HOME: DUDE_HOME },
  })
  const collect = chunk => appendFileSync(logPath, chunk)
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  return child
}

/**
 * Wait until the server answers behind its token handshake.
 * @param child - what {@link startServer} returned.
 * @param port - the port it binds.
 * @param logPath - file collecting the server's own output.
 * @returns the cookie the smoke checks must send.
 */
async function waitForServer(child, port, logPath) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  const base = `http://127.0.0.1:${port}`
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dsh exited with ${child.exitCode} before serving; log: ${logPath}`)
    }
    try {
      const token = tokenFromLog(readFileSync(logPath, 'utf8'))
      if (token !== null) {
        const cookie = await handshakeCookie(base, token)
        if (cookie !== null) {
          const res = await fetch(`${base}/`, { headers: { cookie } })
          if (res.status === 200) return cookie
        }
      }
    } catch { /* not listening yet */ }
    await sleep(500)
  }
  throw new Error(`dsh did not serve on ${port} within ${BOOT_TIMEOUT_MS / 1000}s; log: ${logPath}`)
}

/**
 * Stop the smoke server and its children.
 * @param child - what {@link startServer} returned.
 */
async function stopServer(child) {
  if (child === null || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  for (let i = 0; i < 20 && child.exitCode === null; i += 1) await sleep(200)
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
  }
}

/**
 * The three facts a green smoke asserts.
 * @param base - the smoke server's origin.
 * @returns one `{name, verdict, detail}` per check, in order.
 */
async function smokeChecks(base, cookie) {
  const checks = []
  const headers = cookie === undefined ? {} : { cookie }

  /**
   * @param name - the check's title in the report.
   * @param fn - returns `{verdict, detail}`; a throw becomes a FAIL.
   */
  const step = async (name, fn) => {
    try {
      checks.push({ name, ...(await fn()) })
    } catch (error) {
      checks.push({ name, verdict: 'FAIL', detail: String(error?.message ?? error) })
    }
  }

  // 1. The page and Dude's own bundle are both served, and the bundle is
  //    the self-registering artifact the ModuleLoader expects.
  let indexHtml = ''
  await step('首页 + client bundle', async () => {
    const index = await fetch(`${base}/`, { headers })
    indexHtml = await index.text()
    const bootMatch = /__DSH_BOOT__["'\]]*\s*=\s*(\{[\s\S]*?\})<\/script>/.exec(indexHtml)
    const entry = bootMatch === null
      ? undefined
      : JSON.parse(bootMatch[1]).entries.find(e => e.id === 'dsh-plugin-dude')
    const bundleUrl = entry?.url ?? '/plugins/??dsh-plugin-dude/client.js'
    const bundle = await fetch(`${base}${bundleUrl}`, { headers })
    const head = (await bundle.text()).slice(0, 120)
    const banner = head.startsWith('window.__ModuleLoader__.load({ id: "dsh-plugin-dude"')
    const ok = index.status === 200 && bundle.status === 200 && banner
    return {
      verdict: ok ? 'PASS' : 'FAIL',
      detail: `/ → ${index.status}；client.js → ${bundle.status}；ModuleLoader 头 ${banner ? '在' : '缺失'}`,
    }
  })

  // 2. The preset roster is the whole official agent plane reaching the UI.
  await step('agentPresets/list', async () => {
    const res = await rpc(base, 'agentPresets/list', {}, cookie)
    const presets = res.result?.value?.presets ?? []
    const ids = presets.map(p => p.id)
    const missing = BUILTIN_PRESETS.filter(id => !ids.includes(id))
    const ok = res.result?.ok === true && presets.length >= 4 && missing.length === 0
    return {
      verdict: ok ? 'PASS' : 'FAIL',
      detail: `ok=${res.result?.ok}；presets=${presets.length} [${ids.join(', ')}]`
        + (missing.length > 0 ? `；缺内置 ${missing.join(', ')}` : ''),
    }
  })

  // 3. The boot manifest is the distribution's, not stock dsh's.
  await step('boot 清单含发行版 entry', async () => {
    // 0.1.1 writes `globalThis["__DSH_BOOT__"] = {…}`; rc.6 wrote
    // `window.__DSH_BOOT__ = {…}`. Match the assignment, not the receiver.
    const m = /__DSH_BOOT__["'\]]*\s*=\s*(\{[\s\S]*?\})<\/script>/.exec(indexHtml)
    if (m === null) throw new Error('首页没有 __DSH_BOOT__ 清单')
    const ids = JSON.parse(m[1]).entries.map(e => e.id)
    const missing = BOOT_ENTRIES.filter(id => !ids.includes(id))
    return {
      verdict: missing.length === 0 ? 'PASS' : 'FAIL',
      detail: `${ids.length} 个 entry`
        + (missing.length === 0 ? `；${BOOT_ENTRIES.join(' / ')} 都在` : `；缺 ${missing.join(', ')}`),
    }
  })

  return checks
}

/**
 * Boot, assert, tear down.
 * @param report - the run transcript.
 * @returns 0 when no check failed, 1 otherwise.
 */
async function cmdSmoke(report) {
  const dsh = resolveDsh()
  if (dsh === null) {
    report.say('✗ 找不到 dsh 可执行文件；先在仓库根目录 pnpm install，或用 DSH=<path> 指定')
    return 1
  }
  const base = `http://127.0.0.1:${SMOKE_PORT}`
  const logPath = join(tmpdir(), `dude-smoke-${SMOKE_PORT}.log`)
  report.say(`冒烟：DSH_HOME=${DUDE_HOME} ${dsh} --profile ${PROFILE} --port ${SMOKE_PORT}`)
  report.add(`服务日志：\`${logPath}\``)

  let child = null
  let checks = []
  try {
    child = await startServer(dsh, SMOKE_PORT, logPath)
    const cookie = await waitForServer(child, SMOKE_PORT, logPath)
    checks = await smokeChecks(base, cookie)
  } catch (error) {
    report.say(`✗ 起服务失败：${error?.message ?? error}`)
    report.add('')
    report.add('```')
    report.add(tail(readFileSync(logPath, 'utf8'), 20))
    report.add('```')
    return 1
  } finally {
    await stopServer(child)
  }

  report.add('')
  report.add('| 冒烟项 | 结果 | 细节 |')
  report.add('|---|---|---|')
  for (const c of checks) {
    console.log(`  [${c.verdict}] ${c.name} — ${c.detail}`)
    report.add(`| ${c.name} | ${c.verdict} | ${c.detail.replaceAll('|', '\\|')} |`)
  }
  const failed = checks.filter(c => c.verdict === 'FAIL')
  const skipped = checks.filter(c => c.verdict === 'SKIP')
  report.say(failed.length === 0
    ? `✔ 冒烟通过（${checks.length - skipped.length} PASS / ${skipped.length} SKIP）`
    : `✗ 冒烟失败 ${failed.length} 项：${failed.map(c => c.name).join('、')}`)
  return failed.length === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// check / apply
// ---------------------------------------------------------------------------

/**
 * Report the version pair without touching anything.
 * @param report - the run transcript.
 * @returns 0 when current, 1 when a newer release exists.
 */
async function cmdCheck(report) {
  const { locked, upstream, behind } = survey(report)
  if (!behind) {
    report.say(`✔ 已最新：repo 锁定 ${locked.version}，npm 最新 ${upstream.latest}`)
    return 0
  }
  report.say(`↑ 有新版：repo 锁定 ${locked.version} → npm 最新 ${upstream.latest}`)
  report.say(`  跑 \`node scripts/sync-upstream.mjs --apply\` 升级`)
  return 1
}

/**
 * Rewrite every `@deepseek-ai/*` entry across `plugins/*` that carries the old
 * pinned version.
 *
 * Matching on the exact old version rather than on a name pattern keeps the
 * bump off dependencies that ride a different versioning line — `cordis` is
 * `@deepseek-ai/` too, and its 4.x has nothing to do with the harness rc line.
 * @param from - the version being replaced.
 * @param to - the version to write.
 * @returns the touched manifests and a snapshot of their original bytes.
 */
function bumpPlugins(from, to) {
  const pluginsDir = join(REPO, 'plugins')
  const snapshot = []
  const touched = []
  // The root manifest pins the dsh CLI (the profile's server runtime); it
  // rides the same versioning line and must move with the plugins.
  const manifests = [['root', join(REPO, 'package.json')],
    ...readdirSync(pluginsDir).map(entry => [entry, join(pluginsDir, entry, 'package.json')])]
  for (const [entry, manifest] of manifests) {
    if (!existsSync(manifest)) continue
    const before = readFileSync(manifest, 'utf8')
    snapshot.push({ path: manifest, before })
    const pkg = JSON.parse(before)
    let hits = 0
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const table = pkg[field]
      if (table === undefined) continue
      for (const name of Object.keys(table)) {
        if (name.startsWith('@deepseek-ai/') && table[name] === from) {
          table[name] = to
          hits += 1
        }
      }
    }
    if (hits === 0) continue
    // Preserve the trailing newline convention of the file being rewritten.
    writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    touched.push(`${entry} (${hits})`)
  }
  const lock = join(REPO, 'pnpm-lock.yaml')
  if (existsSync(lock)) {
    snapshot.push({ path: lock, before: readFileSync(lock, 'utf8') })
    // A version bump must re-resolve the whole lock: an incremental install
    // reuses stale entries to satisfy the new packages' peer ranges, which
    // splits the dependency graph across both versions (and with it the
    // TypeScript augmentation graph). Rollback restores the saved bytes.
    rmSync(lock)
  }
  return { snapshot, touched }
}

/**
 * Put the manifests and the lockfile back exactly as they were.
 *
 * This restores bytes rather than running `git checkout`: the bump must be
 * undone surgically even when the repo has no commit to check out against, and
 * unrelated work in the tree must survive a failed upgrade untouched.
 * @param snapshot - what {@link bumpPlugins} recorded.
 */
function rollback(snapshot) {
  for (const { path, before } of snapshot) writeFileSync(path, before, 'utf8')
}

/**
 * Bump, install, gate, smoke — rolling back on the first failure.
 * @param report - the run transcript.
 * @returns 0 when the upgrade is green (or was unnecessary), 1 otherwise.
 */
async function cmdApply(report) {
  const { locked, upstream, behind } = survey(report)
  if (!behind) {
    report.say(`✔ 已最新：repo 锁定 ${locked.version}，npm 最新 ${upstream.latest} —— --apply 短路，未改任何文件`)
    return 0
  }

  report.say(`↑ 升级 ${locked.version} → ${upstream.latest}`)
  const { snapshot, touched } = bumpPlugins(locked.version, upstream.latest)
  report.say(`  bump 的清单：${touched.join('、')}`)

  /**
   * @param label - gate name.
   * @param result - what {@link run} returned.
   * @param stage - the layer to name when reporting the failure.
   * @returns true when the gate passed.
   */
  const gate = (label, result, stage) => {
    report.gate(label, result)
    if (result.code === 0) return true
    rollback(snapshot)
    report.say(`✗ 失败层级：${stage}（\`${label}\`）—— 已回滚 bump 与 lockfile`)
    return false
  }

  const install = run('pnpm', ['install'])
  if (!gate('pnpm install', install, '依赖安装')) return 1

  for (const script of ['build', 'test', 'typecheck']) {
    const r = run('pnpm', ['--filter', 'dsh-plugin-dude', script])
    if (!gate(`pnpm --filter dsh-plugin-dude ${script}`, r, `dude ${script} 门禁`)) return 1
  }

  const smoke = await cmdSmoke(report)
  if (smoke !== 0) {
    rollback(snapshot)
    report.say('✗ 失败层级：冒烟 —— 已回滚 bump 与 lockfile')
    return 1
  }

  report.say(`✔ 升级绿灯：${locked.version} → ${upstream.latest}，门禁与冒烟全通过`)
  report.say('  bump 未 commit；按 design/ARCHITECTURE.md §10「架构验收」')
  report.say('  走完人工验收再提交。')
  return 0
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

const USAGE = `用法：node scripts/sync-upstream.mjs (--check | --apply | --smoke)

  --check   比对 npm 最新版与 repo 锁定版；已最新 exit 0，有新版 exit 1
  --apply   有新版时 bump + install + 门禁 + 冒烟，任一步失败回滚并 exit 1
  --smoke   在 ${SMOKE_PORT} 端口起临时 dsh 服务跑三项冒烟

环境变量：DSH（dsh 可执行文件）、SMOKE_PORT、DSH_PROFILE`

const MODES = { '--check': cmdCheck, '--apply': cmdApply, '--smoke': cmdSmoke }
const flags = process.argv.slice(2).filter(a => a in MODES)
if (flags.length !== 1) {
  console.error(USAGE)
  process.exit(2)
}

const mode = flags[0]
const report = new Report(mode.slice(2))
try {
  process.exitCode = await MODES[mode](report)
} catch (error) {
  report.say(`✗ 未捕获错误：${error?.stack ?? error}`)
  process.exitCode = 1
} finally {
  report.flush()
}
