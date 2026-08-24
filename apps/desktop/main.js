/**
 * DeepBuddy desktop shell (packaged, wave 10).
 *
 * The packaged DeepBuddy.app is self-contained: this main process finds a free
 * port, spawns the staged dsh runtime (real files, not pnpm symlinks — see
 * stage-runtime.sh / electron-builder extraResources) with Electron's bundled
 * Node (ELECTRON_RUN_AS_NODE=1 + process.execPath, Node 22.x ≥ dsh's engine),
 * polls the HTTP endpoint, and loads the window. DSH_HOME is ~/.deepbuddy, the
 * isolated root (config isolation, wave 9); first run migrates from ~/.dsh
 * (canonical semantics live in scripts/deepbuddy — this JS mirrors them).
 *
 * The app runs an APP-EXCLUSIVE profile: `desktop` (not the dev `deepbuddy`
 * profile, whose plugin node_modules links back into this repo and would fight
 * dev hot-reload). The desktop profile is generated idempotently in
 * ~/.deepbuddy/profiles/desktop and points its node_modules/dsh-plugin-deepbuddy
 * at the packaged plugin in resources.
 *
 * Dev mode (`electron .` from the repo, no packaged resources) keeps the old
 * behavior: it loads DSH_WEB_URL (default http://127.0.0.1:3080) without
 * spawning or migrating anything.
 */
const { app, BrowserWindow, nativeTheme, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

/** Where the dev profile's web server listens; `--port` moves it. */
const DSH_WEB_URL = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
/** Retry cadence while the profile's web server is still coming up. */
const RETRY_MS = 1200
/** DeepBuddy's isolated harness home (config isolation, wave 9). */
const DEEP_BUDDY_HOME = path.join(os.homedir(), '.deepbuddy')
const OFFICIAL_HOME = path.join(os.homedir(), '.dsh')
const PROFILES_DIR = path.join(DEEP_BUDDY_HOME, 'profiles')

/** App-exclusive profile name — never the dev `deepbuddy` profile. */
const APP_PROFILE = 'desktop'

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

// ── first-run migration (JS mirror of scripts/deepbuddy) ────────────────────
//
// Canonical semantics live in scripts/deepbuddy. This copy-run-migrate mirrors
// it: copy (never move) the isolation set from ~/.dsh into ~/.deepbuddy, with
// cp -RP-equivalent symlink preservation (the desktop profile's plugin link is
// NOT copied here — the app generates that profile itself). Only runs when
// ~/.deepbuddy does not exist. ~/.dsh is read-only.
function ensureDeepBuddyHome() {
  if (fs.existsSync(DEEP_BUDDY_HOME)) return
  console.log('[deepbuddy] first run — migrating config %s -> %s (copy, ~/.dsh untouched)', OFFICIAL_HOME, DEEP_BUDDY_HOME)
  fs.mkdirSync(DEEP_BUDDY_HOME, { recursive: true })
  fs.mkdirSync(path.join(DEEP_BUDDY_HOME, 'profiles'), { recursive: true })

  const copyPreservingSymlinks = (src, dest) => {
    // Node fs.cp with dereference:false preserves symlinks, exactly like cp -RP.
    fs.cpSync(src, dest, { recursive: true, dereference: false, force: true })
  }

  for (const f of ['settings.yaml', '.credentials.yaml', '.anonymous-user-id']) {
    const src = path.join(OFFICIAL_HOME, f)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DEEP_BUDDY_HOME, f))
  }
  for (const d of ['.agent-presets', 'storages', 'sessions']) {
    const src = path.join(OFFICIAL_HOME, d)
    if (fs.existsSync(src)) copyPreservingSymlinks(src, path.join(DEEP_BUDDY_HOME, d))
  }
  // The dev deepbuddy profile is NOT migrated (the app uses the desktop
  // profile). The official home's profiles are left untouched.
}

// ── app-exclusive desktop profile ───────────────────────────────────────────

/**
 * Generate ~/.deepbuddy/profiles/desktop idempotently. Its manifest mirrors
 * the dev profile (dsh-base + dsh-web-app bundles from the staged runtime;
 * dsh-plugin-deepbuddy from the bundled resources). The plugin is COPIED into
 * the profile's node_modules so it never links back to a source repo.
 *
 * Returns the profile directory (must exist before dsh boots).
 */
function ensureDesktopProfile(resourcesDir) {
  const profileDir = path.join(PROFILES_DIR, APP_PROFILE)
  const pluginDest = path.join(profileDir, 'node_modules', 'dsh-plugin-deepbuddy')
  const pluginSrc = path.join(resourcesDir, 'deepbuddy-plugin')
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true })
  if (!fs.existsSync(pluginSrc)) {
    throw new Error(`[deepbuddy] packaged plugin resources missing at ${pluginSrc}`)
  }
  // Re-copy the plugin every launch: the bundled version must always be the
  // one running, or an app upgrade would keep serving the seeded snapshot.
  fs.rmSync(path.join(profileDir, 'node_modules'), { recursive: true, force: true })
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.cpSync(pluginSrc, pluginDest, { recursive: true, force: true })

  const manifest = {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {
      'dsh-plugin-deepbuddy': 'file:node_modules/dsh-plugin-deepbuddy',
    },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-plugin-deepbuddy'],
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

/**
 * Spawn the packaged dsh runtime as a child of this main process, using
 * ELECTRON_RUN_AS_NODE so the harness runs on Electron's bundled Node (no
 * system Node dependency). Returns the child (killed on app quit).
 */
function spawnDsh(port) {
  const resourcesDir = process.resourcesPath ?? ''
  const runtimeDir = path.join(resourcesDir, 'dsh-runtime')
  // The staged tree lives under a literal node_modules so ESM bare imports
  // between the staged packages resolve by ancestor walk-up — NODE_PATH is
  // CJS-only and cannot carry them (stage-runtime.sh).
  const modulesDir = path.join(runtimeDir, 'node_modules')
  const binPath = path.join(modulesDir, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!fs.existsSync(binPath)) {
    throw new Error(`[deepbuddy] packaged dsh runtime missing at ${binPath}`)
  }
  const profileDir = ensureDesktopProfile(resourcesDir)

  const child = spawn(process.execPath, [binPath, '--profile', APP_PROFILE, '--port', String(port), '--no-open'], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: DEEP_BUDDY_HOME,
      // CJS requires anchored outside the runtime (the generated profile dir)
      // still find the same staged tree — one resolution target for both
      // module systems, so every package loads exactly once.
      NODE_PATH: modulesDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (b) => process.stdout.write(`[dsh] ${b}`))
  child.stderr?.on('data', (b) => process.stderr.write(`[dsh] ${b}`))
  return child
}

/** Poll the endpoint until HTTP 200 (the web server is up), or timeout. */
function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now()
  const attempt = () => new Promise((resolve) => {
    fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) })
      .then((r) => resolve(r.ok))
      .catch(() => resolve(false))
  })
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await attempt()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error(`[deepbuddy] dsh did not answer ${url} within ${timeoutMs}ms`))
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
    // Centered on the shell's single 52px header line (12px lights →
    // y 20..32): every column draws that one line, so the lights, the
    // sidebar toggle beside them and the dock toggle at the far right all
    // share a centerline (ThreeColumnFrame/ColumnFrame).
    trafficLightPosition: { x: 14, y: 20 },
    // The compositor shows this during fast drag/resize before the web
    // content repaints — it must match the UI's ground (--dsw-alias-bg-base
    // per scheme; the theme presenter follows the system by default), or the
    // window flashes the wrong shade.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151517' : '#ffffff',
    title: 'DeepBuddy',
    webPreferences: {
      webviewTag: true,
    },
  })
  win.removeMenu?.()
  win.loadURL(url)
  win.webContents.on('did-fail-load', () => {
    // The retry can outlive the window (quit while the server is still
    // coming up) — a loadURL on a destroyed window is an uncaught TypeError.
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(url)
    }, RETRY_MS)
  })
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
        console.log('[deepbuddy] screenshot written, quitting')
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

app.whenReady().then(async () => {
  const resourcesDir = process.resourcesPath ?? ''
  const runtimeBin = path.join(resourcesDir, 'dsh-runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (fs.existsSync(runtimeBin)) {
    // Packaged: own the dsh lifecycle.
    ensureDeepBuddyHome()
    const port = await findFreePort()
    const url = `http://127.0.0.1:${port}`
    const child = spawnDsh(port)
    app.on('before-quit', () => killChild(child))
    try {
      await waitForHttp(url)
    } catch (e) {
      killChild(child)
      throw e
    }
    createWindow(url)
  } else {
    // Dev mode: no packaged runtime — fall back to the old behavior (external
    // DSH_WEB_URL / default 3080).
    console.log('[deepbuddy] dev mode: no packaged runtime, loading %s', DSH_WEB_URL)
    createWindow(DSH_WEB_URL)
  }
}).catch((e) => {
  console.error('[deepbuddy] startup failed:', e)
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
