/** The governed, first-party browser inspector view. */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { BrowserView } from './BrowserView.tsx'

export const BrowserViewDefinition: InspectorViewTypeDefinition = {
  id: 'browser',
  title: '浏览器',
  icon: 'globe',
  Component: BrowserView,
}

export { BrowserView, normalizeBrowserUrl } from './BrowserView.tsx'
