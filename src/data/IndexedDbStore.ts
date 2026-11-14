/**
 * IndexedDB implementation of `DataStore`.
 *
 * Database layout (version 2):
 *   employees  keyPath `id`
 *   policies   keyPath `id`
 *   leavePlans keyPath `id`
 *   attendance keyPath `id`
 *   holidays   keyPath `id`
 *   meta       keyPath `key`
 *
 * Version 2 adds the daily attendance ledger and the holiday calendar. An existing
 * version-1 database is upgraded in place: the two stores are created by
 * `onupgradeneeded`, every existing row is preserved, and the first load after the
 * upgrade seeds the new datasets under the same rules as a fresh migration.
 *
 * The first `load()` on a fresh database is also the migration point. It reads the
 * four legacy localStorage envelopes through `loadPersisted`, which means a valid
 * old dataset is carried over, a valid-but-empty dataset stays empty, and a corrupt
 * one is replaced by the app seed instead of throwing. Duplicate ids inside a valid
 * envelope are repaired (first occurrence kept) before the keyed stores see them,
 * and the load reports `recovered` for both repairs and substitutions. The same
 * transaction writes all four datasets, the planner settings and the `initialized`
 * marker, so a failure cannot leave a half-migrated database that later looks
 * initialized.
 *
 * The legacy keys are never removed. They are the user's only backup if this
 * migration had a bug, and tooling can inspect them. `legacyBackup` in meta records
 * that they existed, for the Admin page.
 *
 * Saves replace one store's contents inside a readwrite transaction. Imports replace
 * all stores inside one transaction: IndexedDB will abort the whole thing if any
 * request fails, so the previous snapshot survives a failed import.
 */

import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  PlannerSettings,
} from '../types'
import {
  DEFAULT_PLANNER_SETTINGS,
  STORAGE_KEYS,
  dedupeById,
  dedupeByDate,
  hasStoredValue,
  hasUniqueHolidayDates,
  hasUniqueIds,
  type DataSnapshot,
  type DataStore,
  type LoadedData,
  type StoreBackend,
  type StoreResult,
  validateDataSnapshot,
} from './DataStore'
import { INITIAL_EMPLOYEES } from './initialData'
import { INITIAL_POLICIES } from './initialPolicies'
import { createInitialLeavePlans, isDemoEmployeeSet } from './initialLeavePlans'
import { createInitialHolidays } from './initialHolidays'
import { createInitialAttendance } from './initialAttendance'
import { loadPersisted, DATA_SCHEMA_VERSION } from '../utils/storage'
import {
  isAttendanceRecordRow,
  isEmployeeRow,
  isHolidayRow,
  isLeavePlanRow,
  isPlannerSettingsRow,
  isPolicyRow,
} from '../utils/rowValidators'

const DB_VERSION = 2
const EMPLOYEES_STORE = 'employees'
const POLICIES_STORE = 'policies'
const LEAVE_PLANS_STORE = 'leavePlans'
const ATTENDANCE_STORE = 'attendance'
const HOLIDAYS_STORE = 'holidays'
const META_STORE = 'meta'

const ALL_STORES = [
  EMPLOYEES_STORE,
  POLICIES_STORE,
  LEAVE_PLANS_STORE,
  ATTENDANCE_STORE,
  HOLIDAYS_STORE,
  META_STORE,
]

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
    if (!hasUniqueIds(rows)) return { ok: false, reason: 'invalid' }
    return this.replaceRows(EMPLOYEES_STORE, rows)
  }

  async savePolicies(rows: HRPolicy[]): Promise<StoreResult> {
    if (!hasUniqueIds(rows)) return { ok: false, reason: 'invalid' }
    return this.replaceRows(POLICIES_STORE, rows)
  }

  async saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult> {
    if (!hasUniqueIds(rows)) return { ok: false, reason: 'invalid' }
    return this.replaceRows(LEAVE_PLANS_STORE, rows)
  }

  async saveAttendance(rows: AttendanceRecord[]): Promise<StoreResult> {
    // The daily ledger is the payroll input, so a malformed row is rejected here
    // rather than written and discovered by the next load's recovery pass.
    if (!rows.every(isAttendanceRecordRow) || !hasUniqueIds(rows)) {
      return { ok: false, reason: 'invalid' }
    }
    return this.replaceRows(ATTENDANCE_STORE, rows)
  }

  async saveHolidays(rows: Holiday[]): Promise<StoreResult> {
    if (
      !rows.every(isHolidayRow) ||
      !hasUniqueIds(rows) ||
      !hasUniqueHolidayDates(rows)
    ) {
      return { ok: false, reason: 'invalid' }
    }
    return this.replaceRows(HOLIDAYS_STORE, rows)
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
          replaceStore(transaction, ATTENDANCE_STORE, valid.attendance)
          replaceStore(transaction, HOLIDAYS_STORE, valid.holidays)
          putMeta(transaction, 'settings', { ...valid.settings })
          putMeta(transaction, 'initialized', true)
          // The import is a complete, deliberate state: the new stores must not be
          // treated as "absent" and reseeded on the next load.
          putMeta(transaction, 'attendanceInitialized', true)
          putMeta(transaction, 'holidaysInitialized', true)
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
          transaction.objectStore(ATTENDANCE_STORE).clear()
          transaction.objectStore(HOLIDAYS_STORE).clear()
          // Settings are business data too, but the app always needs a threshold.
          // Reset to the documented default rather than leaving an absent value.
          putMeta(transaction, 'settings', { ...DEFAULT_PLANNER_SETTINGS })
          // Keep `initialized` true: clearing is a deliberate empty state, not the
          // first run, and a later load must not resurrect the demo seed. The two
          // new markers say the same for the attendance and holiday stores.
          putMeta(transaction, 'initialized', true)
          putMeta(transaction, 'attendanceInitialized', true)
          putMeta(transaction, 'holidaysInitialized', true)
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
   *
   * The leave planner is the one dataset that is not simply "seed on absence": the
   * demo plans refer to the demo employees, so they are only invented when the
   * roster is exactly the demo roster AND the stored leave payload was unusable
   * (absent, or corrupt). A custom register with no reliable planner history gets
   * an empty planner, not leave for people it does not contain.
   *
   * The holiday seed is likewise roster-independent, while demo attendance is only
   * invented for the exact demo roster AND an absent attendance key. Corrupt
   * attendance is replaced with an empty ledger (and reported), never with invented
   * presence for a roster we cannot trust.
   *
   * Duplicate ids are repaired before the write. `loadPersisted` checks shapes only,
   * and this is the one load that feeds keyed stores directly: writing a repeated id
   * would silently keep just the last row. Holiday rows are additionally deduped by
   * date, because the calendar looks holidays up by day. Keeping the first occurrence
   * matches the import rule and makes every repair visible through `recovered`.
   */
  private async migrateAndSeed(db: IDBDatabase): Promise<LoadedData> {
    const employeesResult = loadPersisted(
      STORAGE_KEYS.employees,
      isEmployeeRow,
      INITIAL_EMPLOYEES,
    )
    const policiesResult = loadPersisted(
      STORAGE_KEYS.policies,
      isPolicyRow,
      INITIAL_POLICIES,
    )
    const leavePlansResult = loadPersisted(STORAGE_KEYS.leavePlans, isLeavePlanRow, [])
    const attendanceResult = loadPersisted(
      STORAGE_KEYS.attendance,
      isAttendanceRecordRow,
      [],
    )
    const holidaysResult = loadPersisted(
      STORAGE_KEYS.holidays,
      isHolidayRow,
      createInitialHolidays(2026),
    )
    const settingsResult = loadPersisted(
      STORAGE_KEYS.settings,
      isPlannerSettingsRow,
      [DEFAULT_PLANNER_SETTINGS],
    )

    const employees = dedupeById(employeesResult.rows)
    const policies = dedupeById(policiesResult.rows)
    const leavePlansDeduped = dedupeById(leavePlansResult.rows)
    const attendanceDeduped = dedupeById(attendanceResult.rows)
    const holidaysById = dedupeById(holidaysResult.rows)
    const holidaysDeduped = dedupeByDate(holidaysById.rows)
    const leavePlansUnusable =
      !hasStoredValue(STORAGE_KEYS.leavePlans) || leavePlansResult.status === 'recovered'
    const leavePlans = leavePlansUnusable
      ? isDemoEmployeeSet(employees.rows)
        ? createInitialLeavePlans(this.now())
        : []
      : leavePlansDeduped.rows
    // Only an ABSENT attendance key is a first-run signal. A corrupt key is a lost
    // dataset: report it and start empty rather than inventing presence for a roster
    // whose history we could not read.
    const attendance =
      !hasStoredValue(STORAGE_KEYS.attendance) && isDemoEmployeeSet(employees.rows)
        ? createInitialAttendance(employees.rows, holidaysDeduped.rows, this.now())
        : attendanceDeduped.rows
    const holidays = holidaysDeduped.rows
    const settings = settingsResult.rows[0] ?? { ...DEFAULT_PLANNER_SETTINGS }
    const legacyBackup = hasLegacyLocalStorage()
    // Any corrupt legacy envelope was discarded by `loadPersisted` above, and any
    // repeated id or holiday date was repaired below it. Neither is silent: the
    // DataGate must say so.
    const recovered =
      employeesResult.status === 'recovered' ||
      policiesResult.status === 'recovered' ||
      leavePlansResult.status === 'recovered' ||
      attendanceResult.status === 'recovered' ||
      holidaysResult.status === 'recovered' ||
      settingsResult.status === 'recovered' ||
      employees.repaired ||
      policies.repaired ||
      leavePlansDeduped.repaired ||
      attendanceDeduped.repaired ||
      holidaysById.repaired ||
      holidaysDeduped.repaired

    // The read transaction that discovered the missing marker has completed, so this
    // connection can start the one atomic write transaction. `withDb` closes it after
    // this method returns.
    await this.runWriteTransaction(db, ALL_STORES, (transaction) => {
      replaceStore(transaction, EMPLOYEES_STORE, employees.rows)
      replaceStore(transaction, POLICIES_STORE, policies.rows)
      replaceStore(transaction, LEAVE_PLANS_STORE, leavePlans)
      replaceStore(transaction, ATTENDANCE_STORE, attendance)
      replaceStore(transaction, HOLIDAYS_STORE, holidays)
      putMeta(transaction, 'settings', { ...settings })
      putMeta(transaction, 'initialized', true)
      putMeta(transaction, 'attendanceInitialized', true)
      putMeta(transaction, 'holidaysInitialized', true)
      putMeta(transaction, 'migratedAt', this.now().toISOString())
      putMeta(transaction, 'legacyBackup', legacyBackup)
    })

    return {
      snapshot: {
        v: 2,
        dataVersion: DATA_SCHEMA_VERSION,
        exportedAt: this.now().toISOString(),
        employees: employees.rows,
        policies: policies.rows,
        leavePlans,
        attendance,
        holidays,
        settings,
      },
      legacyBackup,
      recovered,
    }
  }

  /**
   * Reads an initialized database and shape-checks every dataset before handing it
   * to the console.
   *
   * A keyed store guarantees unique keys, not valid rows. A row written by an older
   * build (or by a browser extension) can still be missing a field a consumer
   * dereferences, which would crash the console after the gate has declared the load
   * healthy. Each invalid dataset is replaced as a whole - filtering bad rows out
   * would silently shrink a roster, which looks like a mass deletion - and the load
   * reports `recovered` so DataGate can tell the user the truth. Employees and
   * policies fall back to their demo seeds; leave plans are demo-seeded only when
   * the roster is the demo set, so a custom register keeps an empty planner.
   * Holidays always have a meaningful fixed seed; demo attendance, like demo leave,
   * is invented only for the demo roster.
   *
   * A database upgraded from version 1 has no attendance/holiday marker, and the two
   * newly created stores are empty. That absent marker - not an empty dataset by
   * itself - is the one-time signal to seed them. A deliberate clear writes both
   * markers, so clearing does not resurrect the demo ledger on the next load.
   */
  private async buildLoadedData(db: IDBDatabase, meta: MetaRecord[]): Promise<LoadedData> {
    const [storedEmployees, storedPolicies, storedLeavePlans, storedAttendance, storedHolidays] =
      await Promise.all([
        readAll<Employee>(db, EMPLOYEES_STORE),
        readAll<HRPolicy>(db, POLICIES_STORE),
        readAll<LeavePlan>(db, LEAVE_PLANS_STORE),
        readAll<AttendanceRecord>(db, ATTENDANCE_STORE),
        readAll<Holiday>(db, HOLIDAYS_STORE),
      ])

    const employeesAreValid = storedEmployees.every(isEmployeeRow)
    const policiesAreValid = storedPolicies.every(isPolicyRow)
    const leavePlansAreValid = storedLeavePlans.every(isLeavePlanRow)
    const attendanceAreValid =
      storedAttendance.every(isAttendanceRecordRow) && hasUniqueIds(storedAttendance)
    const holidaysAreValid =
      storedHolidays.every(isHolidayRow) &&
      hasUniqueIds(storedHolidays) &&
      hasUniqueHolidayDates(storedHolidays)

    const storedSettings = metaValue(meta, 'settings')
    const settings = isPlannerSettingsRow(storedSettings)
      ? storedSettings
      : { ...DEFAULT_PLANNER_SETTINGS }

    const employees = employeesAreValid ? storedEmployees : INITIAL_EMPLOYEES

    const attendanceInitialized = metaValue(meta, 'attendanceInitialized') === true
    const holidaysInitialized = metaValue(meta, 'holidaysInitialized') === true

    let holidays = holidaysAreValid ? storedHolidays : createInitialHolidays(2026)
    if (holidaysAreValid && !holidaysInitialized && storedHolidays.length === 0) {
      holidays = createInitialHolidays(2026)
    }

    let attendance: AttendanceRecord[]
    if (!attendanceAreValid) {
      attendance = isDemoEmployeeSet(employees)
        ? createInitialAttendance(employees, holidays, this.now())
        : []
    } else if (!attendanceInitialized && storedAttendance.length === 0) {
      attendance = isDemoEmployeeSet(employees)
        ? createInitialAttendance(employees, holidays, this.now())
        : []
    } else {
      attendance = storedAttendance
    }

    // Repairing an invalid dataset has to write it back, even when the marker already
    // exists, or the next load would recover the same rows again.
    const replaceAttendance = !attendanceAreValid || !attendanceInitialized
    const replaceHolidays = !holidaysAreValid || !holidaysInitialized
    if (replaceAttendance || replaceHolidays) {
      await this.runWriteTransaction(
        db,
        [ATTENDANCE_STORE, HOLIDAYS_STORE, META_STORE],
        (transaction) => {
          if (replaceAttendance) replaceStore(transaction, ATTENDANCE_STORE, attendance)
          if (replaceHolidays) replaceStore(transaction, HOLIDAYS_STORE, holidays)
          putMeta(transaction, 'attendanceInitialized', true)
          putMeta(transaction, 'holidaysInitialized', true)
        },
      )
    }

    return {
      snapshot: {
        v: 2,
        dataVersion: DATA_SCHEMA_VERSION,
        exportedAt: this.now().toISOString(),
        employees,
        policies: policiesAreValid ? storedPolicies : INITIAL_POLICIES,
        // An unusable leave dataset follows the same rule as first-run seeding: the
        // demo plans only belong to the demo roster. A custom register gets an empty
        // planner rather than leave for employees it does not contain.
        leavePlans: leavePlansAreValid
          ? storedLeavePlans
          : isDemoEmployeeSet(employees)
            ? createInitialLeavePlans(this.now())
            : [],
        attendance,
        holidays,
        settings,
      },
      legacyBackup: metaValue(meta, 'legacyBackup') === true,
      recovered:
        !employeesAreValid ||
        !policiesAreValid ||
        !leavePlansAreValid ||
        !attendanceAreValid ||
        !holidaysAreValid,
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
        if (!db.objectStoreNames.contains(ATTENDANCE_STORE)) {
          db.createObjectStore(ATTENDANCE_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(HOLIDAYS_STORE)) {
          db.createObjectStore(HOLIDAYS_STORE, { keyPath: 'id' })
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
