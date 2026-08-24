/** Desktop webview browser with an iframe fallback for the ordinary web app. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { InspectorViewProps } from '../../app/catalog.ts'
import { IN_ELECTRON } from '../../shell/ColumnFrame.tsx'
import { KIT } from '../../ui/kit.tsx'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Refresh } from '../../ui/icons.tsx'

interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
}

/** Add the intended scheme without turning localhost into an HTTPS request. */
export function normalizeBrowserUrl(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value
  const local = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
  return `${local ? 'http' : 'https'}://${value}`
}

function openExternal(url: string): void {
  if (url !== '') window.open(url, '_blank', 'noopener,noreferrer')
}

function EmbedRefusal({ url }: { url: string }): ReactNode {
  return (
    <div style={{ flex: '1 1 auto', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <KIT.EmptyState>该站点拒绝嵌入</KIT.EmptyState>
        <KIT.Button size={34} onClick={() => { openExternal(url) }}><ExternalLink size={13} />在系统浏览器打开</KIT.Button>
      </div>
    </div>
  )
}

export function BrowserView(_props: InspectorViewProps): ReactNode {
  const [input, setInput] = useState('')
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const [webview, setWebview] = useState<WebviewElement | null>(null)
  const [history, setHistory] = useState({ back: false, forward: false })
  const [reload, setReload] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const webviewRef = useCallback((node: HTMLElement | null): void => {
    setWebview(node as WebviewElement | null)
  }, [])

  const navigate = (): void => {
    const next = normalizeBrowserUrl(input)
    if (next === '') return
    setInput(next)
    setFailed(false)
    setUrl(next)
  }

  useEffect(() => {
    if (webview === null) return
    const sync = (): void => {
      const current = webview.getURL()
      if (current !== '') {
        setInput(current)
        setUrl(current)
      }
      setFailed(false)
      setHistory({ back: webview.canGoBack(), forward: webview.canGoForward() })
    }
    const fail = (): void => { setFailed(true) }
    webview.addEventListener('did-navigate', sync)
    webview.addEventListener('did-navigate-in-page', sync)
    webview.addEventListener('did-fail-load', fail)
    return () => {
      webview.removeEventListener('did-navigate', sync)
      webview.removeEventListener('did-navigate-in-page', sync)
      webview.removeEventListener('did-fail-load', fail)
    }
  }, [webview])

  const onAddressKeyDown = (event: KeyboardEvent<Element>): void => {
    if (event.key === 'Enter') navigate()
  }

  const iframeLoaded = (): void => {
    const frame = iframeRef.current
    if (frame === null) return
    try {
      // A refused cross-origin frame commonly remains an accessible blank
      // document; a successfully loaded cross-origin document throws here.
      const href = frame.contentWindow?.location.href
      setFailed(href === 'about:blank' && url !== 'about:blank')
    } catch {
      setFailed(false)
    }
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 42, flex: '0 0 42px', display: 'flex', alignItems: 'center', gap: 3, padding: '0 8px', borderBottom: '1px solid var(--db-line)' }}>
        <KIT.IconButton title="后退" size={28} disabled={!IN_ELECTRON || !history.back} onClick={() => { webview?.goBack() }}><ArrowLeft size={13} /></KIT.IconButton>
        <KIT.IconButton title="前进" size={28} disabled={!IN_ELECTRON || !history.forward} onClick={() => { webview?.goForward() }}><ArrowRight size={13} /></KIT.IconButton>
        <KIT.IconButton title="刷新" size={28} disabled={url === ''} onClick={() => {
          if (IN_ELECTRON) webview?.reload()
          else setReload(current => current + 1)
          setFailed(false)
        }}><Refresh size={13} /></KIT.IconButton>
        <KIT.Input
          value={input}
          onChange={setInput}
          onKeyDown={onAddressKeyDown}
          placeholder="输入网址"
          mono
          size={30}
          style={{ flex: '1 1 auto', minWidth: 80, borderRadius: 8 }}
        />
        <KIT.IconButton title="在系统浏览器打开" size={28} disabled={url === ''} onClick={() => { openExternal(url) }}><ExternalLink size={13} /></KIT.IconButton>
      </div>
      {url === ''
        ? (
            <div style={{ flex: '1 1 auto', display: 'grid', placeItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--db-text-5)' }}>
                <Globe size={28} />
                <span style={{ fontSize: 12.5 }}>输入地址开始浏览</span>
              </div>
            </div>
          )
        : failed
          ? <EmbedRefusal url={url} />
          : IN_ELECTRON
            ? (
                <webview
                  ref={webviewRef}
                  src={url}
                  style={{ flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, background: 'white' }}
                />
              )
            : (
                <iframe
                  key={`${url}:${reload}`}
                  ref={iframeRef}
                  src={url}
                  title="浏览器"
                  onLoad={iframeLoaded}
                  onError={() => { setFailed(true) }}
                  style={{ flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, background: 'white' }}
                />
              )}
    </div>
  )
}
