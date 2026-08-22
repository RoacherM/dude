/**
 * The per-fiber dependency bundle and the React context that carries it.
 *
 * Every store is created once per plugin fiber in app/App.tsx and provided at
 * the root occupant, so every slot tree below — the sidebar and main columns
 * included — reads the same instances. This is the composition contract
 * features import: each feature pulls the stores it renders from, never the
 * assembly, and never one another's internals.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Dsh } from '../dsh/adapter.ts'
import type { PresetPlane } from '../dsh/presets.ts'
import type { ModelsPlane } from '../dsh/models.ts'
import type { LayoutStore } from '../shell/layout-store.ts'
import type { ConversationStore } from '../features/conversation/index.ts'
import type { FilesStore } from '../features/files/index.ts'
import type { SettingsStore } from '../features/settings/index.ts'

/** The fiber's shared stores and wires. */
export interface AppDeps {
  /** The DSH wire bundle (adapter). */
  dsh: Dsh
  /** Shell state: columns, selection, inspector instances. */
  layout: LayoutStore
  /** The shared agent-preset plane (adapter). */
  presets: PresetPlane
  /** Conversation's data plane. */
  conversation: ConversationStore
  /** The provider/model plane (adapter). */
  models: ModelsPlane
  /** Files' data plane. */
  files: FilesStore
  /** Settings' data plane. */
  settings: SettingsStore
}

const AppDepsContext = createContext<AppDeps | null>(null)

/** Provide the fiber's stores to one slot tree. */
export function AppDepsProvider({ value, children }: { value: AppDeps; children: ReactNode }): ReactNode {
  return <AppDepsContext.Provider value={value}>{children}</AppDepsContext.Provider>
}

/**
 * Read the fiber's stores. Only the root occupant may mount above the
 * provider; any component inside a slot tree may consume.
 */
export function useAppDeps(): AppDeps {
  const deps = useContext(AppDepsContext)
  if (deps === null) throw new Error('useAppDeps outside the root occupant provider')
  return deps
}
