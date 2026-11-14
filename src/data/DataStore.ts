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

import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  PlannerSettings,
} from '../types'
import { DATA_SCHEMA_VERSION } from '../utils/storage'
import {
  isAttendanceRecordRow,
  isEmployeeRow,
  isHolidayRow,
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
  /**
   * Snapshot format version. Separate from the row schema version below.
   *
   * Version 2 adds the daily attendance ledger and the company holiday calendar.
   * Version 1 snapshots are still accepted by `validateDataSnapshot`/`parseSnapshot`
   * and are normalised to v2 with empty arrays, so an old backup stays restorable.
   */
  v: 2
  /** The `DATA_SCHEMA_VERSION` row schema the snapshot was produced against. */
  dataVersion: number
  /** ISO timestamp of when the snapshot was produced. */
  exportedAt: string
  employees: Employee[]
  policies: HRPolicy[]
  leavePlans: LeavePlan[]
  attendance: AttendanceRecord[]
  holidays: Holiday[]
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
  /**
   * True when stored data could not be read and the load substituted seed data.
   *
   * This is deliberately separate from "this browser is on the localStorage
   * fallback": the fallback is healthy storage, while `recovered` means saved rows
   * were actually discarded. The DataGate shows a different warning for each.
   *
   * Optional so a store with nothing to recover (the in-memory test store) can omit
   * it; consumers must treat an absent value as false.
   */
  recovered?: boolean
}

export interface DataStore {
  readonly backend: StoreBackend
  load(): Promise<LoadedData>
  saveEmployees(rows: Employee[]): Promise<StoreResult>
  savePolicies(rows: HRPolicy[]): Promise<StoreResult>
  saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult>
  saveAttendance(rows: AttendanceRecord[]): Promise<StoreResult>
  saveHolidays(rows: Holiday[]): Promise<StoreResult>
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
  attendance: 'omnihr_attendance',
  holidays: 'omnihr_holidays',
  settings: 'omnihr_planner_settings',
} as const

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = { maxConcurrentLeave: 3 }

/**
 * True when every row carries a distinct `id`.
 *
 * A keyed store silently keeps only the last row for a duplicated key. That turns an
 * import of a roster with a repeated Employee ID into a shorter roster that looks
 * exactly like a successful import. The stores therefore reject the whole dataset
 * instead of writing a quietly collapsed one.
 */
export function hasUniqueIds(rows: { id: string }[]): boolean {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) return false
    seen.add(row.id)
  }
  return true
}

/**
 * True when every holiday falls on a distinct date.
 *
 * Holidays are company-wide and looked up BY DATE in the matrix and the working-day
 * math, so two differently-id'd rows for the same day are one holiday with two names.
 * A keyed store would keep both and quietly count the day twice or show whichever name
 * happened to render last, so the row guard deliberately leaves this to the store and
 * snapshot boundary where the sibling rows are visible.
 */
export function hasUniqueHolidayDates(rows: { date: string }[]): boolean {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.date)) return false
    seen.add(row.date)
  }
  return true
}

/**
 * Keeps the first row for each `id`, reporting whether anything was dropped.
 *
 * `loadPersisted` validates the SHAPE of a stored envelope, not the uniqueness of its
 * ids, and both load paths must cope with what that leaves. IndexedDB's keyed stores
 * would silently keep only the last write for a repeated key, and localStorage would
 * load the duplicates only to reject every later save as invalid. Repairing the
 * dataset here keeps the first occurrence, like an import does, and `repaired` lets
 * the caller report the repair instead of losing rows in silence.
 */
export function dedupeById<T extends { id: string }>(
  rows: readonly T[],
): { rows: T[]; repaired: boolean } {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }
  return { rows: unique, repaired: unique.length !== rows.length }
}

/** Same repair rule as `dedupeById`, for the holiday date key the calendar uses. */
export function dedupeByDate<T extends { date: string }>(
  rows: readonly T[],
): { rows: T[]; repaired: boolean } {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of rows) {
    if (seen.has(row.date)) continue
    seen.add(row.date)
    unique.push(row)
  }
  return { rows: unique, repaired: unique.length !== rows.length }
}

/**
 * True when a legacy localStorage key currently holds any value, including a value
 * that later fails validation.
 *
 * `loadPersisted` reports both "the key was never written" and "a valid empty
 * envelope was stored" as `'empty'`, and those need different treatment for the demo
 * leave seed: only the first is a first-run signal. A denied read counts as absent,
 * matching `loadPersisted`'s own rule for unreachable storage.
 */
export function hasStoredValue(key: string): boolean {
  try {
    // `?? null` makes an absent Web Storage API read as "no value": without it,
    // optional chaining yields `undefined`, which is not `null` and would look stored.
    return (globalThis.localStorage?.getItem(key) ?? null) !== null
  } catch {
    return false
  }
}

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

  const candidate = raw as {
    v?: unknown
    dataVersion?: unknown
    exportedAt?: unknown
    employees?: unknown
    policies?: unknown
    leavePlans?: unknown
    attendance?: unknown
    holidays?: unknown
    settings?: unknown
  }

  // Both version fields protect different things: `v` is the snapshot format and
  // `dataVersion` is the row schema. A mismatch in either means this file was made
  // against a shape this build does not understand.
  //
  // Version 1 is still accepted: it predates the daily attendance datasets, so it is
  // normalised to v2 with empty arrays below instead of being rejected. Restoring an
  // old backup must not strand the user's existing roster and leave data.
  const version = candidate.v
  if ((version !== 1 && version !== 2) || candidate.dataVersion !== DATA_SCHEMA_VERSION) {
    return { ok: false, reason: 'version' }
  }

  if (
    typeof candidate.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.exportedAt))
  ) {
    return { ok: false, reason: 'invalid' }
  }

  // A v1 file has no attendance/holidays fields at all. Any fields that happen to be
  // present on a v1 payload are ignored rather than trusted, because that format never
  // defined them.
  const attendance = version === 1 ? [] : candidate.attendance
  const holidays = version === 1 ? [] : candidate.holidays

  if (
    !Array.isArray(candidate.employees) ||
    !candidate.employees.every(isEmployeeRow) ||
    !Array.isArray(candidate.policies) ||
    !candidate.policies.every(isPolicyRow) ||
    !Array.isArray(candidate.leavePlans) ||
    !candidate.leavePlans.every(isLeavePlanRow) ||
    !Array.isArray(attendance) ||
    !attendance.every(isAttendanceRecordRow) ||
    !Array.isArray(holidays) ||
    !holidays.every(isHolidayRow) ||
    !isPlannerSettingsRow(candidate.settings)
  ) {
    return { ok: false, reason: 'invalid' }
  }

  // Shape-valid rows are not enough: duplicate ids would silently collapse when the
  // snapshot is written to a keyed store, shortening the register the user thought
  // they imported. A duplicate holiday date is the same lossy write in calendar terms.
  // Reject the whole file rather than write a lossy one.
  if (
    !hasUniqueIds(candidate.employees) ||
    !hasUniqueIds(candidate.policies) ||
    !hasUniqueIds(candidate.leavePlans) ||
    !hasUniqueIds(attendance) ||
    !hasUniqueIds(holidays) ||
    !hasUniqueHolidayDates(holidays)
  ) {
    return { ok: false, reason: 'invalid' }
  }

  return {
    ok: true,
    snapshot: {
      v: 2,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: candidate.exportedAt,
      employees: candidate.employees,
      policies: candidate.policies,
      leavePlans: candidate.leavePlans,
      attendance: attendance as AttendanceRecord[],
      holidays: holidays as Holiday[],
      settings: candidate.settings,
    },
  }
}
