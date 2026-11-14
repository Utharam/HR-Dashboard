# OmniHR — IndexedDB, Leave Planner & Admin Data Exchange

**Status:** Approved for implementation (2026-11-14)
**Supersedes:** localStorage-only persistence for business data.

## 1. Intent

Make the local-first app durable enough for real HR use by moving business data to IndexedDB, add a leave planner that lets HR record future leave and gives leadership a calendar view of coverage, and turn the Excel Hub into an Admin/Data Exchange page with a full snapshot backup and handoff.

## 2. Goals

- IndexedDB is the primary store for employees, policies, leave plans and planner settings.
- A one-time, non-destructive migration from the existing localStorage keys.
- A full business-data snapshot (export/import JSON) that works as a backup and as a shareable copy for executives.
- A leave planner: HR enters future leave; HR, VP HR, CEO and CFO view a month calendar, filters, peak/coverage days and upcoming leave.
- Admin page owns the Excel Hub and the snapshot workflow.
- A `DataStore` seam that a future cloud backend can implement without changing the UI.
- Keep the current 612-test suite green; add tests for every new behaviour.

## 3. Non-goals

- No backend, cloud database, real multi-user sync or server auth in this version.
- No direct Google Drive/OneDrive API integration; the snapshot file can be saved to any cloud drive manually.
- No enforced role-based access in the base version. HR is the intended editor; an imported snapshot is a local copy. A read-only viewer mode is a documented follow-up.
- No holiday calendar; the working-day count excludes Sundays only, matching the app's 26-day cycle.
- No employee self-service.

## 4. Decisions

| # | Decision |
|---|---|
| D1 | IndexedDB is primary; theme and session stay in localStorage (pre-paint theme script must be synchronous; session is tiny). |
| D2 | If IndexedDB is unavailable, fall back to the existing localStorage store and show a visible warning. The app never white-screens because of storage. |
| D3 | Migration copies the legacy localStorage envelopes into IndexedDB, verifies the write, then leaves the legacy keys in place as a read-only backup. The app ignores them afterwards. Admin can clear them later. |
| D4 | The snapshot is versioned JSON containing employees, policies, leave plans and planner settings. Theme/session are excluded. Import replaces all business data after confirmation. |
| D5 | Leave types: CL, SL, EL, LOP, Maternity, Paternity, Comp Off, Other. Statuses: Planned, Approved, Cancelled. Half-day: AM/PM, single-day only. |
| D6 | Working days exclude Sundays. The planner shows every calendar day but duration counts working days. |
| D7 | Peak/coverage threshold is a configurable `maxConcurrentLeave` (default 3) in planner settings; days at or above it are highlighted and listed. |
| D8 | The Excel tab becomes Admin. The Excel Hub component is rendered inside Admin; the sidebar and header shortcuts point to Admin. |
| D9 | `App` accepts optional `initialData`/`dataStore` props. Production passes IndexedDB-backed values; tests and the legacy path keep the synchronous localStorage behaviour. This keeps existing tests meaningful without a wholesale test rewrite. |
| D10 | No new runtime dependency. `fake-indexeddb` is a dev dependency for store tests. |

## 5. Architecture

```
ThemeProvider
  DataGate                 // loads DataStore, boot screen, fallback warning
    AuthProvider
      RootView
        Landing / Login
        App(initialData, dataStore)
```

- `src/data/DataStore.ts` — interfaces and snapshot types.
- `src/data/IndexedDbStore.ts` — IndexedDB implementation, migration, seeding.
- `src/data/LocalStorageStore.ts` — fallback implementation over `utils/storage.ts`.
- `src/data/MemoryStore.ts` — in-memory implementation for tests and the test render helper.
- `src/data/createDataStore.ts` — picks IndexedDB or the fallback.
- `src/data/DataGate.tsx` — async load, context, boot/error UI.
- `src/data/snapshot.ts` — snapshot creation, validation, serialisation.
- `src/components/AdminSection.tsx` — snapshot export/import UI; Excel Hub is rendered below it by App.
- `src/components/LeavePlannerSection.tsx` + `LeavePlanModal.tsx` — planner UI.
- `src/utils/leavePlanner.ts` — pure date/grid/coverage logic.
- `src/data/initialLeavePlans.ts` — relative-date demo seed.

The existing `App` state shape stays: `employees`, `policies`, `leavePlans`, `plannerSettings`. Only the initial source and the save target change when `initialData`/`dataStore` are supplied.

## 6. Data model

```ts
export type LeaveType = 'CL' | 'SL' | 'EL' | 'LOP' | 'Maternity' | 'Paternity' | 'Comp Off' | 'Other'
export type LeaveStatus = 'Planned' | 'Approved' | 'Cancelled'
export type HalfDay = 'AM' | 'PM' | null

export interface LeavePlan {
  id: string
  employeeId: string
  startDate: string   // YYYY-MM-DD, local calendar date
  endDate: string     // YYYY-MM-DD, inclusive
  type: LeaveType
  status: LeaveStatus
  halfDay: HalfDay
  note?: string
  createdAt: string   // ISO
  updatedAt: string   // ISO
}

export interface PlannerSettings {
  maxConcurrentLeave: number // default 3
}

export interface DataSnapshot {
  v: 1
  dataVersion: number // DATA_SCHEMA_VERSION
  exportedAt: string
  employees: Employee[]
  policies: HRPolicy[]
  leavePlans: LeavePlan[]
  settings: PlannerSettings
}
```

## 7. Storage and migration

- DB `omnihr`, version 1. Stores: `employees` (keyPath `id`), `policies` (`id`), `leavePlans` (`id`), `meta` (`key`).
- First load: if meta `initialized` is absent, read the legacy localStorage keys through `loadPersisted` (employees, policies, leave plans, settings). Use the app seed (`INITIAL_EMPLOYEES`, `INITIAL_POLICIES`, `INITIAL_LEAVE_PLANS`, default settings) where a dataset is absent. Write everything in one transaction; set `initialized`, `migratedAt`, `legacyBackup`.
- Do not delete the legacy keys. `legacyBackup` tells Admin they exist.
- `load()` returns `{ snapshot, legacyBackup }`.
- Saves replace a store's contents in a readwrite transaction and return `{ ok }` or `{ ok: false, reason: 'quota' | 'unavailable' }`.
- `importSnapshot(snapshot)` writes an already-validated snapshot to all stores atomically. The Admin page parses/validates the raw file with `parseSnapshot` first, so the store never half-writes.
- The localStorage fallback implements the same interface over the existing envelopes, so the app behaves identically if IndexedDB is blocked.

## 8. Leave planner UX

- New sidebar tab **Leave Planner** (calendar icon) between Attendance and Payroll.
- Header title: "Leave Planner & Coverage Calendar".
- Top row: month navigation (prev/today/next), department/location filters, employee search, leave-type/status filters, **Add leave**.
- Summary tiles: people on leave today, peak day this month, upcoming leave in the next 30 days, working days booked this month.
- Calendar: Monday-first month grid. Each day shows the date, a count badge, up to three employee initials/dots and `+N`. Days at/above the coverage threshold get a warning tone. Sundays are muted. Clicking a day opens its entries.
- Side panel: selected day's entries (edit/delete), peak days list, planner setting for `maxConcurrentLeave`.
- Add/Edit modal: employee, start date, end date, type, status, half-day (single-day only), note. Validation: employee required, valid date keys, start <= end, half-day only on a single day, no duplicate identical entry. Overlaps are allowed but flagged in the modal.
- Data joins by `employeeId`; a missing employee renders "Unknown employee" rather than crashing.
- The planner is editable by HR; leadership views the same page. Read-only enforcement is a follow-up.

## 9. Admin / snapshot UX

- Sidebar **Admin** replaces **Excel Data Hub**. Header **Admin** replaces the Excel Hub shortcut.
- Admin page:
  1. **Data snapshot** card: record counts, storage backend (IndexedDB/localStorage), legacy backup indicator, Export snapshot, Import snapshot, last exported/imported timestamp.
  2. **Excel Data Hub** section (the existing component).
  3. **Data health** note: "Snapshots are the backup. Save them to Google Drive, OneDrive or any shared drive."
- Export downloads `omnihr-snapshot-YYYY-MM-DD.json`.
- Import reads a JSON file, validates, shows a confirmation with counts, replaces the store and reloads the app. A failed validation shows a Callout; the existing data is untouched.
- Imported copies are local; changes do not propagate back to HR. This is stated in the UI.

## 10. Testing

- Pure: leave date math, month grid, working-day count, filtering, peak days, validators, snapshot round-trip.
- Store: IndexedDB seed, migration from legacy localStorage, save/load, import/export, fallback, unavailable/quota.
- DOM: planner calendar, add/edit/delete, filters, peak-day highlight; Admin export/import/confirmation; DataGate loading/fallback.
- Integration: Root loads the DataGate and renders the console; existing App tests keep the localStorage path.
- Every task ends green on `npm run test`, `npm run lint`, `npm run build`.

## 11. Deferred / follow-ups

- Read-only viewer mode and role enforcement for executives.
- Direct Google Drive/OneDrive integration.
- Cloud `DataStore` implementation and server auth.
- Holiday calendar and multi-day half-day rules.
- Employee self-service leave requests.
- Removing the legacy localStorage backup from Admin.
