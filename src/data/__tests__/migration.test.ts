import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory as FakeIDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { PlannerSettings } from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS } from '../DataStore'
import { IndexedDbStore } from '../IndexedDbStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const now = () => NOW

const LEGACY_EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 2)
const LEGACY_POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEGACY_LEAVE_PLANS = createInitialLeavePlans(NOW).slice(0, 3)
const LEGACY_SETTINGS: PlannerSettings = { maxConcurrentLeave: 7 }

function envelope(rows: unknown[]): string {
  return JSON.stringify({ v: DATA_SCHEMA_VERSION, rows })
}

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

function createStore(): IndexedDbStore {
  return new IndexedDbStore({ now })
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new FakeIDBFactory(),
  })
  installLocalStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IndexedDB migration from localStorage', () => {
  it('seeds every dataset when there is no legacy data', async () => {
    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('seeds demo leave plans when the migrated roster is the exact demo set', async () => {
    installLocalStorage({
      omnihr_employees: envelope(INITIAL_EMPLOYEES),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
  })

  it('does not seed demo leave plans onto a custom migrated roster', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.leavePlans).toEqual([])
  })

  it('migrates legacy v2 envelopes exactly and leaves the keys untouched', async () => {
    const storage = installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope(LEGACY_POLICIES),
      omnihr_leave_plans: envelope(LEGACY_LEAVE_PLANS),
      omnihr_planner_settings: envelope([LEGACY_SETTINGS]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS)
    expect(loaded.snapshot.settings).toEqual(LEGACY_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
    expect(loaded.recovered).toBe(false)

    // The legacy keys are a read-only backup, not a staging area to delete from.
    expect(storage.getItem('omnihr_employees')).toBe(envelope(LEGACY_EMPLOYEES))
    expect(storage.getItem('omnihr_policies')).toBe(envelope(LEGACY_POLICIES))
    expect(storage.getItem('omnihr_leave_plans')).toBe(envelope(LEGACY_LEAVE_PLANS))
    expect(storage.getItem('omnihr_planner_settings')).toBe(envelope([LEGACY_SETTINGS]))
  })

  it('migrates only once, even when the legacy keys keep changing', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope(LEGACY_POLICIES),
    })

    const first = await createStore().load()
    expect(first.snapshot.employees).toEqual(LEGACY_EMPLOYEES)

    const storage = installLocalStorage({
      omnihr_employees: envelope(INITIAL_EMPLOYEES.slice(3, 6)),
      omnihr_policies: envelope(INITIAL_POLICIES.slice(3, 6)),
    })

    const second = await createStore().load()
    expect(second.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(second.snapshot.policies).toEqual(LEGACY_POLICIES)
    // A later visit must not rewrite the backup either.
    expect(storage.getItem('omnihr_employees')).toBe(envelope(INITIAL_EMPLOYEES.slice(3, 6)))
  })

  it('falls back to seed data for corrupt or empty legacy payloads without throwing', async () => {
    installLocalStorage({
      omnihr_employees: '{not json',
      omnihr_policies: '42',
      omnihr_leave_plans: '[null,null]',
      omnihr_planner_settings: JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ nope: true }] }),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    // The employees payload was unreadable, so the fallback roster is the demo set.
    // The leave payload was also unreadable, and the recovery seed follows the same
    // rule as first-run seeding: the demo roster gets the demo planner, and the loss
    // is still reported.
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
    expect(loaded.recovered).toBe(true)
  })

  it('keeps the first row for a duplicated legacy employee id and reports the repair', async () => {
    const duplicate = { ...LEGACY_EMPLOYEES[0], name: 'Later duplicate that must not win' }
    installLocalStorage({
      omnihr_employees: envelope([
        LEGACY_EMPLOYEES[0],
        duplicate,
        LEGACY_EMPLOYEES[1],
      ]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    // The first occurrence survives; the duplicate is not allowed to replace it.
    expect(loaded.snapshot.employees[0].name).toBe(LEGACY_EMPLOYEES[0].name)
    expect(loaded.recovered).toBe(true)

    // The repaired dataset is what was written: a later load cannot resurrect the
    // duplicate from a keyed store that only kept the last write.
    const reloaded = await createStore().load()
    expect(reloaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
  })

  it('repairs duplicated policy and leave ids instead of collapsing them', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope([LEGACY_POLICIES[0], LEGACY_POLICIES[0], LEGACY_POLICIES[1]]),
      omnihr_leave_plans: envelope([
        LEGACY_LEAVE_PLANS[0],
        LEGACY_LEAVE_PLANS[0],
        LEGACY_LEAVE_PLANS[1],
      ]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS.slice(0, 2))
    expect(loaded.recovered).toBe(true)
  })

  it('does not seed demo leave plans onto a custom roster when the leave payload is corrupt', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_leave_plans: '[null,null]',
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.recovered).toBe(true)
  })

  it('seeds demo leave plans onto the demo roster when the leave payload is corrupt', async () => {
    installLocalStorage({
      omnihr_employees: envelope(INITIAL_EMPLOYEES),
      omnihr_leave_plans: '[null,null]',
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.recovered).toBe(true)
  })

  it('preserves a valid empty dataset instead of replacing it with seed data', async () => {
    installLocalStorage({
      omnihr_employees: envelope([]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual([])
    // Absent policies are still seeded: an empty register is a deliberate state, not
    // a reason to leave the rest of the app blank. Leave is different: an empty
    // register is not the demo roster, so no demo planner is invented for it.
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
    expect(loaded.recovered).toBe(false)
  })

  it('does not mark the database initialized when the migration write fails', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope(LEGACY_POLICIES),
    })

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })

    await expect(createStore().load()).rejects.toThrow()

    vi.restoreAllMocks()

    // The failed transaction left no `initialized` marker, so the next visit retries
    // the migration rather than serving a half-written database.
    const loaded = await createStore().load()
    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
  })
})
