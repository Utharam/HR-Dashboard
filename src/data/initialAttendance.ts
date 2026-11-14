/**
 * Demo daily attendance for the current month.
 *
 * This seed is only installed by the store layer when the roster is exactly the demo
 * set and no attendance key exists (D11). The function itself is roster-agnostic: it
 * turns each employee's legacy `presentDays`/`lopDays` into daily records so the demo
 * opens with a populated matrix instead of a blank one.
 *
 * Working days are walked in calendar order: `presentDays` become Present, then
 * `lopDays` become Absent, and the combined count is capped at the month's working
 * days. The remainder stays blank (unmarked), which is what the rollup reports.
 */

import type { AttendanceRecord, Employee, Holiday } from '../types'
import { workingDateKeys } from '../utils/attendance'

export function createInitialAttendance(
  employees: Employee[],
  holidays: Holiday[],
  now: Date = new Date(),
): AttendanceRecord[] {
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const workingDates = workingDateKeys(year, monthIndex, holidays)
  const updatedAt = now.toISOString()
  const records: AttendanceRecord[] = []

  for (const employee of employees) {
    const presentCount = Math.min(
      Math.max(0, Math.floor(employee.presentDays)),
      workingDates.length,
    )
    const absentCount = Math.min(
      Math.max(0, Math.floor(employee.lopDays)),
      Math.max(0, workingDates.length - presentCount),
    )

    for (let index = 0; index < presentCount; index += 1) {
      const date = workingDates[index]
      records.push({
        id: `${employee.id}|${date}`,
        employeeId: employee.id,
        date,
        status: 'Present',
        source: 'seed',
        updatedAt,
      })
    }

    for (let index = 0; index < absentCount; index += 1) {
      const date = workingDates[presentCount + index]
      records.push({
        id: `${employee.id}|${date}`,
        employeeId: employee.id,
        date,
        status: 'Absent',
        source: 'seed',
        updatedAt,
      })
    }
  }

  return records
}
