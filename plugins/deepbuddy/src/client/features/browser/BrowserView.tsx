/** Kept-alive multi-tab browser: desktop webviews with an iframe fallback. */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import type { InspectorViewProps } from '../../app/catalog.ts'
import type { TabRef } from '../../shell/layout-store.ts'
import { IN_ELECTRON } from '../../shell/ColumnFrame.tsx'
import { dbwarn } from '../../log.ts'
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
  loadURL(url: string): Promise<void>
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

/** Kept pages per departed session, mirroring the shell's tab-ledger stash. */
const browserStash = new Map<string, { resources: Map<string, BrowserResourceState>; counter: number }>()

/**
 * The session fence's share: stash the departing session's kept pages under
 * its id and restore the arriving session's — the shell restores that
 * session's browser tabs in the same fence, and a restored tab without its
 * URL would come back as an empty shell.
 */
export function fenceBrowserSession(from?: string, to?: string, live?: ReadonlySet<string>): void {
  if (from !== undefined) browserStash.set(from, { resources: new Map(browserResources), counter: browserCounter })
  if (live !== undefined) {
    for (const key of [...browserStash.keys()]) {
      if (!live.has(key)) browserStash.delete(key)
    }
  }
  browserResources.clear()
  browserCounter = 1
  const stashed = to === undefined ? undefined : browserStash.get(to)
  if (stashed !== undefined) {
    for (const [id, page] of stashed.resources) browserResources.set(id, page)
    browserCounter = stashed.counter
  }
}

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

/**
 * Load-failure card OVER the live guest, not instead of it. Replacing the
 * webview would destroy its history and leave the back button pointing at
 * null — the guest stays mounted, the card floats, retry just reloads.
 */
function LoadFailure({ url, code, onRetry }: { url: string; code: number | undefined; onRetry: () => void }): ReactNode {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, background: 'var(--db-void)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <KIT.EmptyState>{`页面加载失败${code === undefined ? '' : `（${code}）`}`}</KIT.EmptyState>
        <div style={{ display: 'flex', gap: 8 }}>
          <KIT.Button size={34} onClick={onRetry}><Refresh size={13} />重试</KIT.Button>
          <KIT.Button size={34} onClick={() => { openExternal(url) }}><ExternalLink size={13} />在系统浏览器打开</KIT.Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The page area: the same embedded void the terminal and the file preview sit
 * in, so a loaded page, an empty address bar and a refused embed all occupy
 * one block instead of three differently-shaped regions.
 */
const PAGE_BLOCK: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  margin: 12,
  border: '1px solid var(--db-line-panel)',
  borderRadius: 'var(--db-r-card)',
  background: 'var(--db-void)',
  overflow: 'hidden',
}

const BrowserPane = memo(function BrowserPane({ tabId, onLabel }: { tabId: string; onLabel: (label: string) => void }): ReactNode {
  const initial = browserResources.get(tabId) ?? { input: '', url: '' }
  const [input, setInputState] = useState(initial.input)
  const [url, setUrlState] = useState(initial.url)
  // The webview's `src` is DELIBERATELY a separate state that only explicit
  // user navigation writes. Feeding the synced current URL back into `src`
  // makes every guest-initiated navigation reload once more — and turns SPA
  // in-page routing (pushState) into a full page load that wipes the page.
  const [src, setSrc] = useState(initial.url)
  const [failed, setFailed] = useState(false)
  const [failCode, setFailCode] = useState<number | undefined>(undefined)
  const [webview, setWebview] = useState<WebviewElement | null>(null)
  const [history, setHistory] = useState({ back: false, forward: false })
  const [reload, setReload] = useState(0)
  const currentNavigation = useRef(initial.url)
  const onLabelRef = useRef(onLabel)
  onLabelRef.current = onLabel
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
    // A live webview navigates imperatively: `src` is a React prop, so
    // re-entering the URL the guest has since left (same string as the last
    // explicit navigation) diffs as no-op and the Enter goes dead. `src`
    // still seeds the element on (re)mount.
    if (IN_ELECTRON && webview !== null) {
      // loadURL throws SYNCHRONOUSLY when the guest is not attached yet
      // (element mounted, dom-ready pending) — a .catch on the returned
      // promise never sees that. Fall back to the src seed, which is what
      // drives the element until the guest exists anyway.
      try { void Promise.resolve(webview.loadURL(next)).catch(() => { /* did-fail-load 已兜底 */ }) }
      catch { setSrc(next) }
    }
    else {
      setSrc(next)
      // The iframe fallback has the same dead-Enter shape (`src={url}` +
      // remount key) — bump the key so every Enter is a real (re)load.
      setReload(current => current + 1)
    }
    if (!IN_ELECTRON) onLabelRef.current(hostnameOf(next))
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
      // Log origin only — a failed URL can carry OAuth codes and signed query
      // strings, and dbwarn is always on and lands in field reports.
      dbwarn('browser', 'page load failed', { tabId, errorCode: failure.errorCode, host: hostnameOf(failure.validatedURL ?? currentNavigation.current) })
      setFailCode(failure.errorCode)
      setFailed(true)
    }
    const title = (event: Event): void => {
      const next = (event as WebviewNavigationEvent).title?.trim()
      if (next !== undefined && next !== '') onLabelRef.current(next)
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
  }, [webview, tabId])

  const onAddressKeyDown = (event: KeyboardEvent<Element>): void => {
    if (event.key === 'Enter') navigate()
  }

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* The toolbar floats over the panel with no rule under it — the page
          block below carries its own edge. */}
      <div style={{ height: 42, flex: '0 0 42px', display: 'flex', alignItems: 'center', gap: 3, padding: '12px 12px 0' }}>
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
          // The address bar is a filled field, not an outlined one: at this
          // size a stroke reads as a second toolbar edge. Keyboard focus is
          // still visible — the global :focus-visible ring in tokens.ts.
          style={{ flex: '1 1 auto', minWidth: 80, border: 0, borderRadius: 'var(--db-r-control)', background: 'var(--db-fill-2)', fontSize: 12.5 }}
        />
        <KIT.IconButton title="在系统浏览器打开" size={28} disabled={url === ''} onClick={() => { openExternal(url) }}><ExternalLink size={13} /></KIT.IconButton>
      </div>
      <div style={PAGE_BLOCK}>
        {url === ''
          ? (
              <div style={{ flex: '1 1 auto', display: 'grid', placeItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--db-text-5)' }}>
                  <Globe size={28} />
                  <span style={{ fontSize: 12.5 }}>输入地址开始浏览</span>
                </div>
              </div>
            )
          : IN_ELECTRON
            ? (
                <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
                  {/* allowpopups lets window.open/_blank requests REACH the
                      main process, where the desktop shell's
                      setWindowOpenHandler denies the popup and navigates this
                      same webview instead. Without it Electron drops the
                      request before any handler runs — result links on search
                      pages click dead. The partition keeps guest cookies and
                      storage out of the app's own default session. */}
                  <webview ref={webviewRef} src={src} partition="persist:dbdy-guest" allowpopups="true" style={{ flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, background: 'white' }} />
                  {failed && <LoadFailure url={url} code={failCode} onRetry={() => { setFailed(false); webview?.reload() }} />}
                </div>
              )
            : failed
              ? <EmbedRefusal url={url} />
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
    </div>
  )
})

/** Only the two tabs whose visibility changes re-render on a tab switch. */
const BrowserTabMount = memo(function BrowserTabMount({ tabId, active, onOpenTab }: {
  tabId: string
  active: boolean
  onOpenTab: InspectorViewProps['onOpenTab']
}): ReactNode {
  const onLabel = useCallback((label: string) => { onOpenTab({ id: tabId, label }) }, [onOpenTab, tabId])
  return (
    <div
      data-browser-tab={tabId}
      style={{ display: active ? 'flex' : 'none', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}
    >
      <BrowserPane tabId={tabId} onLabel={onLabel} />
    </div>
  )
})

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

  const close = useCallback((tabId: string): void => {
    browserResources.delete(tabId)
    onCloseTab(tabId)
  }, [onCloseTab])

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <InspectorTabs tabs={tabs} active={active} onFocus={onFocusTab} onClose={close} onAdd={add} />
      {tabs.length === 0
        ? <div style={{ padding: 16 }}><KIT.EmptyState>点击 + 新建浏览器标签。</KIT.EmptyState></div>
        : tabs.map(tab => (
            <BrowserTabMount key={tab.id} tabId={tab.id} active={tab.id === active} onOpenTab={onOpenTab} />
          ))}
    </div>
  )
}
