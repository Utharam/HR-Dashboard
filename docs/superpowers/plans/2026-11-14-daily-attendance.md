# Daily Attendance, Monthly Matrix & Holiday Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single monthly attendance number with daily attendance records, a generated monthly matrix template that HR can fill and upload, a company holiday calendar, and a monthly rollup that feeds attendance and current-month payroll/overview.

**Architecture:** Add `AttendanceRecord` and `Holiday` datasets to the existing `DataStore`/IndexedDB seam and snapshot v2. Pure `utils/attendance.ts` owns status mapping, working-day/holiday math and the monthly rollup. `utils/attendanceExcel.ts` builds/parses the monthly matrix. A rewritten `AttendanceSection` renders the matrix, day editor, holiday card and import preview; `App` owns the state and derives `payrollEmployees` for the current month.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library, jsdom, existing `xlsx`, IndexedDB, existing tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-daily-attendance-design.md`

## Global Constraints

- **No new runtime dependency.** `xlsx` is already installed.
- Business data goes through `DataStore`; theme/session stay in localStorage.
- Sundays and holidays are derived, not stored as per-employee records.
- Import replaces the whole selected month after a preview and confirmation; other months untouched.
- Keep all existing tests green; every task ends on `npm run test`, `npm run lint`, `npm run build`.
- No push. Local commits only; keep the `pre-daily-attendance` tag.
- Tokens only in components; new CSS in `src/index.css`.
- Test conventions: explicit vitest imports, `.test.ts` node / `.test.tsx` jsdom, never the literal `@vitest-environment` string.
- One commit per task with `git -c user.name="opencode" -c user.email="opencode@local"`.

## Review Focus

1. **Month math** — leap years, month lengths, Sundays, holidays and local-date keys must not shift or miscount.
2. **Matrix round-trip** — a generated template parsed back must produce exactly the intended records; H/WO cells must not become records.
3. **Replace-month atomicity** — a failed import must leave the previous month untouched; a successful import must not touch other months.
4. **Rollup/payroll fallback** — current-month payroll uses daily records only where they exist; legacy monthly values remain for months/employees without records.
5. **Existing behaviour** — the 848-test suite, theme, auth, leave planner, snapshots and Excel Hub remain intact.

---

## File Structure

**Created**
- `src/utils/attendance.ts` — status mapping, month/working-day helpers, rollup.
- `src/utils/attendanceExcel.ts` — matrix template builder/parser.
- `src/data/initialHolidays.ts` — fixed 2026 holiday seed.
- `src/data/initialAttendance.ts` — demo current-month attendance seed.
- `src/components/AttendanceCellModal.tsx` — edit one employee/day.
- `src/components/HolidayModal.tsx` — add/edit a holiday.
- Tests alongside each module.

**Modified**
- `src/types.ts` — attendance/holiday types.
- `src/utils/rowValidators.ts` — attendance/holiday guards.
- `src/data/DataStore.ts`, `IndexedDbStore.ts`, `LocalStorageStore.ts`, `MemoryStore.ts`, `DataGate.tsx`, `snapshot.ts` — attendance/holidays + snapshot v2.
- `src/components/AttendanceSection.tsx` — matrix/day panel/holiday/import UI.
- `src/components/AdminSection.tsx` — snapshot counts.
- `src/App.tsx` — state, save effects, current-month rollup/payrollEmployees.
- `src/index.css` — attendance classes.
- README/docs.

---

### Task 1: Types, validators, attendance math, Excel matrix and seeds

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/rowValidators.ts`
- Create: `src/utils/attendance.ts`
- Create: `src/utils/attendanceExcel.ts`
- Create: `src/data/initialHolidays.ts`
- Create: `src/data/initialAttendance.ts`
- Tests: `src/utils/__tests__/attendance.test.ts`, `src/utils/__tests__/attendanceExcel.test.ts`, `src/utils/__tests__/rowValidators.test.ts` (extend), `src/data/__tests__/initialHolidays.test.ts`, `src/data/__tests__/initialAttendance.test.ts`

**Interfaces:**
```ts
export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'WFH' | 'HalfDay'
export type AttendanceSource = 'manual' | 'excel' | 'leave' | 'seed'
export interface AttendanceRecord { id: string; employeeId: string; date: string; status: AttendanceStatus; leaveType?: LeaveType; halfDay?: 'AM' | 'PM' | null; note?: string; source: AttendanceSource; updatedAt: string }
export interface Holiday { id: string; date: string; name: string }

export interface AttendanceRollup {
  employeeId: string; presentDays: number; leaveDays: number;
  leaveByType: Partial<Record<LeaveType, number>>; absentDays: number;
  wfhDays: number; holidayDays: number; weeklyOffDays: number;
  workingDays: number; lopDays: number; unmarkedDays: number; hasRecords: boolean;
}

export const ATTENDANCE_CODES: Record<string, { status: AttendanceStatus; leaveType?: LeaveType } | 'H' | 'WO' | 'blank'>
export function monthKey(year: number, monthIndex: number): string
export function parseMonthKey(key: string): { year: number; monthIndex: number } | null
export function daysInMonth(year: number, monthIndex: number): number
export function monthDateKeys(year: number, monthIndex: number): string[]
export function isSunday(dateKey: string): boolean
export function holidayDateSet(holidays: Holiday[]): Set<string>
export function workingDateKeys(year: number, monthIndex: number, holidays: Holiday[]): string[]
export function codeToRecord(code: string, employeeId: string, date: string, now?: Date): AttendanceRecord | null
export function recordToCode(record: AttendanceRecord): string
export function rollupMonth(attendance: AttendanceRecord[], employees: Employee[], holidays: Holiday[], year: number, monthIndex: number): Map<string, AttendanceRollup>

export function buildAttendanceWorkbook(input: { employees: Employee[]; holidays: Holiday[]; leavePlans: LeavePlan[]; year: number; monthIndex: number; prefillPresent: boolean }): XLSX.WorkBook
export function parseAttendanceWorkbook(data: ArrayBuffer, employees: Employee[]): { ok: true; monthKey: string; records: AttendanceRecord[]; issues: { row: number; employeeId?: string; date?: string; code?: string; message: string }[]; matchedEmployees: number; unknownEmployeeIds: string[] } | { ok: false; reason: 'not-a-workbook' | 'missing-month' | 'missing-header' | 'no-employees' }
export function attendanceTemplateFileName(year: number, monthIndex: number): string

export function createInitialHolidays(year?: number): Holiday[]
export function createInitialAttendance(employees: Employee[], holidays: Holiday[], now?: Date): AttendanceRecord[]
```

- Status mapping: `P` Present, `A` Absent, `W` WFH, `HD` HalfDay; `CL`/`SL`/`EL`/`LOP`/`ML`/`PL`/`CO`/`O` Leave with the mapped `LeaveType`; `H`/`WO`/blank return `null` from `codeToRecord`.
- `rollupMonth` includes every employee (zeros if no records). Present = P + W + 0.5×HD; half-day with a leaveType counts 0.5 present + 0.5 leave; without, 0.5 present + 0.5 unmarked. LOP = A + LOP leave. Working days exclude Sundays and holiday dates. `hasRecords` true if any record for the employee in the month.
- `buildAttendanceWorkbook`: sheet `Attendance` with `A1` title, `A2` `Month`, `B2` `YYYY-MM`, `A3` `Generated`, `B3` ISO; header row 5 `Employee ID`, `Employee Name`, `Department`, day numbers 1..N; one row per employee; Sundays `WO`, holidays `H`, approved leave codes prefilled, other working days `P` when `prefillPresent`, blank otherwise. Sheet `Legend` maps codes to meanings. Freeze panes/column widths are optional but keep it readable.
- `parseAttendanceWorkbook`: read `B2`, find the header row with `Employee ID` and day numbers, match employees by ID, ignore `H`/`WO`/blank, validate codes, return issues for unknown IDs/invalid codes/out-of-month columns. It must round-trip the generated workbook.
- `createInitialHolidays(2026)`: fixed Jan 1 New Year, Jan 26 Republic Day, Aug 15 Independence Day, Oct 2 Gandhi Jayanti, Dec 25 Christmas.
- `createInitialAttendance`: current month, demo roster only at the store boundary; mark working days `P` up to `presentDays`, then `A` up to `lopDays`, cap at working days; source `seed`; id `${employeeId}|${date}`.
- Validators: attendance id/employee/date/status/leaveType/halfDay/note/source/updatedAt; holiday id/date/name; holidays unique by date is a store/snapshot rule, not a row guard.

**Tests:**
- Month lengths (Feb 2024/2025), Sunday detection, working days with holidays, month key round-trip.
- Status mapping all codes; H/WO/blank -> null; recordToCode round-trip.
- Rollup: present/WFH/half-day with and without leave type, leave types, A/LOP, holidays/Sundays excluded, unmarked, hasRecords.
- Template round-trip: build for a month with holidays and approved leave; parse; records match; H/WO not stored; prefill present on/off.
- Parser issues: unknown employee, invalid code, missing month/header.
- Validators accept/reject.
- Seed holidays fixed; demo attendance respects present/lop caps and working days.

- [ ] Write failing tests; run them; implement; run full gate; commit `feat(attendance): add daily records, matrix Excel and holiday utilities`.

---

### Task 2: DataStore, IndexedDB v2, snapshot v2 and migration

**Files:**
- Modify: `src/data/DataStore.ts`, `IndexedDbStore.ts`, `LocalStorageStore.ts`, `MemoryStore.ts`, `DataGate.tsx`, `snapshot.ts`
- Tests: `src/data/__tests__/indexedDbStore.test.ts`, `localStorageStore.test.ts`, `memoryStore.test.ts`, `migration.test.ts`, `snapshot.test.ts`, `DataGate.test.tsx`

**Interfaces:**
- `DataSnapshot` v2 adds `attendance: AttendanceRecord[]` and `holidays: Holiday[]`; `SNAPSHOT_VERSION = 2`.
- `DataStore` adds `saveAttendance(rows: AttendanceRecord[]): Promise<StoreResult>` and `saveHolidays(rows: Holiday[]): Promise<StoreResult>`.
- `validateDataSnapshot` accepts v1 (empty arrays) and v2; validates attendance/holiday rows and unique holiday dates; rejects duplicate attendance ids and duplicate holiday dates.
- IndexedDB DB version 2, stores `attendance` keyPath `id` and `holidays` keyPath `id`; `onupgradeneeded` creates them when upgrading from v1. `load` reads both; `importSnapshot` writes both; `exportSnapshot` includes them; `clearBusinessData` clears them.
- Migration: seed `createInitialHolidays(2026)` when the holiday key is absent; seed `createInitialAttendance` only when the employee set is the demo set and the attendance key is absent. Preserve existing data on v1 DB upgrade.
- LocalStorageStore keys `omnihr_attendance` and `omnihr_holidays`; same seeding rules; snapshot v2.
- `parseSnapshot` accepts v1 and returns v2 with empty arrays; `createSnapshot` v2.
- `DataGate` snapshot includes the new datasets; no interface change beyond the snapshot.
- Tests: v1 snapshot import -> empty attendance/holidays; v2 round-trip; store save/load; v1 DB upgrade (fake-indexeddb open at version 1, then load at version 2); custom roster no attendance seed; holiday seed.

- [ ] Write failing tests; run; implement; full gate; commit `feat(attendance): add attendance and holiday stores with snapshot v2`.

---

### Task 3: Attendance UI — matrix, day editor, holiday card, import preview (parallel with Task 2)

**Files:**
- Rewrite: `src/components/AttendanceSection.tsx`
- Create: `src/components/AttendanceCellModal.tsx`, `src/components/HolidayModal.tsx`
- Test: `src/components/__tests__/AttendanceSection.test.tsx`, `AttendanceCellModal.test.tsx`, `HolidayModal.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
```ts
interface AttendanceSectionProps {
  employees: Employee[]
  attendance: AttendanceRecord[]
  holidays: Holiday[]
  leavePlans: LeavePlan[]
  onSaveRecord: (record: AttendanceRecord) => void
  onDeleteRecord: (id: string) => void
  onReplaceMonth: (monthKey: string, records: AttendanceRecord[]) => void
  onSaveHoliday: (holiday: Holiday) => void
  onDeleteHoliday: (id: string) => void
}
```
- Month navigation, filters, summary tiles, matrix (employees × days), day panel, holiday card, template download, import preview/confirmation.
- Matrix cells: status code/tone; Sundays `WO`, holidays `H`, approved leave ghost cells; click opens `AttendanceCellModal` (status, leave type, half-day, note, delete).
- Day panel: selected date, employee status list, “Mark all present”.
- Import: file input -> `parseAttendanceWorkbook`; preview counts/issues; confirmation replaces the month via `onReplaceMonth`; success/error Callouts.
- Template download uses `buildAttendanceWorkbook` + `xlsx.write` + Blob/anchor; prefill-present checkbox.
- Holiday card: month holidays, add/edit via `HolidayModal`, delete.
- Responsive matrix with sticky employee columns; stack day panel at 390.

**Tests:**
- Renders month, matrix, summary; filters.
- Clicking a cell opens the editor; save calls `onSaveRecord`; delete calls `onDeleteRecord`.
- Day panel marks all present; month nav.
- Holiday add/delete calls callbacks.
- Template download calls `buildAttendanceWorkbook`/creates a blob (mock URL).
- Import valid matrix previews counts, confirms, calls `onReplaceMonth`; invalid file shows error; no callback.
- Adjacent-month/holiday/Sunday cells render correctly; approved leave ghost cell.

- [ ] Write failing tests; run; implement; full gate; commit `feat(attendance): add monthly matrix, day editor and holiday UI`.

---

### Task 4: App integration, payroll/overview rollup and Admin snapshot counts

**Files:**
- Modify: `src/App.tsx`, `src/components/AdminSection.tsx`, `src/Root.tsx` (only if needed)
- Tests: `src/__tests__/attendanceIntegration.test.tsx`, `src/components/__tests__/AdminSection.test.tsx` (extend), existing App tests

**Interfaces:**
- App state `attendance: AttendanceRecord[]`, `holidays: Holiday[]` from `initialData` or localStorage keys `omnihr_attendance`/`omnihr_holidays` (empty fallback).
- Save effects through `dataStore.saveAttendance`/`saveHolidays` or `savePersisted`.
- Handlers: save/delete record, replace month (remove `date.startsWith(monthKey)` then add), save/delete holiday.
- Current-month rollup: `rollupMonth(attendance, employees, holidays, currentYear, currentMonth)`; `payrollEmployees` replaces `presentDays`/`lopDays` only when `hasRecords`.
- Pass `payrollEmployees` to `OverviewSection` and `PayrollSection`; pass full `employees`, attendance, holidays, leave plans and callbacks to `AttendanceSection`.
- `AdminSection` snapshot counts add Attendance and Holidays; props/types updated.
- The leave planner remains the source of approved leave; the matrix shows ghost cells.

**Tests:**
- Attendance tab renders with state; adding a record saves through the store; replacing a month removes only that month; holiday save/delete.
- Payroll/Overview use rollup present/LOP when records exist; fall back to employee values when none.
- Snapshot counts include attendance/holidays.
- Existing tests green.

- [ ] Write failing tests; run; implement; full gate; commit `feat(attendance): wire daily records into the console and payroll rollup`.

---

### Task 5: Docs, visual pass and final review

**Files:** README, `docs/GENERAL_APP_GUIDE.md`, `docs/EXCEL_SHEET_HANDLING_GUIDE.md`, plan/spec notes.

- [ ] Document the monthly matrix template, import/replace behavior, holiday calendar, rollup and payroll fallback.
- [ ] Visual pass at 1440/1024/390 light/dark: matrix, cell editor, day panel, holiday modal, import preview.
- [ ] Full gate and final whole-branch review; fix Critical/Important findings.
- [ ] Commit docs.

---

## Execution Order and Parallelism

1. Task 1 alone.
2. **Task 2 + Task 3 in parallel.**
3. Task 4.
4. Task 5 + final review.

Each task is committed in its own worktree; the controller cherry-picks into `main`, runs the full gate, and records the commit. Nothing is pushed.
