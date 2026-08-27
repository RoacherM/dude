/** The governed, first-party browser inspector view. */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { BrowserView, fenceBrowserSession, nextBrowserTab } from './BrowserView.tsx'

export const BrowserViewDefinition: InspectorViewTypeDefinition = {
  id: 'browser',
  title: '浏览器',
  icon: 'globe',
  Component: BrowserView,
  createTab: nextBrowserTab,
  onSessionFence: fenceBrowserSession,
}

export { BrowserView, nextBrowserTab, normalizeBrowserUrl } from './BrowserView.tsx'
