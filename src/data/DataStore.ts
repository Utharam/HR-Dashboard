/**
 * The seam between the console and wherever business data is persisted.
 *
 * WHY THIS EXISTS
 *
 * Business data used to live only in localStorage, read synchronously in `App`'s
 * initialisers. That was adequate for a demo but not for HR records: a 5 MB origin
 * budget is roughly 9,300 employees, and any read or write failure had to be turned
 * into a visible notice by hand at each call site. IndexedDB raises both limits and
 * gives us transactions, but the UI should not care which backend answers.
 *
 * So every read and write goes through `DataStore`. `IndexedDbStore` is the primary
 * implementation, `LocalStorageStore` is the fallback for a browser where IndexedDB
 * is blocked, and `MemoryStore` keeps tests and the test render helper synchronous
 * and isolated. Theme and session deliberately stay in localStorage: the pre-paint
 * theme script must be synchronous, and a session is a few hundred bytes.
 *
 * `DataSnapshot` is the unit of backup and migration. It contains every business
 * dataset and nothing that belongs to one device (no theme, no session). The
 * version fields are checked by both the store boundary and, later, the Admin
 * import path, so neither can half-write data that the other expects to be valid.
 */

import type { Employee, HRPolicy, LeavePlan, PlannerSettings } from '../types'
import { DATA_SCHEMA_VERSION } from '../utils/storage'
import {
  isEmployeeRow,
  isLeavePlanRow,
  isPlannerSettingsRow,
  isPolicyRow,
} from '../utils/rowValidators'

export type StoreBackend = 'indexeddb' | 'localstorage' | 'memory'

/**
 * Why a store operation failed.
 *
 * `quota` is separated from `unavailable` because it is the one failure a user can
 * act on: the data is correct and still in memory, it simply could not be written.
 * `invalid` and `version` are import-time failures and mean nothing was written.
 */
export type StoreFailure = 'quota' | 'unavailable' | 'invalid' | 'version'

export type StoreResult = { ok: true } | { ok: false; reason: StoreFailure }

export interface DataSnapshot {
  /** Snapshot format version. Separate from the row schema version below. */
  v: 1
  /** The `DATA_SCHEMA_VERSION` row schema the snapshot was produced against. */
  dataVersion: number
  /** ISO timestamp of when the snapshot was produced. */
  exportedAt: string
  employees: Employee[]
  policies: HRPolicy[]
  leavePlans: LeavePlan[]
  settings: PlannerSettings
}

export interface LoadedData {
  snapshot: DataSnapshot
  /**
   * True when legacy localStorage keys were found during the one-time migration.
   * They are left in place as a read-only backup; the Admin page can tell the user
   * the old copy exists without the app ever reading it again.
   */
  legacyBackup: boolean
}

export interface DataStore {
  readonly backend: StoreBackend
  load(): Promise<LoadedData>
  saveEmployees(rows: Employee[]): Promise<StoreResult>
  savePolicies(rows: HRPolicy[]): Promise<StoreResult>
  saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult>
  saveSettings(settings: PlannerSettings): Promise<StoreResult>
  exportSnapshot(): Promise<DataSnapshot>
  importSnapshot(snapshot: DataSnapshot): Promise<StoreResult>
  clearBusinessData(): Promise<StoreResult>
}

/**
 * Legacy envelope keys. `App` wrote employees and policies here; the leave planner
 * adds the other two. The IndexedDB migration reads all four exactly once, and the
 * localStorage fallback uses them as its live store.
 */
export const STORAGE_KEYS = {
  employees: 'omnihr_employees',
  policies: 'omnihr_policies',
  leavePlans: 'omnihr_leave_plans',
  settings: 'omnihr_planner_settings',
} as const

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = { maxConcurrentLeave: 3 }

/**
 * Validates a value at the store boundary.
 *
 * The Admin page is specified to run the richer `parseSnapshot` first, but the store
 * must not rely on that courtesy: `importSnapshot` is public API and a caller that
 * forgets the gate would otherwise write a partially valid snapshot. Every row is
 * checked with the same predicate the localStorage loader uses, before any
 * transaction starts, so a rejection leaves the current data untouched.
 */
export function validateDataSnapshot(
  raw: unknown,
): { ok: true; snapshot: DataSnapshot } | { ok: false; reason: 'invalid' | 'version' } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid' }
  }

  const candidate = raw as Partial<DataSnapshot>

  // Both version fields protect different things: `v` is the snapshot format and
  // `dataVersion` is the row schema. A mismatch in either means this file was made
  // against a shape this build does not understand.
  if (candidate.v !== 1 || candidate.dataVersion !== DATA_SCHEMA_VERSION) {
    return { ok: false, reason: 'version' }
  }

  if (
    typeof candidate.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.exportedAt))
  ) {
    return { ok: false, reason: 'invalid' }
  }

  if (
    !Array.isArray(candidate.employees) ||
    !candidate.employees.every(isEmployeeRow) ||
    !Array.isArray(candidate.policies) ||
    !candidate.policies.every(isPolicyRow) ||
    !Array.isArray(candidate.leavePlans) ||
    !candidate.leavePlans.every(isLeavePlanRow) ||
    !isPlannerSettingsRow(candidate.settings)
  ) {
    return { ok: false, reason: 'invalid' }
  }

  return { ok: true, snapshot: candidate as DataSnapshot }
}
