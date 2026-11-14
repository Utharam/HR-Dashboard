/**
 * Pure date, grid and coverage helpers for the leave planner.
 *
 * A leave plan is a range of LOCAL calendar dates, so nothing here calls
 * `toISOString().slice(0, 10)`: that reads UTC and silently shifts the key by a day
 * for anyone east of Greenwich (the same class of bug documented in `utils/dates.ts`).
 * `toDateKey` reads local components and `parseDateKey` builds local midnight.
 *
 * Day arithmetic steps through calendar components (`new Date(y, m, d + n)`) rather
 * than adding 86_400_000 ms. Around a daylight-saving change a millisecond step either
 * duplicates or skips a local day, which would corrupt a leave range or a working-day
 * count; a calendar step cannot.
 */

import type { Employee, LeavePlan, LeaveStatus, LeaveType } from '../types'

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Rebuild a date from components and confirm the components survived the round trip. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (year < 1 || year > 9999) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const probe = new Date(year, month - 1, day)
  probe.setFullYear(year)
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  )
}

/** Formats a Date from its LOCAL calendar components as `YYYY-MM-DD`. */
export function toDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Cannot format an invalid Date')
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** True when `value` is a real `YYYY-MM-DD` local calendar date. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_KEY.exec(value)
  if (!match) return false
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

/**
 * Parses a `YYYY-MM-DD` key to local midnight.
 *
 * Throws on an invalid key instead of returning a silently wrong Date: every caller
 * already has `isValidDateKey` to gate user input, so reaching this throw means a
 * programming mistake, not data loss. `eachDateKey` below does the gating itself.
 */
export function parseDateKey(key: string): Date {
  if (!isValidDateKey(key)) throw new RangeError(`Invalid date key: ${String(key)}`)
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Every `YYYY-MM-DD` key from `start` to `end`, inclusive. */
export function eachDateKey(start: string, end: string): string[] {
  if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) return []

  const startDate = parseDateKey(start)
  const keys: string[] = []
  for (let offset = 0; ; offset += 1) {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + offset,
    )
    const key = toDateKey(date)
    if (key > end) break
    keys.push(key)
  }
  return keys
}

/**
 * Inclusive count of days that are not Sunday.
 *
 * The app's payroll month is a 26-working-day cycle, so Sunday is the only weekly
 * exclusion; there is no holiday calendar in this version. A single Sunday is 0.
 */
export function countWorkingDays(start: string, end: string): number {
  return eachDateKey(start, end).filter((key) => parseDateKey(key).getDay() !== 0).length
}

/**
 * The 42 cells (six Monday-first weeks) that render a month.
 *
 * The grid is always 42 cells so the calendar height does not jump between months.
 * Leading and trailing cells come from adjacent months with `inMonth: false`.
 */
export function monthGrid(year: number, monthIndex: number): { dateKey: string; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset)

  const cells: { dateKey: string; inMonth: boolean }[] = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    )
    cells.push({
      dateKey: toDateKey(date),
      inMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
    })
  }
  return cells
}

/**
 * Plans covering `dateKey`, inclusive of both endpoints.
 *
 * `statuses` is an optional filter: when supplied, only those statuses match, and an
 * empty array matches nothing. Omitting it includes every status, including Cancelled.
 */
export function plansOnDate(
  plans: LeavePlan[],
  dateKey: string,
  statuses?: LeaveStatus[],
): LeavePlan[] {
  if (!isValidDateKey(dateKey)) return []
  return plans.filter((plan) => {
    if (!isValidDateKey(plan.startDate) || !isValidDateKey(plan.endDate)) return false
    if (dateKey < plan.startDate || dateKey > plan.endDate) return false
    return statuses === undefined || statuses.includes(plan.status)
  })
}

/**
 * Distinct people on leave for each day in `[start, end]`.
 *
 * Counts `employeeId`, not plans: one person with two overlapping entries is one
 * person away from their desk, and the coverage threshold is about people. Days with
 * no leave are absent from the map, so consumers read `counts.get(key) ?? 0`.
 */
export function dailyLeaveCounts(
  plans: LeavePlan[],
  start: string,
  end: string,
  statuses?: LeaveStatus[],
): Map<string, number> {
  const counts = new Map<string, number>()
  if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) return counts

  const employeesByDay = new Map<string, Set<string>>()
  for (const plan of plans) {
    if (statuses !== undefined && !statuses.includes(plan.status)) continue

    // Clamp the plan to the requested window before walking its days, so a plan that
    // began last month still counts on every day of this month that it covers.
    const from = plan.startDate > start ? plan.startDate : start
    const to = plan.endDate < end ? plan.endDate : end
    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) continue

    for (const key of eachDateKey(from, to)) {
      let employees = employeesByDay.get(key)
      if (!employees) {
        employees = new Set<string>()
        employeesByDay.set(key, employees)
      }
      employees.add(plan.employeeId)
    }
  }

  // Walk the window in date order so the map itself is deterministic.
  for (const key of eachDateKey(start, end)) {
    const employees = employeesByDay.get(key)
    if (employees && employees.size > 0) counts.set(key, employees.size)
  }
  return counts
}

/** Days whose concurrent count is at or above `threshold`, sorted by date. */
export function peakDays(
  counts: Map<string, number>,
  threshold: number,
): { dateKey: string; count: number }[] {
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([dateKey, count]) => ({ dateKey, count }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}

/**
 * Filters plans through the employee join for the planner toolbar.
 *
 * A plan whose `employeeId` no longer exists still renders in the calendar as
 * "Unknown employee", but it cannot match a department/location filter. Search does
 * match the raw `employeeId`, so an orphaned plan remains findable by id.
 */
export function filterLeavePlans(
  plans: LeavePlan[],
  employees: Employee[],
  filters: {
    department?: string
    location?: string
    search?: string
    type?: LeaveType | 'ALL'
    status?: LeaveStatus | 'ALL'
  },
): LeavePlan[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))
  const search = filters.search?.trim().toLowerCase() ?? ''

  return plans.filter((plan) => {
    if (filters.type && filters.type !== 'ALL' && plan.type !== filters.type) return false
    if (filters.status && filters.status !== 'ALL' && plan.status !== filters.status) return false

    const employee = employeeById.get(plan.employeeId)
    if (filters.department && employee?.department !== filters.department) return false
    if (filters.location && employee?.location !== filters.location) return false

    if (search) {
      const haystack = [employee?.name, employee?.email, plan.employeeId]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }

    return true
  })
}
