/**
 * The settings feature: the settings workbench app and its two pages.
 */
import type { WorkbenchAppDefinition } from '../../app/catalog.ts'
import { SettingsApp } from './SettingsApp.tsx'

/** The settings app's catalog definition. */
export const SettingsAppDefinition: WorkbenchAppDefinition = {
  id: 'settings',
  title: '设置',
  Component: SettingsApp,
}

export { SettingsApp }
export { ModesPage } from './ModesPage.tsx'
export { PluginsPage } from './PluginsPage.tsx'
export { SettingsStore } from './store.ts'
