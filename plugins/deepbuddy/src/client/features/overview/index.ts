/**
 * The overview feature: the dock's 概览 view (conversation outline + session
 * deliverables).
 */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { OverviewView } from './OverviewView.tsx'

/** The view's catalog definition. */
export const OverviewViewDefinition: InspectorViewTypeDefinition = {
  id: 'overview',
  title: '概览',
  icon: 'outline',
  Component: OverviewView,
}
