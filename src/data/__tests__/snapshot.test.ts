import { describe, expect, it } from 'vitest'
import type {
  AttendanceRecord,
  Holiday,
  LeavePlan,
  PlannerEvent,
  PlannerSettings,
} from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import {
  hasUniqueAttendanceDates,
  hasUniqueHolidayDates,
  hasUniqueIds,
  validateDataSnapshot,
  type DataSnapshot,
} from '../DataStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { createInitialHolidays } from '../initialHolidays'
import { createInitialAttendance } from '../initialAttendance'
import { createInitialPlannerEvents } from '../initialPlannerEvents'
import {
  SNAPSHOT_VERSION,
  createSnapshot,
  parseSnapshot,
  snapshotFileName,
  snapshotToJson,
} from '../snapshot'

const EXPORTED_AT = '2026-11-14T09:30:00.000Z'
const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 3)
const POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(new Date(EXPORTED_AT)).slice(0, 4)
const HOLIDAYS: Holiday[] = createInitialHolidays(2026)
const ATTENDANCE: AttendanceRecord[] = createInitialAttendance(
  EMPLOYEES,
  HOLIDAYS,
  new Date(EXPORTED_AT),
).slice(0, 6)
const PLANNER_EVENTS: PlannerEvent[] = createInitialPlannerEvents(new Date(EXPORTED_AT))
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 6 }

function baseSnapshot(): DataSnapshot {
  return {
    v: 3,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: EXPORTED_AT,
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    attendance: ATTENDANCE,
    holidays: HOLIDAYS,
    plannerEvents: PLANNER_EVENTS,
    settings: SETTINGS,
  }
}

/** A pre-attendance snapshot: the format this build must still restore. */
function legacySnapshot(): Record<string, unknown> {
  return {
    v: 1,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: EXPORTED_AT,
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    settings: SETTINGS,
  }
}

/** A pre-events snapshot: v2 carried attendance and holidays but no planner events. */
function legacyV2Snapshot(): Record<string, unknown> {
  return {
    v: 2,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: EXPORTED_AT,
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    attendance: ATTENDANCE,
    holidays: HOLIDAYS,
    settings: SETTINGS,
  }
}

function rawWithout(
  field:
    | 'employees'
    | 'policies'
    | 'leavePlans'
    | 'attendance'
    | 'holidays'
    | 'plannerEvents'
    | 'settings',
): Record<string, unknown> {
  const raw = { ...baseSnapshot() } as unknown as Record<string, unknown>
  delete raw[field]
  return raw
}

describe('hasUniqueIds', () => {
  it('accepts unique ids, including an empty dataset', () => {
    expect(hasUniqueIds([])).toBe(true)
    expect(hasUniqueIds([{ id: 'a' }, { id: 'b' }])).toBe(true)
  })

  it('rejects a repeated id', () => {
    expect(hasUniqueIds([{ id: 'a' }, { id: 'a' }])).toBe(false)
  })
})

describe('hasUniqueHolidayDates', () => {
  it('accepts a holiday calendar with one row per date', () => {
    expect(hasUniqueHolidayDates([])).toBe(true)
    expect(hasUniqueHolidayDates(HOLIDAYS)).toBe(true)
  })

  it('rejects two differently-id\'d holidays on the same date', () => {
    expect(
      hasUniqueHolidayDates([
        { date: '2026-01-01' },
        { date: '2026-01-01' },
      ]),
    ).toBe(false)
  })
})

describe('hasUniqueAttendanceDates', () => {
  it('accepts one row per employee and date, including an empty ledger', () => {
    expect(hasUniqueAttendanceDates([])).toBe(true)
    expect(
      hasUniqueAttendanceDates([
        { employeeId: 'E1', date: '2026-01-05' },
        { employeeId: 'E1', date: '2026-01-06' },
        { employeeId: 'E2', date: '2026-01-05' },
      ]),
    ).toBe(true)
  })

  it('rejects two rows for the same employee and date even with different ids', () => {
    expect(
      hasUniqueAttendanceDates([
        { employeeId: 'E1', date: '2026-01-05' },
        { employeeId: 'E1', date: '2026-01-05' },
      ]),
    ).toBe(false)
  })
})

describe('createSnapshot', () => {
  it('stamps the v3 snapshot format and the data schema version', () => {
    const snapshot = createSnapshot({
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      attendance: ATTENDANCE,
      holidays: HOLIDAYS,
      plannerEvents: PLANNER_EVENTS,
      settings: SETTINGS,
      exportedAt: EXPORTED_AT,
    })

    expect(SNAPSHOT_VERSION).toBe(3)
    expect(snapshot).toEqual({
      v: SNAPSHOT_VERSION,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: EXPORTED_AT,
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      attendance: ATTENDANCE,
      holidays: HOLIDAYS,
      plannerEvents: PLANNER_EVENTS,
      settings: SETTINGS,
    })
  })

  it('defaults an omitted attendance, holiday or planner-event dataset to an empty array, never a missing key', () => {
    const snapshot = createSnapshot({
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      settings: SETTINGS,
      exportedAt: EXPORTED_AT,
    })

    expect(snapshot.v).toBe(3)
    expect(snapshot.attendance).toEqual([])
    expect(snapshot.holidays).toEqual([])
    expect(snapshot.plannerEvents).toEqual([])
    expect(parseSnapshot(snapshot)).toEqual({ ok: true, snapshot })
  })

  it('defaults exportedAt to the current time', () => {
    const before = Date.now()
    const snapshot = createSnapshot({
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      settings: SETTINGS,
    })
    const after = Date.now()

    const exportedAt = Date.parse(snapshot.exportedAt)
    expect(Number.isNaN(exportedAt)).toBe(false)
    expect(exportedAt).toBeGreaterThanOrEqual(before)
    expect(exportedAt).toBeLessThanOrEqual(after)
  })
})

describe('snapshot round-trip', () => {
  it('preserves every dataset and the planner settings through JSON', () => {
    const snapshot = createSnapshot({
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      attendance: ATTENDANCE,
      holidays: HOLIDAYS,
      plannerEvents: PLANNER_EVENTS,
      settings: SETTINGS,
      exportedAt: EXPORTED_AT,
    })

    const json = snapshotToJson(snapshot)
    expect(typeof json).toBe('string')

    const result = parseSnapshot(JSON.parse(json))
    expect(result).toEqual({ ok: true, snapshot })
    if (!result.ok) throw new Error('expected a valid snapshot')

    expect(result.snapshot.employees).toEqual(EMPLOYEES)
    expect(result.snapshot.policies).toEqual(POLICIES)
    expect(result.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(result.snapshot.attendance).toEqual(ATTENDANCE)
    expect(result.snapshot.holidays).toEqual(HOLIDAYS)
    expect(result.snapshot.plannerEvents).toEqual(PLANNER_EVENTS)
    expect(result.snapshot.settings).toEqual(SETTINGS)
  })

  it('round-trips empty datasets without inventing rows', () => {
    const snapshot = createSnapshot({
      employees: [],
      policies: [],
      leavePlans: [],
      attendance: [],
      holidays: [],
      plannerEvents: [],
      settings: { maxConcurrentLeave: 1 },
      exportedAt: EXPORTED_AT,
    })

    expect(parseSnapshot(JSON.parse(snapshotToJson(snapshot)))).toEqual({
      ok: true,
      snapshot,
    })
  })
})

describe('parseSnapshot', () => {
  it('rejects a payload that is not a plain object', () => {
    expect(parseSnapshot(null)).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSnapshot('not a snapshot')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSnapshot([])).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each([
    'employees',
    'policies',
    'leavePlans',
    'attendance',
    'holidays',
    'plannerEvents',
    'settings',
  ] as const)('rejects a v3 snapshot without %s', (field) => {
    expect(parseSnapshot(rawWithout(field))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts a v1 snapshot and returns v3 with empty attendance, holidays and planner events', () => {
    expect(parseSnapshot(legacySnapshot())).toEqual({
      ok: true,
      snapshot: {
        ...legacySnapshot(),
        v: 3,
        attendance: [],
        holidays: [],
        plannerEvents: [],
      },
    })
  })

  it('accepts a v2 snapshot and returns v3 with empty planner events', () => {
    expect(parseSnapshot(legacyV2Snapshot())).toEqual({
      ok: true,
      snapshot: {
        ...legacyV2Snapshot(),
        v: 3,
        plannerEvents: [],
      },
    })
  })

  it('rejects a wrong snapshot version', () => {
    expect(parseSnapshot({ ...baseSnapshot(), v: SNAPSHOT_VERSION + 1 })).toEqual({
      ok: false,
      reason: 'version',
    })
    expect(parseSnapshot({ ...baseSnapshot(), v: 0 })).toEqual({
      ok: false,
      reason: 'version',
    })
  })

  it('rejects a wrong data schema version', () => {
    expect(parseSnapshot({ ...baseSnapshot(), dataVersion: DATA_SCHEMA_VERSION + 1 })).toEqual({
      ok: false,
      reason: 'version',
    })
  })

  it('rejects an unparseable exportedAt', () => {
    expect(parseSnapshot({ ...baseSnapshot(), exportedAt: 'not-a-date' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(parseSnapshot({ ...baseSnapshot(), exportedAt: 1731576600000 })).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects invalid employee, policy, leave, attendance, holiday, planner-event and settings rows', () => {
    const base = baseSnapshot()

    expect(
      parseSnapshot({ ...base, employees: [{ ...EMPLOYEES[0], monthlyCTC: 'not-a-number' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({ ...base, policies: [{ ...POLICIES[0], rules: 'not-an-array' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        leavePlans: [
          {
            ...LEAVE_PLANS[0],
            startDate: '2026-11-16',
            endDate: '2026-11-18',
            halfDay: 'AM',
          },
        ],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        attendance: [{ ...ATTENDANCE[0], date: '2026-02-30' }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        attendance: [{ ...ATTENDANCE[0], status: 'Retiring' }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        holidays: [{ ...HOLIDAYS[0], date: 'not-a-date' }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        plannerEvents: [{ ...PLANNER_EVENTS[0], title: '   ' }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        plannerEvents: [
          { ...PLANNER_EVENTS[0], startDate: '2026-11-20', endDate: '2026-11-19' },
        ],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        plannerEvents: [{ ...PLANNER_EVENTS[0], type: 'Conference' }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        plannerEvents: [{ ...PLANNER_EVENTS[0], department: 42 }],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(parseSnapshot({ ...base, settings: { maxConcurrentLeave: 0 } })).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects duplicate ids in every keyed dataset', () => {
    const base = baseSnapshot()

    expect(
      parseSnapshot({ ...base, employees: [EMPLOYEES[0], { ...EMPLOYEES[0], name: 'Duplicate' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({ ...base, policies: [POLICIES[0], { ...POLICIES[0], title: 'Duplicate' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({ ...base, leavePlans: [LEAVE_PLANS[0], { ...LEAVE_PLANS[0] }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({ ...base, attendance: [ATTENDANCE[0], { ...ATTENDANCE[0], status: 'WFH' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({ ...base, holidays: [HOLIDAYS[0], { ...HOLIDAYS[0], name: 'Duplicate' }] }),
    ).toEqual({ ok: false, reason: 'invalid' })

    expect(
      parseSnapshot({
        ...base,
        plannerEvents: [
          PLANNER_EVENTS[0],
          { ...PLANNER_EVENTS[0], title: 'Duplicate' },
        ],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects two holidays on the same date even when their ids differ', () => {
    expect(
      parseSnapshot({
        ...baseSnapshot(),
        holidays: [
          HOLIDAYS[0],
          { ...HOLIDAYS[0], id: 'holiday-copy', name: 'Duplicate day' },
        ],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects two attendance rows for the same employee and date with different ids', () => {
    const duplicateDay = {
      ...ATTENDANCE[0],
      id: 'manual-copy',
      status: 'WFH' as const,
    }

    expect(
      parseSnapshot({
        ...baseSnapshot(),
        attendance: [ATTENDANCE[0], duplicateDay],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })

    // The store boundary is the same contract as the file boundary.
    expect(
      validateDataSnapshot({
        ...baseSnapshot(),
        attendance: [ATTENDANCE[0], duplicateDay],
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts an empty dataset with valid settings', () => {
    const snapshot = createSnapshot({
      employees: [],
      policies: [],
      leavePlans: [],
      attendance: [],
      holidays: [],
      plannerEvents: [],
      settings: { maxConcurrentLeave: 2 },
      exportedAt: EXPORTED_AT,
    })

    expect(parseSnapshot(snapshot)).toEqual({ ok: true, snapshot })
  })
})

describe('snapshotFileName', () => {
  it('uses the local calendar date', () => {
    // Both local times are 5 January, so an implementation that slices the UTC ISO
    // string fails one of them in any timezone that is not UTC.
    expect(snapshotFileName(new Date(2026, 0, 5, 0, 30))).toBe('omnihr-snapshot-2026-01-05.json')
    expect(snapshotFileName(new Date(2026, 0, 5, 23, 30))).toBe('omnihr-snapshot-2026-01-05.json')
  })

  it('defaults to today and keeps the expected shape', () => {
    expect(snapshotFileName()).toMatch(/^omnihr-snapshot-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
