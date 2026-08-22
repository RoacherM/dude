/**
 * The files feature: the explorer inspector view.
 */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { FilesView } from './FilesView.tsx'

/** The view type's catalog definition. */
export const FilesViewDefinition: InspectorViewTypeDefinition = {
  id: 'explorer',
  title: '文件',
  icon: 'explorer',
  Component: FilesView,
}
export { FilesStore } from './store.ts'

export { FilesView }
