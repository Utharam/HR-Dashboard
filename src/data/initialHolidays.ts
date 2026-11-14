/**
 * Fixed national holidays for the demo company calendar.
 *
 * The dates repeat every year, so the seed accepts the year to stamp onto the recurring
 * list. 2026 is the default because the demo roster and payroll months are anchored
 * there. Holidays are company-wide and keyed by date; the store/snapshot layer enforces
 * uniqueness, not this seed.
 */

import type { Holiday } from '../types'

interface HolidaySpec {
  month: number
  day: number
  name: string
}

const FIXED_HOLIDAYS: HolidaySpec[] = [
  { month: 1, day: 1, name: 'New Year' },
  { month: 1, day: 26, name: 'Republic Day' },
  { month: 8, day: 15, name: 'Independence Day' },
  { month: 10, day: 2, name: 'Gandhi Jayanti' },
  { month: 12, day: 25, name: 'Christmas' },
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function createInitialHolidays(year: number = 2026): Holiday[] {
  return FIXED_HOLIDAYS.map((spec) => {
    const date = `${String(year).padStart(4, '0')}-${pad2(spec.month)}-${pad2(spec.day)}`
    return { id: `holiday-${date}`, date, name: spec.name }
  })
}
