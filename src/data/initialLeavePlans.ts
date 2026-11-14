/**
 * Relative-date demo leave plans for the first run and the "Reset Demo State" path.
 *
 * The dates are anchored to the coming Monday (today itself when today is Monday)
 * rather than to hardcoded calendar dates, so the demo calendar always has visible
 * upcoming leave. Every range is Monday-Friday, which also means no plan starts, ends
 * or covers a Sunday - the only day the working-day count excludes.
 *
 * The seed is deterministic for a given `now`: the same instant yields the same plans.
 */

import type { Employee, HalfDay, LeavePlan, LeaveStatus, LeaveType } from '../types'
import { INITIAL_EMPLOYEES } from './initialData'
import { toDateKey } from '../utils/leavePlanner'

interface SeedSpec {
  /** Days after the anchor Monday. */
  offset: number
  /** Inclusive duration in days; the seed ranges never cross a Sunday. */
  days: number
  employeeIndex: number
  type: LeaveType
  status: LeaveStatus
  halfDay?: HalfDay
  note?: string
}

const SEED_SPECS: SeedSpec[] = [
  { offset: 0, days: 3, employeeIndex: 0, type: 'CL', status: 'Approved', note: 'Family trip' },
  { offset: 0, days: 1, employeeIndex: 20, type: 'SL', status: 'Approved', halfDay: 'PM' },
  { offset: 7, days: 5, employeeIndex: 40, type: 'EL', status: 'Planned' },
  { offset: 9, days: 2, employeeIndex: 60, type: 'Comp Off', status: 'Approved' },
  {
    offset: 14,
    days: 1,
    employeeIndex: 80,
    type: 'LOP',
    status: 'Cancelled',
    note: 'Cancelled by employee',
  },
  { offset: 16, days: 3, employeeIndex: 100, type: 'Maternity', status: 'Planned' },
  { offset: 0, days: 2, employeeIndex: 120, type: 'Paternity', status: 'Approved' },
  { offset: 25, days: 1, employeeIndex: 140, type: 'Other', status: 'Planned', halfDay: 'AM' },
  { offset: 28, days: 4, employeeIndex: 160, type: 'CL', status: 'Approved' },
  { offset: 35, days: 2, employeeIndex: 180, type: 'SL', status: 'Planned' },
]

/**
 * True only when `employees` is exactly the built-in demo roster.
 *
 * The demo leave seed is addressed by employee index into `INITIAL_EMPLOYEES`, so it
 * is only meaningful when that roster is what the user has. A custom roster - even
 * one that happens to be the same length - must never receive invented leave for
 * people who were not part of the demo. Reordered demo employees still count as the
 * demo set: the seed ids are stable and an order change loses no information.
 */
export function isDemoEmployeeSet(employees: readonly Employee[]): boolean {
  if (employees.length !== INITIAL_EMPLOYEES.length) return false

  const ids = new Set(employees.map((employee) => employee.id))
  // A duplicate id shrinks the set; a same-length roster with duplicates is not the
  // demo roster even if every demo id happens to appear.
  if (ids.size !== INITIAL_EMPLOYEES.length) return false

  return INITIAL_EMPLOYEES.every((employee) => ids.has(employee.id))
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Monday-first anchor: today when today is Monday, otherwise the coming Monday. */
function upcomingMonday(today: Date): Date {
  const daysUntilMonday = (8 - today.getDay()) % 7
  return addDays(today, daysUntilMonday)
}

export function createInitialLeavePlans(now: Date = new Date()): LeavePlan[] {
  const today = startOfDay(now)
  const monday = upcomingMonday(today)
  const stamp = now.toISOString()

  return SEED_SPECS.map((spec, index) => {
    const start = addDays(monday, spec.offset)
    const end = addDays(start, spec.days - 1)
    const employee = INITIAL_EMPLOYEES[spec.employeeIndex % INITIAL_EMPLOYEES.length]

    return {
      id: `leave-seed-${index + 1}`,
      employeeId: employee.id,
      startDate: toDateKey(start),
      endDate: toDateKey(end),
      type: spec.type,
      status: spec.status,
      halfDay: spec.halfDay ?? null,
      ...(spec.note ? { note: spec.note } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    }
  })
}
