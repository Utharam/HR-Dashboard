import { describe, it, expect } from 'vitest'
import { toISODate, parseSpreadsheetDate, computeTenureYears, computeAttendancePct } from '../dates'

describe('toISODate', () => {
  it('formats from local components, not UTC', () => {
    expect(toISODate(new Date(2021, 2, 15))).toBe('2021-03-15')
  })
  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2021, 0, 5))).toBe('2021-01-05')
  })
})

describe('parseSpreadsheetDate', () => {
  it('passes through an ISO date unchanged', () => {
    expect(parseSpreadsheetDate('2021-03-15')).toBe('2021-03-15')
  })
  it('reads an unambiguous DD/MM/YYYY as day-first', () => {
    expect(parseSpreadsheetDate('15/03/2021')).toBe('2021-03-15')
  })
  it('reads an unambiguous MM/DD/YYYY as month-first', () => {
    expect(parseSpreadsheetDate('03/15/2021')).toBe('2021-03-15')
  })
  it('never returns a month above 12', () => {
    const r = parseSpreadsheetDate('12/31/2021')
    expect(r).not.toBeNull()
    expect(Number(r!.slice(5, 7))).toBeLessThanOrEqual(12)
  })
  it('defaults an ambiguous slash date to day-first for an Indian roster', () => {
    expect(parseSpreadsheetDate('05/03/2021')).toBe('2021-03-05')
  })
  it('formats a textual date without shifting a day', () => {
    expect(parseSpreadsheetDate('March 15, 2021')).toBe('2021-03-15')
  })
  it('decodes an Excel serial date', () => {
    expect(parseSpreadsheetDate(44927)).toBe('2023-01-01')
  })
  it('returns null for an unparseable value rather than a fake date', () => {
    expect(parseSpreadsheetDate('not a date')).toBeNull()
  })
  it('returns null for an impossible ISO date', () => {
    expect(parseSpreadsheetDate('2021-02-30')).toBeNull()
  })
})

describe('computeTenureYears', () => {
  it('computes fractional tenure from a DOJ string', () => {
    const t = computeTenureYears('2020-01-01', new Date(2026, 0, 1))
    expect(t).toBeCloseTo(6, 5)
  })
  it('returns null for a blank DOJ instead of NaN', () => {
    expect(computeTenureYears('')).toBeNull()
  })
  it('never returns a negative tenure for a future DOJ', () => {
    expect(computeTenureYears('2099-01-01', new Date(2026, 0, 1))).toBe(0)
  })
})

describe('computeAttendancePct', () => {
  it('computes 22 of 26 working days as 84.6%', () => {
    expect(computeAttendancePct(22)).toBe(84.6)
  })
  it('computes a full month as 100%', () => {
    expect(computeAttendancePct(26)).toBe(100)
  })
  it('keeps a genuine zero at zero', () => {
    expect(computeAttendancePct(0)).toBe(0)
  })
  it('clamps above the working month', () => {
    expect(computeAttendancePct(30)).toBe(100)
  })
})