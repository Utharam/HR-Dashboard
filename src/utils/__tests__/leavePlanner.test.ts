import { describe, it, expect } from 'vitest'
import type { Employee, LeavePlan } from '../../types'
import { INITIAL_EMPLOYEES } from '../../data/initialData'
import {
  toDateKey,
  parseDateKey,
  isValidDateKey,
  eachDateKey,
  countWorkingDays,
  monthGrid,
  plansOnDate,
  dailyLeaveCounts,
  peakDays,
  filterLeavePlans,
} from '../leavePlanner'

const plan = (overrides: Partial<LeavePlan> = {}): LeavePlan => ({
  id: 'plan-1',
  employeeId: 'E-1',
  startDate: '2024-03-04',
  endDate: '2024-03-04',
  type: 'CL',
  status: 'Approved',
  halfDay: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  ...INITIAL_EMPLOYEES[0],
  ...overrides,
})

const employeeById = (
  id: string,
  name: string,
  department: string,
  location: string,
): Employee => employee({ id, name, department, location, email: `${id.toLowerCase()}@omnixhr.io` })

describe('toDateKey', () => {
  it('formats from local year/month/day', () => {
    expect(toDateKey(new Date(2024, 0, 15))).toBe('2024-01-15')
  })

  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2024, 8, 5))).toBe('2024-09-05')
  })

  it('does not shift a near-midnight local date through UTC', () => {
    // In any zone east of Greenwich, `toISOString().slice(0, 10)` turns this
    // local 00:30 into the previous UTC day. The key must stay 2024-04-01.
    expect(toDateKey(new Date(2024, 3, 1, 0, 30))).toBe('2024-04-01')
    expect(toDateKey(new Date(2024, 2, 31, 23, 59, 59, 999))).toBe('2024-03-31')
  })

  it('handles a month boundary', () => {
    expect(toDateKey(new Date(2024, 0, 31))).toBe('2024-01-31')
    expect(toDateKey(new Date(2024, 1, 1))).toBe('2024-02-01')
  })

  it('rejects an invalid Date rather than rendering NaN components', () => {
    expect(() => toDateKey(new Date(Number.NaN))).toThrow(RangeError)
  })
})

describe('parseDateKey', () => {
  it('parses to local midnight, not UTC midnight', () => {
    const parsed = parseDateKey('2024-02-29')
    expect(parsed.getFullYear()).toBe(2024)
    expect(parsed.getMonth()).toBe(1)
    expect(parsed.getDate()).toBe(29)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
  })

  it('round-trips every valid key', () => {
    for (const key of ['2023-12-31', '2024-01-01', '2024-02-29', '2024-12-31']) {
      expect(toDateKey(parseDateKey(key))).toBe(key)
    }
  })

  it('throws on a malformed or impossible key', () => {
    for (const key of ['2024-02-30', '2023-02-29', '2024-13-01', '2024-1-01', '2024/01/01', '']) {
      expect(() => parseDateKey(key)).toThrow(RangeError)
    }
  })
})

describe('isValidDateKey', () => {
  it.each(['2024-01-01', '2024-02-29', '2023-12-31', '2025-06-15'])('accepts %s', (key) => {
    expect(isValidDateKey(key)).toBe(true)
  })

  it.each([
    '2023-02-29',
    '2024-02-30',
    '2024-04-31',
    '2024-13-01',
    '2024-00-10',
    '2024-01-00',
    '2024-1-01',
    '24-01-01',
    '2024/01/01',
    '',
    ' 2024-01-01',
    '2024-01-01 ',
  ])('rejects %j', (key) => {
    expect(isValidDateKey(key)).toBe(false)
  })

  it.each([null, undefined, 20240101, new Date(2024, 0, 1), ['2024-01-01'], true])(
    'rejects the non-string %s',
    (value) => {
      expect(isValidDateKey(value)).toBe(false)
    },
  )
})

describe('eachDateKey', () => {
  it('returns a single key for a single day', () => {
    expect(eachDateKey('2024-01-15', '2024-01-15')).toEqual(['2024-01-15'])
  })

  it('walks across a month boundary inclusively', () => {
    expect(eachDateKey('2024-01-30', '2024-02-02')).toEqual([
      '2024-01-30',
      '2024-01-31',
      '2024-02-01',
      '2024-02-02',
    ])
  })

  it('includes the leap day', () => {
    expect(eachDateKey('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
  })

  it('walks a DST change without duplicating or skipping a day', () => {
    // US DST starts on 2024-03-10. Adding 86_400_000 ms in a DST zone would skip
    // a local day; calendar stepping must not.
    expect(eachDateKey('2024-03-09', '2024-03-11')).toEqual([
      '2024-03-09',
      '2024-03-10',
      '2024-03-11',
    ])
  })

  it('returns an empty list for a reversed or invalid range', () => {
    expect(eachDateKey('2024-03-05', '2024-03-04')).toEqual([])
    expect(eachDateKey('2024-02-30', '2024-03-01')).toEqual([])
    expect(eachDateKey('2024-03-01', 'not-a-date')).toEqual([])
  })
})

describe('countWorkingDays', () => {
  it('excludes Sunday', () => {
    expect(countWorkingDays('2024-03-04', '2024-03-10')).toBe(6)
  })

  it('returns 0 for a single Sunday', () => {
    expect(countWorkingDays('2024-03-10', '2024-03-10')).toBe(0)
  })

  it('returns 0 for a Sunday-only range', () => {
    expect(countWorkingDays('2024-03-10', '2024-03-10')).toBe(0)
  })

  it('counts a single Saturday as one working day', () => {
    expect(countWorkingDays('2024-03-09', '2024-03-09')).toBe(1)
  })

  it('counts across a month boundary', () => {
    // Mon 2024-01-29 .. Sun 2024-02-04
    expect(countWorkingDays('2024-01-29', '2024-02-04')).toBe(6)
  })

  it('counts a leap-week range', () => {
    // Mon 2024-02-26 .. Sun 2024-03-03
    expect(countWorkingDays('2024-02-26', '2024-03-03')).toBe(6)
  })

  it('counts the leap day itself', () => {
    // Wed 2024-02-28 .. Fri 2024-03-01
    expect(countWorkingDays('2024-02-28', '2024-03-01')).toBe(3)
  })

  it('returns 0 for a reversed or invalid range', () => {
    expect(countWorkingDays('2024-03-05', '2024-03-04')).toBe(0)
    expect(countWorkingDays('2024-02-30', '2024-03-04')).toBe(0)
  })
})

describe('monthGrid', () => {
  it('returns 42 Monday-first cells', () => {
    const grid = monthGrid(2024, 0)
    expect(grid).toHaveLength(42)
    expect(parseDateKey(grid[0].dateKey).getDay()).toBe(1)
    expect(parseDateKey(grid[41].dateKey).getDay()).toBe(0)
    expect(eachDateKey(grid[0].dateKey, grid[41].dateKey)).toHaveLength(42)
  })

  it('marks leading and trailing days from adjacent months', () => {
    const grid = monthGrid(2024, 0) // January 2024 starts on a Monday
    expect(grid[0]).toEqual({ dateKey: '2024-01-01', inMonth: true })
    expect(grid[30]).toEqual({ dateKey: '2024-01-31', inMonth: true })
    expect(grid[31]).toEqual({ dateKey: '2024-02-01', inMonth: false })
    expect(grid[41]).toEqual({ dateKey: '2024-02-11', inMonth: false })
  })

  it('handles a non-Monday month start and a leap February', () => {
    const grid = monthGrid(2024, 1) // February 2024 starts on a Thursday
    expect(grid[0]).toEqual({ dateKey: '2024-01-29', inMonth: false })
    expect(grid[3]).toEqual({ dateKey: '2024-02-01', inMonth: true })
    expect(grid[31]).toEqual({ dateKey: '2024-02-29', inMonth: true })
    expect(grid[32]).toEqual({ dateKey: '2024-03-01', inMonth: false })
    expect(grid[41]).toEqual({ dateKey: '2024-03-10', inMonth: false })
  })

  it('rolls into the next year for December', () => {
    const grid = monthGrid(2024, 11)
    expect(grid[0]).toEqual({ dateKey: '2024-11-25', inMonth: false })
    expect(grid[6]).toEqual({ dateKey: '2024-12-01', inMonth: true })
    expect(grid[36]).toEqual({ dateKey: '2024-12-31', inMonth: true })
    expect(grid[37]).toEqual({ dateKey: '2025-01-01', inMonth: false })
    expect(grid[41]).toEqual({ dateKey: '2025-01-05', inMonth: false })
  })
})

describe('plansOnDate', () => {
  const multi = plan({ id: 'p1', startDate: '2024-03-04', endDate: '2024-03-08', status: 'Approved' })
  const single = plan({
    id: 'p2',
    employeeId: 'E-2',
    startDate: '2024-03-06',
    endDate: '2024-03-06',
    status: 'Planned',
    halfDay: 'AM',
  })
  const cancelled = plan({
    id: 'p3',
    employeeId: 'E-3',
    startDate: '2024-03-06',
    endDate: '2024-03-06',
    status: 'Cancelled',
  })
  const plans = [multi, single, cancelled]

  it('includes every plan covering the date, inclusive of both endpoints', () => {
    expect(plansOnDate(plans, '2024-03-04').map((p) => p.id)).toEqual(['p1'])
    expect(plansOnDate(plans, '2024-03-06').map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(plansOnDate(plans, '2024-03-08').map((p) => p.id)).toEqual(['p1'])
    expect(plansOnDate(plans, '2024-03-09')).toEqual([])
  })

  it('filters by status when a list is supplied', () => {
    expect(plansOnDate(plans, '2024-03-06', ['Approved']).map((p) => p.id)).toEqual(['p1'])
    expect(plansOnDate(plans, '2024-03-06', ['Planned', 'Approved']).map((p) => p.id)).toEqual([
      'p1',
      'p2',
    ])
    expect(plansOnDate(plans, '2024-03-06', [])).toEqual([])
  })

  it('returns nothing for an invalid date key', () => {
    expect(plansOnDate(plans, '2024-02-30')).toEqual([])
  })
})

describe('dailyLeaveCounts', () => {
  const plans = [
    plan({ id: 'p1', employeeId: 'E-1', startDate: '2024-03-04', endDate: '2024-03-06' }),
    plan({ id: 'p2', employeeId: 'E-2', startDate: '2024-03-05', endDate: '2024-03-05' }),
    plan({ id: 'p3', employeeId: 'E-1', startDate: '2024-03-05', endDate: '2024-03-05', status: 'Planned' }),
    plan({ id: 'p4', employeeId: 'E-3', startDate: '2024-03-06', endDate: '2024-03-06', status: 'Cancelled' }),
    plan({ id: 'p5', employeeId: 'E-4', startDate: '2024-02-28', endDate: '2024-03-05' }),
    plan({ id: 'p6', employeeId: 'E-5', startDate: '2024-03-20', endDate: '2024-03-21' }),
  ]

  it('counts distinct employees per day inside the range', () => {
    const counts = dailyLeaveCounts(plans, '2024-03-04', '2024-03-06')
    expect(counts.get('2024-03-04')).toBe(2) // E-1, E-4
    expect(counts.get('2024-03-05')).toBe(3) // E-1 (twice), E-2, E-4 → three people
    expect(counts.get('2024-03-06')).toBe(2) // E-1, E-3 (cancelled but no filter)
    expect(counts.has('2024-03-07')).toBe(false)
  })

  it('includes plans that begin before or end after the requested range', () => {
    const counts = dailyLeaveCounts(plans, '2024-03-04', '2024-03-04')
    expect(counts.get('2024-03-04')).toBe(2)
  })

  it('ignores plans entirely outside the range', () => {
    const counts = dailyLeaveCounts(plans, '2024-03-04', '2024-03-06')
    expect(counts.has('2024-03-20')).toBe(false)
  })

  it('filters by status when supplied', () => {
    const counts = dailyLeaveCounts(plans, '2024-03-04', '2024-03-06', ['Approved'])
    expect(counts.get('2024-03-04')).toBe(2)
    expect(counts.get('2024-03-05')).toBe(3)
    expect(counts.get('2024-03-06')).toBe(1) // only E-1; E-3 is Cancelled
    expect(dailyLeaveCounts(plans, '2024-03-04', '2024-03-06', [])).toEqual(new Map())
  })

  it('returns an empty map for a reversed or invalid range', () => {
    expect(dailyLeaveCounts(plans, '2024-03-06', '2024-03-04').size).toBe(0)
    expect(dailyLeaveCounts(plans, 'bad', '2024-03-04').size).toBe(0)
  })
})

describe('peakDays', () => {
  it('returns days at or above the threshold, sorted by date', () => {
    const counts = new Map([
      ['2024-03-06', 4],
      ['2024-03-04', 2],
      ['2024-03-05', 3],
      ['2024-03-07', 1],
    ])
    expect(peakDays(counts, 3)).toEqual([
      { dateKey: '2024-03-05', count: 3 },
      { dateKey: '2024-03-06', count: 4 },
    ])
    expect(peakDays(counts, 2)).toEqual([
      { dateKey: '2024-03-04', count: 2 },
      { dateKey: '2024-03-05', count: 3 },
      { dateKey: '2024-03-06', count: 4 },
    ])
  })

  it('returns nothing when no day reaches the threshold', () => {
    expect(peakDays(new Map([['2024-03-04', 1]]), 2)).toEqual([])
    expect(peakDays(new Map(), 1)).toEqual([])
  })
})

describe('filterLeavePlans', () => {
  const employees = [
    employeeById('E-1', 'Alice Sharma', 'Engineering', 'Bengaluru HQ'),
    employeeById('E-2', 'Bob Menon', 'Finance', 'Mumbai Hub'),
    employeeById('E-3', 'Cara Iyer', 'Engineering', 'Mumbai Hub'),
  ]
  const plans = [
    plan({ id: 'p1', employeeId: 'E-1', startDate: '2024-03-04', type: 'CL', status: 'Approved' }),
    plan({ id: 'p2', employeeId: 'E-2', startDate: '2024-03-05', type: 'SL', status: 'Planned' }),
    plan({ id: 'p3', employeeId: 'E-3', startDate: '2024-03-06', type: 'EL', status: 'Approved' }),
    plan({ id: 'p4', employeeId: 'E-999', startDate: '2024-03-07', type: 'CL', status: 'Planned' }),
    plan({ id: 'p5', employeeId: 'E-1', startDate: '2024-03-08', type: 'LOP', status: 'Cancelled' }),
  ]
  const ids = (rows: LeavePlan[]) => rows.map((row) => row.id)

  it('returns every plan when no filters are supplied', () => {
    expect(ids(filterLeavePlans(plans, employees, {}))).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('filters by department and joins through the employee', () => {
    expect(ids(filterLeavePlans(plans, employees, { department: 'Engineering' }))).toEqual([
      'p1',
      'p3',
      'p5',
    ])
  })

  it('filters by location', () => {
    expect(ids(filterLeavePlans(plans, employees, { location: 'Mumbai Hub' }))).toEqual(['p2', 'p3'])
  })

  it('combines department and location', () => {
    expect(ids(filterLeavePlans(plans, employees, { department: 'Engineering', location: 'Mumbai Hub' }))).toEqual([
      'p3',
    ])
  })

  it('searches employee name and id case-insensitively', () => {
    expect(ids(filterLeavePlans(plans, employees, { search: 'alice' }))).toEqual(['p1', 'p5'])
    expect(ids(filterLeavePlans(plans, employees, { search: '  E-2 ' }))).toEqual(['p2'])
    expect(ids(filterLeavePlans(plans, employees, { search: 'E-999' }))).toEqual(['p4'])
    expect(ids(filterLeavePlans(plans, employees, { search: 'nobody' }))).toEqual([])
  })

  it('filters by type and status with ALL as the no-op value', () => {
    expect(ids(filterLeavePlans(plans, employees, { type: 'CL' }))).toEqual(['p1', 'p4'])
    expect(ids(filterLeavePlans(plans, employees, { type: 'ALL' }))).toHaveLength(5)
    expect(ids(filterLeavePlans(plans, employees, { status: 'Cancelled' }))).toEqual(['p5'])
    expect(ids(filterLeavePlans(plans, employees, { status: 'ALL' }))).toHaveLength(5)
  })

  it('intersects every supplied filter', () => {
    expect(
      ids(filterLeavePlans(plans, employees, { search: 'alice', type: 'CL', status: 'Approved' })),
    ).toEqual(['p1'])
    expect(
      ids(filterLeavePlans(plans, employees, { search: 'alice', type: 'SL' })),
    ).toEqual([])
  })

  it('excludes plans whose employee is missing when an employee filter is active', () => {
    expect(ids(filterLeavePlans(plans, employees, { department: 'Engineering' }))).not.toContain('p4')
    expect(ids(filterLeavePlans(plans, employees, { location: 'Mumbai Hub' }))).not.toContain('p4')
  })
})
