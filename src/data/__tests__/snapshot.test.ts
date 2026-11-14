import { describe, expect, it } from 'vitest'
import type { LeavePlan, PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { hasUniqueIds, type DataSnapshot } from '../DataStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
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
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 6 }

function baseSnapshot(): DataSnapshot {
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

function rawWithout(field: 'employees' | 'policies' | 'leavePlans' | 'settings'): Record<string, unknown> {
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

describe('createSnapshot', () => {
  it('stamps the snapshot format and data schema versions', () => {
    const snapshot = createSnapshot({
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      settings: SETTINGS,
      exportedAt: EXPORTED_AT,
    })

    expect(SNAPSHOT_VERSION).toBe(1)
    expect(snapshot).toEqual({
      v: SNAPSHOT_VERSION,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: EXPORTED_AT,
      employees: EMPLOYEES,
      policies: POLICIES,
      leavePlans: LEAVE_PLANS,
      settings: SETTINGS,
    })
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
    expect(result.snapshot.settings).toEqual(SETTINGS)
  })

  it('round-trips empty datasets without inventing rows', () => {
    const snapshot = createSnapshot({
      employees: [],
      policies: [],
      leavePlans: [],
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

  it.each(['employees', 'policies', 'leavePlans', 'settings'] as const)(
    'rejects a snapshot without %s',
    (field) => {
      expect(parseSnapshot(rawWithout(field))).toEqual({ ok: false, reason: 'invalid' })
    },
  )

  it('rejects a wrong snapshot version', () => {
    expect(parseSnapshot({ ...baseSnapshot(), v: SNAPSHOT_VERSION + 1 })).toEqual({
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

  it('rejects invalid employee, policy, leave and settings rows', () => {
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

    expect(parseSnapshot({ ...base, settings: { maxConcurrentLeave: 0 } })).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects duplicate ids in employees, policies and leave plans', () => {
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
  })

  it('accepts an empty dataset with valid settings', () => {
    const snapshot = createSnapshot({
      employees: [],
      policies: [],
      leavePlans: [],
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
