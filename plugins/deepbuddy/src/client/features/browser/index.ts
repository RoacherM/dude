/** The governed, first-party browser inspector view. */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { BrowserView, fenceBrowserSession } from './BrowserView.tsx'

export const BrowserViewDefinition: InspectorViewTypeDefinition = {
  id: 'browser',
  title: '浏览器',
  icon: 'globe',
  Component: BrowserView,
  onSessionFence: fenceBrowserSession,
}

export { BrowserView, normalizeBrowserUrl } from './BrowserView.tsx'
