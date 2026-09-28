/**
 * Which dsh runtime (the "kernel") the packaged app runs, and how a newer one
 * is installed without reinstalling the app.
 *
 * The app carries a baseline runtime in its resources. A hot update installs
 * `@deepseek-ai/dsh@<version>` from npm into ~/.dude/runtime/<version> with
 * the pnpm the app also carries. The directory listing is the only state: the
 * kernel that runs is the highest version among the baseline and the
 * installed directories, so a newer app build overtakes an older hot update.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DUDE_HOME = path.join(os.homedir(), '.dude')
const RUNTIMES_DIR = path.join(DUDE_HOME, 'runtime')
const PACKAGE = '@deepseek-ai/dsh'

/** Order two semver strings, prereleases included (`0.1.5-rc.3` < `0.1.5` < `0.1.6-alpha.1`). */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split('-', 2)
    return { core: core.split('.').map(Number), pre: pre === undefined ? [] : pre.split('.') }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i]
  }
  // A release outranks every prerelease of the same triple.
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1
    if (y.pre[i] === undefined) return 1
    const nx = /^\d+$/.test(x.pre[i]) ? Number(x.pre[i]) : NaN
    const ny = /^\d+$/.test(y.pre[i]) ? Number(y.pre[i]) : NaN
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny
    } else if (x.pre[i] !== y.pre[i]) {
      return x.pre[i] < y.pre[i] ? -1 : 1
    }
  }
  return 0
}

/** The dsh version a runtime directory holds. */
function runtimeVersion(runtimeDir) {
  const manifest = path.join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).version
}

/**
 * The runtime to boot: the highest of the app's baseline and every hot update.
 * @returns `{ dir, version, installed }`; `installed` is false for the baseline.
 */
function activeRuntime(bundledDir) {
  let best = { dir: bundledDir, version: runtimeVersion(bundledDir), installed: false }
  if (!fs.existsSync(RUNTIMES_DIR)) return best
  for (const name of fs.readdirSync(RUNTIMES_DIR)) {
    if (name.startsWith('.')) continue
    const dir = path.join(RUNTIMES_DIR, name)
    const version = runtimeVersion(dir)
    if (compareVersions(version, best.version) > 0) best = { dir, version, installed: true }
  }
  return best
}

/**
 * The newest release upstream offers: the higher of the `latest` and `next`
 * dist-tags. `alpha` builds are published to the same registry but are not a
 * release line, the same rule as scripts/sync-upstream.mjs.
 */
async function latestRelease() {
  const res = await fetch(`https://registry.npmjs.org/-/package/${PACKAGE}/dist-tags`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`npm registry answered ${res.status} for ${PACKAGE} dist-tags`)
  const tags = await res.json()
  const candidates = [tags.latest, tags.next].filter((v) => typeof v === 'string')
  if (candidates.length === 0) throw new Error(`${PACKAGE} has neither a latest nor a next dist-tag`)
  return candidates.sort(compareVersions).at(-1)
}

/** How many packages a runtime holds: pnpm keeps one `.pnpm/<id>` directory per package. */
function packageCount(runtimeDir) {
  return fs.readdirSync(path.join(runtimeDir, 'node_modules', '.pnpm'))
    .filter((name) => name !== 'node_modules' && name !== 'lock.yaml').length
}

/**
 * Install `@deepseek-ai/dsh@<version>` into ~/.dude/runtime/<version>, the
 * same prod-only, script-free install stage-runtime.sh makes for the
 * baseline. It installs into a dot-directory and renames on success, so a
 * half-finished install is never picked by activeRuntime.
 *
 * Progress comes from pnpm's ndjson reporter: every package is fetched, then
 * imported into the tree. The total is only known late, so `expectedPackages`
 * (the running kernel's count; releases differ by a few percent) stands in
 * for it. Fetching is 80% of the bar, importing the rest; the bar never goes
 * back and stays below 100 until pnpm exits.
 * @param onProgress - called with an integer percent in [0, 99].
 * @returns the installed runtime directory.
 */
async function installRuntime(version, pnpmBin, expectedPackages, onProgress = () => {}) {
  const target = path.join(RUNTIMES_DIR, version)
  const work = path.join(RUNTIMES_DIR, `.install-${version}`)
  await fs.promises.rm(work, { recursive: true, force: true })
  await fs.promises.mkdir(work, { recursive: true })
  await fs.promises.writeFile(path.join(work, 'package.json'), '{ "name": "dude-runtime", "private": true }\n')

  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmBin, 'install', `${PACKAGE}@${version}`, '--prod', '--ignore-scripts', '--reporter=ndjson'], {
      cwd: work,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let fetched = 0
    let imported = 0
    let percent = 0
    const errors = []
    let pending = ''
    child.stdout.on('data', (b) => {
      const lines = (pending + b.toString()).split('\n')
      pending = lines.pop()
      for (const line of lines) {
        let event
        try { event = JSON.parse(line) } catch { continue }
        if (event.level === 'error') errors.push(event.err?.message ?? event.message ?? line)
        if (event.name !== 'pnpm:progress') continue
        if (event.status === 'fetched') fetched++
        else if (event.status === 'imported') imported++
        else continue
        const total = Math.max(expectedPackages, fetched)
        const next = Math.min(99, Math.floor((80 * fetched + 20 * imported) / total))
        if (next > percent) onProgress(percent = next)
      }
    })
    child.stderr.on('data', (b) => {
      errors.push(b.toString())
      process.stderr.write(`[pnpm] ${b}`)
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code, errors }))
  })
  if (output.code !== 0) {
    await fs.promises.rm(work, { recursive: true, force: true })
    throw new Error(`pnpm install ${PACKAGE}@${version} exited ${output.code}:\n${output.errors.join('\n').trim().split('\n').slice(-15).join('\n')}`)
  }
  await fs.promises.rm(target, { recursive: true, force: true })
  await fs.promises.rename(work, target)
  return target
}

/** Delete every hot-update runtime except `keepDir` (each one is ~500MB, 25k files). */
async function removeOtherRuntimes(keepDir) {
  for (const name of await fs.promises.readdir(RUNTIMES_DIR)) {
    const dir = path.join(RUNTIMES_DIR, name)
    if (dir !== keepDir) await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

module.exports = { compareVersions, activeRuntime, latestRelease, packageCount, installRuntime, removeOtherRuntimes }
