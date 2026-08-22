/**
 * The sessions feature: the sidebar's session list section.
 */
import type { SidebarSectionDefinition } from '../../app/catalog.ts'
import { SessionList } from './SessionList.tsx'

/** The section's catalog definition. */
export const SessionListSectionDefinition: SidebarSectionDefinition = {
  id: 'sessions',
  Component: SessionList,
}

export { SessionList }
