const assert = require('node:assert/strict')
const { test } = require('node:test')
const { KernelUpdates } = require('./updates.js')
const { compareVersions } = require('./kernel.js')

/**
 * A KernelUpdates with scripted ports. `answers` are the button indexes the
 * user picks, in order; every dialog and every published presentation is
 * recorded.
 */
function setup({ latest = '0.1.8', answers = [], tasks = false, download, restart } = {}) {
  const log = { dialogs: [], published: [], restarts: [] }
  let version = '0.1.7'
  const updates = new KernelUpdates({
    currentVersion: () => version,
    latestRelease: async () => {
      if (latest instanceof Error) throw latest
      return latest
    },
    compareVersions,
    download: download ?? (async (v, onProgress) => {
      onProgress(40)
      onProgress(99)
      return `/runtime/${v}`
    }),
    inspectTasks: async () => {
      if (tasks instanceof Error) throw tasks
      return tasks
    },
    restart: restart ?? (async (v, dir) => {
      log.restarts.push(dir)
      version = v
    }),
    ask: async (dialog) => {
      log.dialogs.push(dialog)
      return answers.shift() ?? dialog.buttons.length - 1
    },
    publish: (presentation) => log.published.push(presentation),
  })
  return { updates, log }
}

test('a background check finds an update without any dialog', async () => {
  const { updates, log } = setup()
  await updates.checkQuietly()
  assert.deepEqual(updates.presentation, { phase: 'available', version: '0.1.8' })
  assert.equal(log.dialogs.length, 0)
})

test('a failed background check stays silent and leaves the state idle', async () => {
  const { updates, log } = setup({ latest: new Error('getaddrinfo ENOTFOUND registry.npmjs.org') })
  await updates.checkQuietly()
  assert.deepEqual(updates.presentation, { phase: 'idle' })
  assert.equal(log.dialogs.length, 0)
})

test('the menu check says so when the kernel is current', async () => {
  const { updates, log } = setup({ latest: '0.1.7' })
  await updates.open(true)
  assert.equal(updates.state.phase, 'idle')
  assert.match(log.dialogs[0].message, /内核已是最新：dsh 0\.1\.7/)
})

test('clicking the available status downloads with progress and ends ready', async () => {
  const { updates, log } = setup()
  await updates.checkQuietly()
  await updates.open()
  assert.equal(log.dialogs.length, 0, 'the sidebar click itself is the consent')
  assert.deepEqual(log.published.filter((p) => p.phase === 'downloading').map((p) => p.percent), [0, 40, 99])
  assert.deepEqual(updates.presentation, { phase: 'ready', version: '0.1.8' })
})

test('the menu confirms before downloading, and "later" downloads nothing', async () => {
  const { updates, log } = setup({ answers: [1] })
  await updates.open(true)
  assert.match(log.dialogs[0].message, /发现 dsh 0\.1\.8（当前 0\.1\.7）/)
  assert.equal(updates.state.phase, 'available')
})

test('install and restart switches the kernel and returns to idle', async () => {
  const { updates, log } = setup({ answers: [0] })
  await updates.checkQuietly()
  await updates.open()
  await updates.open()
  assert.equal(log.dialogs[0].buttons[0], '安装并重启')
  assert.deepEqual(log.restarts, ['/runtime/0.1.8'])
  assert.ok(log.published.some((p) => p.phase === 'installing'))
  assert.deepEqual(updates.presentation, { phase: 'idle' })
})

test('running tasks are named, and "later" keeps the download ready', async () => {
  const { updates, log } = setup({ tasks: true, answers: [1] })
  await updates.checkQuietly()
  await updates.open()
  await updates.open()
  assert.equal(log.dialogs[0].message, '仍有进行中的任务')
  assert.deepEqual(log.dialogs[0].buttons, ['停止任务并更新', '稍后'])
  assert.equal(log.restarts.length, 0)
  assert.deepEqual(updates.presentation, { phase: 'ready', version: '0.1.8' })
})

test('unknown task state blocks the restart and can be retried', async () => {
  const { updates, log } = setup({ tasks: new Error('dsh did not report its tasks within 2000ms') })
  await updates.checkQuietly()
  await updates.open()
  await updates.open()
  assert.equal(log.restarts.length, 0)
  assert.deepEqual(updates.presentation, { phase: 'error', version: '0.1.8', failure: 'tasks-unavailable' })
  assert.equal(updates.state.dir, '/runtime/0.1.8', 'the download is kept for the retry')
})

test('a kernel that does not boot is reported, and the retry starts over from a check', async () => {
  let restarts = 0
  const { updates, log } = setup({
    answers: [0, 0],
    restart: async () => {
      restarts++
      throw new Error('dsh 0.1.8 没能启动，已回到 0.1.7。')
    },
  })
  await updates.checkQuietly()
  await updates.open()
  await updates.open()
  assert.deepEqual(updates.presentation, { phase: 'error', version: '0.1.8', failure: 'install' })
  assert.match(log.dialogs.at(-1).detail, /没能启动/)
  // Retry: the broken runtime is gone, so the flow checks again and re-downloads.
  await updates.open()
  assert.equal(restarts, 1)
  assert.deepEqual(updates.presentation, { phase: 'ready', version: '0.1.8' })
})

test('a network failure while downloading gets the network copy', async () => {
  const { updates, log } = setup({
    download: async () => {
      throw new Error('pnpm install exited 1:\nERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/... ECONNRESET')
    },
  })
  await updates.checkQuietly()
  await updates.open()
  assert.deepEqual(updates.presentation, { phase: 'error', version: '0.1.8', failure: 'download-network' })
  assert.match(log.dialogs[0].message, /网络连接异常/)
})

test('a second click while downloading joins the running download', async () => {
  let finish
  const { updates } = setup({ download: () => new Promise((resolve) => { finish = resolve }) })
  await updates.checkQuietly()
  const first = updates.open()
  const second = updates.open()
  assert.equal(first, second)
  finish('/runtime/0.1.8')
  await first
  assert.equal(updates.state.phase, 'ready')
})
