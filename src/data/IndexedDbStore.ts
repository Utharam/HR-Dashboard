/**
 * IndexedDB implementation of `DataStore`.
 *
 * Database layout (version 1):
 *   employees  keyPath `id`
 *   policies   keyPath `id`
 *   leavePlans keyPath `id`
 *   meta       keyPath `key`
 *
 * The first `load()` on a fresh database is also the migration point. It reads the
 * four legacy localStorage envelopes through `loadPersisted`, which means a valid
 * old dataset is carried over exactly, a valid-but-empty dataset stays empty, and a
 * corrupt one is replaced by the app seed instead of throwing. The same transaction
 * writes all four datasets, the planner settings and the `initialized` marker, so a
 * failure cannot leave a half-migrated database that later looks initialized.
 *
 * The legacy keys are never removed. They are the user's only backup if this
 * migration had a bug, and tooling can inspect them. `legacyBackup` in meta records
 * that they existed, for the Admin page.
 *
 * Saves replace one store's contents inside a readwrite transaction. Imports replace
 * all stores inside one transaction: IndexedDB will abort the whole thing if any
 * request fails, so the previous snapshot survives a failed import.
 */

import type { Employee, HRPolicy, LeavePlan, PlannerSettings } from '../types'
import {
  DEFAULT_PLANNER_SETTINGS,
  STORAGE_KEYS,
  type DataSnapshot,
  type DataStore,
  type LoadedData,
  type StoreBackend,
  type StoreResult,
  validateDataSnapshot,
} from './DataStore'
import { INITIAL_EMPLOYEES } from './initialData'
import { INITIAL_POLICIES } from './initialPolicies'
import { createInitialLeavePlans } from './initialLeavePlans'
import { loadPersisted, DATA_SCHEMA_VERSION } from '../utils/storage'
import {
  isEmployeeRow,
  isLeavePlanRow,
  isPlannerSettingsRow,
  isPolicyRow,
} from '../utils/rowValidators'

const DB_VERSION = 1
const EMPLOYEES_STORE = 'employees'
const POLICIES_STORE = 'policies'
const LEAVE_PLANS_STORE = 'leavePlans'
const META_STORE = 'meta'

const ALL_STORES = [EMPLOYEES_STORE, POLICIES_STORE, LEAVE_PLANS_STORE, META_STORE]

interface MetaRecord {
  key: string
  value: unknown
}

export interface IndexedDbStoreOptions {
  dbName?: string
  now?: () => Date
}

function isQuotaError(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function classifyStorageError(error: unknown): 'quota' | 'unavailable' {
  return isQuotaError(error) ? 'quota' : 'unavailable'
}

function storageUnavailable(): Error {
  return new DOMException('IndexedDB is not available in this browser', 'NotFoundError')
}

function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(storeName, 'readonly')
    } catch (error) {
      reject(error)
      return
    }

    try {
      const request = transaction.objectStore(storeName).getAll()
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
    } catch (error) {
      reject(error)
    }
  })
}

/** Clears a store and re-populates it within the caller's transaction. */
function replaceStore(transaction: IDBTransaction, storeName: string, rows: readonly unknown[]): void {
  const store = transaction.objectStore(storeName)
  store.clear()
  for (const row of rows) store.put(row)
}

function putMeta(transaction: IDBTransaction, key: string, value: unknown): void {
  transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRecord)
}

function metaValue(meta: MetaRecord[], key: string): unknown {
  return meta.find((record) => record.key === key)?.value
}

function hasLegacyLocalStorage(): boolean {
  try {
    const storage = globalThis.localStorage
    if (!storage) return false
    return Object.values(STORAGE_KEYS).some((key) => storage.getItem(key) !== null)
  } catch {
    // A denied read is not evidence of a backup. The migration below handles the
    // same denial by falling back to seed data.
    return false
  }
}

export class IndexedDbStore implements DataStore {
  readonly backend: StoreBackend = 'indexeddb'

  private readonly dbName: string
  private readonly now: () => Date

  constructor(options: IndexedDbStoreOptions = {}) {
    this.dbName = options.dbName ?? 'omnihr'
    this.now = options.now ?? (() => new Date())
  }

  async load(): Promise<LoadedData> {
    return this.withDb(async (db) => {
      const meta = await readAll<MetaRecord>(db, META_STORE)
      if (metaValue(meta, 'initialized') !== true) {
        return this.migrateAndSeed(db)
      }
      return this.buildLoadedData(db, meta)
    })
  }

  async saveEmployees(rows: Employee[]): Promise<StoreResult> {
    return this.replaceRows(EMPLOYEES_STORE, rows)
  }

  async savePolicies(rows: HRPolicy[]): Promise<StoreResult> {
    return this.replaceRows(POLICIES_STORE, rows)
  }

  async saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult> {
    return this.replaceRows(LEAVE_PLANS_STORE, rows)
  }

  async saveSettings(settings: PlannerSettings): Promise<StoreResult> {
    try {
      await this.withDb((db) =>
        this.runWriteTransaction(db, [META_STORE], (transaction) => {
          putMeta(transaction, 'settings', { ...settings })
        }),
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: classifyStorageError(error) }
    }
  }

  async exportSnapshot(): Promise<DataSnapshot> {
    const loaded = await this.load()
    return loaded.snapshot
  }

  async importSnapshot(snapshot: DataSnapshot): Promise<StoreResult> {
    // Validate before opening a transaction. A half-valid snapshot must never reach
    // the database, and the previous data must survive a rejected import untouched.
    const validation = validateDataSnapshot(snapshot)
    if (!validation.ok) return validation

    const valid = validation.snapshot

    try {
      await this.withDb((db) =>
        this.runWriteTransaction(db, ALL_STORES, (transaction) => {
          replaceStore(transaction, EMPLOYEES_STORE, valid.employees)
          replaceStore(transaction, POLICIES_STORE, valid.policies)
          replaceStore(transaction, LEAVE_PLANS_STORE, valid.leavePlans)
          putMeta(transaction, 'settings', { ...valid.settings })
          putMeta(transaction, 'initialized', true)
          putMeta(transaction, 'importedAt', this.now().toISOString())
        }),
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: classifyStorageError(error) }
    }
  }

  async clearBusinessData(): Promise<StoreResult> {
    try {
      await this.withDb((db) =>
        this.runWriteTransaction(db, ALL_STORES, (transaction) => {
          transaction.objectStore(EMPLOYEES_STORE).clear()
          transaction.objectStore(POLICIES_STORE).clear()
          transaction.objectStore(LEAVE_PLANS_STORE).clear()
          // Settings are business data too, but the app always needs a threshold.
          // Reset to the documented default rather than leaving an absent value.
          putMeta(transaction, 'settings', { ...DEFAULT_PLANNER_SETTINGS })
          // Keep `initialized` true: clearing is a deliberate empty state, not the
          // first run, and a later load must not resurrect the demo seed.
          putMeta(transaction, 'initialized', true)
        }),
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: classifyStorageError(error) }
    }
  }

  private async replaceRows(storeName: string, rows: readonly unknown[]): Promise<StoreResult> {
    try {
      await this.withDb((db) =>
        this.runWriteTransaction(db, [storeName], (transaction) => {
          replaceStore(transaction, storeName, rows)
        }),
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: classifyStorageError(error) }
    }
  }

  /**
   * One-time copy of the legacy localStorage envelopes, seeded where a dataset is
   * absent. `loadPersisted` returns the fallback seed for a missing or corrupt key
   * and the stored rows (including a valid empty array) otherwise.
   */
  private async migrateAndSeed(db: IDBDatabase): Promise<LoadedData> {
    const employees = loadPersisted(
      STORAGE_KEYS.employees,
      isEmployeeRow,
      INITIAL_EMPLOYEES,
    ).rows
    const policies = loadPersisted(
      STORAGE_KEYS.policies,
      isPolicyRow,
      INITIAL_POLICIES,
    ).rows
    const leavePlans = loadPersisted(
      STORAGE_KEYS.leavePlans,
      isLeavePlanRow,
      createInitialLeavePlans(this.now()),
    ).rows
    const settingsRows = loadPersisted(
      STORAGE_KEYS.settings,
      isPlannerSettingsRow,
      [DEFAULT_PLANNER_SETTINGS],
    ).rows
    const settings = settingsRows[0] ?? { ...DEFAULT_PLANNER_SETTINGS }
    const legacyBackup = hasLegacyLocalStorage()

    // The read transaction that discovered the missing marker has completed, so this
    // connection can start the one atomic write transaction. `withDb` closes it after
    // this method returns.
    await this.runWriteTransaction(db, ALL_STORES, (transaction) => {
      replaceStore(transaction, EMPLOYEES_STORE, employees)
      replaceStore(transaction, POLICIES_STORE, policies)
      replaceStore(transaction, LEAVE_PLANS_STORE, leavePlans)
      putMeta(transaction, 'settings', { ...settings })
      putMeta(transaction, 'initialized', true)
      putMeta(transaction, 'migratedAt', this.now().toISOString())
      putMeta(transaction, 'legacyBackup', legacyBackup)
    })

    return {
      snapshot: {
        v: 1,
        dataVersion: DATA_SCHEMA_VERSION,
        exportedAt: this.now().toISOString(),
        employees,
        policies,
        leavePlans,
        settings,
      },
      legacyBackup,
    }
  }

  private async buildLoadedData(db: IDBDatabase, meta: MetaRecord[]): Promise<LoadedData> {
    const [employees, policies, leavePlans] = await Promise.all([
      readAll<Employee>(db, EMPLOYEES_STORE),
      readAll<HRPolicy>(db, POLICIES_STORE),
      readAll<LeavePlan>(db, LEAVE_PLANS_STORE),
    ])

    const storedSettings = metaValue(meta, 'settings')
    const settings = isPlannerSettingsRow(storedSettings)
      ? storedSettings
      : { ...DEFAULT_PLANNER_SETTINGS }

    return {
      snapshot: {
        v: 1,
        dataVersion: DATA_SCHEMA_VERSION,
        exportedAt: this.now().toISOString(),
        employees,
        policies,
        leavePlans,
        settings,
      },
      legacyBackup: metaValue(meta, 'legacyBackup') === true,
    }
  }

  private async withDb<T>(action: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await this.openDb()
    try {
      return await action(db)
    } finally {
      db.close()
    }
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const factory: IDBFactory | undefined = globalThis.indexedDB
      if (!factory) {
        reject(storageUnavailable())
        return
      }

      let request: IDBOpenDBRequest
      try {
        request = factory.open(this.dbName, DB_VERSION)
      } catch (error) {
        reject(error)
        return
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(EMPLOYEES_STORE)) {
          db.createObjectStore(EMPLOYEES_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(POLICIES_STORE)) {
          db.createObjectStore(POLICIES_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(LEAVE_PLANS_STORE)) {
          db.createObjectStore(LEAVE_PLANS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
      request.onblocked = () => reject(new DOMException('IndexedDB open blocked', 'AbortError'))
    })
  }

  private runWriteTransaction(
    db: IDBDatabase,
    storeNames: string[],
    body: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = db.transaction(storeNames, 'readwrite')
      } catch (error) {
        reject(error)
        return
      }

      let settled = false
      const succeed = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        reject(error)
      }

      transaction.oncomplete = succeed
      transaction.onerror = () =>
        fail(transaction.error ?? new Error('IndexedDB transaction failed'))
      transaction.onabort = () =>
        fail(transaction.error ?? new Error('IndexedDB transaction aborted'))

      try {
        body(transaction)
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          /* the transaction may already be inactive; the original error is what matters */
        }
        fail(error)
      }
    })
  }
}
