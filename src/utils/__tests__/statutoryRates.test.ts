import { describe, it, expect } from 'vitest'
import { rateAsOf, epfWageCeiling, EPF_WAGE_CEILING_SCHEDULE, type EffectiveRate } from '../statutoryRates'

const sched: readonly EffectiveRate<string>[] = [
  { from: '2020-01-01', value: 'old' },
  { from: '2024-06-15', value: 'new' },
]

describe('rateAsOf', () => {
  it('returns the entry in force on the given date', () => {
    expect(rateAsOf(sched, '2024-06-15')).toBe('new')
  })
  it('treats from as inclusive and does not apply it a day early', () => {
    expect(rateAsOf(sched, '2024-06-14')).toBe('old')
  })
  it('returns the latest entry for a date past the end of the schedule', () => {
    expect(rateAsOf(sched, '2099-01-01')).toBe('new')
  })
  it('falls back to the earliest entry for a date before the schedule begins', () => {
    expect(rateAsOf(sched, '1990-01-01')).toBe('old')
  })
  it('does not depend on the order entries are declared in', () => {
    expect(rateAsOf([...sched].reverse(), '2024-06-15')).toBe('new')
  })
})

describe('epfWageCeiling', () => {
  it('is 15000 under the pre-2026 regime', () => {
    expect(epfWageCeiling('2026-09-16')).toBe(15000)
  })
  it('is 25000 from 17 September 2026', () => {
    expect(epfWageCeiling('2026-09-17')).toBe(25000)
  })
  it('carries the 25000 ceiling into the following year', () => {
    expect(epfWageCeiling('2027-04-01')).toBe(25000)
  })
  it('schedules the 2026 change with its gazette date', () => {
    expect(EPF_WAGE_CEILING_SCHEDULE.some(r => r.from === '2026-09-17' && r.value === 25000)).toBe(true)
  })
})
