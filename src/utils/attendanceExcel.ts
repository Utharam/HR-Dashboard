/**
 * The monthly attendance matrix: one row per employee, one column per calendar day.
 *
 * The writer and the parser are deliberately symmetrical. The writer emits the exact
 * layout the parser looks for (`Month` in B2, headers on row 5, day numbers in the
 * header), and the parser tolerates the workbook having been opened and re-saved in
 * Excel. `H`/`WO` cells are derived calendar facts, not records: the parser ignores
 * them so a round trip cannot invent per-employee holiday or weekly-off rows.
 */

import * as XLSX from 'xlsx'
import type {
  AttendanceRecord,
  Employee,
  Holiday,
  LeavePlan,
  LeaveType,
} from '../types'
import {
  ATTENDANCE_CODES,
  codeToRecord,
  holidayDateSet,
  isSunday,
  monthDateKeys,
  monthKey,
  parseMonthKey,
} from './attendance'
import { eachDateKey } from './leavePlanner'

export interface ParseAttendanceIssue {
  row: number
  employeeId?: string
  date?: string
  code?: string
  message: string
}

export type ParseAttendanceResult =
  | {
      ok: true
      monthKey: string
      records: AttendanceRecord[]
      issues: ParseAttendanceIssue[]
      matchedEmployees: number
      unknownEmployeeIds: string[]
    }
  | { ok: false; reason: 'not-a-workbook' | 'missing-month' | 'missing-header' | 'no-employees' }

/** Reverse of `ATTENDANCE_CODES`, derived from the one code table rather than copied. */
const LEAVE_CODE_BY_TYPE = new Map<LeaveType, string>()
for (const [code, mapping] of Object.entries(ATTENDANCE_CODES)) {
  if (typeof mapping === 'object' && mapping.status === 'Leave' && mapping.leaveType) {
    LEAVE_CODE_BY_TYPE.set(mapping.leaveType, code)
  }
}

const LEGEND_ROWS: Array<[string, string]> = [
  ['Code', 'Meaning'],
  ['P', 'Present'],
  ['A', 'Absent'],
  ['W', 'Work From Home'],
  ['HD', 'Half Day'],
  ['CL', 'Casual Leave'],
  ['SL', 'Sick Leave'],
  ['EL', 'Earned Leave'],
  ['LOP', 'Loss of Pay'],
  ['ML', 'Maternity Leave'],
  ['PL', 'Paternity Leave'],
  ['CO', 'Comp Off'],
  ['O', 'Other Leave'],
  ['H', 'Holiday (derived)'],
  ['WO', 'Weekly Off (derived)'],
  ['(blank)', 'Unmarked'],
]

function buildLegendSheet(): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(LEGEND_ROWS)
}

/**
 * `${employeeId}|${date}` → the approved `LeaveType` covering that date.
 *
 * Shared with the Attendance matrix UI, which renders the same approved leave as
 * ghost cells, so the template and the screen can never disagree about what the
 * planner has approved.
 */
export function approvedLeaveByEmployeeDate(leavePlans: LeavePlan[]): Map<string, LeaveType> {
  const leave = new Map<string, LeaveType>()
  for (const plan of leavePlans) {
    if (plan.status !== 'Approved') continue
    for (const date of eachDateKey(plan.startDate, plan.endDate)) {
      const key = `${plan.employeeId}|${date}`
      // Overlapping approved plans are already a planner anomaly; first one wins so
      // the template stays deterministic.
      if (!leave.has(key)) leave.set(key, plan.type)
    }
  }
  return leave
}

/**
 * Builds the workbook HR fills in and uploads.
 *
 * Cell precedence is calendar first: Sunday is `WO`, then a holiday is `H`, then an
 * approved leave plan, then `P` (when prefill is on) or blank. A leave plan that spans
 * a Sunday or holiday therefore cannot consume a non-working day.
 */
export function buildAttendanceWorkbook(input: {
  employees: Employee[]
  holidays: Holiday[]
  leavePlans: LeavePlan[]
  year: number
  monthIndex: number
  prefillPresent: boolean
}): XLSX.WorkBook {
  const { employees, holidays, leavePlans, year, monthIndex, prefillPresent } = input
  const dates = monthDateKeys(year, monthIndex)
  const holidaysOnDate = holidayDateSet(holidays)
  const leaveOnDate = approvedLeaveByEmployeeDate(leavePlans)

  const rows: Array<Array<string | number | null>> = [
    ['OmniHR Monthly Attendance'],
    ['Month', monthKey(year, monthIndex)],
    ['Generated', new Date().toISOString()],
    [''],
    ['Employee ID', 'Employee Name', 'Department', ...dates.map((_, index) => index + 1)],
  ]

  for (const employee of employees) {
    const dayCells = dates.map((date) => {
      if (isSunday(date)) return 'WO'
      if (holidaysOnDate.has(date)) return 'H'

      const leaveType = leaveOnDate.get(`${employee.id}|${date}`)
      if (leaveType) return LEAVE_CODE_BY_TYPE.get(leaveType) ?? 'O'

      return prefillPresent ? 'P' : null
    })
    rows.push([employee.id, employee.name, employee.department, ...dayCells])
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 26 },
    ...dates.map(() => ({ wch: 4 })),
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance')
  XLSX.utils.book_append_sheet(workbook, buildLegendSheet(), 'Legend')
  return workbook
}

/** `omnihr-attendance-YYYY-MM.xlsx`. */
export function attendanceTemplateFileName(year: number, monthIndex: number): string {
  return `omnihr-attendance-${monthKey(year, monthIndex)}.xlsx`
}

/** A header cell that means a day column: an integer 1..31, as a number or digits. */
function dayNumber(cell: unknown): number | null {
  if (typeof cell === 'number') {
    return Number.isInteger(cell) && cell >= 1 && cell <= 31 ? cell : null
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim()
    if (!/^\d{1,2}$/.test(trimmed)) return null
    const value = Number(trimmed)
    return value >= 1 && value <= 31 ? value : null
  }
  return null
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

/**
 * Parses the monthly matrix.
 *
 * Only `Attendance` cells that represent a record become records. `H`, `WO` and blanks
 * are skipped; unknown employees and invalid codes are reported as preview issues so
 * the UI can show them before replacing a month.
 */
export function parseAttendanceWorkbook(
  data: ArrayBuffer,
  employees: Employee[],
): ParseAttendanceResult {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array' })
  } catch {
    return { ok: false, reason: 'not-a-workbook' }
  }

  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'attendance')
  if (!sheetName) return { ok: false, reason: 'not-a-workbook' }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return { ok: false, reason: 'not-a-workbook' }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })

  // B2 is the contract; the label-search fallback keeps a sheet whose title rows were
  // deleted above B2 importable rather than failing for a cosmetic reason.
  let month = parseMonthKey(cellText(rows[1]?.[1]))
  if (!month) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      if (cellText(row[0]).toLowerCase() !== 'month') continue
      month = parseMonthKey(cellText(row[1]))
      if (month) break
    }
  }
  if (!month) return { ok: false, reason: 'missing-month' }

  let headerRow = -1
  let employeeIdColumn = -1
  let dayColumns = new Map<number, number>()

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) continue

    let idColumn = -1
    const days = new Map<number, number>()
    for (let column = 0; column < row.length; column += 1) {
      const cell = row[column]
      if (idColumn === -1 && cellText(cell).toLowerCase() === 'employee id') {
        idColumn = column
      }
      const day = dayNumber(cell)
      if (day !== null) days.set(day, column)
    }

    if (idColumn !== -1 && days.size > 0) {
      headerRow = rowIndex
      employeeIdColumn = idColumn
      dayColumns = days
      break
    }
  }

  if (headerRow === -1) return { ok: false, reason: 'missing-header' }
  if (employees.length === 0) return { ok: false, reason: 'no-employees' }

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))
  const monthText = monthKey(month.year, month.monthIndex)
  const dates = monthDateKeys(month.year, month.monthIndex)
  const now = new Date()

  const recordsById = new Map<string, AttendanceRecord>()
  const issues: ParseAttendanceIssue[] = []
  const matchedEmployees = new Set<string>()
  const unknownEmployeeIds = new Set<string>()

  const orderedDayColumns = Array.from(dayColumns.entries()).sort((a, b) => a[0] - b[0])

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) continue

    const employeeId = cellText(row[employeeIdColumn])
    if (!employeeId) continue

    if (!employeeById.has(employeeId)) {
      unknownEmployeeIds.add(employeeId)
      issues.push({
        row: rowIndex + 1,
        employeeId,
        message: `Unknown employee ID "${employeeId}"`,
      })
      continue
    }

    matchedEmployees.add(employeeId)

    for (const [day, column] of orderedDayColumns) {
      const code = cellText(row[column])
      if (!code) continue

      const normalized = code.toUpperCase()
      const mapping = ATTENDANCE_CODES[normalized]
      if (mapping === 'H' || mapping === 'WO' || mapping === 'blank') continue

      if (day > dates.length) {
        issues.push({
          row: rowIndex + 1,
          employeeId,
          code: normalized,
          message: `Day ${day} is outside ${monthText}`,
        })
        continue
      }

      const date = dates[day - 1]
      if (mapping === undefined) {
        issues.push({
          row: rowIndex + 1,
          employeeId,
          date,
          code: normalized,
          message: `Unknown attendance code "${code}" on ${date}`,
        })
        continue
      }

      const record = codeToRecord(normalized, employeeId, date, now)
      if (record) recordsById.set(record.id, record)
    }
  }

  return {
    ok: true,
    monthKey: monthText,
    records: Array.from(recordsById.values()),
    issues,
    matchedEmployees: matchedEmployees.size,
    unknownEmployeeIds: Array.from(unknownEmployeeIds),
  }
}
