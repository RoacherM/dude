/**
 * xterm client for the host-owned, session-scoped PTY. The React tree owns
 * only the presentation and one WebSocket attachment: closing or switching
 * the dock disconnects this view, while the host keeps the PTY alive.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import xtermCss from '@xterm/xterm/css/xterm.css'
import type { InspectorViewProps } from '../../app/catalog.ts'
import { useAppDeps } from '../../app/context.tsx'
import { useStore } from '../../dsh/hooks.ts'
import { KIT } from '../../ui/kit.tsx'
import { Refresh, Stop } from '../../ui/icons.tsx'

type ConnectionState = 'connecting' | 'ready' | 'exited' | 'closed' | 'error'

interface TerminalMessage {
  type?: string
  data?: string
  cwd?: string
  message?: string
  exitCode?: number | null
  status?: 'running' | 'exited'
}

function terminalSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/deepbuddy/terminal?sessionId=${encodeURIComponent(sessionId)}`
}

function send(socket: WebSocket | null, message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

/** One xterm attachment. The host enforces the one-PTY-per-session rule. */
export function TerminalView(_props: InspectorViewProps): ReactNode {
  const { conversation } = useAppDeps()
  useStore(conversation)
  const sessionId = conversation.state.list?.current as string | undefined
  const mountRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<ConnectionState>('connecting')
  const [detail, setDetail] = useState('')
  const [restart, setRestart] = useState(0)

  useEffect(() => {
    if (sessionId === undefined || mountRef.current === null) return
    const mount = mountRef.current
    const styles = getComputedStyle(mount)
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily: styles.getPropertyValue('--db-mono').trim() || 'monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: styles.getPropertyValue('--db-window').trim() || '#151517',
        foreground: styles.getPropertyValue('--db-text-2').trim() || '#cfd3d6',
        cursor: styles.getPropertyValue('--db-text').trim() || '#f9fafb',
        selectionBackground: styles.getPropertyValue('--db-fill-6').trim() || '#3a3a3e',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(mount)

    let disposed = false
    let reconnectTimer: number | undefined
    let manuallyClosed = false

    const fitAndResize = (): void => {
      try {
        fit.fit()
        send(socketRef.current, { type: 'resize', cols: terminal.cols, rows: terminal.rows })
      } catch { /* the dock may be between layout frames */ }
    }
    const resizeObserver = new ResizeObserver(fitAndResize)
    resizeObserver.observe(mount)
    requestAnimationFrame(fitAndResize)

    const connect = (): void => {
      if (disposed || manuallyClosed) return
      setState('connecting')
      setDetail('')
      const socket = new WebSocket(terminalSocketUrl(sessionId))
      socketRef.current = socket
      socket.addEventListener('open', fitAndResize)
      socket.addEventListener('message', (event) => {
        let message: TerminalMessage
        try { message = JSON.parse(String(event.data)) as TerminalMessage }
        catch { return }
        if (message.type === 'snapshot') {
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
          manuallyClosed = true
          setState('closed')
        }
        else if (message.type === 'error') {
          manuallyClosed = true
          setDetail(message.message ?? '终端连接失败')
          setState('error')
        }
      })
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null
        if (!disposed && !manuallyClosed) reconnectTimer = window.setTimeout(connect, 800)
      })
    }

    const input = terminal.onData(data => { send(socketRef.current, { type: 'input', data }) })
    connect()
    return () => {
      disposed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      resizeObserver.disconnect()
      input.dispose()
      socketRef.current?.close()
      socketRef.current = null
      fit.dispose()
      terminal.dispose()
    }
  }, [sessionId, restart])

  if (sessionId === undefined) {
    return <div style={{ padding: 16 }}><KIT.EmptyState>还没有会话——发起一个任务后即可打开终端。</KIT.EmptyState></div>
  }

  const stop = (): void => {
    send(socketRef.current, { type: 'kill' })
    setState('closed')
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--db-window)' }}>
      <style>{xtermCss}</style>
      <div style={{ height: 34, flex: '0 0 34px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 12px', borderBottom: '1px solid var(--db-line)' }}>
        <KIT.Dot tone={state === 'ready' ? 'run' : state === 'connecting' ? 'await' : 'offline'} size={6} />
        <span title={detail} style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--db-mono)', fontSize: 11.5, color: state === 'error' ? 'var(--db-await)' : 'var(--db-text-4)' }}>
          {state === 'connecting' ? '正在连接…' : detail || (state === 'closed' ? '终端已关闭' : '终端')}
        </span>
        {state === 'closed' || state === 'exited' || state === 'error'
          ? (
              <KIT.IconButton title="重新启动终端" size={26} onClick={() => { setRestart(value => value + 1) }}>
                <Refresh size={13} />
              </KIT.IconButton>
            )
          : (
              <KIT.IconButton title="终止终端" size={26} disabled={state !== 'ready'} onClick={stop}>
                <Stop size={12} />
              </KIT.IconButton>
            )}
      </div>
      <div ref={mountRef} style={{ flex: '1 1 auto', minHeight: 0, padding: '8px 8px 4px', userSelect: 'text', overflow: 'hidden' }} />
    </div>
  )
}
