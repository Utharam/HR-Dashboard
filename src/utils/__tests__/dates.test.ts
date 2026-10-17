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

  // Part-year coverage. A tenure is `whole completed years + (days served since
  // the last anniversary / days in that service year)`, so an `asOf` landing
  // exactly on an anniversary always yields a fraction of 0. Only an
  // off-anniversary `asOf` can pin the part-year at all - which is precisely the
  // gap that let the fraction be silently dropped. Every case passes an explicit
  // `asOf`, so none of them can drift with the wall clock.

  it('keeps the part-year when asOf is not on an anniversary', () => {
    // doj 2019-06-15, asOf 2024-03-20.
    // 4 completed years (2019-06-15 -> 2023-06-15). The 2023-06-15 -> 2024-06-15
    // service year is 366 days because it contains 2024-02-29. Of those, 279 have
    // been served: 200 days to 2024-01-01, then 79 more.
    expect(computeTenureYears('2019-06-15', new Date(2024, 2, 20))).toBeCloseTo(4 + 279 / 366, 10)
  })

  it('keeps a part-year above six months, which rounds UP to a higher whole year', () => {
    // doj 2020-01-15, asOf 2026-10-17.
    // 6 completed years, because the 2026-01-15 anniversary has already passed.
    // The 2026-01-15 -> 2027-01-15 service year is 365 days (2026 is not a leap
    // year), and 275 of them have been served: day-of-year 290 minus 15.
    //
    // 0.7534 is above 0.5, so Payment of Gratuity rounding counts this employee as
    // 7 completed years. An implementation that loses the fraction instead reports
    // exactly 6.0 and rounds DOWN to 6 - a full year of service and a materially
    // smaller gratuity for the same person. This is the case that must fail if the
    // part-year is ever dropped again.
    expect(computeTenureYears('2020-01-15', new Date(2026, 9, 17))).toBeCloseTo(6 + 275 / 365, 10)
  })

  it('rounds a joiner under six months down', () => {
    // doj 2024-01-15, asOf 2024-04-20: 96 days served of a 366-day service year
    // (2024 is a leap year), i.e. 0.2623 - well below the 0.5 threshold.
    //
    // Pins current behaviour: `computeTenureYears` short-circuits to 0 for anyone
    // with under a full year of service, so the 0.2623 part-year is not reported.
    // Harmless for the statutory result - 0 and 0.2623 both round to 0 completed
    // years and neither is eligible - but the fraction is discarded here.
    expect(computeTenureYears('2024-01-15', new Date(2024, 3, 20))).toBe(0)
  })

  it('cannot round a joiner past six months up to 1 year - the fraction is dropped', () => {
    // doj 2024-01-15, asOf 2024-08-20: 218 days of a 366-day service year = 0.5956,
    // which IS above the 0.5 threshold and would round UP to 1 completed year.
    //
    // The same `whole <= 0` guard returns 0, so that round-up is unreachable
    // through this function. No payment consequence - a sub-year tenure cannot
    // reach the 5-year eligibility threshold or the Rs 20,00,000 cap either way -
    // but the figure shown for a 7-month employee is 0 rather than 0.6. Pinned so
    // it cannot change silently.
    expect(computeTenureYears('2024-01-15', new Date(2024, 7, 20))).toBe(0)
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