/** Multi-instance xterm client for host-owned, session-scoped PTYs. */
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import xtermCss from '@xterm/xterm/css/xterm.css'
import type { InspectorViewProps } from '../../app/catalog.ts'
import type { TabRef } from '../../shell/layout-store.ts'
import { useAppDeps } from '../../app/context.tsx'
import { dblog, dbwarn } from '../../log.ts'
import { KIT } from '../../ui/kit.tsx'
import { InspectorTabs } from '../../ui/InspectorTabs.tsx'
import { Refresh } from '../../ui/icons.tsx'

type ConnectionState = 'connecting' | 'ready' | 'exited' | 'closed' | 'error'

interface TerminalMessage {
  type?: string
  data?: string
  cwd?: string
  message?: string
  exitCode?: number | null
  status?: 'running' | 'exited'
}

let terminalCounter = 1

/** The session fence's share: restart the tab numbering with the session. */
export function fenceTerminalSession(): void {
  terminalCounter = 1
}

function terminalSocketUrl(sessionId: string, termId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const query = new URLSearchParams({ sessionId, termId })
  return `${protocol}//${window.location.host}/deepbuddy/terminal?${query.toString()}`
}

function send(socket: WebSocket | null, message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function nextTerminalTab(tabs: readonly TabRef[]): TabRef {
  const greatest = tabs.reduce((max, tab) => {
    const match = /^term-(\d+)$/.exec(tab.id)
    return match === null ? max : Math.max(max, Number(match[1]))
  }, 0)
  const number = Math.max(terminalCounter, greatest + 1)
  terminalCounter = number + 1
  return { id: `term-${number}`, label: `终端 ${number}` }
}

const TerminalPane = memo(function TerminalPane({ sessionId, termId, visible, onControl, onClosed }: {
  sessionId: string
  termId: string
  visible: boolean
  onControl: (termId: string, close: (() => void) | null) => void
  onClosed: (termId: string) => void
}): ReactNode {
  const mountRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<() => void>(() => {})
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const [state, setState] = useState<ConnectionState>('connecting')
  const [detail, setDetail] = useState('')
  const [restart, setRestart] = useState(0)

  useEffect(() => {
    if (mountRef.current === null) return
    const mount = mountRef.current
    // The screen is the embedded void, not the panel it sits on. Read the
    // tokens fresh per call: xterm bakes the theme into its canvas, so a
    // mount-time snapshot would leave a dark terminal on a light UI after a
    // theme switch — the observer below re-reads on every theme flip.
    const readTheme = () => {
      const styles = getComputedStyle(mount)
      return {
        background: styles.getPropertyValue('--db-void').trim() || '#0e0e10',
        foreground: styles.getPropertyValue('--db-text-3').trim() || '#a6a6ad',
        cursor: styles.getPropertyValue('--db-text').trim() || '#f4f4f5',
        selectionBackground: styles.getPropertyValue('--db-fill-6').trim() || '#3a3a3e',
      }
    }
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily: getComputedStyle(mount).getPropertyValue('--db-mono').trim() || 'monospace',
      fontSize: 12,
      lineHeight: 1.8,
      scrollback: 5000,
      theme: readTheme(),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(mount)
    // ThemePresenter flips `data-ds-dark-theme` on body; the kept-alive pane
    // must follow it or it keeps the stale scheme until a remount.
    const themeObserver = new MutationObserver(() => { terminal.options.theme = readTheme() })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    let disposed = false
    let reconnectTimer: number | undefined
    let resizeTimer: number | undefined
    // Two separate facts, not one flag: `hostTerminated` means the host ended
    // the resource (closed/error message) so no kill is owed — but the TAB
    // still closes on request. `closeRequested` is only the ×-click's own
    // idempotency; conflating them made error-state tabs unclosable once.
    let hostTerminated = false
    let closeRequested = false

    const closeResource = (): void => {
      if (closeRequested) return
      closeRequested = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (hostTerminated) {
        // The host already killed (closed) or never made (error) the PTY —
        // nothing to kill, just take the tab out of the ledger.
        onClosed(termId)
        return
      }
      hostTerminated = true
      // Kill over a fresh kill-intent connection: the host route kills on
      // sight without spawning, so no message ordering matters; the timeout
      // bounds a CONNECTING socket against a black-holed port. If even this
      // cannot connect, the PTY waits for session disposal as before.
      const bestEffortKill = (): void => {
        try {
          const killer = new WebSocket(`${terminalSocketUrl(sessionId, termId)}&intent=kill`)
          const killerTimeout = window.setTimeout(() => { killer.close() }, 5000)
          killer.addEventListener('close', () => { window.clearTimeout(killerTimeout) })
          killer.addEventListener('error', () => { killer.close() })
        } catch { /* fully offline — nothing to kill against */ }
      }
      const socket = socketRef.current
      if (socket === null || socket.readyState === WebSocket.CLOSED) {
        // No live socket (reconnect window, or already dead): the host keeps
        // the PTY until an explicit kill, so a silent tab removal would leak
        // it against the per-session limit.
        bestEffortKill()
        onClosed(termId)
        return
      }
      let finished = false
      const killAndClose = (): void => {
        if (finished) return
        finished = true
        // A socket that died between the ×-click and this callback cannot
        // carry the kill — deliver it out of band instead of dropping it.
        if (socket.readyState === WebSocket.OPEN) send(socket, { type: 'kill' })
        else bestEffortKill()
        socket.close()
        onClosed(termId)
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener('open', killAndClose, { once: true })
        // A socket that dies before ever opening still owes the tab its
        // removal — without this the tab is stuck at 正在连接 forever.
        socket.addEventListener('close', killAndClose, { once: true })
      }
      else killAndClose()
    }
    onControl(termId, closeResource)

    const fitAndResize = (): void => {
      if (!visibleRef.current) return
      try {
        fit.fit()
        send(socketRef.current, { type: 'resize', cols: terminal.cols, rows: terminal.rows })
      } catch { /* hidden panes and dock transitions can temporarily be 0x0 */ }
    }
    fitRef.current = fitAndResize
    // Shrinking an xterm reflows wrapped scrollback and is much more expensive
    // than growing it. ResizeObserver fires throughout a divider gesture, so
    // wait for the size to settle instead of reflowing the buffer every frame.
    const scheduleFitAndResize = (): void => {
      if (!visibleRef.current) return
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = undefined
        fitAndResize()
      }, 80)
    }
    const resizeObserver = new ResizeObserver(scheduleFitAndResize)
    resizeObserver.observe(mount)

    let reconnectAttempts = 0
    const connect = (): void => {
      if (disposed || hostTerminated || closeRequested) return
      setState('connecting')
      setDetail('')
      const socket = new WebSocket(terminalSocketUrl(sessionId, termId))
      socketRef.current = socket
      socket.addEventListener('open', fitAndResize)
      socket.addEventListener('message', (event) => {
        let message: TerminalMessage
        try { message = JSON.parse(String(event.data)) as TerminalMessage }
        catch { return }
        if (message.type === 'snapshot') {
          dblog('terminal', 'attached', { termId, cwd: message.cwd, status: message.status })
          reconnectAttempts = 0
          terminal.reset()
          if (message.data !== undefined) terminal.write(message.data)
          setDetail(message.cwd ?? '')
          setState(message.status === 'exited' ? 'exited' : 'ready')
          fitAndResize()
        }
        else if (message.type === 'output' && message.data !== undefined) terminal.write(message.data)
        else if (message.type === 'exit') {
          terminal.writeln(`\r\n[进程已退出${message.exitCode === null || message.exitCode === undefined ? '' : ` · ${message.exitCode}`}]`)
          setState('exited')
        }
        else if (message.type === 'closed') {
          hostTerminated = true
          setState('closed')
        }
        else if (message.type === 'error') {
          dbwarn('terminal', 'host refused the terminal', { termId, message: message.message })
          hostTerminated = true
          setDetail(message.message ?? '终端连接失败')
          setState('error')
        }
      })
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null
        }
        if (!disposed && !hostTerminated && !closeRequested) {
          // Exponential backoff, 800ms → 15s cap: a host that stays down must
          // not be hammered (and must not flood the always-on warn channel)
          // at a fixed 800ms forever. A successful attach resets the clock.
          const delay = Math.min(800 * 2 ** reconnectAttempts, 15_000)
          reconnectAttempts += 1
          if (reconnectAttempts <= 3) dbwarn('terminal', `socket dropped — reconnecting in ${delay}ms`, { termId })
          else dblog('terminal', `socket dropped — reconnecting in ${delay}ms`, { termId, attempt: reconnectAttempts })
          reconnectTimer = window.setTimeout(connect, delay)
        }
      })
    }

    const input = terminal.onData(data => { send(socketRef.current, { type: 'input', data }) })
    connect()
    return () => {
      disposed = true
      fitRef.current = () => {}
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
      themeObserver.disconnect()
      resizeObserver.disconnect()
      input.dispose()
      socketRef.current?.close()
      socketRef.current = null
      onControl(termId, null)
      fit.dispose()
      terminal.dispose()
    }
  }, [sessionId, termId, restart, onControl, onClosed])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => { fitRef.current() })
  }, [visible])

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* No rule under the meta row: the black screen below it already reads
          as a separate surface, and a hairline on top of that is the second
          separator DESIGN_INTENT §10 forbids. */}
      <div style={{ height: 34, flex: '0 0 34px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 12px' }}>
        <KIT.Dot tone={state === 'ready' ? 'run' : state === 'connecting' ? 'await' : 'offline'} size={6} />
        <span title={detail} style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--db-mono)', fontSize: 11.5, color: state === 'error' ? 'var(--db-await)' : 'var(--db-text-4)' }}>
          {state === 'connecting' ? '正在连接…' : detail || (state === 'closed' ? '终端已关闭' : '终端')}
        </span>
        {(state === 'closed' || state === 'exited' || state === 'error') && (
          <KIT.IconButton title="重新启动终端" size={26} onClick={() => { setRestart(value => value + 1) }}>
            <Refresh size={13} />
          </KIT.IconButton>
        )}
      </div>
      {/* The terminal is a block set INTO the panel, not the panel's floor:
          it keeps the column's 12px margin on three sides and carries its own
          hairline and card radius. */}
      <div
        ref={mountRef}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          margin: '0 12px 12px',
          padding: '12px 14px',
          border: '1px solid var(--db-line-panel)',
          borderRadius: 'var(--db-r-card)',
          background: 'var(--db-void)',
          userSelect: 'text',
          overflow: 'hidden',
        }}
      />
    </div>
  )
})

/** One kept-alive xterm pane per tab; only an explicit tab close kills it. */
export function TerminalView(props: InspectorViewProps): ReactNode {
  const { tabs, active, visible, onOpenTab, onCloseTab, onFocusTab } = props
  const { dsh } = useAppDeps()
  const currentSession = useCallback(() => dsh.sessions.list.getSnapshot().current as string | undefined, [dsh])
  const sessionId = useSyncExternalStore(dsh.sessions.list.subscribe, currentSession, currentSession)
  const controls = useRef(new Map<string, () => void>())
  // Once per mount: the session fence remounts this view, so a new session
  // gets its own first-tab auto-open without any session tracking here.
  const initialized = useRef(false)
  const onControl = useCallback((termId: string, close: (() => void) | null): void => {
    if (close === null) controls.current.delete(termId)
    else controls.current.set(termId, close)
  }, [])
  const closeTabRef = useRef(onCloseTab)
  closeTabRef.current = onCloseTab
  const finishClose = useCallback((termId: string): void => {
    controls.current.delete(termId)
    closeTabRef.current(termId)
  }, [])

  const add = useCallback((): void => {
    if (sessionId === undefined) return
    onOpenTab(nextTerminalTab(tabs))
  }, [sessionId, tabs, onOpenTab])

  useEffect(() => {
    if (!visible || sessionId === undefined || initialized.current) return
    initialized.current = true
    if (tabs.length === 0) add()
  }, [visible, sessionId, tabs.length, add])

  const close = (termId: string): void => {
    const control = controls.current.get(termId)
    if (control === undefined) finishClose(termId)
    else control()
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{xtermCss}</style>
      <InspectorTabs tabs={tabs} active={active} onFocus={onFocusTab} onClose={close} onAdd={add} />
      {sessionId === undefined
        ? <div style={{ padding: 16 }}><KIT.EmptyState>还没有会话——发起一个任务后即可打开终端。</KIT.EmptyState></div>
        : tabs.length === 0
          ? <div style={{ padding: 16 }}><KIT.EmptyState>点击 + 新建终端。</KIT.EmptyState></div>
          : tabs.map(tab => (
              <div
                key={tab.id}
                data-terminal-tab={tab.id}
                style={{ display: tab.id === active ? 'flex' : 'none', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}
              >
                <TerminalPane
                  sessionId={sessionId}
                  termId={tab.id}
                  visible={visible && tab.id === active}
                  onControl={onControl}
                  onClosed={finishClose}
                />
              </div>
            ))}
    </div>
  )
}
