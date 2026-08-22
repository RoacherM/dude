/**
 * DeepBuddy desktop shell.
 *
 * v1 is a window over a locally running `dsh --profile deepbuddy` (the
 * distribution profile: official dsh-base + dsh-web-app bundles plus
 * dsh-plugin-deepbuddy, whose frame is the resident UI). The whole UI lives in
 * the plugin; the shell contributes macOS chrome — hiddenInset native traffic
 * lights aligned to the frame's 48px window row, and the drag regions the
 * plugin declares via -webkit-app-region. Point DSH_WEB_URL elsewhere for a
 * non-default port.
 *
 * A later version replaces the HTTP dependency with the harness's planned
 * file:// + IPC-fetch carrier (see deepseek-harness docs/subsystems/web-server.md).
 */
const { app, BrowserWindow, shell } = require('electron')

/** Where the deepbuddy profile's web server listens; `--port` moves it. */
const DSH_WEB_URL = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
/** Retry cadence while the profile's web server is still coming up. */
const RETRY_MS = 1000

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    // Center the native lights in the frame's 48px window row.
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#fafaf9',
    title: 'DeepBuddy',
  })
  win.removeMenu?.()
  win.loadURL(DSH_WEB_URL)
  win.webContents.on('did-fail-load', () => {
    setTimeout(() => { void win.loadURL(DSH_WEB_URL) }, RETRY_MS)
  })
  // External links leave the shell for the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Verification hook: DSH_DESKTOP_SCREENSHOT=/path.png captures the loaded
  // window and exits, so a headless check can prove the shell renders.
  const shot = process.env.DSH_DESKTOP_SCREENSHOT
  if (shot) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        require('node:fs').writeFileSync(shot, image.toPNG())
        app.quit()
      }, 1500)
    })
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
