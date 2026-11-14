/**
 * Pure daily-attendance helpers: month/working-day math, the Excel code mapping and
 * the monthly rollup.
 *
 * Attendance dates are LOCAL calendar keys (`YYYY-MM-DD`), exactly like leave plans:
 * `toISOString().slice(0, 10)` reads UTC and would shift the key by a day for anyone
 * east of Greenwich. `utils/leavePlanner.ts` owns those key helpers, so this module
 * reuses them instead of re-deriving dates.
 *
 * Sundays and holidays are DERIVED, not stored per employee. The matrix shows `WO`/`H`
 * and the importer ignores those cells; `workingDateKeys` is the single definition of
 * a working day used by the template, the seed and the rollup.
 */

import type {
  AttendanceRecord,
  AttendanceRollup,
  AttendanceStatus,
  Employee,
  Holiday,
  LeaveType,
} from '../types'
import { isValidDateKey, parseDateKey } from './leavePlanner'

const MONTH_KEY = /^(\d{4})-(\d{2})$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function isValidMonthIndex(monthIndex: number): boolean {
  return Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/**
 * `YYYY-MM` for a zero-based JavaScript month index.
 *
 * The app uses Date's 0-based months everywhere, so the key follows suit rather than
 * inventing a second, 1-based convention at the Excel boundary.
 */
export function monthKey(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(monthIndex + 1)}`
}

/** Parses a `YYYY-MM` key back into a zero-based month, or `null` when invalid. */
export function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  if (typeof key !== 'string') return null
  const match = MONTH_KEY.exec(key.trim())
  if (!match) return null

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (year < 1 || year > 9999 || !isValidMonthIndex(monthIndex)) return null
  return { year, monthIndex }
}

/** Calendar length of a month, leap years included. Zero for an invalid month. */
export function daysInMonth(year: number, monthIndex: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return 0
  if (!isValidMonthIndex(monthIndex)) return 0

  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[monthIndex]
}

/** Every `YYYY-MM-DD` key in the month, in calendar order. */
export function monthDateKeys(year: number, monthIndex: number): string[] {
  const count = daysInMonth(year, monthIndex)
  if (count === 0) return []

  const prefix = monthKey(year, monthIndex)
  return Array.from({ length: count }, (_, index) => `${prefix}-${pad2(index + 1)}`)
}

/** True when a real date key falls on Sunday. Invalid keys are not Sundays. */
export function isSunday(dateKey: string): boolean {
  if (!isValidDateKey(dateKey)) return false
  return parseDateKey(dateKey).getDay() === 0
}

/** The distinct, valid holiday dates as a set for O(1) membership checks. */
export function holidayDateSet(holidays: Holiday[]): Set<string> {
  const dates = new Set<string>()
  for (const holiday of holidays) {
    if (isValidDateKey(holiday.date)) dates.add(holiday.date)
  }
  return dates
}

/**
 * Working-day keys for a month: every date that is neither Sunday nor a holiday.
 *
 * A holiday that falls on a Sunday is not double-counted because the predicate is a
 * pair of exclusions over one calendar, not arithmetic over two totals.
 */
export function workingDateKeys(year: number, monthIndex: number, holidays: Holiday[]): string[] {
  const holidayDates = holidayDateSet(holidays)
  return monthDateKeys(year, monthIndex).filter(
    (dateKey) => !isSunday(dateKey) && !holidayDates.has(dateKey),
  )
}

/**
 * Full-day leave codes, keyed by leave type.
 *
 * These and `HALF_LEAVE_CODE_BY_TYPE` are separate maps on purpose: a half-day leave
 * is a different record (`HalfDay` + `leaveType`) from a full leave day, and a UI that
 * used one map for both would render `CL` where the imported sheet said `HD-CL` (or
 * turn a full leave into half a day on the next download).
 */
export const FULL_LEAVE_CODE_BY_TYPE: Record<LeaveType, string> = {
  CL: 'CL',
  SL: 'SL',
  EL: 'EL',
  LOP: 'LOP',
  Maternity: 'ML',
  Paternity: 'PL',
  'Comp Off': 'CO',
  Other: 'O',
}

/** Half-day leave codes (`HD-CL` = half Casual Leave, ...), keyed by leave type. */
export const HALF_LEAVE_CODE_BY_TYPE: Record<LeaveType, string> = {
  CL: 'HD-CL',
  SL: 'HD-SL',
  EL: 'HD-EL',
  LOP: 'HD-LOP',
  Maternity: 'HD-ML',
  Paternity: 'HD-PL',
  'Comp Off': 'HD-CO',
  Other: 'HD-O',
}

type AttendanceCodeMapping = { status: AttendanceStatus; leaveType?: LeaveType }

/** Expands a leave-code map into matrix entries so codes and types cannot drift. */
function leaveCodeMappings(
  codeByType: Record<LeaveType, string>,
  status: AttendanceStatus,
): Record<string, AttendanceCodeMapping> {
  const mappings: Record<string, AttendanceCodeMapping> = {}
  for (const [leaveType, code] of Object.entries(codeByType) as Array<[LeaveType, string]>) {
    mappings[code] = { status, leaveType }
  }
  return mappings
}

/**
 * The matrix alphabet.
 *
 * `H`, `WO` and `blank` are not statuses: they are derived/absent cells. Keeping them
 * in the same table lets the template writer and the parser share one vocabulary.
 * Full-day and half-day leave codes are generated from the two exported maps above, so
 * every code the template can write is a code the parser understands.
 */
export const ATTENDANCE_CODES: Record<
  string,
  AttendanceCodeMapping | 'H' | 'WO' | 'blank'
> = {
  P: { status: 'Present' },
  A: { status: 'Absent' },
  W: { status: 'WFH' },
  HD: { status: 'HalfDay' },
  ...leaveCodeMappings(FULL_LEAVE_CODE_BY_TYPE, 'Leave'),
  ...leaveCodeMappings(HALF_LEAVE_CODE_BY_TYPE, 'HalfDay'),
  H: 'H',
  WO: 'WO',
  '': 'blank',
}

/**
 * Turns one matrix cell into a record, or `null` when the cell is derived/blank.
 *
 * The code is trimmed and upper-cased so a sheet filled in lower-case still imports.
 * `source` is `excel` because this mapping exists for the import path; the UI builds
 * manual records itself.
 */
export function codeToRecord(
  code: string,
  employeeId: string,
  date: string,
  now: Date = new Date(),
): AttendanceRecord | null {
  if (!isValidDateKey(date) || employeeId.length === 0) return null

  const mapping = ATTENDANCE_CODES[code.trim().toUpperCase()]
  if (mapping === undefined || typeof mapping === 'string') return null

  const record: AttendanceRecord = {
    id: `${employeeId}|${date}`,
    employeeId,
    date,
    status: mapping.status,
    source: 'excel',
    updatedAt: now.toISOString(),
  }
  if (mapping.leaveType) record.leaveType = mapping.leaveType
  return record
}

/**
 * The matrix code for a record.
 *
 * A half-day with a leave type is `HD-<code>` (for example `HD-SL`), while a plain
 * half-day stays `HD`. That distinction is the only way the round trip can preserve
 * "half sick leave" instead of collapsing it to a worked half-day on the next import.
 */
export function recordToCode(record: AttendanceRecord): string {
  switch (record.status) {
    case 'Present':
      return 'P'
    case 'Absent':
      return 'A'
    case 'WFH':
      return 'W'
    case 'HalfDay':
      return record.leaveType ? HALF_LEAVE_CODE_BY_TYPE[record.leaveType] ?? 'HD' : 'HD'
    case 'Leave':
      return record.leaveType ? FULL_LEAVE_CODE_BY_TYPE[record.leaveType] ?? 'O' : 'O'
  }
}

/**
 * Per-employee totals for a month.
 *
 * - present = P + W + 0.5 x HD (whether or not the half-day carries a leave type)
 * - leave = leave records + 0.5 x HD with a leave type
 * - LOP = absent records + LOP leave (including a half-day LOP)
 * - unmarked = working days not covered by present/leave/absent; a half-day without a
 *   leave type contributes 0.5 present and leaves the other 0.5 unmarked
 *
 * Records dated on a Sunday or a holiday are ignored for the totals: those are derived
 * non-working days, and counting them would let present days exceed working days.
 * `hasRecords` means "this employee has at least one usable mark this month", so an
 * off-day-only ledger also leaves it false. Payroll uses that flag to decide whether to
 * replace the employee's legacy aggregate values at all; treating a stray holiday
 * record as a ledger would replace a fully populated legacy month with zeros.
 */
export function rollupMonth(
  attendance: AttendanceRecord[],
  employees: Employee[],
  holidays: Holiday[],
  year: number,
  monthIndex: number,
): Map<string, AttendanceRollup> {
  const key = monthKey(year, monthIndex)
  const prefix = `${key}-`
  const workingDateList = workingDateKeys(year, monthIndex, holidays)
  const workingDays = workingDateList.length
  const workingDates = new Set(workingDateList)
  const holidayDates = holidayDateSet(holidays)
  const monthDates = monthDateKeys(year, monthIndex)
  const holidayDays = monthDates.filter((dateKey) => holidayDates.has(dateKey)).length
  const weeklyOffDays = monthDates.filter((dateKey) => isSunday(dateKey)).length

  const rollups = new Map<string, AttendanceRollup>()
  for (const employee of employees) {
    rollups.set(employee.id, {
      employeeId: employee.id,
      presentDays: 0,
      leaveDays: 0,
      leaveByType: {},
      absentDays: 0,
      wfhDays: 0,
      holidayDays,
      weeklyOffDays,
      workingDays,
      lopDays: 0,
      unmarkedDays: 0,
      hasRecords: false,
    })
  }

  for (const record of attendance) {
    if (!isValidDateKey(record.date) || !record.date.startsWith(prefix)) continue

    const rollup = rollups.get(record.employeeId)
    if (!rollup) continue

    // A Sunday/holiday mark is a display artifact from an old template, not evidence
    // the employee has been marked for this month. Only a working-day record counts.
    if (!workingDates.has(record.date)) continue
    rollup.hasRecords = true

    switch (record.status) {
      case 'Present':
        rollup.presentDays += 1
        break
      case 'WFH':
        rollup.presentDays += 1
        rollup.wfhDays += 1
        break
      case 'Absent':
        rollup.absentDays += 1
        rollup.lopDays += 1
        break
      case 'Leave': {
        const leaveType = record.leaveType ?? 'Other'
        rollup.leaveDays += 1
        rollup.leaveByType[leaveType] = (rollup.leaveByType[leaveType] ?? 0) + 1
        if (leaveType === 'LOP') rollup.lopDays += 1
        break
      }
      case 'HalfDay': {
        rollup.presentDays += 0.5
        if (record.leaveType) {
          rollup.leaveDays += 0.5
          rollup.leaveByType[record.leaveType] =
            (rollup.leaveByType[record.leaveType] ?? 0) + 0.5
          if (record.leaveType === 'LOP') rollup.lopDays += 0.5
        }
        break
      }
    }
  }

  for (const rollup of rollups.values()) {
    // A half-day without leave is already only 0.5 present, so subtracting the three
    // counted buckets leaves exactly the other half (and every untouched working day).
    rollup.unmarkedDays = Math.max(
      0,
      rollup.workingDays - rollup.presentDays - rollup.leaveDays - rollup.absentDays,
    )
  }

  return rollups
}
