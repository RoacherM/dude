/**
 * Browser half of the terminal-probe plugin: a floating terminal panel
 * registered into the frame's `shell.overlay` list slot.
 *
 * This is the P4a acceptance probe (ARCHITECTURE.md「P4a 验收案例」), so it is
 * deliberately written the way any third-party plugin would be — one
 * `slots.inject('shell.overlay', …)` registration, no knowledge of DeepBuddy
 * whatsoever, styles under its own class prefix, everything on the plugin
 * fiber. If it renders and runs a command inside the DeepBuddy frame, the
 * open surface is genuinely open.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the SlotMap merge that declares 'shell.overlay'. The row
// that DECLARES the seat at runtime is DeepBuddy's frame, not this package —
// the merge is a compile-time fact about the key's shape.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-terminal-probe'

/** Required client services: the slot registry and the RPC wire. */
export const inject = ['slots', 'connection']

/** The `shell.overlay` list entry id — the cell this plugin occupies. */
const ENTRY_ID = 'terminal-probe'

/** Sorted after the workspace drawer's 100 so the two coexist predictably. */
const ENTRY_ORDER = 200

/** One printed line of the session transcript. */
interface Line {
  tone: 'command' | 'out' | 'err' | 'note'
  text: string
}

/** What `terminalProbe/exec` answers. */
type ExecResult =
  | { exitCode: number | null; signal: string | null; timedOut: boolean; stdout: string; stderr: string; truncated: boolean }
  | { error: { kind: string; message: string } }

/** The generic RPC caller the Connection service exposes to the browser. */
interface ConnectionRpc {
  call(channel: string, endpoint: string, payload: unknown): Promise<
    { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
  >
}

const CSS = `
.dshtp {
  position: absolute;
  right: 56px;
  bottom: 16px;
  width: 460px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  /* Alias tokens, not literals: the panel follows whatever theme the frame's
     presenter projects, which is the whole point of the token bridge. */
  border: 1px solid var(--dsw-alias-border-l1, #d5d2ce);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #201e1d);
  box-shadow: 0 12px 32px rgba(28, 25, 23, .18);
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dshtp-head {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #d5d2ce);
  color: var(--dsw-alias-label-secondary, #605d5d);
  font-weight: 600;
}
.dshtp-out {
  flex: 1 1 auto;
  min-height: 96px;
  overflow-y: auto;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.dshtp-command { color: var(--dsw-alias-brand-text, #ec3013); }
.dshtp-err { color: #d33; }
.dshtp-note { color: var(--dsw-alias-label-secondary, #605d5d); }
.dshtp-in {
  flex: 0 0 auto;
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l1, #d5d2ce);
  background: transparent;
  color: inherit;
  padding: 8px 10px;
  outline: none;
  font: inherit;
}
`

/**
 * Install the plugin's stylesheet.
 * @returns disposer removing the style element (rides the plugin fiber).
 */
function installStyles(): () => void {
  const el = document.createElement('style')
  el.dataset['owner'] = name
  el.textContent = CSS
  document.head.append(el)
  return () => { el.remove() }
}

/**
 * Call the host half.
 * @param rpc - `connection.rpc`.
 * @param command - the command line to run.
 * @returns the host's answer, refusals included.
 */
async function exec(rpc: ConnectionRpc, command: string): Promise<ExecResult> {
  const result = await rpc.call('/api', 'terminalProbe/exec', { args: { request: { command } } })
  if (!result.ok) return { error: { kind: result.error.code, message: result.error.message } }
  return result.value as ExecResult
}

/**
 * Build the panel component over a bound RPC.
 * @param rpc - `connection.rpc`.
 * @returns the component to register into 'shell.overlay'.
 */
function createPanel(rpc: ConnectionRpc): () => ReactNode {
  return function TerminalProbePanel(): ReactNode {
    const [lines, setLines] = useState<Line[]>([
      { tone: 'note', text: 'terminal-probe · shell.overlay · 回车执行' },
    ])
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const outRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
      const el = outRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, [lines])

    const submit = useCallback(() => {
      const command = draft.trim()
      if (command === '' || busy) return
      setDraft('')
      setBusy(true)
      setLines(prev => [...prev, { tone: 'command', text: `$ ${command}` }])
      void exec(rpc, command).then((r) => {
        setBusy(false)
        if ('error' in r) {
          setLines(prev => [...prev, { tone: 'err', text: `${r.error.kind}: ${r.error.message}` }])
          return
        }
        setLines((prev) => {
          const next = [...prev]
          if (r.stdout !== '') next.push({ tone: 'out', text: r.stdout.replace(/\n$/, '') })
          if (r.stderr !== '') next.push({ tone: 'err', text: r.stderr.replace(/\n$/, '') })
          const how = r.timedOut ? 'timed out' : r.signal === null ? `exit ${r.exitCode}` : `signal ${r.signal}`
          next.push({ tone: 'note', text: `[${how}]${r.truncated ? ' (truncated)' : ''}` })
          return next
        })
      })
    }, [draft, busy])

    return (
      <div className="dshtp">
        <div className="dshtp-head">terminal-probe</div>
        <div className="dshtp-out" ref={outRef}>
          {lines.map((line, i) => (
            <div key={i} className={`dshtp-${line.tone}`}>{line.text}</div>
          ))}
        </div>
        <input
          className="dshtp-in"
          value={draft}
          placeholder={busy ? '运行中…' : '输入命令，回车执行'}
          disabled={busy}
          onChange={(e) => { setDraft(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </div>
    )
  }
}

/**
 * Mount the panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => installStyles(), 'terminal-probe: styles')
  // The browser `connection` service is reached through `ctx.get`, not a
  // Context member: the cordis Context type carries the HOST connection under
  // that name, and the runtime plugin resolves the browser one the same way.
  const connection = ctx.get('connection') as ConnectionHandle
  const Panel = createPanel(connection.rpc as ConnectionRpc)
  // `slots.inject` waits for the frame to declare the seat and re-registers if
  // the frame is ever replaced; its disposal rides this plugin's fiber.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: ENTRY_ID, order: ENTRY_ORDER, label: 'Terminal probe' },
    Panel,
  ))
}
