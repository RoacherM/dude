/**
 * The temporary occupants' subscription hook.
 *
 * Each occupant is its own React tree under its own slot entry, so they
 * subscribe to the shared store rather than reading it through a parent.
 */
import { useSyncExternalStore } from 'react'
import type { AppStore } from '../store.ts'

/**
 * Re-render this occupant whenever the data plane moves.
 * @param store - the shared store.
 */
export function useStore(store: AppStore): void {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
}
