/**
 * In-memory implementation of `DataStore`.
 *
 * Tests use this to exercise code that expects a store without depending on a real
 * browser database, and the DataGate/render helper can pass it to `App` when a test
 * wants a specific snapshot. It is deliberately synchronous under the async interface:
 * there is no failure mode to recover from, so every valid operation succeeds.
 *
 * The default contents mirror the application seed, because an empty `MemoryStore`
 * would render a blank console and stop being a drop-in replacement for a fresh
 * IndexedDB store.
 */

import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  PlannerEvent,
  PlannerSettings,
} from '../types'
import {
  DEFAULT_PLANNER_SETTINGS,
  hasUniqueHolidayDates,
  hasUniqueIds,
  type DataSnapshot,
  type DataStore,
  type LoadedData,
  type StoreBackend,
  type StoreResult,
  validateDataSnapshot,
} from './DataStore'
import { DATA_SCHEMA_VERSION } from '../utils/storage'
import { INITIAL_EMPLOYEES } from './initialData'
import { INITIAL_POLICIES } from './initialPolicies'
import { createInitialLeavePlans, isDemoEmployeeSet } from './initialLeavePlans'
import { createInitialHolidays } from './initialHolidays'
import { createInitialAttendance } from './initialAttendance'
import { createInitialPlannerEvents } from './initialPlannerEvents'
import {
  isAttendanceRecordRow,
  isHolidayRow,
  isPlannerEventRow,
} from '../utils/rowValidators'

function cloneSnapshot(snapshot: DataSnapshot): DataSnapshot {
  return {
    ...snapshot,
    employees: snapshot.employees.map((row) => ({ ...row })),
    policies: snapshot.policies.map((row) => ({
      ...row,
      rules: [...row.rules],
      ...(row.giftOptions ? { giftOptions: [...row.giftOptions] } : {}),
    })),
    leavePlans: snapshot.leavePlans.map((row) => ({ ...row })),
    attendance: snapshot.attendance.map((row) => ({ ...row })),
    holidays: snapshot.holidays.map((row) => ({ ...row })),
    plannerEvents: snapshot.plannerEvents.map((row) => ({ ...row })),
    settings: { ...snapshot.settings },
  }
}

export class MemoryStore implements DataStore {
  readonly backend: StoreBackend = 'memory'

  private snapshot: DataSnapshot

  constructor(initial?: Partial<DataSnapshot>) {
    // Mirror the application seed for every dataset the caller did not override.
    // Demo attendance is only meaningful for the exact demo roster (D11); a custom
    // roster starts with an empty daily ledger but keeps the fixed holiday calendar.
    // The demo event calendar follows the same roster rule as demo leave.
    const employees = initial?.employees ?? INITIAL_EMPLOYEES
    const holidays = initial?.holidays ?? createInitialHolidays(2026)
    const attendance =
      initial?.attendance ??
      (isDemoEmployeeSet(employees) ? createInitialAttendance(employees, holidays) : [])
    const plannerEvents =
      initial?.plannerEvents ??
      (isDemoEmployeeSet(employees) ? createInitialPlannerEvents() : [])

    this.snapshot = {
      v: 3,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: initial?.exportedAt ?? new Date().toISOString(),
      employees,
      policies: initial?.policies ?? INITIAL_POLICIES,
      leavePlans: initial?.leavePlans ?? createInitialLeavePlans(),
      attendance,
      holidays,
      plannerEvents,
      settings: initial?.settings ?? DEFAULT_PLANNER_SETTINGS,
    }
    this.snapshot = cloneSnapshot(this.snapshot)
  }

  async load(): Promise<LoadedData> {
    return { snapshot: cloneSnapshot(this.snapshot), legacyBackup: false }
  }

  async saveEmployees(rows: Employee[]): Promise<StoreResult> {
    this.snapshot = { ...this.snapshot, employees: rows.map((row) => ({ ...row })) }
    return { ok: true }
  }

  async savePolicies(rows: HRPolicy[]): Promise<StoreResult> {
    this.snapshot = {
      ...this.snapshot,
      policies: rows.map((row) => ({
        ...row,
        rules: [...row.rules],
        ...(row.giftOptions ? { giftOptions: [...row.giftOptions] } : {}),
      })),
    }
    return { ok: true }
  }

  async saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult> {
    this.snapshot = { ...this.snapshot, leavePlans: rows.map((row) => ({ ...row })) }
    return { ok: true }
  }

  async saveAttendance(rows: AttendanceRecord[]): Promise<StoreResult> {
    if (!rows.every(isAttendanceRecordRow) || !hasUniqueIds(rows)) {
      return { ok: false, reason: 'invalid' }
    }
    this.snapshot = { ...this.snapshot, attendance: rows.map((row) => ({ ...row })) }
    return { ok: true }
  }

  async saveHolidays(rows: Holiday[]): Promise<StoreResult> {
    if (
      !rows.every(isHolidayRow) ||
      !hasUniqueIds(rows) ||
      !hasUniqueHolidayDates(rows)
    ) {
      return { ok: false, reason: 'invalid' }
    }
    this.snapshot = { ...this.snapshot, holidays: rows.map((row) => ({ ...row })) }
    return { ok: true }
  }

  async savePlannerEvents(rows: PlannerEvent[]): Promise<StoreResult> {
    if (!rows.every(isPlannerEventRow) || !hasUniqueIds(rows)) {
      return { ok: false, reason: 'invalid' }
    }
    this.snapshot = {
      ...this.snapshot,
      plannerEvents: rows.map((row) => ({ ...row })),
    }
    return { ok: true }
  }

  async saveSettings(settings: PlannerSettings): Promise<StoreResult> {
    this.snapshot = { ...this.snapshot, settings: { ...settings } }
    return { ok: true }
  }

  async exportSnapshot(): Promise<DataSnapshot> {
    return cloneSnapshot(this.snapshot)
  }

  async importSnapshot(snapshot: DataSnapshot): Promise<StoreResult> {
    const validation = validateDataSnapshot(snapshot)
    if (!validation.ok) return validation

    this.snapshot = cloneSnapshot(validation.snapshot)
    return { ok: true }
  }

  async clearBusinessData(): Promise<StoreResult> {
    this.snapshot = {
      ...this.snapshot,
      employees: [],
      policies: [],
      leavePlans: [],
      attendance: [],
      holidays: [],
      plannerEvents: [],
      settings: { ...DEFAULT_PLANNER_SETTINGS },
    }
    return { ok: true }
  }
}
