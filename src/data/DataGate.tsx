/* oxlint-disable react/only-export-components -- a context module owns its gate, its hook and its value type; splitting them would scatter one responsibility */
/**
 * The one place business data is loaded, before any view renders.
 *
 * WHY THIS EXISTS
 *
 * `App` used to read localStorage synchronously in its state initialisers. Moving
 * business data to IndexedDB breaks that shape: an IndexedDB open is always
 * asynchronous, and the console cannot render its first honest frame until the data
 * has either arrived or been declared unreachable. Rather than teaching the console
 * to render half-initialised, the load happens once, here, above auth and routing,
 * and the result is handed down through context.
 *
 * Responsibilities, in order:
 *
 * 1. Pick a store - the optional `store` prop (tests inject a MemoryStore) or
 *    `createDataStore()`, which prefers IndexedDB.
 * 2. Load it once. While loading, render the boot screen: the same token-styled
 *    placeholder the auth layer uses, so the two async layers read as one load.
 * 3. If the load REJECTS, fall back to `LocalStorageStore` and keep the app running.
 *    The degradation is never silent: for as long as the active backend is
 *    localstorage, a warning banner sits above the view, because that is a property
 *    of the whole session, not of the one failure that caused it.
 * 4. Publish `{ store, snapshot, legacyBackup, recovered }` through context.
 *    Consumers read it with `useDataGate()`; there is no second load path anywhere
 *    in the app.
 *
 * The `broken` screen is the only unrecoverable case: even the fallback refused to
 * load. It is reachable only if a store violates its never-throw contract, and it
 * exists so that violation degrades to a readable screen instead of a white one.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createDataStore } from './createDataStore'
import { LocalStorageStore } from './LocalStorageStore'
import type { DataSnapshot, DataStore } from './DataStore'

/** What the app reads from the one completed load. */
export interface DataGateValue {
  store: DataStore
  snapshot: DataSnapshot
  /**
   * True when legacy localStorage keys were found during the store's one-time
   * migration. The Admin page surfaces it; nothing else acts on it.
   */
  legacyBackup: boolean
  /**
   * True when saved rows could not be read and the store substituted demo data.
   * Always a boolean here, even though stores may omit it when nothing was lost.
   */
  recovered: boolean
}

const DataGateContext = createContext<DataGateValue | null>(null)

/**
 * Reads the completed load. Throws outside the provider so a component mounted under
 * the wrong tree fails loudly instead of silently degrading to whatever it guesses.
 */
export function useDataGate(): DataGateValue {
  const value = useContext(DataGateContext)
  if (value === null) {
    throw new Error('useDataGate must be used inside <DataGate>')
  }
  return value
}

type GatePhase =
  | { phase: 'loading' }
  | {
      phase: 'ready'
      store: DataStore
      snapshot: DataSnapshot
      legacyBackup: boolean
      recovered: boolean
    }
  | { phase: 'broken' }

export interface DataGateProps {
  children: React.ReactNode
  /**
   * Overrides `createDataStore()`. Production never passes this; tests do, so the
   * gate can be exercised without a real browser database.
   */
  store?: DataStore
}

const FALLBACK_WARNING =
  'IndexedDB is unavailable, so OmniHR is using the older localStorage copy. It may not include changes made since IndexedDB was last available. Changes here are saved to localStorage and may not merge back.'

const RECOVERED_WARNING =
  'Some saved data could not be read and was replaced by demo data.'

const BROKEN_MESSAGE =
  'OmniHR could not read or prepare its data storage in this browser. Close this tab and reopen OmniHR. If the problem remains, clear this site\u2019s storage from your browser settings.'

export const DataGate: React.FC<DataGateProps> = ({ children, store: storeProp }) => {
  const [phase, setPhase] = useState<GatePhase>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    const primary = storeProp ?? createDataStore()

    const boot = async () => {
      try {
        const loaded = await primary.load()
        if (!cancelled) {
          setPhase({
            phase: 'ready',
            store: primary,
            ...loaded,
            recovered: loaded.recovered === true,
          })
        }
        return
      } catch {
        /* the primary backend refused to load; the fallback below decides the outcome */
      }

      // A fresh fallback store, not a retry of the failed one: a blocked IndexedDB
      // open says nothing about localStorage, which is exactly the backend this
      // switch is for. `LocalStorageStore` reports `unavailable` for the Admin page.
      const fallback = new LocalStorageStore('unavailable')
      try {
        const loaded = await fallback.load()
        if (!cancelled) {
          setPhase({
            phase: 'ready',
            store: fallback,
            ...loaded,
            recovered: loaded.recovered === true,
          })
        }
      } catch {
        // Unreachable while LocalStorageStore honours its never-throw contract. If
        // that contract is ever broken, this is the readable screen instead of a
        // white one - never children, because no view can render honest data.
        if (!cancelled) setPhase({ phase: 'broken' })
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [storeProp])

  // Computed before the early returns so the hook order never depends on the phase.
  const value = useMemo<DataGateValue | null>(
    () =>
      phase.phase === 'ready'
        ? {
            store: phase.store,
            snapshot: phase.snapshot,
            legacyBackup: phase.legacyBackup,
            recovered: phase.recovered,
          }
        : null,
    [phase],
  )

  if (phase.phase === 'loading') {
    return (
      <div className="boot-screen" role="status">
        Loading OmniHR…
      </div>
    )
  }

  if (phase.phase !== 'ready' || value === null) {
    return (
      <div className="boot-screen" role="alert">
        {BROKEN_MESSAGE}
      </div>
    )
  }

  return (
    <DataGateContext.Provider value={value}>
      {/*
        These warnings live here, above every view, because they describe the load
        itself: the banner in `App` reports single failed writes, these report where
        the data lives and whether any of it had to be discarded. Same token classes
        as that banner, so the tone comes from the CSS layer and the warnings read as
        one system. A fallback load can also have recovered rows, so both may appear.
      */}
      {phase.store.backend === 'localstorage' && (
        <div className="alert tone-warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{FALLBACK_WARNING}</span>
        </div>
      )}
      {phase.recovered && (
        <div className="alert tone-warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{RECOVERED_WARNING}</span>
        </div>
      )}
      {children}
    </DataGateContext.Provider>
  )
}
