/**
 * Chooses the storage backend once, before the console renders.
 *
 * IndexedDB is preferred. The check is only "does this global exist"; an open that
 * fails later (private mode, a blocked upgrade, a corrupted database) is handled by
 * `DataGate`, which falls back to `LocalStorageStore` when `load()` rejects. Keeping
 * the factory small means a test can stub `globalThis.indexedDB` and get the expected
 * backend without fighting a feature-detection library.
 */

import type { DataStore } from './DataStore'
import { IndexedDbStore } from './IndexedDbStore'
import { LocalStorageStore } from './LocalStorageStore'

export function createDataStore(): DataStore {
  try {
    if (typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null) {
      return new IndexedDbStore()
    }
  } catch {
    // Some locked-down profiles throw on the property access itself. That is the
    // same answer as "absent" for our purposes.
  }

  return new LocalStorageStore('unavailable')
}
