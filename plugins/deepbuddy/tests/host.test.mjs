/**
 * Host-half behavior against the REAL filesystem backend.
 *
 * The fence is the only thing standing between a browser tab and the machine's
 * filesystem, so it is exercised against `@deepseek-ai/dsh-fs-local` over real
 * temp directories — real symlinks, real realpath resolution, real reads. Only
 * the sessions lookup is a stand-in: it contributes one string (the session's
 * cwd) and carrying the whole session persistence stack in here would test that
 * instead of this.
 *
 * The subject is the BUILT artifact (`lib/index.js`), which is what dsh loads.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { DeepbuddyFilesService } from '../lib/index.js'

/** Session id used by every fenced case. */
const SESSION = 'session-under-test'

/** Temp tree root; `root/` is the session workspace and its siblings are outside it. */
let base
/** The session's project root — the fence. */
let root
/** The service under test, wired to the real backend. */
let service
/** Cwd reported for {@link SESSION}; a test may point it elsewhere. */
let sessionCwd

before(async () => {
  // The seam reports realpaths, and macOS's temp dir is itself a symlink
  // (/var -> /private/var); realpath here so the fixture speaks the same paths.
  base = await realpath(await mkdtemp(join(tmpdir(), 'dbdy-')))
  root = join(base, 'work')
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(base, 'work-evil'), { recursive: true })
  await mkdir(join(base, 'outside'), { recursive: true })

  await writeFile(join(root, 'README.md'), '# Title\n\nbody\n')
  await writeFile(join(root, 'docs', 'guide.md'), 'guide\n')
  await writeFile(join(root, 'binary.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]))
  await writeFile(join(base, 'outside', 'secret.txt'), 'secret\n')
  // A prefix-name sibling: string containment would call this inside `work`.
  await writeFile(join(base, 'work-evil', 'secret.txt'), 'secret\n')
  await symlink(join(base, 'outside', 'secret.txt'), join(root, 'escape.txt'))

  sessionCwd = root
  const fsCtx = new Context()
  const fs = new LocalFileSystem(fsCtx, LocalFileSystem.Config({ cwd: base }))
  const ctx = {
    sessions: { get: id => (id === SESSION ? { header: { cwd: sessionCwd } } : undefined) },
    get: key => (key === 'fs' ? fs : undefined),
  }
  service = new DeepbuddyFilesService(ctx, { previewMaxChars: 262_144 })
})

after(async () => { await rm(base, { recursive: true, force: true }) })

/** Build a service sharing the fixture but with its own preview cap. */
function withCap(maxChars) {
  const fsCtx = new Context()
  const fs = new LocalFileSystem(fsCtx, LocalFileSystem.Config({ cwd: base }))
  const ctx = {
    sessions: { get: id => (id === SESSION ? { header: { cwd: root } } : undefined) },
    get: key => (key === 'fs' ? fs : undefined),
  }
  return new DeepbuddyFilesService(ctx, { previewMaxChars: maxChars })
}

/**
 * Build a service whose live session table is EMPTY — the shape a host plugin
 * row sees once the agent plane sits in another realm — backed by a session
 * persistence stand-in listing the given headers.
 */
function withPersistedOnly(headers) {
  const fsCtx = new Context()
  const fs = new LocalFileSystem(fsCtx, LocalFileSystem.Config({ cwd: base }))
  const ctx = {
    sessions: { get: () => undefined },
    get: key => (key === 'fs' ? fs : key === 'sessionPersistence' ? { list: async () => headers } : undefined),
  }
  return new DeepbuddyFilesService(ctx, { previewMaxChars: 262_144 })
}

describe('readFile fencing', () => {
  it('serves a file inside the session root', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, 'README.md') })
    assert.deepEqual(
      { kind: result.kind, text: result.text, truncated: result.truncated },
      { kind: 'text', text: '# Title\n\nbody\n', truncated: false },
    )
  })

  it('refuses a `..` traversal out of the root', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, '..', 'outside', 'secret.txt') })
    assert.deepEqual(result, { error: { kind: 'outside-root' } })
  })

  it('refuses a symlink whose target leaves the root', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, 'escape.txt') })
    assert.deepEqual(result, { error: { kind: 'outside-root' } })
  })

  it('refuses a sibling directory whose name has the root as a prefix', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(base, 'work-evil', 'secret.txt') })
    assert.deepEqual(result, { error: { kind: 'outside-root' } })
  })

  it('reports a missing file inside the root as not-found', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, 'nope.md') })
    assert.deepEqual(result, { error: { kind: 'not-found' } })
  })

  it('refuses a directory as not-regular', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, 'docs') })
    assert.deepEqual(result, { error: { kind: 'not-regular' } })
  })

  it('answers binary content as the binary channel instead of failing', async () => {
    const result = await service.readFile({ sessionId: SESSION, path: join(root, 'binary.bin') })
    assert.equal(result.kind, 'binary')
    assert.equal(result.size, 5)
  })

  it('refuses an unknown session before touching the filesystem', async () => {
    const result = await service.readFile({ sessionId: 'ghost', path: join(root, 'README.md') })
    assert.deepEqual(result, { error: { kind: 'session-not-found' } })
  })

  it('refuses a session with no recorded cwd', async () => {
    const previous = sessionCwd
    sessionCwd = undefined
    try {
      const result = await service.readFile({ sessionId: SESSION, path: join(root, 'README.md') })
      assert.deepEqual(result, { error: { kind: 'session-no-cwd' } })
    } finally {
      sessionCwd = previous
    }
  })

  it('refuses per request when the assembly has no filesystem', async () => {
    const ctx = { sessions: { get: () => ({ header: { cwd: root } }) }, get: () => undefined }
    const bare = new DeepbuddyFilesService(ctx, { previewMaxChars: 1024 })
    assert.deepEqual(
      await bare.readFile({ sessionId: SESSION, path: join(root, 'README.md') }),
      { error: { kind: 'fs-missing' } },
    )
  })

  it('rejects a malformed request without reaching the fence', async () => {
    assert.deepEqual(await service.readFile(null), { error: { kind: 'bad-request' } })
    assert.deepEqual(await service.readFile({ sessionId: SESSION }), { error: { kind: 'bad-request' } })
    assert.deepEqual(await service.readFile({ sessionId: SESSION, path: '' }), { error: { kind: 'bad-request' } })
  })
})

describe('readFile preview cap', () => {
  it('does not mark a file of exactly the cap as truncated', async () => {
    await writeFile(join(root, 'exact.txt'), 'a'.repeat(64))
    const result = await withCap(64).readFile({ sessionId: SESSION, path: join(root, 'exact.txt') })
    assert.deepEqual(
      { kind: result.kind, length: result.text.length, truncated: result.truncated },
      { kind: 'text', length: 64, truncated: false },
    )
  })

  it('truncates one code unit past the cap', async () => {
    await writeFile(join(root, 'over.txt'), 'a'.repeat(65))
    const result = await withCap(64).readFile({ sessionId: SESSION, path: join(root, 'over.txt') })
    assert.deepEqual(
      { length: result.text.length, truncated: result.truncated },
      { length: 64, truncated: true },
    )
  })

  it('never cuts a surrogate pair in half', async () => {
    // The cap lands between the emoji's two code units.
    await writeFile(join(root, 'emoji.txt'), `${'a'.repeat(9)}😀tail`)
    const result = await withCap(10).readFile({ sessionId: SESSION, path: join(root, 'emoji.txt') })
    assert.equal(result.text, 'a'.repeat(9))
    assert.equal(result.truncated, true)
    assert.equal([...result.text].length, 9, 'the preview decodes as whole characters')
  })
})

describe('listDirectory', () => {
  it('lists the session root when the path is empty', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: '' })
    assert.equal(result.path, root)
    const names = result.entries.map(entry => entry.name)
    assert.ok(names.includes('docs'), `expected docs in ${names.join(', ')}`)
    assert.ok(names.includes('README.md'), `expected README.md in ${names.join(', ')}`)
  })

  it('puts directories first and orders each group by name', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: '' })
    const directories = result.entries.filter(entry => entry.directory).map(entry => entry.name)
    const files = result.entries.filter(entry => !entry.directory).map(entry => entry.name)
    assert.deepEqual(result.entries.map(entry => entry.name), [...directories, ...files])
    assert.deepEqual(files, [...files].sort())
  })

  it('returns absolute child paths the caller can open directly', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: join(root, 'docs') })
    assert.deepEqual(result.entries, [{ name: 'guide.md', path: join(root, 'docs', 'guide.md'), directory: false }])
  })

  it('refuses a directory outside the root', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: join(base, 'outside') })
    assert.deepEqual(result, { error: { kind: 'outside-root' } })
  })

  it('refuses the prefix-name sibling', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: join(base, 'work-evil') })
    assert.deepEqual(result, { error: { kind: 'outside-root' } })
  })

  it('refuses a file as not-directory', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: join(root, 'README.md') })
    assert.deepEqual(result, { error: { kind: 'not-directory' } })
  })

  it('reports a missing directory as not-found', async () => {
    const result = await service.listDirectory({ sessionId: SESSION, path: join(root, 'no-such-dir') })
    assert.deepEqual(result, { error: { kind: 'not-found' } })
  })
})

describe('session root resolution', () => {
  it('falls back to the persisted header when the session is not live in this realm', async () => {
    const service = withPersistedOnly([{ id: SESSION, cwd: root }])
    const read = await service.readFile({ sessionId: SESSION, path: join(root, 'README.md') })
    assert.deepEqual(
      { kind: read.kind, text: read.text },
      { kind: 'text', text: '# Title\n\nbody\n' },
    )
    const listed = await service.listDirectory({ sessionId: SESSION, path: '' })
    assert.equal(listed.path, root)
  })

  it('fences a persisted session by its own recorded cwd', async () => {
    const service = withPersistedOnly([{ id: SESSION, cwd: root }])
    assert.deepEqual(
      await service.readFile({ sessionId: SESSION, path: join(base, 'outside', 'secret.txt') }),
      { error: { kind: 'outside-root' } },
    )
  })

  it('reports a persisted session with no recorded cwd as session-no-cwd', async () => {
    const service = withPersistedOnly([{ id: SESSION }])
    assert.deepEqual(
      await service.listDirectory({ sessionId: SESSION, path: '' }),
      { error: { kind: 'session-no-cwd' } },
    )
  })

  it('still reports a session absent from both planes as session-not-found', async () => {
    const service = withPersistedOnly([{ id: 'someone-else', cwd: root }])
    assert.deepEqual(
      await service.listDirectory({ sessionId: SESSION, path: '' }),
      { error: { kind: 'session-not-found' } },
    )
  })

  it('prefers the live session cwd over the persisted header', async () => {
    const fsCtx = new Context()
    const fs = new LocalFileSystem(fsCtx, LocalFileSystem.Config({ cwd: base }))
    const ctx = {
      sessions: { get: id => (id === SESSION ? { header: { cwd: root } } : undefined) },
      get: key => (key === 'fs' ? fs : key === 'sessionPersistence'
        ? { list: async () => [{ id: SESSION, cwd: join(base, 'outside') }] }
        : undefined),
    }
    const service = new DeepbuddyFilesService(ctx, { previewMaxChars: 262_144 })
    const listed = await service.listDirectory({ sessionId: SESSION, path: '' })
    assert.equal(listed.path, root)
  })
})

describe('typert registration', () => {
  it('claims exactly the two endpoints the browser half calls', async () => {
    const { DESCRIPTORS } = await import('../lib/index.js')
    assert.deepEqual(
      DESCRIPTORS.map(descriptor => `${descriptor.namespace}/${descriptor.method}`),
      ['deepbuddyFiles/readFile', 'deepbuddyFiles/listDirectory'],
    )
  })

  it('binds every descriptor to the service instance the Gateway will invoke', () => {
    assert.equal(service.typertRemote.service, service)
    assert.equal(service.typertRemote.serviceKey, 'deepbuddyFiles')
    assert.equal(service.typertRemote.namespace, 'deepbuddyFiles')
  })
})
