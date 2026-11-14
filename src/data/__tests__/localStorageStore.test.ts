import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb'
import type {
  AttendanceRecord,
  Holiday,
  LeavePlan,
  PayStructureOverride,
  PayrollBonus,
  PlannerEvent,
  PlannerSettings,
} from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { createDefaultPayStructure } from '../../utils/payStructure'
import {
  DEFAULT_PLANNER_SETTINGS,
  STORAGE_KEYS,
  type DataSnapshot,
} from '../DataStore'
import { LocalStorageStore } from '../LocalStorageStore'
import { createDataStore } from '../createDataStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { createInitialHolidays } from '../initialHolidays'
import { createInitialAttendance } from '../initialAttendance'
import { createInitialPlannerEvents } from '../initialPlannerEvents'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 4)
const POLICIES = INITIAL_POLICIES.slice(0, 3)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(NOW).slice(0, 2)
const HOLIDAYS: Holiday[] = createInitialHolidays(2026)
const ATTENDANCE: AttendanceRecord[] = createInitialAttendance(EMPLOYEES, HOLIDAYS, NOW).slice(0, 4)
const PLANNER_EVENTS: PlannerEvent[] = createInitialPlannerEvents(NOW)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 4 }
const PAY_STRUCTURE = createDefaultPayStructure()
const PAY_OVERRIDES: PayStructureOverride[] = [
  {
    employeeId: EMPLOYEES[0].id,
    components: [
      { id: 'basic', name: 'Basic', basis: 'Fixed', value: 60000, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ],
    epfEnabled: false,
    professionalTaxEnabled: true,
    updatedAt: '2026-11-14T09:30:00.000Z',
  },
]
const PAYROLL_BONUSES: PayrollBonus[] = [
  {
    id: 'bonus-1',
    employeeId: EMPLOYEES[0].id,
    monthKey: '2026-11',
    kind: 'Custom',
    label: 'Festival bonus',
    amount: 2500,
    createdAt: '2026-11-14T09:30:00.000Z',
    updatedAt: '2026-11-14T09:30:00.000Z',
  },
]

function installLocalStorage(entries: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(entries))
  const storage: Storage = {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, String(value))
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  return storage
}

function envelope(rows: unknown[]): string {
  return JSON.stringify({ v: DATA_SCHEMA_VERSION, rows })
}

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 4,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    attendance: ATTENDANCE,
    holidays: HOLIDAYS,
    plannerEvents: PLANNER_EVENTS,
    payStructure: PAY_STRUCTURE,
    payOverrides: PAY_OVERRIDES,
    payrollBonuses: PAYROLL_BONUSES,
    settings: SETTINGS,
    ...overrides,
  }
}

/**
 * The fallback seed uses the current clock for its ISO timestamps, so two calls a
 * millisecond apart differ there while the calendar content is identical. Compare
 * the attendance-relevant fields so the assertion is about the seed, not timing.
 */
function attendanceSignature(rows: AttendanceRecord[]): string[] {
  return rows.map((row) =>
    [row.id, row.employeeId, row.date, row.status, row.leaveType ?? '', row.source].join('|'),
  )
}

function leavePlanContent(plans: LeavePlan[]): string[] {
  return plans.map((plan) =>
    [plan.id, plan.employeeId, plan.startDate, plan.endDate, plan.type, plan.status, plan.halfDay ?? '', plan.note ?? ''].join('|'),
  )
}

const DEMO_ATTENDANCE = () =>
  createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026))

beforeEach(() => {
  // These tests exercise the fallback, so IndexedDB must look absent even if another
  // test file installed fake-indexeddb in the same worker.
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: undefined,
  })
  installLocalStorage()
})

describe('LocalStorageStore', () => {
  it('seeds an empty store with the demo datasets, attendance, holidays, events and default pay structure', async () => {
    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(attendanceSignature(loaded.snapshot.attendance)).toEqual(
      attendanceSignature(DEMO_ATTENDANCE()),
    )
    expect(loaded.snapshot.plannerEvents.map((event) => event.id)).toEqual(
      createInitialPlannerEvents().map((event) => event.id),
    )
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('saves and reloads every dataset through the versioned envelopes', async () => {
    const store = new LocalStorageStore()
    await store.load()

    await expect(store.saveEmployees(EMPLOYEES)).resolves.toEqual({ ok: true })
    await expect(store.savePolicies(POLICIES)).resolves.toEqual({ ok: true })
    await expect(store.saveLeavePlans(LEAVE_PLANS)).resolves.toEqual({ ok: true })
    await expect(store.saveAttendance(ATTENDANCE)).resolves.toEqual({ ok: true })
    await expect(store.saveHolidays(HOLIDAYS)).resolves.toEqual({ ok: true })
    await expect(store.savePlannerEvents(PLANNER_EVENTS)).resolves.toEqual({ ok: true })
    await expect(store.savePayStructure(PAY_STRUCTURE)).resolves.toEqual({ ok: true })
    await expect(store.savePayOverrides(PAY_OVERRIDES)).resolves.toEqual({ ok: true })
    await expect(store.savePayrollBonuses(PAYROLL_BONUSES)).resolves.toEqual({ ok: true })
    await expect(store.saveSettings(SETTINGS)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
    expect(loaded.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(loaded.snapshot.payStructure).toEqual(PAY_STRUCTURE)
    expect(loaded.snapshot.payOverrides).toEqual(PAY_OVERRIDES)
    expect(loaded.snapshot.payrollBonuses).toEqual(PAYROLL_BONUSES)
    expect(loaded.snapshot.settings).toEqual(SETTINGS)
  })

  it('writes the three pay datasets under their own keys', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.savePayStructure(PAY_STRUCTURE)
    await store.savePayOverrides(PAY_OVERRIDES)
    await store.savePayrollBonuses(PAYROLL_BONUSES)

    const structureEnvelope = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.payStructure) ?? 'null',
    ) as { rows: unknown[] }
    expect(structureEnvelope.rows).toEqual([PAY_STRUCTURE])
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.payOverrides) ?? 'null').rows,
    ).toEqual(PAY_OVERRIDES)
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.payrollBonuses) ?? 'null').rows,
    ).toEqual(PAYROLL_BONUSES)
  })

  it('seeds demo leave plans, attendance and events when the roster is exactly the demo set and no key exists', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES))

    const loaded = await new LocalStorageStore().load()

    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
    expect(attendanceSignature(loaded.snapshot.attendance)).toEqual(
      attendanceSignature(DEMO_ATTENDANCE()),
    )
    expect(loaded.snapshot.plannerEvents.map((event) => event.id)).toEqual(
      createInitialPlannerEvents().map((event) => event.id),
    )
  })

  it('does not seed demo leave plans, demo attendance or demo events onto a custom roster', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES.slice(0, 3)))

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.employees).toHaveLength(3)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
  })

  it('preserves valid attendance, holiday, leave and event keys even when the roster is custom', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES.slice(0, 3)))
    localStorage.setItem(STORAGE_KEYS.leavePlans, envelope(LEAVE_PLANS))
    localStorage.setItem(STORAGE_KEYS.attendance, envelope(ATTENDANCE))
    localStorage.setItem(STORAGE_KEYS.holidays, envelope([HOLIDAYS[0]]))
    localStorage.setItem(STORAGE_KEYS.plannerEvents, envelope(PLANNER_EVENTS))

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual([HOLIDAYS[0]])
    expect(loaded.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
  })

  it('keeps a valid empty attendance, holiday or event envelope empty instead of reseeding it', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES))
    localStorage.setItem(STORAGE_KEYS.attendance, envelope([]))
    localStorage.setItem(STORAGE_KEYS.holidays, envelope([]))
    localStorage.setItem(STORAGE_KEYS.plannerEvents, envelope([]))

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.recovered).toBe(false)
  })

  it('falls back to seed data for corrupt payloads without throwing', async () => {
    installLocalStorage({
      omnihr_employees: '{not json',
      omnihr_policies: 'null',
      omnihr_leave_plans: '[null]',
      omnihr_attendance: '[null]',
      omnihr_holidays: '42',
      omnihr_planner_events: '[null]',
      omnihr_planner_settings: JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ maxConcurrentLeave: 0 }] }),
    })

    const loaded = await new LocalStorageStore().load()
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    // The employees payload was unreadable, so the fallback roster is the demo set.
    // The leave payload was also unreadable; the recovery seed follows the same rule
    // as first-run seeding, so the demo roster gets the demo planner. The loss is
    // still reported rather than passed off as a clean demo seed.
    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
    // A corrupt attendance payload is a lost ledger, not an absent first-run key:
    // it is replaced with an empty ledger rather than invented presence. The event
    // calendar follows the same rule, while the holiday calendar is safe to seed
    // because its fallback is fixed and roster-independent.
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.recovered).toBe(true)
  })

  it('keeps the first row for a duplicated employee id and reports the repair', async () => {
    localStorage.setItem(
      STORAGE_KEYS.employees,
      envelope([EMPLOYEES[0], { ...EMPLOYEES[0], name: 'Later duplicate' }, EMPLOYEES[1]]),
    )

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.employees).toEqual([EMPLOYEES[0], EMPLOYEES[1]])
    expect(loaded.snapshot.employees[0].name).toBe(EMPLOYEES[0].name)
    // The repair is not silent: without `recovered` the next save would report an
    // invalid dataset while the screen still showed the duplicates.
    expect(loaded.recovered).toBe(true)
  })

  it('repairs duplicated policy, leave, attendance and event ids plus duplicate holiday dates', async () => {
    localStorage.setItem(
      STORAGE_KEYS.employees,
      envelope(INITIAL_EMPLOYEES.slice(0, 4)),
    )
    localStorage.setItem(
      STORAGE_KEYS.policies,
      envelope([POLICIES[0], POLICIES[0], POLICIES[1]]),
    )
    localStorage.setItem(
      STORAGE_KEYS.leavePlans,
      envelope([LEAVE_PLANS[0], LEAVE_PLANS[0], LEAVE_PLANS[1]]),
    )
    localStorage.setItem(
      STORAGE_KEYS.attendance,
      envelope([ATTENDANCE[0], ATTENDANCE[0], ATTENDANCE[1]]),
    )
    localStorage.setItem(
      STORAGE_KEYS.holidays,
      envelope([HOLIDAYS[0], { ...HOLIDAYS[0], id: 'holiday-copy' }, HOLIDAYS[1]]),
    )
    localStorage.setItem(
      STORAGE_KEYS.plannerEvents,
      envelope([PLANNER_EVENTS[0], PLANNER_EVENTS[0], PLANNER_EVENTS[1]]),
    )

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.policies).toEqual([POLICIES[0], POLICIES[1]])
    expect(loaded.snapshot.leavePlans).toEqual([LEAVE_PLANS[0], LEAVE_PLANS[1]])
    expect(loaded.snapshot.attendance).toEqual([ATTENDANCE[0], ATTENDANCE[1]])
    expect(loaded.snapshot.holidays).toEqual([HOLIDAYS[0], HOLIDAYS[1]])
    expect(loaded.snapshot.plannerEvents).toEqual([PLANNER_EVENTS[0], PLANNER_EVENTS[1]])
    expect(loaded.recovered).toBe(true)
  })

  it('repairs a duplicate holiday id even when the dates differ', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(EMPLOYEES))
    localStorage.setItem(
      STORAGE_KEYS.holidays,
      envelope([HOLIDAYS[0], { ...HOLIDAYS[1], id: HOLIDAYS[0].id }]),
    )

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.holidays).toEqual([HOLIDAYS[0]])
    expect(loaded.recovered).toBe(true)
  })

  it('falls back to the default pay structure and empty pay datasets for corrupt payloads', async () => {
    installLocalStorage({
      omnihr_employees: envelope(EMPLOYEES),
      omnihr_pay_structure: '{not json',
      omnihr_pay_overrides: '[null]',
      omnihr_payroll_bonuses: '42',
    })

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
    expect(loaded.recovered).toBe(true)
  })

  it('repairs duplicate override employeeIds and bonus ids and reports it', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(EMPLOYEES))
    localStorage.setItem(
      STORAGE_KEYS.payOverrides,
      envelope([
        PAY_OVERRIDES[0],
        { ...PAY_OVERRIDES[0], note: 'Later duplicate' },
      ]),
    )
    localStorage.setItem(
      STORAGE_KEYS.payrollBonuses,
      envelope([PAYROLL_BONUSES[0], { ...PAYROLL_BONUSES[0], label: 'Later duplicate' }]),
    )

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.payOverrides).toEqual([PAY_OVERRIDES[0]])
    expect(loaded.snapshot.payrollBonuses).toEqual([PAYROLL_BONUSES[0]])
    expect(loaded.recovered).toBe(true)
  })

  it('rejects invalid structures, overrides and bonuses without writing them', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.savePayStructure(PAY_STRUCTURE)
    await store.savePayOverrides(PAY_OVERRIDES)
    await store.savePayrollBonuses(PAYROLL_BONUSES)

    await expect(
      store.savePayStructure({
        ...PAY_STRUCTURE,
        components: [{ id: 'hra', name: 'HRA', basis: 'PercentOfCTC', value: 50 }],
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.savePayOverrides([PAY_OVERRIDES[0], { ...PAY_OVERRIDES[0], note: 'Duplicate' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.savePayrollBonuses([PAYROLL_BONUSES[0], { ...PAYROLL_BONUSES[0] }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    const loaded = await store.load()
    expect(loaded.snapshot.payStructure).toEqual(PAY_STRUCTURE)
    expect(loaded.snapshot.payOverrides).toEqual(PAY_OVERRIDES)
    expect(loaded.snapshot.payrollBonuses).toEqual(PAYROLL_BONUSES)
  })

  it('rejects duplicate employee id without writing the dataset', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    const duplicate = [EMPLOYEES[0], { ...EMPLOYEES[0], name: 'Duplicate' }]
    await expect(store.saveEmployees(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.employees).toEqual(EMPLOYEES)
  })

  it('rejects duplicate policy id without writing the dataset', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.savePolicies(POLICIES)

    const duplicate = [POLICIES[0], { ...POLICIES[0], title: 'Duplicate' }]
    await expect(store.savePolicies(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.policies).toEqual(POLICIES)
  })

  it('rejects duplicate leave-plan id without writing the dataset', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveLeavePlans(LEAVE_PLANS)

    const duplicate = [LEAVE_PLANS[0], { ...LEAVE_PLANS[0] }]
    await expect(store.saveLeavePlans(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.leavePlans).toEqual(LEAVE_PLANS)
  })

  it('rejects duplicate planner-event ids and malformed rows without writing the calendar', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.savePlannerEvents(PLANNER_EVENTS)

    await expect(
      store.savePlannerEvents([
        PLANNER_EVENTS[0],
        { ...PLANNER_EVENTS[0], title: 'Duplicate id' },
      ]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.savePlannerEvents([{ ...PLANNER_EVENTS[0], endDate: '2026-01-01' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    expect((await store.load()).snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
  })

  it('rejects duplicate attendance ids, malformed rows and duplicate holiday dates', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveAttendance(ATTENDANCE)
    await store.saveHolidays(HOLIDAYS)

    await expect(
      store.saveAttendance([ATTENDANCE[0], { ...ATTENDANCE[0], status: 'WFH' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.saveAttendance([{ ...ATTENDANCE[0], date: 'not-a-date' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.saveHolidays([HOLIDAYS[0], { ...HOLIDAYS[0], id: 'holiday-copy' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    const loaded = await store.load()
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
  })

  it('exports and imports a v4 snapshot including the pay datasets', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.savePayStructure(PAY_STRUCTURE)
    await store.savePayOverrides(PAY_OVERRIDES)
    await store.savePayrollBonuses(PAYROLL_BONUSES)
    await store.saveSettings(SETTINGS)

    const exported = await store.exportSnapshot()
    expect(exported.v).toBe(4)
    expect(exported.employees).toEqual(EMPLOYEES)
    expect(exported.payStructure).toEqual(PAY_STRUCTURE)
    expect(exported.payOverrides).toEqual(PAY_OVERRIDES)
    expect(exported.payrollBonuses).toEqual(PAYROLL_BONUSES)
    expect(exported.settings).toEqual(SETTINGS)

    await expect(store.importSnapshot(makeSnapshot())).resolves.toEqual({ ok: true })

    const imported = await store.load()
    expect(imported.snapshot.employees).toEqual(EMPLOYEES)
    expect(imported.snapshot.policies).toEqual(POLICIES)
    expect(imported.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(imported.snapshot.attendance).toEqual(ATTENDANCE)
    expect(imported.snapshot.holidays).toEqual(HOLIDAYS)
    expect(imported.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(imported.snapshot.payStructure).toEqual(PAY_STRUCTURE)
    expect(imported.snapshot.payOverrides).toEqual(PAY_OVERRIDES)
    expect(imported.snapshot.payrollBonuses).toEqual(PAYROLL_BONUSES)
    expect(imported.snapshot.settings).toEqual(SETTINGS)
  })

  it('imports a v1 snapshot as v4 with empty attendance, holidays, planner and pay datasets', async () => {
    const store = new LocalStorageStore()
    await store.load()

    const legacy = {
      v: 1,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: '2026-11-14T09:30:00.000Z',
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      settings: SETTINGS,
    } as unknown as DataSnapshot

    await expect(store.importSnapshot(legacy)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
  })

  it('imports a v2 snapshot as v4 with empty planner and pay datasets', async () => {
    const store = new LocalStorageStore()
    await store.load()

    const legacy = {
      ...makeSnapshot(),
      v: 2,
      plannerEvents: undefined,
      payStructure: undefined,
      payOverrides: undefined,
      payrollBonuses: undefined,
    } as unknown as DataSnapshot

    await expect(store.importSnapshot(legacy)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
  })

  it('imports a v3 snapshot as v4 with the default pay datasets', async () => {
    const store = new LocalStorageStore()
    await store.load()

    const legacy = {
      ...makeSnapshot(),
      v: 3,
      payStructure: undefined,
      payOverrides: undefined,
      payrollBonuses: undefined,
    } as unknown as DataSnapshot

    await expect(store.importSnapshot(legacy)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
  })

  it('leaves existing data untouched when an import is invalid', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    const invalid = makeSnapshot({ employees: [{ oops: true } as never] })
    await expect(store.importSnapshot(invalid)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    const wrongVersion = { ...makeSnapshot(), v: 5 } as unknown as DataSnapshot
    await expect(store.importSnapshot(wrongVersion)).resolves.toEqual({
      ok: false,
      reason: 'version',
    })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
  })

  it('clears business data to empty datasets, not back to the demo seed', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.saveSettings(SETTINGS)

    await expect(store.clearBusinessData()).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual([])
    expect(loaded.snapshot.policies).toEqual([])
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
  })

  it('rolls back earlier keys when an import write fails', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.savePolicies(POLICIES)
    await store.saveLeavePlans(LEAVE_PLANS)
    await store.saveAttendance(ATTENDANCE)
    await store.saveHolidays(HOLIDAYS)
    await store.savePlannerEvents(PLANNER_EVENTS)

    const storage = globalThis.localStorage
    const originalSetItem = storage.setItem.bind(storage)
    storage.setItem = (key: string, value: string) => {
      if (key === STORAGE_KEYS.holidays) {
        throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
      }
      originalSetItem(key, value)
    }

    const incoming = makeSnapshot({ employees: INITIAL_EMPLOYEES.slice(5, 7) })
    await expect(store.importSnapshot(incoming)).resolves.toEqual({
      ok: false,
      reason: 'quota',
    })

    storage.setItem = originalSetItem

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
  })

  it('never throws when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    })
    const store = new LocalStorageStore()

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(attendanceSignature(loaded.snapshot.attendance)).toEqual(
      attendanceSignature(DEMO_ATTENDANCE()),
    )
    await expect(store.saveEmployees(EMPLOYEES)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    await expect(store.saveAttendance(ATTENDANCE)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    await expect(store.savePlannerEvents(PLANNER_EVENTS)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    await expect(store.clearBusinessData()).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('reports the fallback backend and why it was selected', async () => {
    const store = new LocalStorageStore('unavailable')
    expect(store.backend).toBe('localstorage')
    expect(store.reason).toBe('unavailable')
  })
})

describe('createDataStore', () => {
  it('returns the localStorage fallback when IndexedDB is absent', () => {
    const store = createDataStore()
    expect(store).toBeInstanceOf(LocalStorageStore)
    expect(store.backend).toBe('localstorage')
  })

  it('returns the IndexedDB store when IndexedDB exists', () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new FakeIDBFactory(),
    })

    const store = createDataStore()
    expect(store.backend).toBe('indexeddb')
  })
})
