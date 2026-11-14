import { describe, expect, it } from 'vitest'
import type { LeavePlan, PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS, type DataSnapshot } from '../DataStore'
import { MemoryStore } from '../MemoryStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'

const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 3)
const POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(new Date('2026-11-14T09:30:00.000Z')).slice(0, 2)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 6 }

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 1,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    settings: SETTINGS,
    ...overrides,
  }
}

describe('MemoryStore', () => {
  it('starts from the application seed and exposes the memory backend', async () => {
    const store = new MemoryStore()
    const loaded = await store.load()

    expect(store.backend).toBe('memory')
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
  })

  it('saves and reloads all four datasets', async () => {
    const store = new MemoryStore()
    await store.load()

    await store.saveEmployees(EMPLOYEES)
    await store.savePolicies(POLICIES)
    await store.saveLeavePlans(LEAVE_PLANS)
    await store.saveSettings(SETTINGS)

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.settings).toEqual(SETTINGS)
  })

  it('imports a valid snapshot and rejects an invalid one without changing data', async () => {
    const store = new MemoryStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    await expect(store.importSnapshot(makeSnapshot())).resolves.toEqual({ ok: true })
    expect((await store.load()).snapshot.policies).toEqual(POLICIES)

    const invalid = makeSnapshot({ settings: { maxConcurrentLeave: 0 } })
    await expect(store.importSnapshot(invalid)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect((await store.load()).snapshot.settings).toEqual(SETTINGS)
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
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
  })

  it('hands out copies so a caller cannot mutate stored data by accident', async () => {
    const store = new MemoryStore({ employees: EMPLOYEES })
    const loaded = await store.load()

    loaded.snapshot.employees[0].name = 'Mutated outside the store'
    loaded.snapshot.settings.maxConcurrentLeave = 99

    const reloaded = await store.load()
    expect(reloaded.snapshot.employees[0].name).toBe(EMPLOYEES[0].name)
    expect(reloaded.snapshot.settings.maxConcurrentLeave).toBe(DEFAULT_PLANNER_SETTINGS.maxConcurrentLeave)
  })
})
