/** Kept-alive multi-tab browser: desktop webviews with an iframe fallback. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { InspectorViewProps } from '../../app/catalog.ts'
import type { TabRef } from '../../shell/layout-store.ts'
import { IN_ELECTRON } from '../../shell/ColumnFrame.tsx'
import { KIT } from '../../ui/kit.tsx'
import { InspectorTabs } from '../../ui/InspectorTabs.tsx'
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

interface WebviewNavigationEvent extends Event {
  errorCode?: number
  validatedURL?: string
  isMainFrame?: boolean
  title?: string
  url?: string
}

interface BrowserResourceState {
  input: string
  url: string
}

/** Survives a dock-column unmount; the layout ledger supplies the stable ids. */
const browserResources = new Map<string, BrowserResourceState>()
let browserCounter = 1

/** Add the intended scheme without turning localhost into an HTTPS request. */
export function normalizeBrowserUrl(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value
  const local = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
  return `${local ? 'http' : 'https'}://${value}`
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname || url }
  catch { return url }
}

function openExternal(url: string): void {
  if (url !== '') window.open(url, '_blank', 'noopener,noreferrer')
}

function nextBrowserTab(tabs: readonly TabRef[]): TabRef {
  const greatest = tabs.reduce((max, tab) => {
    const match = /^browser-(\d+)$/.exec(tab.id)
    return match === null ? max : Math.max(max, Number(match[1]))
  }, 0)
  const number = Math.max(browserCounter, greatest + 1)
  browserCounter = number + 1
  return { id: `browser-${number}`, label: '新标签页' }
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

function BrowserPane({ tabId, onLabel }: { tabId: string; onLabel: (label: string) => void }): ReactNode {
  const initial = browserResources.get(tabId) ?? { input: '', url: '' }
  const [input, setInputState] = useState(initial.input)
  const [url, setUrlState] = useState(initial.url)
  const [failed, setFailed] = useState(false)
  const [webview, setWebview] = useState<WebviewElement | null>(null)
  const [history, setHistory] = useState({ back: false, forward: false })
  const [reload, setReload] = useState(0)
  const currentNavigation = useRef(initial.url)
  const webviewRef = useCallback((node: HTMLElement | null): void => {
    setWebview(node as WebviewElement | null)
  }, [])

  const persist = (nextInput: string, nextUrl: string): void => {
    browserResources.set(tabId, { input: nextInput, url: nextUrl })
  }
  const setInput = (next: string): void => {
    setInputState(next)
    persist(next, url)
  }
  const navigate = (): void => {
    const next = normalizeBrowserUrl(input)
    if (next === '') return
    currentNavigation.current = next
    setFailed(false)
    setInputState(next)
    setUrlState(next)
    persist(next, next)
    if (!IN_ELECTRON) onLabel(hostnameOf(next))
  }

  useEffect(() => {
    if (webview === null) return
    const navigationStarted = (event: Event): void => {
      const next = (event as WebviewNavigationEvent).url
      if (next !== undefined && next !== '') currentNavigation.current = next
      setFailed(false)
    }
    const sync = (): void => {
      const current = webview.getURL()
      if (current !== '') {
        currentNavigation.current = current
        setInputState(current)
        setUrlState(current)
        persist(current, current)
      }
      setFailed(false)
      setHistory({ back: webview.canGoBack(), forward: webview.canGoForward() })
    }
    const fail = (event: Event): void => {
      const failure = event as WebviewNavigationEvent
      if (failure.isMainFrame === false || failure.errorCode === -3) return
      if (failure.validatedURL !== undefined && failure.validatedURL !== '' && failure.validatedURL !== currentNavigation.current) return
      setFailed(true)
    }
    const title = (event: Event): void => {
      const next = (event as WebviewNavigationEvent).title?.trim()
      if (next !== undefined && next !== '') onLabel(next)
    }
    webview.addEventListener('will-navigate', navigationStarted)
    webview.addEventListener('did-start-loading', navigationStarted)
    webview.addEventListener('did-navigate', sync)
    webview.addEventListener('did-navigate-in-page', sync)
    webview.addEventListener('did-fail-load', fail)
    webview.addEventListener('page-title-updated', title)
    return () => {
      webview.removeEventListener('will-navigate', navigationStarted)
      webview.removeEventListener('did-start-loading', navigationStarted)
      webview.removeEventListener('did-navigate', sync)
      webview.removeEventListener('did-navigate-in-page', sync)
      webview.removeEventListener('did-fail-load', fail)
      webview.removeEventListener('page-title-updated', title)
    }
  }, [webview, tabId, onLabel])

  const onAddressKeyDown = (event: KeyboardEvent<Element>): void => {
    if (event.key === 'Enter') navigate()
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 42, flex: '0 0 42px', display: 'flex', alignItems: 'center', gap: 3, padding: '0 8px', borderBottom: '1px solid var(--db-line)' }}>
        <KIT.IconButton title="后退" size={28} disabled={!IN_ELECTRON || !history.back} onClick={() => { webview?.goBack() }}><ArrowLeft size={13} /></KIT.IconButton>
        <KIT.IconButton title="前进" size={28} disabled={!IN_ELECTRON || !history.forward} onClick={() => { webview?.goForward() }}><ArrowRight size={13} /></KIT.IconButton>
        <KIT.IconButton title="刷新" size={28} disabled={url === ''} onClick={() => {
          setFailed(false)
          currentNavigation.current = url
          if (IN_ELECTRON) webview?.reload()
          else setReload(current => current + 1)
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
            ? <webview ref={webviewRef} src={url} style={{ flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, background: 'white' }} />
            : (
                <iframe
                  key={`${url}:${reload}`}
                  src={url}
                  title="浏览器"
                  onLoad={() => { setFailed(false) }}
                  onError={() => { setFailed(true) }}
                  style={{ flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, background: 'white' }}
                />
              )}
    </div>
  )
}

export function BrowserView(props: InspectorViewProps): ReactNode {
  const { tabs, active, visible, onOpenTab, onCloseTab, onFocusTab } = props
  const initialized = useRef(false)
  const add = useCallback((): void => {
    onOpenTab(nextBrowserTab(tabs))
  }, [tabs, onOpenTab])

  useEffect(() => {
    if (!visible || initialized.current) return
    initialized.current = true
    if (tabs.length === 0) add()
  }, [visible, tabs.length, add])

  const close = (tabId: string): void => {
    browserResources.delete(tabId)
    onCloseTab(tabId)
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <InspectorTabs tabs={tabs} active={active} onFocus={onFocusTab} onClose={close} onAdd={add} />
      {tabs.length === 0
        ? <div style={{ padding: 16 }}><KIT.EmptyState>点击 + 新建浏览器标签。</KIT.EmptyState></div>
        : tabs.map(tab => (
            <div
              key={tab.id}
              data-browser-tab={tab.id}
              style={{ display: tab.id === active ? 'flex' : 'none', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}
            >
              <BrowserPane tabId={tab.id} onLabel={(label) => { onOpenTab({ id: tab.id, label }) }} />
            </div>
          ))}
    </div>
  )
}
