/**
 * localStorage implementation of `DataStore`.
 *
 * This is the fallback for a browser where IndexedDB is blocked (private windows,
 * hardened profiles, some embedded webviews). It uses the same versioned envelopes
 * `App` has always written, so a browser that falls back still finds the user's old
 * data and the two backends do not invent different storage formats.
 *
 * The contract is deliberately weaker than IndexedDB in one respect: localStorage has
 * no transactions. `importSnapshot` validates everything first, then writes the four
 * keys, restoring the previous values if a later write fails. That is a best-effort
 * rollback, not a guarantee — a quota failure can also prevent restoring — but it is
 * the strongest promise this API allows, and every method still reports rather than
 * throws.
 */

import type { Employee, HRPolicy, LeavePlan, PlannerSettings } from '../types'
import {
  DEFAULT_PLANNER_SETTINGS,
  STORAGE_KEYS,
  dedupeById,
  hasStoredValue,
  hasUniqueIds,
  type DataSnapshot,
  type DataStore,
  type LoadedData,
  type StoreBackend,
  type StoreResult,
  validateDataSnapshot,
} from './DataStore'
import { DATA_SCHEMA_VERSION, loadPersisted, savePersisted } from '../utils/storage'
import {
  isEmployeeRow,
  isLeavePlanRow,
  isPlannerSettingsRow,
  isPolicyRow,
} from '../utils/rowValidators'
import { INITIAL_EMPLOYEES } from './initialData'
import { INITIAL_POLICIES } from './initialPolicies'
import { createInitialLeavePlans, isDemoEmployeeSet } from './initialLeavePlans'

type LegacyKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

function loadSettings(): { settings: PlannerSettings; recovered: boolean } {
  const result = loadPersisted(
    STORAGE_KEYS.settings,
    isPlannerSettingsRow,
    [DEFAULT_PLANNER_SETTINGS],
  )
  return {
    settings: result.rows[0] ?? { ...DEFAULT_PLANNER_SETTINGS },
    recovered: result.status === 'recovered',
  }
}

/** Writes a keyed dataset only when no id repeats; a keyed envelope would lose rows. */
function saveRows<T extends { id: string }>(key: LegacyKey, rows: T[]): StoreResult {
  if (!hasUniqueIds(rows)) return { ok: false, reason: 'invalid' }
  return savePersisted(key, rows)
}

function readRaw(key: LegacyKey): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function restoreRaw(key: LegacyKey, value: string | null): void {
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    if (value === null) {
      storage.removeItem(key)
    } else {
      storage.setItem(key, value)
    }
  } catch {
    /* rollback is best effort; the caller already has the original failure */
  }
}

export class LocalStorageStore implements DataStore {
  readonly backend: StoreBackend = 'localstorage'

  /**
   * Why this store was selected. `unavailable` means IndexedDB could not be opened,
   * which the DataGate surfaces as a warning. The store's behaviour is identical
   * either way, so the field exists for the UI, not for branching here.
   */
  readonly reason?: 'unavailable'

  constructor(reason?: 'unavailable') {
    this.reason = reason
  }

  async load(): Promise<LoadedData> {
    // Same first-run behaviour as the IndexedDB migration: an absent or corrupt
    // employees/policies dataset is replaced by the demo seed, while a valid empty
    // envelope stays empty (it is a deliberate state, not a missing one). Leave plans
    // are the exception below, because the demo seed belongs to the demo roster.
    // `App`'s save effects persist the seed on the next render, as they always did.
    const employeesResult = loadPersisted(
      STORAGE_KEYS.employees,
      isEmployeeRow,
      INITIAL_EMPLOYEES,
    )
    const policiesResult = loadPersisted(
      STORAGE_KEYS.policies,
      isPolicyRow,
      INITIAL_POLICIES,
    )
    // The leave key gets an empty fallback, not the demo seed, so a custom roster is
    // never shown leave for demo employees it does not contain. The seed is applied
    // below only when the roster is exactly the demo set and the stored leave payload
    // is unusable (absent or corrupt).
    const leavePlansResult = loadPersisted(STORAGE_KEYS.leavePlans, isLeavePlanRow, [])
    const settingsResult = loadSettings()

    // Shape validation accepts a repeated id; this backend would then load the whole
    // dataset but reject every later save as invalid, which looks like a storage
    // failure with no explanation. Repair the duplicates here (first row wins) and
    // report it through `recovered`, matching the IndexedDB migration.
    const employees = dedupeById(employeesResult.rows)
    const policies = dedupeById(policiesResult.rows)
    const leavePlansDeduped = dedupeById(leavePlansResult.rows)
    const leavePlansUnusable =
      !hasStoredValue(STORAGE_KEYS.leavePlans) || leavePlansResult.status === 'recovered'
    const leavePlans = leavePlansUnusable
      ? isDemoEmployeeSet(employees.rows)
        ? createInitialLeavePlans()
        : []
      : leavePlansDeduped.rows

    return {
      snapshot: {
        v: 1,
        dataVersion: DATA_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        employees: employees.rows,
        policies: policies.rows,
        leavePlans,
        settings: settingsResult.settings,
      },
      // In this backend the legacy keys ARE the live store, so there is no separate
      // read-only backup to advertise.
      legacyBackup: false,
      // A corrupt envelope was replaced, or a repeated id was repaired, above. The
      // fallback backend still has to admit that the saved copy it found was unusable
      // or malformed.
      recovered:
        employeesResult.status === 'recovered' ||
        policiesResult.status === 'recovered' ||
        leavePlansResult.status === 'recovered' ||
        settingsResult.recovered ||
        employees.repaired ||
        policies.repaired ||
        leavePlansDeduped.repaired,
    }
  }

  async saveEmployees(rows: Employee[]): Promise<StoreResult> {
    return saveRows(STORAGE_KEYS.employees, rows)
  }

  async savePolicies(rows: HRPolicy[]): Promise<StoreResult> {
    return saveRows(STORAGE_KEYS.policies, rows)
  }

  async saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult> {
    return saveRows(STORAGE_KEYS.leavePlans, rows)
  }

  async saveSettings(settings: PlannerSettings): Promise<StoreResult> {
    return savePersisted(STORAGE_KEYS.settings, [settings])
  }

  async exportSnapshot(): Promise<DataSnapshot> {
    const loaded = await this.load()
    return loaded.snapshot
  }

  async importSnapshot(snapshot: DataSnapshot): Promise<StoreResult> {
    // Validate before touching a single key. The Admin path validates the uploaded
    // file first as well, but the store cannot assume its caller remembered to.
    const validation = validateDataSnapshot(snapshot)
    if (!validation.ok) return validation

    const valid = validation.snapshot
    const previous = new Map<LegacyKey, string | null>([
      [STORAGE_KEYS.employees, readRaw(STORAGE_KEYS.employees)],
      [STORAGE_KEYS.policies, readRaw(STORAGE_KEYS.policies)],
      [STORAGE_KEYS.leavePlans, readRaw(STORAGE_KEYS.leavePlans)],
      [STORAGE_KEYS.settings, readRaw(STORAGE_KEYS.settings)],
    ])

    const writes: Array<[LegacyKey, unknown[]]> = [
      [STORAGE_KEYS.employees, valid.employees],
      [STORAGE_KEYS.policies, valid.policies],
      [STORAGE_KEYS.leavePlans, valid.leavePlans],
      [STORAGE_KEYS.settings, [valid.settings]],
    ]

    for (const [key, rows] of writes) {
      const result = savePersisted(key, rows)
      if (!result.ok) {
        for (const [previousKey, previousValue] of previous) {
          restoreRaw(previousKey, previousValue)
        }
        return result
      }
    }

    return { ok: true }
  }

  async clearBusinessData(): Promise<StoreResult> {
    // Write valid empty envelopes rather than removing the keys. Removing them would
    // make the next load treat the origin as a first run and re-seed the demo data;
    // "cleared" must stay cleared, exactly as it does in the IndexedDB store.
    const writes: Array<[LegacyKey, unknown[]]> = [
      [STORAGE_KEYS.employees, []],
      [STORAGE_KEYS.policies, []],
      [STORAGE_KEYS.leavePlans, []],
      [STORAGE_KEYS.settings, [{ ...DEFAULT_PLANNER_SETTINGS }]],
    ]

    for (const [key, rows] of writes) {
      const result = savePersisted(key, rows)
      if (!result.ok) return result
    }

    return { ok: true }
  }
}
