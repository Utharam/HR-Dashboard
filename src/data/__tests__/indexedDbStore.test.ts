import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory as FakeIDBFactory, IDBObjectStore } from 'fake-indexeddb'
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
import { DEFAULT_PLANNER_SETTINGS, type DataSnapshot } from '../DataStore'
import { IndexedDbStore } from '../IndexedDbStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { createInitialHolidays } from '../initialHolidays'
import { createInitialAttendance } from '../initialAttendance'
import { createInitialPlannerEvents } from '../initialPlannerEvents'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const now = () => NOW

const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 3)
const POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(NOW).slice(0, 4)
const HOLIDAYS: Holiday[] = createInitialHolidays(2026)
const ATTENDANCE: AttendanceRecord[] = createInitialAttendance(EMPLOYEES, HOLIDAYS, NOW).slice(0, 4)
const PLANNER_EVENTS: PlannerEvent[] = createInitialPlannerEvents(NOW)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 5 }
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
    updatedAt: NOW.toISOString(),
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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  },
]

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 4,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: NOW.toISOString(),
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

function createStore(): IndexedDbStore {
  return new IndexedDbStore({ now })
}

/**
 * Writes a row straight into the live database, bypassing the store's shape guards.
 * A row written by an older build can still be present in IndexedDB even though
 * today's predicates reject it; `save*` is the wrong seam to reproduce that.
 */
function putRaw(storeName: string, row: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open('omnihr')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(row)
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => {
        db.close()
        reject(transaction.error)
      }
    }
  })
}

beforeEach(() => {
  // A fresh factory per test means no database survives into the next test. This is
  // the per-file setup the plan requires; the global test setup stays untouched.
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new FakeIDBFactory(),
  })
  // The migration reads these envelopes; a leftover key from another test would
  // change the seed this file is asserting. This file runs in the node environment,
  // where Web Storage is legitimately absent.
  globalThis.localStorage?.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IndexedDbStore', () => {
  it('seeds every dataset and the default pay structure on an empty database', async () => {
    const loaded = await createStore().load()

    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.dataVersion).toBe(DATA_SCHEMA_VERSION)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('saves and reloads every dataset', async () => {
    const store = createStore()
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
    expect(loaded.recovered).toBe(false)
  })

  it('rejects invalid structures, duplicate override employeeIds and duplicate bonus ids', async () => {
    const store = createStore()
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

  it('rejects a duplicate employee id without writing the dataset', async () => {
    const store = createStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    const duplicate = [EMPLOYEES[0], { ...EMPLOYEES[0], name: 'Duplicate' }]
    await expect(store.saveEmployees(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.employees).toEqual(EMPLOYEES)
  })

  it('rejects a duplicate policy id without writing the dataset', async () => {
    const store = createStore()
    await store.load()
    await store.savePolicies(POLICIES)

    const duplicate = [POLICIES[0], { ...POLICIES[0], title: 'Duplicate' }]
    await expect(store.savePolicies(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.policies).toEqual(POLICIES)
  })

  it('rejects a duplicate leave-plan id without writing the dataset', async () => {
    const store = createStore()
    await store.load()
    await store.saveLeavePlans(LEAVE_PLANS)

    const duplicate = [LEAVE_PLANS[0], { ...LEAVE_PLANS[0] }]
    await expect(store.saveLeavePlans(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    expect((await store.load()).snapshot.leavePlans).toEqual(LEAVE_PLANS)
  })

  it('rejects duplicate attendance ids and malformed rows without writing the ledger', async () => {
    const store = createStore()
    await store.load()
    await store.saveAttendance(ATTENDANCE)

    await expect(
      store.saveAttendance([ATTENDANCE[0], { ...ATTENDANCE[0], status: 'WFH' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.saveAttendance([{ ...ATTENDANCE[0], date: 'not-a-date' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    expect((await store.load()).snapshot.attendance).toEqual(ATTENDANCE)
  })

  it('rejects duplicate holiday ids and duplicate holiday dates without writing the calendar', async () => {
    const store = createStore()
    await store.load()
    await store.saveHolidays(HOLIDAYS)

    await expect(
      store.saveHolidays([HOLIDAYS[0], { ...HOLIDAYS[0], name: 'Duplicate id' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.saveHolidays([HOLIDAYS[0], { ...HOLIDAYS[0], id: 'holiday-copy' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    expect((await store.load()).snapshot.holidays).toEqual(HOLIDAYS)
  })

  it('rejects duplicate planner-event ids and malformed rows without writing the calendar', async () => {
    const store = createStore()
    await store.load()
    await store.savePlannerEvents(PLANNER_EVENTS)

    await expect(
      store.savePlannerEvents([
        PLANNER_EVENTS[0],
        { ...PLANNER_EVENTS[0], title: 'Duplicate id' },
      ]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.savePlannerEvents([{ ...PLANNER_EVENTS[0], startDate: '2026-02-30' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    expect((await store.load()).snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
  })

  it('replaces corrupt stored rows with seed data and reports recovery', async () => {
    const store = createStore()
    await store.load()

    await putRaw('employees', { id: 'broken' })
    await putRaw('policies', { id: 'broken' })
    await putRaw('leavePlans', { id: 'broken' })
    await putRaw('attendance', { id: 'broken' })
    await putRaw('holidays', { id: 'broken' })
    await putRaw('plannerEvents', { id: 'broken' })
    await putRaw('payStructure', { id: 'company', components: [] })
    await putRaw('payOverrides', { employeeId: 'broken' })
    await putRaw('payrollBonuses', { id: 'broken' })

    const loaded = await store.load()
    expect(loaded.recovered).toBe(true)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
  })

  it('does not seed demo leave plans, demo attendance or demo events onto a custom roster with invalid rows', async () => {
    const store = createStore()
    await store.load()

    // The roster is a valid custom set (not the demo roster), while the leave,
    // attendance and event stores hold rows today's predicates reject. Recovery must
    // not invent data for employees the demo seed does not describe.
    await store.saveEmployees(EMPLOYEES)
    await putRaw('leavePlans', { id: 'broken' })
    await putRaw('attendance', { id: 'broken' })
    await putRaw('plannerEvents', { id: 'broken' })

    const loaded = await store.load()
    expect(loaded.recovered).toBe(true)
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
  })

  it('seeds demo leave plans, attendance and events when the demo roster has invalid rows', async () => {
    const store = createStore()
    await store.load()

    await store.saveEmployees(INITIAL_EMPLOYEES)
    await putRaw('leavePlans', { id: 'broken' })
    await putRaw('attendance', { id: 'broken' })
    await putRaw('plannerEvents', { id: 'broken' })

    const loaded = await store.load()
    expect(loaded.recovered).toBe(true)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
  })

  it('treats a saved empty array as a deliberate empty dataset instead of reseeding it', async () => {
    const store = createStore()
    await store.load()

    await store.saveEmployees([])
    await store.savePolicies([])
    await store.saveLeavePlans([])
    await store.saveAttendance([])
    await store.saveHolidays([])
    await store.savePlannerEvents([])

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual([])
    expect(loaded.snapshot.policies).toEqual([])
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
  })

  it('exports the currently stored snapshot', async () => {
    const store = createStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.saveAttendance(ATTENDANCE)
    await store.saveHolidays(HOLIDAYS)
    await store.savePlannerEvents(PLANNER_EVENTS)
    await store.saveSettings(SETTINGS)

    const exported = await store.exportSnapshot()
    expect(exported.employees).toEqual(EMPLOYEES)
    expect(exported.attendance).toEqual(ATTENDANCE)
    expect(exported.holidays).toEqual(HOLIDAYS)
    expect(exported.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(exported.payStructure).toEqual(PAY_STRUCTURE)
    expect(exported.settings).toEqual(SETTINGS)
  })

  it('imports a validated snapshot into every dataset', async () => {
    const store = createStore()
    await store.load()

    const incoming = makeSnapshot()
    await expect(store.importSnapshot(incoming)).resolves.toEqual({ ok: true })

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

  it('imports a v1 snapshot with empty attendance, holidays, planner and pay datasets', async () => {
    const store = createStore()
    await store.load()

    const legacy = {
      v: 1,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: NOW.toISOString(),
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
    // The imported empty stores are deliberate: a later load must not reseed them.
    expect((await createStore().load()).snapshot.attendance).toEqual([])
    expect((await createStore().load()).snapshot.plannerEvents).toEqual([])
  })

  it('imports a v2 snapshot with empty planner and pay datasets', async () => {
    const store = createStore()
    await store.load()

    const legacyV2 = {
      ...makeSnapshot(),
      v: 2,
      plannerEvents: undefined,
      payStructure: undefined,
      payOverrides: undefined,
      payrollBonuses: undefined,
    } as unknown as DataSnapshot

    await expect(store.importSnapshot(legacyV2)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
  })

  it('imports a v3 snapshot with the default pay datasets', async () => {
    const store = createStore()
    await store.load()

    const legacyV3 = {
      ...makeSnapshot(),
      v: 3,
      payStructure: undefined,
      payOverrides: undefined,
      payrollBonuses: undefined,
    } as unknown as DataSnapshot

    await expect(store.importSnapshot(legacyV3)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.v).toBe(4)
    expect(loaded.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(loaded.snapshot.payStructure).toEqual(createDefaultPayStructure())
    expect(loaded.snapshot.payOverrides).toEqual([])
    expect(loaded.snapshot.payrollBonuses).toEqual([])
  })

  it('rejects a wrong snapshot version without changing stored data', async () => {
    const store = createStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    const wrongVersion = { ...makeSnapshot(), v: 5 } as unknown as DataSnapshot
    await expect(store.importSnapshot(wrongVersion)).resolves.toEqual({
      ok: false,
      reason: 'version',
    })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
  })

  it('rejects an invalid row without changing stored data', async () => {
    const store = createStore()
    await store.load()
    await store.savePolicies(POLICIES)

    const invalid = makeSnapshot({
      employees: [{ id: 'broken' } as never],
    })
    await expect(store.importSnapshot(invalid)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })

    const loaded = await store.load()
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
  })

  it('clears business data, resets settings and restores the default pay structure without reseeding', async () => {
    const store = createStore()
    await store.load()
    await store.saveSettings(SETTINGS)
    await store.savePayStructure(PAY_STRUCTURE)
    await store.savePayOverrides(PAY_OVERRIDES)
    await store.savePayrollBonuses(PAYROLL_BONUSES)

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

  it('reports unavailable when IndexedDB is missing', async () => {
    const store = createStore()
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: undefined,
    })

    await expect(store.load()).rejects.toThrow()
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
  })

  it('maps a QuotaExceededError to the quota reason', async () => {
    const store = createStore()
    await store.load()

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })

    await expect(store.saveEmployees(EMPLOYEES)).resolves.toEqual({
      ok: false,
      reason: 'quota',
    })
  })
})
