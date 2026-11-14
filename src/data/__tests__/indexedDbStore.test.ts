import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory as FakeIDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { LeavePlan, PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS, type DataSnapshot } from '../DataStore'
import { IndexedDbStore } from '../IndexedDbStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const now = () => NOW

const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 3)
const POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(NOW).slice(0, 4)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 5 }

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 1,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: NOW.toISOString(),
    employees: EMPLOYEES,
    policies: POLICIES,
    leavePlans: LEAVE_PLANS,
    settings: SETTINGS,
    ...overrides,
  }
}

function createStore(): IndexedDbStore {
  return new IndexedDbStore({ now })
}

beforeEach(() => {
  // A fresh factory per test means no database survives into the next test. This is
  // the per-file setup the plan requires; the global test setup stays untouched.
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new FakeIDBFactory(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IndexedDbStore', () => {
  it('seeds employees, policies, leave plans and settings on an empty database', async () => {
    const loaded = await createStore().load()

    expect(loaded.snapshot.v).toBe(1)
    expect(loaded.snapshot.dataVersion).toBe(DATA_SCHEMA_VERSION)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('saves and reloads all four datasets', async () => {
    const store = createStore()
    await store.load()

    await expect(store.saveEmployees(EMPLOYEES)).resolves.toEqual({ ok: true })
    await expect(store.savePolicies(POLICIES)).resolves.toEqual({ ok: true })
    await expect(store.saveLeavePlans(LEAVE_PLANS)).resolves.toEqual({ ok: true })
    await expect(store.saveSettings(SETTINGS)).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(loaded.snapshot.settings).toEqual(SETTINGS)
    expect(loaded.recovered).toBe(false)
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

  it('replaces corrupt stored rows with demo data and reports recovery', async () => {
    const store = createStore()
    await store.load()

    // Bypass the shape guards through the typed save seam: a row written by an older
    // build can still be present in IndexedDB even though today's predicates reject it.
    await store.saveEmployees([{ id: 'broken' } as never])
    await store.savePolicies([{ id: 'broken' } as never])
    await store.saveLeavePlans([{ id: 'broken' } as never])

    const loaded = await store.load()
    expect(loaded.recovered).toBe(true)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
  })

  it('treats a saved empty array as an empty dataset instead of reseeding it', async () => {
    const store = createStore()
    await store.load()

    await store.saveEmployees([])
    await store.savePolicies([])
    await store.saveLeavePlans([])

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual([])
    expect(loaded.snapshot.policies).toEqual([])
    expect(loaded.snapshot.leavePlans).toEqual([])
  })

  it('exports the currently stored snapshot', async () => {
    const store = createStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.saveSettings(SETTINGS)

    const exported = await store.exportSnapshot()
    expect(exported.employees).toEqual(EMPLOYEES)
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
    expect(loaded.snapshot.settings).toEqual(SETTINGS)
  })

  it('rejects a wrong snapshot version without changing stored data', async () => {
    const store = createStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)

    const wrongVersion = { ...makeSnapshot(), v: 2 } as unknown as DataSnapshot
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

  it('clears business data and resets settings without reseeding on the next load', async () => {
    const store = createStore()
    await store.load()
    await store.saveSettings(SETTINGS)

    await expect(store.clearBusinessData()).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual([])
    expect(loaded.snapshot.policies).toEqual([])
    expect(loaded.snapshot.leavePlans).toEqual([])
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
