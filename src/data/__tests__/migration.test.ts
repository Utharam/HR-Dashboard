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
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
  })

  it('preserves a valid empty dataset instead of replacing it with seed data', async () => {
    installLocalStorage({
      omnihr_employees: envelope([]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual([])
    // Absent datasets are still seeded: an empty register is a deliberate state, not
    // a reason to leave the rest of the app blank.
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
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
