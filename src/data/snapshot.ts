/**
 * Versioned JSON snapshot: the backup and handoff format for every business dataset.
 *
 * WHY THIS EXISTS
 *
 * IndexedDB makes the app durable on one device, but durability is not a backup. The
 * Admin page lets HR download a single JSON file and load it back on another machine,
 * or hand it to an executive as a read-only local copy. That file is the only artefact
 * that leaves the browser, so it has to carry everything the console needs and nothing
 * device-specific: employees, policies, leave plans, daily attendance, holidays,
 * planner events, the company pay structure, per-employee pay overrides, monthly
 * payroll bonuses and planner settings. Theme and session are deliberately absent -
 * they belong to a browser, not to the organisation.
 *
 * Two versions are recorded for different failure modes. `v` is the snapshot FORMAT;
 * `dataVersion` is the row schema (`DATA_SCHEMA_VERSION`). A file is only accepted when
 * both match this build and every row passes the same validator the localStorage loader
 * uses, so an import either replaces the data completely or changes nothing. The Admin
 * page parses the file with `parseSnapshot` before handing it to `DataStore`, and the
 * store re-validates at its own boundary; neither half of that contract is trusted by
 * the other.
 */

import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
  PlannerEvent,
  PlannerSettings,
} from '../types'
import { toDateKey } from '../utils/leavePlanner'
import { createDefaultPayStructure } from '../utils/payStructure'
import { DATA_SCHEMA_VERSION } from '../utils/storage'
import { type DataSnapshot, validateDataSnapshot } from './DataStore'

/**
 * Snapshot format version.
 *
 * Mirrors the `v` literal in `DataSnapshot` and the check in `validateDataSnapshot`.
 * It is separate from `DATA_SCHEMA_VERSION` because the two change for different
 * reasons: adding a dataset changes the snapshot format, while reshaping a row changes
 * the schema. Version 2 adds `attendance` and `holidays`; version 3 adds
 * `plannerEvents`; version 4 adds `payStructure`, `payOverrides` and
 * `payrollBonuses`. Versions 1–3 are still readable and are normalised to v4 with
 * the default pay structure and empty pay datasets.
 */
export const SNAPSHOT_VERSION = 4

export interface SnapshotInput {
  employees: Employee[]
  policies: HRPolicy[]
  leavePlans: LeavePlan[]
  /**
   * Optional so call sites that predate the daily attendance feature can keep
   * building a valid snapshot; an absent dataset means an empty one, never a
   * half-written snapshot.
   */
  attendance?: AttendanceRecord[]
  holidays?: Holiday[]
  /** Optional for the same reason: an absent event calendar means an empty one. */
  plannerEvents?: PlannerEvent[]
  /**
   * Optional so tests and older call sites can still build a snapshot. An absent
   * pay structure means the default template; absent overrides/bonuses mean empty
   * arrays. The result is always a complete v4 snapshot.
   */
  payStructure?: PayStructure
  payOverrides?: PayStructureOverride[]
  payrollBonuses?: PayrollBonus[]
  settings: PlannerSettings
  /** Testing/handoff seam; defaults to the current time. */
  exportedAt?: string
}

export type SnapshotParseResult =
  | { ok: true; snapshot: DataSnapshot }
  | { ok: false; reason: 'invalid' | 'version' }

/**
 * Builds a snapshot from the live datasets.
 *
 * This does not validate: `createSnapshot` is called with state the app already holds
 * and has validated on the way in. The import path is the untrusted one and goes
 * through `parseSnapshot` below.
 */
export function createSnapshot(input: SnapshotInput): DataSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    employees: input.employees,
    policies: input.policies,
    leavePlans: input.leavePlans,
    attendance: input.attendance ?? [],
    holidays: input.holidays ?? [],
    plannerEvents: input.plannerEvents ?? [],
    payStructure: input.payStructure ?? createDefaultPayStructure(),
    payOverrides: input.payOverrides ?? [],
    payrollBonuses: input.payrollBonuses ?? [],
    settings: input.settings,
  }
}

/**
 * Validates an untrusted parsed JSON value.
 *
 * `version` and `invalid` are distinguished because they tell the user different things:
 * a version mismatch means this file came from another build, while `invalid` means the
 * file is malformed or holds a bad row. Either way nothing is written. The row and
 * timestamp checks themselves live in `validateDataSnapshot`, so the store boundary and
 * the file boundary cannot drift apart.
 *
 * Version 1 is accepted on purpose: it predates daily attendance and holidays,
 * version 2 predates planner events, and version 3 predates the pay datasets.
 * `validateDataSnapshot` returns any of them as v4 with the default structure and
 * empty arrays for the datasets that format did not define, so an old backup remains
 * a complete restore rather than being refused by the build that added the datasets.
 */
export function parseSnapshot(raw: unknown): SnapshotParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid' }
  }

  // Check the snapshot format here so the exported constant is the authority on the
  // Admin import path; `validateDataSnapshot` then covers the data schema and rows.
  const version = (raw as { v?: unknown }).v
  if (version !== 1 && version !== 2 && version !== 3 && version !== SNAPSHOT_VERSION) {
    return { ok: false, reason: 'version' }
  }

  return validateDataSnapshot(raw)
}

/**
 * Serialises a snapshot for download.
 *
 * Pretty-printed on purpose: a snapshot is a human handoff as well as a machine backup,
 * and it may be opened in an editor or compared between two exports by hand.
 */
export function snapshotToJson(snapshot: DataSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

/**
 * `omnihr-snapshot-YYYY-MM-DD.json`, using the LOCAL calendar date.
 *
 * `toDateKey` never calls `toISOString().slice(0, 10)`, so an export made late in the
 * evening west of Greenwich is not dated tomorrow.
 */
export function snapshotFileName(date: Date = new Date()): string {
  return `omnihr-snapshot-${toDateKey(date)}.json`
}
