import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory as FakeIDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  PlannerSettings,
} from '../../types'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import { DEFAULT_PLANNER_SETTINGS } from '../DataStore'
import { IndexedDbStore } from '../IndexedDbStore'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { createInitialHolidays } from '../initialHolidays'
import { createInitialAttendance } from '../initialAttendance'
import { createInitialPlannerEvents } from '../initialPlannerEvents'

const NOW = new Date('2026-11-14T09:30:00.000Z')
const now = () => NOW

const LEGACY_EMPLOYEES = INITIAL_EMPLOYEES.slice(0, 2)
const LEGACY_POLICIES = INITIAL_POLICIES.slice(0, 2)
const LEGACY_LEAVE_PLANS = createInitialLeavePlans(NOW).slice(0, 3)
const LEGACY_HOLIDAYS = createInitialHolidays(2026)
const LEGACY_ATTENDANCE = createInitialAttendance(LEGACY_EMPLOYEES, LEGACY_HOLIDAYS, NOW).slice(0, 3)
const LEGACY_PLANNER_EVENTS = createInitialPlannerEvents(NOW)
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

/**
 * Builds a real version-1 database with the four stores that version shipped, so the
 * upgrade under test is the browser's own `onupgradeneeded` path rather than a mock.
 */
async function createV1Database(options: {
  employees: Employee[]
  policies?: HRPolicy[]
  leavePlans?: LeavePlan[]
  settings?: PlannerSettings
}): Promise<void> {
  const factory = new FakeIDBFactory()
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: factory,
  })

  await new Promise<void>((resolve, reject) => {
    const request = factory.open('omnihr', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('employees', { keyPath: 'id' })
      db.createObjectStore('policies', { keyPath: 'id' })
      db.createObjectStore('leavePlans', { keyPath: 'id' })
      db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(
        ['employees', 'policies', 'leavePlans', 'meta'],
        'readwrite',
      )
      for (const row of options.employees) transaction.objectStore('employees').put(row)
      for (const row of options.policies ?? []) transaction.objectStore('policies').put(row)
      for (const row of options.leavePlans ?? []) transaction.objectStore('leavePlans').put(row)
      transaction.objectStore('meta').put({ key: 'initialized', value: true })
      transaction
        .objectStore('meta')
        .put({ key: 'settings', value: options.settings ?? DEFAULT_PLANNER_SETTINGS })
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => {
        db.close()
        reject(transaction.error)
      }
      transaction.onabort = () => {
        db.close()
        reject(transaction.error)
      }
    }
  })
}

/**
 * Builds a real version-2 database with the stores that version shipped and its
 * `attendanceInitialized`/`holidaysInitialized` markers, so the v2 -> v3 upgrade is
 * exercised through the browser's own `onupgradeneeded` path.
 */
async function createV2Database(options: {
  employees: Employee[]
  policies?: HRPolicy[]
  leavePlans?: LeavePlan[]
  attendance?: AttendanceRecord[]
  holidays?: Holiday[]
  settings?: PlannerSettings
}): Promise<void> {
  const factory = new FakeIDBFactory()
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: factory,
  })

  await new Promise<void>((resolve, reject) => {
    const request = factory.open('omnihr', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('employees', { keyPath: 'id' })
      db.createObjectStore('policies', { keyPath: 'id' })
      db.createObjectStore('leavePlans', { keyPath: 'id' })
      db.createObjectStore('attendance', { keyPath: 'id' })
      db.createObjectStore('holidays', { keyPath: 'id' })
      db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(
        ['employees', 'policies', 'leavePlans', 'attendance', 'holidays', 'meta'],
        'readwrite',
      )
      for (const row of options.employees) transaction.objectStore('employees').put(row)
      for (const row of options.policies ?? []) transaction.objectStore('policies').put(row)
      for (const row of options.leavePlans ?? []) transaction.objectStore('leavePlans').put(row)
      for (const row of options.attendance ?? []) transaction.objectStore('attendance').put(row)
      for (const row of options.holidays ?? []) transaction.objectStore('holidays').put(row)
      const meta = transaction.objectStore('meta')
      meta.put({ key: 'initialized', value: true })
      meta.put({ key: 'attendanceInitialized', value: true })
      meta.put({ key: 'holidaysInitialized', value: true })
      meta.put({ key: 'settings', value: options.settings ?? DEFAULT_PLANNER_SETTINGS })
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => {
        db.close()
        reject(transaction.error)
      }
      transaction.onabort = () => {
        db.close()
        reject(transaction.error)
      }
    }
  })
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

    expect(loaded.snapshot.v).toBe(3)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
    expect(loaded.snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    expect(loaded.legacyBackup).toBe(false)
    expect(loaded.recovered).toBe(false)
  })

  it('seeds demo leave plans, attendance and events when the migrated roster is the exact demo set', async () => {
    installLocalStorage({
      omnihr_employees: envelope(INITIAL_EMPLOYEES),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.leavePlans).toEqual(createInitialLeavePlans(NOW))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
  })

  it('does not seed demo leave plans, demo attendance or demo events onto a custom migrated roster', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
  })

  it('migrates legacy v2 envelopes exactly and leaves the keys untouched', async () => {
    const storage = installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope(LEGACY_POLICIES),
      omnihr_leave_plans: envelope(LEGACY_LEAVE_PLANS),
      omnihr_attendance: envelope(LEGACY_ATTENDANCE),
      omnihr_holidays: envelope(LEGACY_HOLIDAYS),
      omnihr_planner_events: envelope(LEGACY_PLANNER_EVENTS),
      omnihr_planner_settings: envelope([LEGACY_SETTINGS]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(LEGACY_ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(LEGACY_HOLIDAYS)
    expect(loaded.snapshot.plannerEvents).toEqual(LEGACY_PLANNER_EVENTS)
    expect(loaded.snapshot.settings).toEqual(LEGACY_SETTINGS)
    expect(loaded.legacyBackup).toBe(true)
    expect(loaded.recovered).toBe(false)

    // The legacy keys are a read-only backup, not a staging area to delete from.
    expect(storage.getItem('omnihr_employees')).toBe(envelope(LEGACY_EMPLOYEES))
    expect(storage.getItem('omnihr_policies')).toBe(envelope(LEGACY_POLICIES))
    expect(storage.getItem('omnihr_leave_plans')).toBe(envelope(LEGACY_LEAVE_PLANS))
    expect(storage.getItem('omnihr_attendance')).toBe(envelope(LEGACY_ATTENDANCE))
    expect(storage.getItem('omnihr_holidays')).toBe(envelope(LEGACY_HOLIDAYS))
    expect(storage.getItem('omnihr_planner_events')).toBe(
      envelope(LEGACY_PLANNER_EVENTS),
    )
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
      omnihr_attendance: '[null,null]',
      omnihr_holidays: 'not json',
      omnihr_planner_events: '[null,null]',
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
    // A corrupt attendance key is a lost ledger, not an absent first-run key; the
    // fixed holiday seed is safe regardless of what the roster looks like. A corrupt
    // event key is likewise a lost calendar and is not replaced by invented events.
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
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

  it('repairs duplicated policy, leave, attendance and event ids plus duplicate holiday dates', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_policies: envelope([LEGACY_POLICIES[0], LEGACY_POLICIES[0], LEGACY_POLICIES[1]]),
      omnihr_leave_plans: envelope([
        LEGACY_LEAVE_PLANS[0],
        LEGACY_LEAVE_PLANS[0],
        LEGACY_LEAVE_PLANS[1],
      ]),
      omnihr_attendance: envelope([
        LEGACY_ATTENDANCE[0],
        LEGACY_ATTENDANCE[0],
        LEGACY_ATTENDANCE[1],
      ]),
      omnihr_holidays: envelope([
        LEGACY_HOLIDAYS[0],
        { ...LEGACY_HOLIDAYS[0], id: 'holiday-copy' },
        LEGACY_HOLIDAYS[1],
      ]),
      omnihr_planner_events: envelope([
        LEGACY_PLANNER_EVENTS[0],
        LEGACY_PLANNER_EVENTS[0],
        LEGACY_PLANNER_EVENTS[1],
      ]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS.slice(0, 2))
    expect(loaded.snapshot.attendance).toEqual(LEGACY_ATTENDANCE.slice(0, 2))
    expect(loaded.snapshot.holidays).toEqual(LEGACY_HOLIDAYS.slice(0, 2))
    expect(loaded.snapshot.plannerEvents).toEqual(LEGACY_PLANNER_EVENTS.slice(0, 2))
    expect(loaded.recovered).toBe(true)
  })

  it('repairs a duplicate holiday id even when the dates differ', async () => {
    installLocalStorage({
      omnihr_employees: envelope(LEGACY_EMPLOYEES),
      omnihr_holidays: envelope([
        LEGACY_HOLIDAYS[0],
        { ...LEGACY_HOLIDAYS[1], id: LEGACY_HOLIDAYS[0].id },
      ]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.holidays).toEqual([LEGACY_HOLIDAYS[0]])
    expect(loaded.recovered).toBe(true)
  })

  it('does not seed demo attendance or demo events when the key was deliberately emptied', async () => {
    installLocalStorage({
      omnihr_employees: envelope(INITIAL_EMPLOYEES),
      omnihr_attendance: envelope([]),
      omnihr_planner_events: envelope([]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.recovered).toBe(false)
  })

  it('preserves a valid empty dataset instead of replacing it with seed data', async () => {
    installLocalStorage({
      omnihr_employees: envelope([]),
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual([])
    // Absent policies are still seeded: an empty register is a deliberate state, not
    // a reason to leave the rest of the app blank. Leave and attendance are different:
    // an empty register is not the demo roster, so neither demo seed is invented.
    expect(loaded.snapshot.policies).toEqual(INITIAL_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual([])
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
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

describe('IndexedDB v1 database upgrade', () => {
  it('upgrades in place, preserves every v1 dataset and seeds the new ones', async () => {
    await createV1Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      settings: LEGACY_SETTINGS,
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.v).toBe(3)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS)
    expect(loaded.snapshot.settings).toEqual(LEGACY_SETTINGS)
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.snapshot.attendance).toEqual(
      createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026), NOW),
    )
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
    expect(loaded.recovered).toBe(false)
  })

  it('does not seed demo attendance or demo events onto a custom roster during the upgrade', async () => {
    await createV1Database({
      employees: LEGACY_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      settings: LEGACY_SETTINGS,
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.snapshot.holidays).toEqual(createInitialHolidays(2026))
    expect(loaded.recovered).toBe(false)
  })

  it('does not reseed attendance, holidays or events after a deliberate clear', async () => {
    await createV1Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      settings: LEGACY_SETTINGS,
    })

    const store = createStore()
    await store.load()
    await expect(store.clearBusinessData()).resolves.toEqual({ ok: true })

    const loaded = await store.load()
    expect(loaded.snapshot.attendance).toEqual([])
    expect(loaded.snapshot.holidays).toEqual([])
    expect(loaded.snapshot.plannerEvents).toEqual([])
  })

  it('keeps newly saved attendance, holidays and events across a reload', async () => {
    await createV1Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      settings: LEGACY_SETTINGS,
    })

    const store = createStore()
    await store.load()
    await store.saveAttendance(LEGACY_ATTENDANCE)
    await store.saveHolidays([LEGACY_HOLIDAYS[0]])
    await store.savePlannerEvents(LEGACY_PLANNER_EVENTS)

    const loaded = await createStore().load()
    expect(loaded.snapshot.attendance).toEqual(LEGACY_ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual([LEGACY_HOLIDAYS[0]])
    expect(loaded.snapshot.plannerEvents).toEqual(LEGACY_PLANNER_EVENTS)
  })
})

describe('IndexedDB v2 database upgrade', () => {
  it('upgrades in place, preserves every v2 dataset and seeds planner events for the demo roster', async () => {
    await createV2Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      attendance: LEGACY_ATTENDANCE,
      holidays: LEGACY_HOLIDAYS,
      settings: LEGACY_SETTINGS,
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.v).toBe(3)
    expect(loaded.snapshot.employees).toEqual(INITIAL_EMPLOYEES)
    expect(loaded.snapshot.policies).toEqual(LEGACY_POLICIES)
    expect(loaded.snapshot.leavePlans).toEqual(LEGACY_LEAVE_PLANS)
    expect(loaded.snapshot.attendance).toEqual(LEGACY_ATTENDANCE)
    expect(loaded.snapshot.holidays).toEqual(LEGACY_HOLIDAYS)
    expect(loaded.snapshot.plannerEvents).toEqual(createInitialPlannerEvents(NOW))
    expect(loaded.snapshot.settings).toEqual(LEGACY_SETTINGS)
    expect(loaded.recovered).toBe(false)
  })

  it('does not invent demo planner events for a custom roster during the upgrade', async () => {
    await createV2Database({
      employees: LEGACY_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      attendance: LEGACY_ATTENDANCE,
      holidays: LEGACY_HOLIDAYS,
      settings: LEGACY_SETTINGS,
    })

    const loaded = await createStore().load()

    expect(loaded.snapshot.employees).toEqual(LEGACY_EMPLOYEES)
    expect(loaded.snapshot.plannerEvents).toEqual([])
    expect(loaded.recovered).toBe(false)
  })

  it('keeps a planner-event calendar saved after the upgrade across a reload', async () => {
    await createV2Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      attendance: LEGACY_ATTENDANCE,
      holidays: LEGACY_HOLIDAYS,
      settings: LEGACY_SETTINGS,
    })

    const store = createStore()
    await store.load()
    await store.savePlannerEvents(LEGACY_PLANNER_EVENTS)

    const loaded = await createStore().load()
    expect(loaded.snapshot.plannerEvents).toEqual(LEGACY_PLANNER_EVENTS)
  })

  it('does not reseed planner events after a deliberate clear', async () => {
    await createV2Database({
      employees: INITIAL_EMPLOYEES,
      policies: LEGACY_POLICIES,
      leavePlans: LEGACY_LEAVE_PLANS,
      attendance: LEGACY_ATTENDANCE,
      holidays: LEGACY_HOLIDAYS,
      settings: LEGACY_SETTINGS,
    })

    const store = createStore()
    await store.load()
    await expect(store.clearBusinessData()).resolves.toEqual({ ok: true })

    const loaded = await createStore().load()
    expect(loaded.snapshot.plannerEvents).toEqual([])
  })
})
