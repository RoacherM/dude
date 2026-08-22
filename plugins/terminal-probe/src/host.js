/**
 * dsh-plugin-terminal-probe — host half.
 *
 * One Remote endpoint on the Typert Gateway's shared `/api` channel,
 * `terminalProbe/exec`: run one foreground command through the host's own
 * `ctx.shell` executor and hand back the leaf facts the panel prints. Command
 * execution therefore inherits whatever sandbox the assembly's executor
 * applies (`bash-sandbox` on this profile) — the probe adds no escape hatch of
 * its own.
 *
 * The descriptor is hand-written rather than generated for the same reason
 * workspace-shell's is: an out-of-tree plugin has no access to the harness's
 * reflection generator, and every service here is reached through the injected
 * Context by name and called structurally, so the plugin ships no copy of the
 * harness runtime.
 */

/** Stable Cordis plugin name. */
export const name = 'terminal-probe'

/**
 * Required services. `shell` stays out on purpose: a missing executor is a
 * per-request refusal the panel prints in red, not a reason to leave the whole
 * surface unmounted — the same failure discipline the distribution's own
 * plugins follow.
 */
export const inject = ['typert']

/** Cordis service key and Remote wire namespace of the host half. */
const SERVICE_KEY = 'terminalProbe'

/** npm package name, used as the Typert contribution's owner identity. */
const PACKAGE_NAME = 'dsh-plugin-terminal-probe'

/** Wall-clock ceiling for one probe command. */
const TIMEOUT_MS = 15_000

/** Foreground stdout capture budget; the panel prints text, not files. */
const STDOUT_MAX_BYTES = 64 * 1024

/** The single strict invocation descriptor: `terminalProbe/exec`. */
const DESCRIPTORS = [{
  id: `${PACKAGE_NAME}#${SERVICE_KEY}/exec`,
  service: SERVICE_KEY,
  namespace: SERVICE_KEY,
  method: 'exec',
  invocation: { kind: 'direct' },
  parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
  result: { mode: 'src-json' },
}]

/**
 * Run one command for the panel and answer in leaf JSON.
 *
 * `typertRemote` is the visible binding the Gateway validates before it
 * invokes anything: it must name this exact instance, service key, and
 * namespace. The record is written by hand for the same reason the descriptor
 * is — binding one plain frozen object needs no shared module.
 */
class TerminalProbeService {
  #ctx

  /**
   * @param ctx - the plugin's own Context, used to reach `shell` at call time.
   */
  constructor(ctx) {
    this.#ctx = ctx
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: SERVICE_KEY,
      namespace: SERVICE_KEY,
    })
  }

  /**
   * Execute one foreground command.
   * @param request - `{ command }`; anything else is refused.
   * @returns the run's leaf facts, or `{ error }` — never a throw, because a
   *   thrown transport failure would read as a broken page rather than a
   *   command that did not work.
   */
  async exec(request) {
    const command = typeof request === 'object' && request !== null ? request.command : undefined
    if (typeof command !== 'string' || command.trim() === '') {
      return { error: { kind: 'bad-request', message: 'command must be a non-empty string' } }
    }
    const shell = this.#ctx.get('shell')
    if (shell === undefined) {
      return { error: { kind: 'shell-missing', message: 'this assembly composes no ctx.shell executor' } }
    }
    try {
      const spec = shell.resolve({ command, timeoutMs: TIMEOUT_MS, stdoutMaxBytes: STDOUT_MAX_BYTES })
      const result = await shell.run(spec)
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        stdout: result.stdout.text,
        stderr: result.stderr.text,
        truncated: result.stdout.truncated || result.stderr.truncated,
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { error: { kind: 'shell-error', message } }
    }
  }
}

/**
 * Seat the service and publish its endpoint.
 * @param ctx - the plugin Context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.provide(SERVICE_KEY, new TerminalProbeService(ctx)), 'terminal-probe: service')
  ctx.effect(() => ctx.typert.register({
    package: PACKAGE_NAME,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: DESCRIPTORS,
  }), 'terminal-probe: typert definitions')
}

export { DESCRIPTORS, SERVICE_KEY }
