# IndexedDB, Leave Planner & Admin Data Exchange — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move business data to IndexedDB with a safe localStorage migration, add a leave planner calendar for HR and leadership, and turn the Excel Hub into an Admin/Data Exchange page with full snapshot export/import.

**Architecture:** A `DataStore` interface with IndexedDB and localStorage implementations is loaded once by a `DataGate` before the console renders. `App` accepts optional `initialData`/`dataStore` props so production uses IndexedDB while existing tests keep the synchronous localStorage path. The leave planner is a pure date/grid/coverage layer plus a presentational section; the Admin page composes the snapshot card and the existing Excel Hub.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library, jsdom, `fake-indexeddb` (dev only), IndexedDB, existing CSS tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-indexeddb-leave-admin-design.md`

## Global Constraints

- **No new runtime dependency.** `fake-indexeddb` is a dev dependency only.
- **Business data goes through `DataStore`**: employees, policies, leave plans, planner settings. Theme and session stay in localStorage.
- **Keep the 612-test suite green.** Existing `App` tests must keep the localStorage path; new tests cover the IndexedDB path.
- **No push.** All commits are local; the user will say when to push. Keep the local tag `pre-indexeddb-refactor` untouched.
- **Tokens only.** New CSS lives in `src/index.css`; no raw hex/px/rem in components.
- **Test conventions:** explicit imports from `vitest`; `.test.ts` runs in Node, `.test.tsx` in jsdom; never write the literal `@vitest-environment` string.
- **One commit per task** with `git -c user.name="opencode" -c user.email="opencode@local" commit`.
- Every task ends green on `npm run test`, `npm run lint`, `npm run build`.

## Review Focus

1. **Existing localStorage data survives the migration** — employees, policies, empty datasets and corrupt payloads must not be lost or duplicated.
2. **IndexedDB unavailable/blocked** — the app falls back to localStorage with a visible warning and never white-screens.
3. **Snapshot import is atomic and validated** — a malformed, wrong-version or partially invalid file leaves the current data untouched.
4. **Leave date math** — month boundaries, leap years, Sundays, single-day half-days and local-date keys must not shift by a day or miscount.
5. **Existing behaviour** — theme pre-paint, auth session, Excel import/export and the 612 existing tests remain intact.

---

## File Structure

**Created**
- `src/data/DataStore.ts` — interfaces, `DataSnapshot`, `PlannerSettings`, result types.
- `src/data/IndexedDbStore.ts` — IndexedDB implementation, seed, migration.
- `src/data/LocalStorageStore.ts` — fallback over `utils/storage.ts`.
- `src/data/createDataStore.ts` — backend selection.
- `src/data/DataGate.tsx` — async load, context, boot/fallback UI.
- `src/data/snapshot.ts` — snapshot create/validate/serialise.
- `src/data/initialLeavePlans.ts` — relative-date demo seed.
- `src/utils/leavePlanner.ts` — pure date/grid/coverage helpers.
- `src/components/LeavePlannerSection.tsx` — calendar + filters + summary.
- `src/components/LeavePlanModal.tsx` — add/edit form.
- `src/components/AdminSection.tsx` — snapshot card + storage info.
- Tests alongside each module.

**Modified**
- `src/types.ts` — leave types, `LeavePlan`, `PlannerSettings`, `ActiveTab` `'leave'`/`'admin'`.
- `src/utils/rowValidators.ts` — `isLeavePlanRow`, `isPlannerSettingsRow`.
- `src/App.tsx` — optional `initialData`/`dataStore`, leave state, Admin/leave tabs.
- `src/Root.tsx` — `DataGate` composition and data props.
- `src/components/Sidebar.tsx` — Leave Planner + Admin items.
- `src/components/Header.tsx` — titles, Admin shortcut.
- `src/index.css` — planner/admin classes.
- `README.md` / docs — feature and snapshot instructions.

---

### Task 1: Types, validators and pure leave utilities

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/rowValidators.ts`
- Create: `src/utils/leavePlanner.ts`
- Create: `src/data/initialLeavePlans.ts`
- Test: `src/utils/__tests__/leavePlanner.test.ts`
- Test: `src/utils/__tests__/rowValidators.test.ts` (extend)
- Test: `src/data/__tests__/initialLeavePlans.test.ts`

**Interfaces:**
```ts
export type LeaveType = 'CL' | 'SL' | 'EL' | 'LOP' | 'Maternity' | 'Paternity' | 'Comp Off' | 'Other'
export type LeaveStatus = 'Planned' | 'Approved' | 'Cancelled'
export type HalfDay = 'AM' | 'PM' | null
export interface LeavePlan { id: string; employeeId: string; startDate: string; endDate: string; type: LeaveType; status: LeaveStatus; halfDay: HalfDay; note?: string; createdAt: string; updatedAt: string }
export interface PlannerSettings { maxConcurrentLeave: number }

export function toDateKey(date: Date): string
export function parseDateKey(key: string): Date
export function isValidDateKey(value: unknown): value is string
export function eachDateKey(start: string, end: string): string[]
export function countWorkingDays(start: string, end: string): number
export function monthGrid(year: number, monthIndex: number): { dateKey: string; inMonth: boolean }[]
export function plansOnDate(plans: LeavePlan[], dateKey: string, statuses?: LeaveStatus[]): LeavePlan[]
export function dailyLeaveCounts(plans: LeavePlan[], start: string, end: string, statuses?: LeaveStatus[]): Map<string, number>
export function peakDays(counts: Map<string, number>, threshold: number): { dateKey: string; count: number }[]
export function filterLeavePlans(plans: LeavePlan[], employees: Employee[], filters: { department?: string; location?: string; search?: string; type?: LeaveType | 'ALL'; status?: LeaveStatus | 'ALL' }): LeavePlan[]
export function createInitialLeavePlans(now?: Date): LeavePlan[]
```

- `toDateKey` uses local year/month/day (never `toISOString().slice(0,10)`).
- `countWorkingDays` counts inclusive days excluding Sunday; a single Sunday returns 0; a Sunday-only range is 0.
- `monthGrid` returns 42 cells, Monday-first, including leading/trailing days from adjacent months with `inMonth: false`.
- `peakDays` returns days with `count >= threshold`, sorted by date.
- `createInitialLeavePlans` returns 10 deterministic demo plans over the next 45 days using `INITIAL_EMPLOYEES`; IDs `leave-seed-1..10`; no Sundays; dates relative to `now` (default `new Date()`).

**Steps:**
- [ ] Write the failing tests above with the exact cases (local date key across DST/month boundary; 2024-02 leap; Sunday exclusion; 42-cell grid; peak threshold; filters; validators reject bad dates/half-day multi-day).
- [ ] Run `npx vitest run src/utils/__tests__/leavePlanner.test.ts src/utils/__tests__/rowValidators.test.ts src/data/__tests__/initialLeavePlans.test.ts` and confirm failure.
- [ ] Implement the types, validators and pure utilities.
- [ ] Run the tests and the full gate (`npm run test`, `npm run lint`, `npm run build`).
- [ ] Commit: `feat(leave): add leave types, validators and calendar utilities`

---

### Task 2: DataStore, IndexedDB, fallback and migration

**Files:**
- Create: `src/data/DataStore.ts`
- Create: `src/data/IndexedDbStore.ts`
- Create: `src/data/LocalStorageStore.ts`
- Create: `src/data/MemoryStore.ts`
- Create: `src/data/createDataStore.ts`
- Test: `src/data/__tests__/indexedDbStore.test.ts`
- Test: `src/data/__tests__/localStorageStore.test.ts`
- Test: `src/data/__tests__/migration.test.ts`
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
```ts
export type StoreBackend = 'indexeddb' | 'localstorage' | 'memory'
export type StoreFailure = 'quota' | 'unavailable' | 'invalid' | 'version'
export type StoreResult = { ok: true } | { ok: false; reason: StoreFailure }
export interface LoadedData { snapshot: DataSnapshot; legacyBackup: boolean }

export interface DataStore {
  readonly backend: StoreBackend
  load(): Promise<LoadedData>
  saveEmployees(rows: Employee[]): Promise<StoreResult>
  savePolicies(rows: HRPolicy[]): Promise<StoreResult>
  saveLeavePlans(rows: LeavePlan[]): Promise<StoreResult>
  saveSettings(settings: PlannerSettings): Promise<StoreResult>
  exportSnapshot(): Promise<DataSnapshot>
  importSnapshot(snapshot: DataSnapshot): Promise<StoreResult>
  clearBusinessData(): Promise<StoreResult>
}

export class IndexedDbStore implements DataStore { constructor(options?: { dbName?: string; now?: () => Date }) }
export class LocalStorageStore implements DataStore { constructor(reason?: 'unavailable') }
export class MemoryStore implements DataStore { constructor(initial?: Partial<DataSnapshot>) }
export function createDataStore(): DataStore
```

- IndexedDB DB `omnihr` version 1; stores `employees`, `policies`, `leavePlans` keyed by `id`, `meta` keyed by `key`.
- First load migrates legacy `omnihr_employees`/`omnihr_policies` (and any `omnihr_leave_plans`/`omnihr_planner_settings`) through `loadPersisted`, seeds absent datasets from `INITIAL_EMPLOYEES`/`INITIAL_POLICIES`/`createInitialLeavePlans()`/`{ maxConcurrentLeave: 3 }`, writes all in one transaction, sets meta `initialized`/`migratedAt`/`legacyBackup`, and leaves the legacy keys untouched.
- `saveX` clears and repopulates its store in one readwrite transaction; map `QuotaExceededError` to `quota`, everything else to `unavailable`.
- `importSnapshot(snapshot: DataSnapshot)` writes an already-validated snapshot to all stores atomically and never partially writes. The Admin page parses/validates the raw file with `parseSnapshot` first (Task 5/7).
- `LocalStorageStore` uses the existing envelopes with keys `omnihr_employees`, `omnihr_policies`, `omnihr_leave_plans`, `omnihr_planner_settings`; it never throws.
- `createDataStore()` returns `IndexedDbStore` when `indexedDB` exists, otherwise `LocalStorageStore`.

**Tests:**
- Empty DB seeds employees/policies/leave plans/settings.
- Legacy v2 localStorage migrates exactly; legacy keys remain; `legacyBackup` is true.
- Corrupt/empty legacy payloads fall back to seed without throwing.
- Save then load round-trips all four datasets.
- `importSnapshot` replaces all datasets atomically; an invalid snapshot leaves previous data unchanged.
- `fake-indexeddb` setup per test file; no global test-setup change.
- Fallback store loads/saves via localStorage.

**Steps:**
- [ ] `npm install -D fake-indexeddb`.
- [ ] Write the failing tests.
- [ ] Implement the store classes and factory.
- [ ] Run the targeted tests and full gate.
- [ ] Commit: `feat(data): add IndexedDB store with localStorage migration and fallback`

---

### Task 3: Leave planner UI and modal (parallel with Task 2)

**Files:**
- Create: `src/components/LeavePlannerSection.tsx`
- Create: `src/components/LeavePlanModal.tsx`
- Test: `src/components/__tests__/LeavePlannerSection.test.tsx`
- Modify: `src/index.css` (append planner classes)

**Interfaces:**
```ts
interface LeavePlannerSectionProps {
  employees: Employee[]
  leavePlans: LeavePlan[]
  settings: PlannerSettings
  onSave: (plan: LeavePlan) => void
  onDelete: (id: string) => void
  onSettingsChange: (settings: PlannerSettings) => void
}
```
- Uses Task 1's pure helpers and types. No store or App dependency.
- Month view default; Monday-first; prev/today/next; department/location/employee/type/status filters; Add leave; summary tiles; calendar cells with count + up to 3 initials + `+N`; peak-day warning; selected-day side panel with edit/delete; settings input for `maxConcurrentLeave`.
- Modal fields and validation as in the design; half-day only when start === end; overlaps flagged but allowed.
- All new CSS uses tokens; responsive at 390/1024/1440.

**Tests:**
- Renders the current month and weekday header.
- Opens the modal from Add leave and saves a valid plan.
- Rejects an end date before the start and a half-day on a multi-day range.
- Filters by department and type.
- Highlights a day at/above the threshold and lists it under peak days.
- Month navigation changes the visible month; Today returns.
- Selecting a day shows its entries; delete calls `onDelete`.

**Steps:**
- [ ] Write the failing DOM tests with fixed `now` data.
- [ ] Implement the section and modal; add CSS.
- [ ] Run targeted tests and full gate.
- [ ] Commit: `feat(leave): add leave planner calendar and entry modal`

---

### Task 4: DataGate, App/Root integration and test helper (parallel with Task 5)

**Files:**
- Create: `src/data/DataGate.tsx`
- Test: `src/data/__tests__/DataGate.test.tsx`
- Modify: `src/Root.tsx`
- Modify: `src/App.tsx`
- Create: `src/test/renderApp.tsx` (test helper)

**Interfaces:**
- `DataGate` context: `{ store: DataStore; snapshot: DataSnapshot; legacyBackup: boolean }`; optional `store` prop for tests, otherwise `createDataStore()`.
- `App` props: `{ onSignOut?: () => void; initialData?: DataSnapshot; dataStore?: DataStore }`.
- `Root` wraps `AuthProvider`/`RootView` in `DataGate`; `RootView` passes `initialData`/`dataStore` to `App`.
- `App` initializes employees/policies from `initialData` when supplied; otherwise keeps the existing `loadPersisted` path. Save effects use `dataStore.saveEmployees`/`savePolicies` when supplied, otherwise `savePersisted`.
- Boot screen: token-styled, `role="status"`, "Loading OmniHR…"; fallback warning banner when `store.backend === 'localstorage'`.
- `renderApp` helper renders `ThemeProvider` + `App` with `initialData`/`dataStore` from a `MemoryStore`; existing tests that render `<App />` directly remain unchanged.

**Tests:**
- DataGate shows the boot screen, then children after load.
- DataGate falls back and shows the warning when `createDataStore`/load rejects.
- App with `initialData` renders the seeded console without touching localStorage data.
- App with `dataStore` calls `saveEmployees`/`savePolicies` on change (use a mock store).
- Existing Root tests still pass (the fallback localStorage path is used in jsdom without fake-indexeddb).

**Steps:**
- [ ] Write the failing DataGate/App tests.
- [ ] Implement DataGate and the App/Root wiring.
- [ ] Run targeted tests and full gate.
- [ ] Commit: `feat(data): load business data through a DataGate before the console`

---

### Task 5: Snapshot utilities and validation (parallel with Task 4)

**Files:**
- Create: `src/data/snapshot.ts`
- Test: `src/data/__tests__/snapshot.test.ts`

**Interfaces:**
```ts
export const SNAPSHOT_VERSION = 1
export function createSnapshot(input: { employees: Employee[]; policies: HRPolicy[]; leavePlans: LeavePlan[]; settings: PlannerSettings; exportedAt?: string }): DataSnapshot
export function parseSnapshot(raw: unknown): { ok: true; snapshot: DataSnapshot } | { ok: false; reason: 'invalid' | 'version' }
export function snapshotToJson(snapshot: DataSnapshot): string
export function snapshotFileName(date?: Date): string // omnihr-snapshot-YYYY-MM-DD.json
```
- Validates every row with `isEmployeeRow`, `isPolicyRow`, `isLeavePlanRow`, `isPlannerSettingsRow`; requires `v === SNAPSHOT_VERSION`, `dataVersion === DATA_SCHEMA_VERSION`, `exportedAt` parseable, all arrays present.
- Round-trip is lossless.

**Tests:**
- Round-trip preserves all datasets and settings.
- Rejects missing arrays, wrong `v`, wrong `dataVersion`, invalid employee/policy/leave/settings rows, unparseable `exportedAt`.
- Filename uses the local date.

**Steps:**
- [ ] Write the failing tests.
- [ ] Implement the utilities.
- [ ] Run targeted tests and full gate.
- [ ] Commit: `feat(data): add versioned snapshot export/import utilities`

---

### Task 6: Leave planner integration, seed and persistence

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/types.ts` (ActiveTab `'leave'`)
- Test: `src/__tests__/leavePlannerIntegration.test.tsx`
- Test: `src/App.test.tsx` (extend only if needed)

**Interfaces:**
- App state: `leavePlans` initialized from `initialData?.leavePlans` or `loadPersisted('omnihr_leave_plans', isLeavePlanRow, [])`; `plannerSettings` similarly with default `{ maxConcurrentLeave: 3 }`.
- Save effect uses `dataStore.saveLeavePlans`/`saveSettings` when supplied, otherwise `savePersisted`.
- Sidebar item `{ id: 'leave', label: 'Leave Planner', icon: CalendarDays }` between Attendance and Payroll.
- Header title/subtitle for `'leave'`.
- Render `<LeavePlannerSection ... />` for `activeTab === 'leave'`.
- `handleNavigateToGuides`/Excel links unchanged.

**Tests:**
- Clicking Leave Planner renders the calendar and summary.
- Add leave through the modal updates the calendar and calls the data store save.
- Existing tabs and Excel import/export tests still pass.

**Steps:**
- [ ] Write the failing integration test.
- [ ] Wire the state, save effects, sidebar, header and section.
- [ ] Run targeted tests and full gate.
- [ ] Commit: `feat(leave): add the leave planner tab and persistence`

---

### Task 7: Admin page, Excel Hub move and snapshot UI

**Files:**
- Create: `src/components/AdminSection.tsx`
- Test: `src/components/__tests__/AdminSection.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/types.ts` (ActiveTab `'admin'`, remove `'excel'`)
- Test: `src/components/__tests__/shell.test.tsx` / `themeIntegration.test.tsx` (update labels)

**Interfaces:**
```ts
interface AdminSectionProps {
  employees: Employee[]
  policies: HRPolicy[]
  leavePlans: LeavePlan[]
  settings: PlannerSettings
  store?: DataStore
  backend: StoreBackend
  legacyBackup: boolean
  onImported: () => void
}
```
- Snapshot card: counts, backend, legacy backup, Export snapshot, Import snapshot, last exported/imported (localStorage key `omnihr_snapshot_meta`), explanatory copy about Google Drive/OneDrive.
- Export: `store.exportSnapshot()` or `createSnapshot` fallback; download via Blob/anchor.
- Import: file input, `JSON.parse`, `parseSnapshot(raw)`, confirmation with counts before replace, then `store.importSnapshot(snapshot)`; on success `onImported()` (App reloads); on failure a `Callout tone="danger"` and no change.
- App `activeTab === 'admin'` renders `AdminSection` and the existing `ExcelHubSection` in the same page.
- Sidebar **Admin** replaces **Excel Data Hub**; Header **Admin** replaces the Excel Hub shortcut. The Excel guide link still works.

**Tests:**
- Admin tab shows the snapshot card and the Excel Hub.
- Export calls the store and triggers a download (mock `URL.createObjectURL`/anchor click).
- Import of a valid snapshot asks for confirmation, calls `importSnapshot`, then `onImported`.
- Import of invalid JSON/wrong version shows an error and does not call `importSnapshot`.
- Existing Excel Hub tests and navigation tests pass with the new label.

**Steps:**
- [ ] Write the failing tests.
- [ ] Implement AdminSection and the navigation move.
- [ ] Run targeted tests and full gate.
- [ ] Commit: `feat(admin): add snapshot exchange and move Excel Hub into Admin`

---

### Task 8: Docs, README and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/GENERAL_APP_GUIDE.md` (brief)
- Modify: `docs/EXCEL_SHEET_HANDLING_GUIDE.md` (only if the Admin label changes a path)

- [ ] Document IndexedDB persistence, the localStorage migration, the Leave Planner, Admin snapshots and the Google Drive/OneDrive handoff.
- [ ] Update the feature list and the demo access note.
- [ ] Run `npm run test`, `npm run lint`, `npm run build`.
- [ ] Run a visual pass at 1440/1024/390 in dark and light: planner calendar, add modal, Admin snapshot card, Excel Hub inside Admin.
- [ ] Commit: `docs: document IndexedDB, leave planner and admin snapshots`

---

## Execution Order and Parallelism

1. Task 1 alone (types/utilities/seed).
2. **Task 2 + Task 3 in parallel** (store vs planner UI; disjoint files).
3. **Task 4 + Task 5 in parallel** (DataGate/App vs snapshot utilities; disjoint files).
4. Task 6 alone (leave integration).
5. Task 7 alone (Admin integration).
6. Task 8 + final whole-branch review.

Each task is committed in its own worktree; the controller cherry-picks into `main`, runs the full gate, and records the commit. No task is pushed.
