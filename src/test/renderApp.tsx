/**
 * Shared render helper for tests that exercise `App` through the data seam.
 *
 * WHY THIS EXISTS
 *
 * The existing suite renders `<App />` bare on purpose: those tests pin the
 * synchronous localStorage contract and must keep working unchanged (design decision
 * D9). Newer tests need the IndexedDB-era behaviour - state seeded from a store's
 * snapshot and saves routed to `dataStore` - without each one hand-assembling the
 * theme provider, a snapshot and a store.
 *
 * The store defaults to a fresh `MemoryStore` (isolated from localStorage,
 * synchronous semantics under the async interface) and `initialData` defaults to
 * that store's snapshot, so a bare `await renderApp()` mounts the console exactly as
 * the DataGate would feed it. Passing `dataStore`/`initialData` explicitly overrides
 * either, which is how tests mount a mock store to assert on what App writes.
 */
import { render, type RenderResult } from '@testing-library/react'
import { App } from '../App'
import { ThemeProvider } from '../theme/ThemeContext'
import { MemoryStore } from '../data/MemoryStore'
import type { DataSnapshot, DataStore, StoreBackend } from '../data/DataStore'

export interface RenderAppOptions {
  /** Replaces the store's own snapshot as the data App starts from. */
  initialData?: DataSnapshot
  /** Defaults to a fresh `MemoryStore`. */
  dataStore?: DataStore
  /**
   * What the Admin page reports as the storage backend. Defaults to the store's
   * own backend - the exact value the DataGate hands RootView in production -
   * so a test can override it only when it wants to pin a specific report.
   */
  backend?: StoreBackend
  /** Defaults to `false`, as the DataGate reports for a store with no migration. */
  legacyBackup?: boolean
}

export interface RenderAppResult extends RenderResult {
  /** The store App was mounted with, for assertions on what App wrote to it. */
  store: DataStore
}

export async function renderApp(options: RenderAppOptions = {}): Promise<RenderAppResult> {
  const store = options.dataStore ?? new MemoryStore()
  const initialData = options.initialData ?? (await store.load()).snapshot
  const backend = options.backend ?? store.backend

  const view = render(
    <ThemeProvider>
      <App
        initialData={initialData}
        dataStore={store}
        backend={backend}
        legacyBackup={options.legacyBackup ?? false}
      />
    </ThemeProvider>,
  )

  return Object.assign(view, { store })
}
