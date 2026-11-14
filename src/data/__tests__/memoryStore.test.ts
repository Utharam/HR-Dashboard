import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, Holiday, LeavePlan, PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS, type DataSnapshot } from '../DataStore'
import { MemoryStore } from '../MemoryStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { createInitialHolidays } from '../initialHolidays'
import { createInitialAttendance } from '../initialAttendance'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 3)
const POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(NOW).slice(0, 2)
const HOLIDAYS: Holiday[] = createInitialHolidays(2026)
const ATTENDANCE: AttendanceRecord[] = createInitialAttendance(EMPLOYEES, HOLIDAYS, NOW).slice(0, 3)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 6 }

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 2,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    attendance: ATTENDANCE,
    holidays: HOLIDAYS,
    settings: SETTINGS,
    ...overrides,
  }
}

/** Compares the calendar facts of a seed without pinning its millisecond timestamp. */
function attendanceSignature(rows: AttendanceRecord[]): string[] {
  return rows.map((row) =>
    [row.id, row.employeeId, row.date, row.status, row.leaveType ?? '', row.source].join('|'),
  )
}

describe('MemoryStore', () => {
  it('starts from the application seed and exposes the memory backend', async () => {
    const store = new MemoryStore()
    const loaded = await store.load()

    expect(store.backend).toBe('memory')
    expect(loaded.snapshot.v).toBe(2)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(attendanceSignature(loaded.snapshot.attendance)).toEqual(
      attendanceSignature(
        createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026)),
      ),
    )
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
  })

  it('does not invent demo attendance for a custom initial roster', async () => {
    const store = new MemoryStore({ employees: EMPLOYEES, policies: POLICIES, leavePlans: [] })
    const loaded = await store.load()

    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
  })

  it('keeps an explicitly supplied attendance and holiday dataset', async () => {
    const store = new MemoryStore({
      employees: EMPLOYEES,
      attendance: ATTENDANCE,
      holidays: [HOLIDAYS[0]],
    })
    const loaded = await store.load()

    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual([HOLIDAYS[0]])
  })

  it('saves and reloads all six datasets', async () => {
    const store = new MemoryStore()
    await store.load()

    await store.saveEmployees(EMPLOYEES)
    await store.savePolicies(POLICIES)
    await store.saveLeavePlans(LEAVE_PLANS)
    await store.saveAttendance(ATTENDANCE)
    await store.saveHolidays(HOLIDAYS)
    await store.saveSettings(SETTINGS)

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)
    expect(loaded.snapshot.settings).toEqual(SETTINGS)
  })

  it('rejects duplicate attendance ids without changing the stored ledger', async () => {
    const store = new MemoryStore({ attendance: ATTENDANCE, holidays: HOLIDAYS })
    await store.load()

    const duplicate = [ATTENDANCE[0], { ...ATTENDANCE[0], status: 'WFH' as const }]
    await expect(store.saveAttendance(duplicate)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect((await store.load()).snapshot.attendance).toEqual(ATTENDANCE)
  })

  it('rejects a malformed attendance row without changing the stored ledger', async () => {
    const store = new MemoryStore({ attendance: ATTENDANCE, holidays: HOLIDAYS })
    await store.load()

    await expect(
      store.saveAttendance([{ ...ATTENDANCE[0], date: 'not-a-date' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })
    expect((await store.load()).snapshot.attendance).toEqual(ATTENDANCE)
  })

  it('rejects duplicate holiday ids and duplicate holiday dates', async () => {
    const store = new MemoryStore({ holidays: HOLIDAYS })
    await store.load()

    await expect(
      store.saveHolidays([HOLIDAYS[0], { ...HOLIDAYS[0], name: 'Duplicate id' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    await expect(
      store.saveHolidays([HOLIDAYS[0], { ...HOLIDAYS[0], id: 'holiday-copy' }]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })

    expect((await store.load()).snapshot.holidays).toEqual(HOLIDAYS)
  })

  it('imports a valid v2 snapshot and rejects an invalid one without changing data', async () => {
    const store = new MemoryStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    await expect(store.importSnapshot(makeSnapshot())).resolves.toEqual({ ok: true })
    const loaded = await store.load()
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.attendance).toEqual(ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(HOLIDAYS)

    const invalid = makeSnapshot({ settings: { maxConcurrentLeave: 0 } })
    await expect(store.importSnapshot(invalid)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect((await store.load()).snapshot.settings).toEqual(SETTINGS)
  })

  it('accepts a v1 snapshot and imports empty attendance and holidays', async () => {
    const store = new MemoryStore({ attendance: ATTENDANCE, holidays: HOLIDAYS })
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
    expect(loaded.snapshot.v).toBe(2)
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
  })

  it('clears to empty datasets and the default settings', async () => {
    const store = new MemoryStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    await expect(store.clearBusinessData()).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual([])
    expect(loaded.snapshot.policies).toEqual([])
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
  })

  it('hands out copies so a caller cannot mutate stored data by accident', async () => {
    const store = new MemoryStore({
      employees: EMPLOYEES,
      attendance: ATTENDANCE,
      holidays: HOLIDAYS,
    })
    const loaded = await store.load()

    loaded.snapshot.employees[0].name = 'Mutated outside the store'
    loaded.snapshot.settings.maxConcurrentLeave = 99
    loaded.snapshot.attendance[0] = { ...loaded.snapshot.attendance[0], status: 'Absent' }
    loaded.snapshot.holidays.pop()

    const reloaded = await store.load()
    expect(reloaded.snapshot.employees[0].name).toBe(EMPLOYEES[0].name)
    expect(reloaded.snapshot.settings.maxConcurrentLeave).toBe(DEFAULT_PLANNER_SETTINGS.maxConcurrentLeave)
    expect(reloaded.snapshot.attendance[0].status).toBe(ATTENDANCE[0].status)
    expect(reloaded.snapshot.holidays).toEqual(HOLIDAYS)
  })
})
