# OmniHR — Daily Attendance, Monthly Matrix & Holiday Calendar

**Status:** Approved for implementation (2026-11-14)
**Builds on:** IndexedDB business-data store, Leave Planner, Admin snapshot exchange.

## 1. Intent

Move attendance from a single monthly `presentDays` number to a **daily record per employee**, with a monthly Excel matrix that HR can fill and upload, a holiday calendar, and a monthly rollup that feeds the attendance register and the current-month payroll/overview figures.

## 2. Goals

- Store daily attendance in IndexedDB: one record per employee/date.
- Generate a monthly matrix template (one row per employee, one column per day) from the live roster, month and holidays.
- Import that matrix, preview additions/updates/replacements, and replace the month's records atomically.
- Maintain an annual holiday calendar (company-wide) and use it in the matrix, working-day counts and rollups.
- Provide a daily/monthly attendance UI: matrix, day editing, summary cards, holiday management.
- Derive the monthly attendance register and current-month `presentDays`/`lopDays` from daily records; fall back to the legacy employee fields when a month has no daily records.
- Include attendance and holidays in the full snapshot (v2), with v1 snapshot compatibility.
- Keep all existing 848 tests green; add tests for every new behaviour.

## 3. Non-goals

- No biometric/device integration.
- No hour-level overtime, shift scheduling or geo-fencing.
- No automatic deduction from CL/SL/EL balances in this phase. The rollup shows leave days by type; balances remain a separate ledger.
- No multi-location holiday calendars; holidays are company-wide.
- No employee self-service.
- No read-only role enforcement.

## 4. Decisions

| # | Decision |
|---|---|
| D1 | A daily record is keyed by employee + date; one record per employee/date. |
| D2 | Sundays and holidays are **derived** from the calendar/holiday list, not stored as per-employee records. The matrix displays `WO`/`H`; the importer ignores those cells. |
| D3 | Status codes: `P` Present, `A` Absent, `W` WFH, `HD` Half-day, `CL`/`SL`/`EL`/`LOP`/`ML`/`PL`/`CO`/`O` Leave with the corresponding type. `H` and `WO` are derived. Blank = unmarked. |
| D4 | The monthly matrix is the primary Excel format: one row per employee, day columns 1..31, month in `B2`, legend sheet. It can be uploaded monthly or after corrections. |
| D5 | Import **replaces the whole month's attendance records** after a preview and confirmation. It does not touch other months. The template includes the full roster, so this is predictable. |
| D6 | The template pre-fills Sundays as `WO`, holidays as `H`, and approved leave plans as the matching leave code. Other working days default to `P` unless the “prefill present” option is off. |
| D7 | Monthly rollup: present = P + W + 0.5×HD; leave days by type; LOP = A + LOP leave; working days exclude Sundays and holidays. Half-day with a leave type counts 0.5 leave and 0.5 present; half-day without one counts 0.5 present and 0.5 unmarked (no LOP). |
| D8 | Current-month payroll/overview use the daily rollup when an employee has any daily record in that month; otherwise they keep the legacy `presentDays`/`lopDays` values. |
| D9 | Holidays are company-wide `{ date, name }`; seed fixed national holidays for 2026 (New Year, Republic Day, Independence Day, Gandhi Jayanti, Christmas). HR can add/remove. |
| D10 | Snapshot v2 adds `attendance` and `holidays`; v1 snapshots import with empty arrays. IndexedDB schema version 2 adds the two stores. |
| D11 | Demo attendance is seeded for the current month only when the roster is exactly the demo roster; custom rosters start with an empty daily ledger. |

## 5. Data model

```ts
export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'WFH' | 'HalfDay'
export type AttendanceSource = 'manual' | 'excel' | 'leave' | 'seed'

export interface AttendanceRecord {
  id: string                 // `${employeeId}|${date}`
  employeeId: string
  date: string               // YYYY-MM-DD
  status: AttendanceStatus
  leaveType?: LeaveType      // required when status === 'Leave'
  halfDay?: 'AM' | 'PM' | null
  note?: string
  source: AttendanceSource
  updatedAt: string          // ISO
}

export interface Holiday {
  id: string                 // `holiday-${date}`
  date: string               // YYYY-MM-DD
  name: string
}
```

`DataSnapshot` v2 adds `attendance: AttendanceRecord[]` and `holidays: Holiday[]`. `SNAPSHOT_VERSION = 2`; `parseSnapshot` accepts v1 (empty arrays) and v2.

## 6. Monthly matrix template

Sheet `Attendance`:

- A1: `OmniHR Monthly Attendance`
- A2: `Month`, B2: `YYYY-MM`
- A3: `Generated`, B3: ISO timestamp
- Row 5 headers: `Employee ID`, `Employee Name`, `Department`, `1` … `31`
- Rows 6+: one per employee, in roster order.
- Cells: codes from D3; Sundays `WO`; holidays `H`; approved leave prefilled; working days `P` when prefill is on; blank otherwise.
- Sheet `Legend`: code → meaning.

The template is generated for the selected month from the full roster, the holiday list and approved leave plans. File name `omnihr-attendance-YYYY-MM.xlsx`.

## 7. Import

- Read the workbook, find the `Attendance` sheet, read `B2` as the month, find the header row containing `Employee ID` and day numbers.
- Match rows by employee ID; ignore name/department columns. Unknown IDs and invalid codes become preview issues.
- Ignore `H`/`WO` cells; they are derived.
- Preview: month, employees matched, records to create, existing records to replace, invalid cells, unknown employees, missing employees.
- Confirmation replaces all attendance records for that month; other months untouched.
- A successful import writes through `DataStore.saveAttendance` and updates App state. A failed write leaves the previous month untouched.

## 8. UI

New Attendance section:

- Month navigation (prev/today/next), department/location/search filters.
- Summary tiles: working days this month, present today, on leave today, absent today, WFH today, holidays this month, unmarked today.
- Monthly matrix: employees × days; `P/A/W/HD/CL/SL/EL/LOP/ML/PL/CO/O/H/WO` cells with tone colours; Sundays/holidays muted; approved leave plans shown as ghost cells when no record; click a cell to edit.
- Day panel: selected date, employee status editor (Present/Absent/WFH/Half-day/Leave + leave type/note), “Mark all present” for the day.
- Holiday card: list this month's holidays, add/edit/delete.
- Toolbar: Download template (with “prefill working days as Present” option), Import attendance.
- Responsive: matrix scrolls horizontally with sticky employee columns; day panel stacks at 390.

## 9. Rollup and payroll

`rollupMonth(attendance, employees, holidays, year, month)` returns per employee:
`presentDays`, `leaveDays`, `leaveByType`, `absentDays`, `wfhDays`, `holidayDays`, `weeklyOffDays`, `workingDays`, `lopDays`, `unmarkedDays`, `hasRecords`.

- `presentDays = P + W + 0.5*HD` (half-day with leaveType: 0.5 present + 0.5 leave; without: 0.5 present + 0.5 unmarked).
- `lopDays = A + LOP leave`.
- `workingDays = days in month - Sundays - holidays`.
- `attendancePct = presentDays / workingDays * 100` (0 when workingDays is 0).
- App derives `payrollEmployees` for the current month: if a record exists for the employee, replace `presentDays`/`lopDays` with the rollup; otherwise keep the employee values.
- `OverviewSection` and `PayrollSection` receive `payrollEmployees`; the Attendance section uses its selected month's rollup.
- Leave balances are not changed.

## 10. Holiday calendar

- `Holiday { id, date, name }`; unique date.
- Seed 2026 fixed national holidays: Jan 1, Jan 26, Aug 15, Oct 2, Dec 25.
- Add/edit/delete in the Attendance holiday card.
- The template and matrix mark holidays; the rollup excludes them from working days.

## 11. Seed

- Holidays: the fixed 2026 list.
- Demo attendance: only when the roster is exactly the demo set and no attendance key exists. For each employee, mark the current month's working days: `presentDays` as `P`, then `lopDays` as `A`, capped at the month's working days; the remainder is blank. Source `seed`.
- No demo attendance for custom rosters.

## 12. Testing

- Pure: status mapping, date/month helpers, matrix template generation, parser round-trip, rollup (Sundays, holidays, half-days, leave types, LOP), holiday uniqueness, validators.
- Store: IndexedDB v2 stores, save/load/import, snapshot v1→v2 compatibility, localStorage fallback, demo seeding/custom roster.
- DOM: matrix rendering, cell editing, day panel, holiday add/delete, import preview/confirmation, template download.
- Integration: App state/save, payroll/overview derived values, fallback when no records, snapshot counts.
- Every task ends green on `npm run test`, `npm run lint`, `npm run build`.

## 13. Deferred

- Automatic leave-balance deduction and leave ledger.
- Hour-level overtime, shifts, biometric integration.
- Multi-location holiday calendars.
- Read-only executive mode.
- Direct Google Drive/OneDrive integration and cloud backend.
