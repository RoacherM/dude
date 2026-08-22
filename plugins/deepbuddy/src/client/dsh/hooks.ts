/**
 * React hooks for the data surfaces every feature renders from.
 *
 * Two shapes, one pattern: a DSH `ObservableSnapshot` (immutable value +
 * subscribe) and the per-fiber stores (mutable state + version counter) both
 * expose `{ subscribe, getSnapshot }` — `useSyncExternalStore` wants exactly
 * that, so both are read through the same two hooks.
 */
import { useSyncExternalStore } from 'react'

/** The observable surface a store or snapshot must expose. */
export interface Readable {
  subscribe(listener: () => void): () => void
  getSnapshot(): unknown
}

/** The store flavour: a monotonic version is the uSES snapshot. */
export interface Versioned {
  subscribe(listener: () => void): () => void
  getVersion(): number
}

/**
 * Re-render this component whenever an observable snapshot changes.
 *
 * The snapshot itself is the uSES getSnapshot source: it is immutable and
 * reference-stable, so reads never force a re-render.
 * @param source - the observable to follow.
 * @returns the current snapshot.
 */
export function useSnapshot<T>(source: { subscribe(listener: () => void): () => void; getSnapshot(): T }): T {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}

/**
 * Re-render this component whenever a per-fiber store moves.
 *
 * Each slot tree is its own React boundary, so the stores are followed here
 * rather than through a shared parent — the version bumps synchronously per
 * mutation, so a notification is never stale.
 * @param store - the store to follow.
 */
export function useStore(store: Versioned): void {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
}
