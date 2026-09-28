/**
 * Kernel update state and the user flow around it, modelled on the official
 * desktop app's updater so the official web UI can show it: the settings
 * plugin (`dsh-client-ui-settings-general`) reads `window.dshDesktop.updates`
 * (protocol 1, exposed by preload.cjs) and draws the sidebar status — "新版本",
 * the download percent, "安装并重启", "重试更新". The page only displays the
 * presentation and calls `open()`; this module decides what a click means.
 *
 *   idle ─check→ checking → available ─open→ downloading N% → ready
 *   ready ─open→ installing (ask about running tasks, confirm) → restart → idle
 *   any step can fail → error, which remembers the failed operation for retry
 *
 * The official app replaces the whole app; Dude replaces only the kernel
 * (kernel.js installs it, main.js restarts dsh on it). Everything with side
 * effects comes in through `ports`, so the flow is testable without Electron.
 */

/** Same idea as the official presentation: network failures get their own copy. */
const NETWORK_FAILURE = /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|ERR_PNPM_META_FETCH_FAIL|ERR_SOCKET_TIMEOUT/

/** Dialog copy for each failure kind, the official Simplified Chinese wording. */
const FAILURE_COPY = {
  check: '检查更新失败，请稍后重试。',
  'check-network': '检查更新失败，请稍后重试。网络连接异常，请检查网络后重试。',
  download: '下载更新失败，请重试。',
  'download-network': '下载更新失败，请重试。网络连接异常，请检查网络后重试。',
  install: '安装更新失败，请稍后重试。',
  'install-network': '安装更新失败，请稍后重试。网络连接异常，请检查网络后重试。',
  'tasks-unavailable': '无法确认任务状态，请在工作区就绪后重试更新。',
}

function failed(state, operation) {
  return state.phase === 'error' && state.operation === operation
}

class KernelUpdates {
  /**
   * @param ports.currentVersion - () => the running kernel's version.
   * @param ports.latestRelease - () => the newest upstream version.
   * @param ports.compareVersions - semver order, kernel.js.
   * @param ports.download - (version, onProgress) => the installed runtime directory.
   * @param ports.inspectTasks - () => whether stopping dsh now interrupts work; rejects when unknown.
   * @param ports.restart - (version, dir) => dsh running on the new kernel; on failure it has
   *   already deleted `dir` and brought the old kernel back.
   * @param ports.ask - ({ type, message, detail, buttons }) => the index of the chosen button;
   *   the last button is the cancel choice.
   * @param ports.publish - (presentation) => void, fanned out to every page.
   */
  constructor(ports) {
    this.ports = ports
    this.current = { phase: 'idle' }
    this.operation = undefined
  }

  get state() {
    return this.current
  }

  /** What the official web UI reads: `{ phase, version?, percent?, failure? }`. */
  get presentation() {
    const { phase, version, percent } = this.current
    return {
      phase,
      ...(version === undefined ? {} : { version }),
      ...(percent === undefined ? {} : { percent }),
      ...(phase === 'error' ? { failure: this.failureKind(this.current) } : {}),
    }
  }

  /**
   * Background poll. It stays quiet: no dialog, no "checking" status, and a
   * failure leaves the state as it was. A known update is not re-checked.
   */
  async checkQuietly() {
    if (this.operation !== undefined || this.current.phase !== 'idle') return
    try {
      const latest = await this.ports.latestRelease()
      if (this.operation === undefined && this.current.phase === 'idle' && this.isNewer(latest)) {
        this.set({ phase: 'available', version: latest })
      }
    } catch (e) {
      console.error('[dude] background kernel update check failed:', e)
    }
  }

  /**
   * The user's click on the sidebar status or the menu item. A click while an
   * action runs joins it instead of starting a second one.
   * @param manual - from the menu: always re-check, and confirm before downloading.
   */
  open(manual = false) {
    this.operation ??= this.run(manual).finally(() => {
      this.operation = undefined
    })
    return this.operation
  }

  async run(manual) {
    let state = this.current
    // A kernel that failed to boot has been deleted; start over from a check.
    if (failed(state, 'install') && state.dir === undefined) state = this.set({ phase: 'idle' })
    if (manual || state.phase === 'idle' || failed(state, 'check')) state = await this.check()

    if (failed(state, 'check')) return this.showFailure(state)
    if (state.phase === 'idle') {
      await this.ports.ask({
        type: 'info',
        message: `内核已是最新：dsh ${this.ports.currentVersion()}`,
        detail: 'npm 的 latest / next 通道没有更新的版本。',
        buttons: ['好'],
      })
      return
    }
    if (state.phase === 'ready' || failed(state, 'install')) return this.install(state)
    if (state.phase === 'available' || failed(state, 'download')) {
      if (manual) {
        const response = await this.ports.ask({
          type: 'question',
          message: `发现 dsh ${state.version}（当前 ${this.ports.currentVersion()}）`,
          detail: '新内核从 npm 下载，约 500MB，在后台进行，进度显示在 Dude 菜单里（0.1.7 起的内核在侧栏左下角也有）。下好后点「安装并重启」切换。\n\n'
            + '这个版本没有经过 Dude 的测试和冒烟。新内核起不来时会删掉它，回到当前版本。',
          buttons: ['下载', '稍后'],
        })
        if (response !== 0) return
      }
      return this.download(state.version)
    }
  }

  async check() {
    if (['available', 'downloading', 'ready'].includes(this.current.phase)) return this.current
    this.set({ phase: 'checking' })
    try {
      const latest = await this.ports.latestRelease()
      return this.set(this.isNewer(latest) ? { phase: 'available', version: latest } : { phase: 'idle' })
    } catch (e) {
      return this.set({ phase: 'error', operation: 'check', message: String(e?.message ?? e) })
    }
  }

  async download(version) {
    this.set({ phase: 'downloading', version, percent: 0 })
    try {
      const dir = await this.ports.download(version, (percent) => {
        this.set({ phase: 'downloading', version, percent })
      })
      this.set({ phase: 'ready', version, dir })
    } catch (e) {
      await this.showFailure(this.set({ phase: 'error', operation: 'download', version, message: String(e?.message ?? e) }))
    }
  }

  async install({ version, dir }) {
    this.set({ phase: 'installing', version, dir })
    let active
    try {
      active = await this.ports.inspectTasks()
    } catch (e) {
      return this.showFailure(this.set({
        phase: 'error', operation: 'install', failure: 'tasks-unavailable', version, dir, message: String(e?.message ?? e),
      }))
    }
    const response = await this.ports.ask(active
      ? {
          type: 'warning',
          message: '仍有进行中的任务',
          detail: '重启更新会中断这些任务，是否要继续更新？',
          buttons: ['停止任务并更新', '稍后'],
        }
      : {
          type: 'info',
          message: `dsh ${version} 已下载`,
          detail: '选择「安装并重启」重启内核并切换到新版本，窗口会重新加载。\n\n'
            + '这个版本没有经过 Dude 的测试和冒烟。新内核起不来时会删掉它，回到当前版本。',
          buttons: ['安装并重启', '稍后'],
        })
    if (response !== 0) {
      this.set({ phase: 'ready', version, dir })
      return
    }
    try {
      await this.ports.restart(version, dir)
      this.set({ phase: 'idle' })
    } catch (e) {
      await this.showFailure(this.set({ phase: 'error', operation: 'install', version, message: String(e?.message ?? e) }))
    }
  }

  failureKind(state) {
    if (state.failure !== undefined) return state.failure
    return NETWORK_FAILURE.test(state.message ?? '') ? `${state.operation}-network` : state.operation
  }

  showFailure(state) {
    return this.ports.ask({
      type: 'error',
      message: FAILURE_COPY[this.failureKind(state)],
      detail: state.message ?? '',
      buttons: ['好'],
    })
  }

  isNewer(version) {
    return this.ports.compareVersions(version, this.ports.currentVersion()) > 0
  }

  set(state) {
    this.current = state
    this.ports.publish(this.presentation)
    return state
  }
}

module.exports = { KernelUpdates }
