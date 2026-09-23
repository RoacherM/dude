/**
 * Dude desktop shell (packaged, wave 10).
 *
 * The packaged Dude.app is self-contained: this main process finds a free
 * port, spawns the staged dsh runtime (real files, not pnpm symlinks — see
 * stage-runtime.sh / electron-builder extraResources) with Electron's bundled
 * Node (ELECTRON_RUN_AS_NODE=1 + process.execPath, Node 22.x ≥ dsh's engine),
 * polls until dsh prints its listen URL, and loads that URL in the window.
 * 0.1.2 gates the UI behind a one-shot `?token=` handshake; the shell reads
 * the token from dsh stdout so a double-click never asks the user for a URL.
 * DSH_HOME is ~/.dude, the isolated root (config isolation, wave 9);
 * first run migrates from ~/.dsh (canonical semantics live in scripts/dude
 * — this JS mirrors them).
 *
 * The app runs an APP-EXCLUSIVE profile: `dude-app` (not the dev `dude`
 * profile, whose plugin node_modules links back into this repo and would fight
 * dev hot-reload). The app profile is generated idempotently in
 * ~/.dude/profiles/dude-app and points its node_modules/dsh-plugin-dude
 * at the packaged plugin in resources.
 *
 * The kernel can also be hot-updated from the app menu without reinstalling
 * the app: kernel.js installs a newer dsh into ~/.dude/runtime/<version> and
 * the highest installed version wins at launch.
 *
 * Dev mode (`electron .` from the repo, no packaged resources) keeps the old
 * behavior: it loads DSH_WEB_URL (default http://127.0.0.1:3080) without
 * spawning or migrating anything.
 */
const { app, BrowserWindow, Menu, dialog, nativeTheme, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const kernel = require('./kernel.js')

/** Where the dev profile's web server listens; `--port` moves it. */
const DSH_WEB_URL = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
/** Retry cadence while the profile's web server is still coming up. */
const RETRY_MS = 1200
/** How long dsh may take to print its listen URL, and then to answer it. */
const BOOT_TIMEOUT_MS = 60000
/** Dude's isolated harness home (config isolation, wave 9). */
const DUDE_HOME = path.join(os.homedir(), '.dude')
const OFFICIAL_HOME = path.join(os.homedir(), '.dsh')
const PROFILES_DIR = path.join(DUDE_HOME, 'profiles')

/** App-exclusive profile name — never the dev `dude` profile, and not
 * `desktop` either: since dsh 0.1.5 the launcher reserves that name for the
 * official Electron app and refuses it on the command line. */
const APP_PROFILE = 'dude-app'

// ── free port (net listen 0) ────────────────────────────────────────────────

/** Ask the OS for a free TCP port, then release it for the dsh bind. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

// ── first-run migration (JS mirror of scripts/dude) ────────────────────
//
// Canonical semantics live in scripts/dude. This copy-run-migrate mirrors
// it: copy (never move) the isolation set from ~/.dsh into ~/.dude, with
// cp -RP-equivalent symlink preservation (the app profile's plugin link is
// NOT copied here — the app generates that profile itself). Only runs when
// ~/.dude does not exist. ~/.dsh is read-only.
function ensureDudeHome() {
  if (fs.existsSync(DUDE_HOME)) return
  console.log('[dude] first run — migrating config %s -> %s (copy, ~/.dsh untouched)', OFFICIAL_HOME, DUDE_HOME)
  fs.mkdirSync(DUDE_HOME, { recursive: true })
  fs.mkdirSync(path.join(DUDE_HOME, 'profiles'), { recursive: true })

  const copyPreservingSymlinks = (src, dest) => {
    // Node fs.cp with dereference:false preserves symlinks, exactly like cp -RP.
    fs.cpSync(src, dest, { recursive: true, dereference: false, force: true })
  }

  for (const f of ['settings.yaml', '.credentials.yaml', '.anonymous-user-id']) {
    const src = path.join(OFFICIAL_HOME, f)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DUDE_HOME, f))
  }
  for (const d of ['.agent-presets', 'storages', 'sessions']) {
    const src = path.join(OFFICIAL_HOME, d)
    if (fs.existsSync(src)) copyPreservingSymlinks(src, path.join(DUDE_HOME, d))
  }
  // The dev dude profile is NOT migrated (the app uses its own
  // profile). The official home's profiles are left untouched.
}

// ── app-exclusive app profile ───────────────────────────────────────────────

/**
 * Generate ~/.dude/profiles/dude-app idempotently. Its manifest mirrors
 * the dev profile (dsh-base + dsh-web-app bundles from the staged runtime;
 * dsh-plugin-dude from the bundled resources). The plugin is COPIED into
 * the profile's node_modules so it never links back to a source repo.
 *
 * Returns the profile directory (must exist before dsh boots).
 */
function ensureDesktopProfile(resourcesDir) {
  const profileDir = path.join(PROFILES_DIR, APP_PROFILE)
  const pluginDest = path.join(profileDir, 'node_modules', 'dsh-plugin-dude')
  const pluginSrc = path.join(resourcesDir, 'dude-plugin')
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true })
  if (!fs.existsSync(pluginSrc)) {
    throw new Error(`[dude] packaged plugin resources missing at ${pluginSrc}`)
  }
  // Re-copy the plugin every launch: the bundled version must always be the
  // one running, or an app upgrade would keep serving the seeded snapshot.
  fs.rmSync(path.join(profileDir, 'node_modules'), { recursive: true, force: true })
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.cpSync(pluginSrc, pluginDest, { recursive: true, force: true })

  const manifest = {
    name: 'dsh-profile-dude-app',
    private: true,
    dependencies: {
      'dsh-plugin-dude': 'file:node_modules/dsh-plugin-dude',
    },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-plugin-dude'],
        // `startup`, like the official shipped templates: `live` (the
        // default) loads the HMR plugin to watch patch files, which needs
        // --expose-internals and has nothing to watch in a packaged app.
        patchReload: 'startup',
      },
    },
  }
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  // cordis.yml / cordis.patch.yml: same shape as the dev profile (empty entry
  // list + patch layer; the composition comes from the bundles).
  if (!fs.existsSync(path.join(profileDir, 'cordis.yml'))) {
    fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '# dsh profile root — composed as patches\n[]\n')
  }
  if (!fs.existsSync(path.join(profileDir, 'cordis.patch.yml'))) {
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '# patch layer\n[]\n')
  }
  return profileDir
}

// ── spawn + poll dsh ───────────────────────────────────────────────────────

/** dsh 0.1.2 prints `dsh web: http://127.0.0.1:PORT/?token=...`; 0.1.1 omitted the query. */
const DSH_WEB_LINE = /dsh web: (https?:\/\/127\.0\.0\.1:\d+\/\S*)/

/**
 * Spawn the packaged dsh runtime as a child of this main process, using
 * ELECTRON_RUN_AS_NODE so the harness runs on Electron's bundled Node (no
 * system Node dependency). Returns the child (killed on app quit) and a
 * promise for the listen URL dsh prints — including the 0.1.2 handshake token.
 */
function spawnDsh(port, runtime) {
  const resourcesDir = process.resourcesPath ?? ''
  const runtimeDir = runtime.dir
  // The staged tree lives under a literal node_modules so ESM bare imports
  // between the staged packages resolve by ancestor walk-up — NODE_PATH is
  // CJS-only and cannot carry them (stage-runtime.sh).
  const modulesDir = path.join(runtimeDir, 'node_modules')
  const binPath = path.join(modulesDir, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!fs.existsSync(binPath)) {
    throw new Error(`[dude] packaged dsh runtime missing at ${binPath}`)
  }
  ensureDesktopProfile(resourcesDir)
  if (runtime.installed) {
    // Since dsh 0.1.5 the loader imports the plugin from the runtime's own
    // node_modules. The baseline has it staged; a hot-update runtime gets the
    // packaged plugin copied in on every launch, like the profile does.
    const pluginDest = path.join(modulesDir, 'dsh-plugin-dude')
    fs.rmSync(pluginDest, { recursive: true, force: true })
    fs.cpSync(path.join(resourcesDir, 'dude-plugin'), pluginDest, { recursive: true })
  }

  let settleUrl
  const readyUrl = new Promise((resolve, reject) => {
    settleUrl = { resolve, reject }
  })
  let buf = ''
  let settled = false

  const child = spawn(process.execPath, [binPath, '--profile', APP_PROFILE, '--port', String(port), '--no-open'], {
    cwd: runtimeDir,
    // Own process group, so quit's `process.kill(-child.pid)` actually names
    // it — without this the child shares Electron's group and the negative-pid
    // kill is ESRCH (dsh-spawned PTY shells would outlive the app).
    detached: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: DUDE_HOME,
      // CJS requires anchored outside the runtime (the generated profile dir)
      // still find the same staged tree — one resolution target for both
      // module systems, so every package loads exactly once.
      NODE_PATH: modulesDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const onData = (b) => {
    const text = b.toString()
    process.stdout.write(`[dsh] ${text}`)
    if (settled) return
    buf += text
    const m = DSH_WEB_LINE.exec(buf)
    if (m) {
      settled = true
      settleUrl.resolve(m[1].trim())
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.once('exit', (code) => {
    if (!settled) settleUrl.reject(new Error(`[dude] dsh exited ${code} before printing its listen URL`))
  })
  setTimeout(() => {
    if (!settled) settleUrl.reject(new Error(`[dude] dsh printed no listen URL within ${BOOT_TIMEOUT_MS}ms`))
  }, BOOT_TIMEOUT_MS).unref()
  return { child, readyUrl }
}

/**
 * Poll until the origin answers. Do NOT fetch the `?token=` URL here:
 * that handshake is for the BrowserWindow session. 0.1.2's bare `/` is 401
 * until Chromium spends the token; 0.1.1's bare `/` is 200. Either means up.
 */
function waitForOrigin(origin, timeoutMs = BOOT_TIMEOUT_MS) {
  const start = Date.now()
  const attempt = () => new Promise((resolve) => {
    fetch(origin, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(2000) })
      .then((r) => resolve(r.status === 200 || r.status === 401 || r.status === 303))
      .catch(() => resolve(false))
  })
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await attempt()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error(`[dude] dsh did not answer ${origin} within ${timeoutMs}ms`))
      setTimeout(tick, RETRY_MS)
    }
    tick()
  })
}

// ── window ──────────────────────────────────────────────────────────────────

/** The URL the app currently targets (packaged: the spawned dsh; dev: DSH_WEB_URL). */
let currentUrl = DSH_WEB_URL

function createWindow(url) {
  currentUrl = url
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    // Lights are about 14px tall; y 17 centres them 24px down, on the row
    // the official conversation header and right sidebar tabs already use,
    // and inside the sidebar's 36px safe band (the plugin's styles.ts).
    trafficLightPosition: { x: 14, y: 17 },
    // The compositor shows this during fast drag/resize before the web
    // content repaints, so it must match the official ground
    // (--dsw-alias-bg-base: #fff light, #151517 dark; the theme presenter
    // follows the system by default), or the window flashes the wrong shade.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151517' : '#ffffff',
    title: 'Dude',
  })
  win.webContents.on('console-message', (_e, level, message) => {
    console.log(`[renderer:${level}] ${message}`)
  })
  win.webContents.on('did-finish-load', () => {
    console.log('[dude] loaded', win.webContents.getURL())
  })
  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
    console.log('[dude] fail-load', { code, desc, validatedURL, isMainFrame })
    // 303 handshake and in-page redirects abort the first navigation (-3).
    // Retrying the token URL fights Chromium's follow and can stick on a
    // blank window.
    if (!isMainFrame || code === -3) return
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(currentUrl)
    }, RETRY_MS)
  })
  win.loadURL(url)
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u)
    return { action: 'deny' }
  })

  // Verification hook: DSH_DESKTOP_SCREENSHOT=/path.png captures and exits.
  const shot = process.env.DSH_DESKTOP_SCREENSHOT
  if (shot) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        fs.writeFileSync(shot, image.toPNG())
        console.log('[dude] screenshot written, quitting')
        app.quit()
      }, 1500)
    })
  }

  // The dsh child is NOT torn down here: on macOS closing the window keeps
  // the app (and its server) alive, so `activate` can reopen against the same
  // URL. The child dies with the app on `before-quit`.
  return win
}

function killChild(child) {
  if (child && !child.killed) {
    // SIGTERM the process group so any dsh-spawned children go with it.
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* no group */ }
    try { child.kill('SIGTERM') } catch { /* already gone */ }
  }
}

/** Kill the dsh child and wait until it has exited, so its port and files are free. */
function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  const exited = new Promise((resolve) => child.once('exit', resolve))
  killChild(child)
  const force = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
  }, 5000)
  return exited.finally(() => clearTimeout(force))
}

// ── kernel lifecycle and hot update ─────────────────────────────────────────

/** The running kernel: `{ child, runtime, url }`. Only this module replaces it. */
let dsh = null
/** Set while a hot update downloads or restarts the kernel. */
let updating = null

/** Boot a runtime on a free port and wait until it answers. */
async function startDsh(runtime) {
  const { child, readyUrl } = spawnDsh(await findFreePort(), runtime)
  try {
    const url = await readyUrl
    const origin = new URL(url)
    await waitForOrigin(`${origin.protocol}//${origin.host}/`)
    return { child, runtime, url }
  } catch (e) {
    await stopChild(child)
    throw e
  }
}

/** Point every window (and any window `activate` reopens) at the kernel's URL. */
function showUrl(url) {
  currentUrl = url
  for (const win of BrowserWindow.getAllWindows()) void win.loadURL(url)
}

/**
 * Install the newest upstream release and restart the kernel on it. The old
 * kernel stops first so two servers never share ~/.dude. If the new one does
 * not boot, its runtime is deleted and the old one starts again.
 */
async function updateKernel() {
  const current = dsh.runtime.version
  const latest = await kernel.latestRelease()
  if (kernel.compareVersions(latest, current) <= 0) {
    await dialog.showMessageBox({
      message: `内核已是最新：dsh ${current}`,
      detail: 'npm 的 latest / next 通道没有更新的版本。',
    })
    return
  }
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['下载并更新', '取消'],
    defaultId: 0,
    cancelId: 1,
    message: `发现 dsh ${latest}（当前 ${current}）`,
    detail: '新内核从 npm 下载，约 280MB，在后台进行。装好后内核会重启，正在运行的任务会中断。\n\n'
      + '这个版本没有经过 Dude 的测试和冒烟。新内核起不来时会删掉它，回到当前版本。',
  })
  if (response !== 0) return

  updating = `正在下载 dsh ${latest}…`
  setMenu()
  const dir = await kernel.installRuntime(latest, path.join(process.resourcesPath, 'pnpm', 'bin', 'pnpm.mjs'))
  updating = `正在重启内核 dsh ${latest}…`
  setMenu()
  const previous = dsh
  await stopChild(previous.child)
  try {
    dsh = await startDsh({ dir, version: latest, installed: true })
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true })
    dsh = await startDsh(previous.runtime)
    showUrl(dsh.url)
    throw new Error(`dsh ${latest} 没能启动，已回到 ${previous.runtime.version}。\n\n${e?.message ?? e}`)
  }
  showUrl(dsh.url)
  kernel.removeOtherRuntimes(dir)
  await dialog.showMessageBox({ message: `内核已更新到 dsh ${latest}` })
}

function checkForKernelUpdate() {
  updateKernel()
    .catch((e) => {
      console.error('[dude] kernel update failed:', e)
      dialog.showErrorBox('内核更新失败', String(e?.message ?? e))
    })
    .finally(() => {
      updating = null
      setMenu()
    })
}

/**
 * The standard macOS menus plus, in the packaged app, the kernel update item.
 * The edit menu is what makes ⌘C / ⌘V work in the page.
 */
function setMenu() {
  const kernelItems = dsh === null ? [] : [
    { label: updating ?? `检查内核更新…（当前 dsh ${dsh.runtime.version}）`, enabled: updating === null, click: checkForKernelUpdate },
    { type: 'separator' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        ...kernelItems,
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

app.whenReady().then(async () => {
  const bundledDir = path.join(process.resourcesPath ?? '', 'dsh-runtime')
  if (fs.existsSync(path.join(bundledDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
    // Packaged: own the dsh lifecycle.
    ensureDudeHome()
    app.on('before-quit', () => { if (dsh !== null) killChild(dsh.child) })
    const runtime = kernel.activeRuntime(bundledDir)
    try {
      dsh = await startDsh(runtime)
    } catch (e) {
      if (!runtime.installed) throw e
      throw new Error(`内核 dsh ${runtime.version} 没能启动。删掉 ${runtime.dir} 可回到 app 自带的版本。\n\n${e?.message ?? e}`)
    }
    setMenu()
    createWindow(dsh.url)
  } else {
    // Dev mode: no packaged runtime — fall back to the old behavior (external
    // DSH_WEB_URL / default 3080).
    console.log('[dude] dev mode: no packaged runtime, loading %s', DSH_WEB_URL)
    setMenu()
    createWindow(DSH_WEB_URL)
  }
}).catch((e) => {
  console.error('[dude] startup failed:', e)
  dialog.showErrorBox('Dude could not start', String(e?.message ?? e))
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Re-open against the same URL — the dsh child is still alive (it only
    // dies on before-quit), so this reconnects instead of erroring out.
    createWindow(currentUrl)
  }
})
