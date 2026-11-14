import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb'
import type { LeavePlan, PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS, STORAGE_KEYS, type DataSnapshot } from '../DataStore'
import { LocalStorageStore } from '../LocalStorageStore'
import { createDataStore } from '../createDataStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'

const EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 4)
const POLICIES = INITIAL_POLICIES.slice(0, 3)
const LEAVE_PLANS: LeavePlan[] = createInitialLeavePlans(new Date('2026-11-14T09:30:00.000Z')).slice(0, 2)
const SETTINGS: PlannerSettings = { maxConcurrentLeave: 4 }

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

/**
 * The fallback seed uses the current clock for its ISO timestamps, so two calls a
 * millisecond apart differ there while the calendar content is identical. Compare
 * the leave-relevant fields so the assertion is about the seed, not timing.
 */
function leavePlanContent(plans: LeavePlan[]): string[] {
  return plans.map((plan) =>
    [plan.id, plan.employeeId, plan.startDate, plan.endDate, plan.type, plan.status, plan.halfDay ?? '', plan.note ?? ''].join('|'),
  )
}

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
  it('seeds an empty store with the demo datasets', async () => {
    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('saves and reloads all four datasets through the versioned envelopes', async () => {
    const store = new LocalStorageStore()
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
  })

  it('seeds demo leave plans when the roster is exactly the demo set and no leave key exists', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES))

    const loaded = await new LocalStorageStore().load()

    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
  })

  it('does not seed demo leave plans onto a custom roster', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES.slice(0, 3)))

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.employees).toHaveLength(3)
    expect(loaded.snapshot.leavePlans).toEqual([])
  })

  it('preserves a valid leave key even when the roster is custom', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES.slice(0, 3)))
    localStorage.setItem(STORAGE_KEYS.leavePlans, envelope(LEAVE_PLANS))

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.leavePlans).toEqual(LEAVE_PLANS)
  })

  it('falls back to seed data for corrupt payloads without throwing', async () => {
    installLocalStorage({
      omnihr_employees: '{not json',
      omnihr_policies: 'null',
      omnihr_leave_plans: '[null]',
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

  it('repairs duplicated policy and leave ids instead of loading an unsavable set', async () => {
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

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.policies).toEqual([POLICIES[0], POLICIES[1]])
    expect(loaded.snapshot.leavePlans).toEqual([LEAVE_PLANS[0], LEAVE_PLANS[1]])
    expect(loaded.recovered).toBe(true)
  })

  it('does not seed demo leave plans onto a custom roster when the leave payload is corrupt', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES.slice(0, 3)))
    localStorage.setItem(STORAGE_KEYS.leavePlans, '[null,null]')

    const loaded = await new LocalStorageStore().load()

    expect(loaded.snapshot.employees).toHaveLength(3)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.recovered).toBe(true)
  })

  it('seeds demo leave plans onto the demo roster when the leave payload is corrupt', async () => {
    localStorage.setItem(STORAGE_KEYS.employees, envelope(INITIAL_EMPLOYEES))
    localStorage.setItem(STORAGE_KEYS.leavePlans, '[null,null]')

    const loaded = await new LocalStorageStore().load()

    expect(leavePlanContent(loaded.snapshot.leavePlans)).toEqual(
      leavePlanContent(createInitialLeavePlans()),
    )
    expect(loaded.recovered).toBe(true)
  })

  it('rejects a duplicate employee id without writing the dataset', async () => {
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

  it('rejects a duplicate policy id without writing the dataset', async () => {
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

  it('rejects a duplicate leave-plan id without writing the dataset', async () => {
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

  it('exports and imports a snapshot', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.saveSettings(SETTINGS)

    const exported = await store.exportSnapshot()
    expect(exported.employees).toEqual(EMPLOYEES)
    expect(exported.settings).toEqual(SETTINGS)

    await expect(store.importSnapshot(makeSnapshot())).resolves.toEqual({ ok: true })

    const imported = await store.load()
    expect(imported.snapshot.employees).toEqual(EMPLOYEES)
    expect(imported.snapshot.policies).toEqual(POLICIES)
    expect(imported.snapshot.leavePlans).toEqual(LEAVE_PLANS)
    expect(imported.snapshot.settings).toEqual(SETTINGS)
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

    const wrongVersion = { ...makeSnapshot(), v: 2 } as unknown as DataSnapshot
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
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
  })

  it('rolls back earlier keys when an import write fails', async () => {
    const store = new LocalStorageStore()
    await store.load()
    await store.saveEmployees(EMPLOYEES)
    await store.savePolicies(POLICIES)
    await store.saveLeavePlans(LEAVE_PLANS)

    const storage = globalThis.localStorage
    const originalSetItem = storage.setItem.bind(storage)
    storage.setItem = (key: string, value: string) => {
      if (key === 'omnihr_leave_plans') {
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
  })

  it('never throws when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    })
    const store = new LocalStorageStore()

    const loaded = await store.load()
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    await expect(store.saveEmployees(EMPLOYEES)).resolves.toEqual({
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
