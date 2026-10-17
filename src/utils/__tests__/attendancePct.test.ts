import { describe, it, expect } from 'vitest'
import { INITIAL_EMPLOYEES } from '../../data/initialData'
import { computeAttendancePct } from '../dates'

describe('Employee seed integrity', () => {
  // Checked across EVERY row rather than just the first: inspecting a single row
  // would let 199 stale copies of the denormalised field ship undetected.
  it('does not persist a denormalised attendancePct field on any seed row', () => {
    const offenders = INITIAL_EMPLOYEES.filter(e => 'attendancePct' in e)
    expect(offenders).toEqual([])
  })

  // Replaces a range assertion that could never fail: computeAttendancePct clamps
  // to [0, 26] and rounds by construction, so "is between 0 and 100" was vacuous.
  // What actually matters downstream is finiteness - the Overview KPI sums this
  // across the roster, so a single NaN would poison the whole average.
  it('derives a finite attendance percentage for every seed row and domain edge', () => {
    const inputs = [...INITIAL_EMPLOYEES.map(e => e.presentDays), 0, 26, 30, -5]
    const results = inputs.map(presentDays => computeAttendancePct(presentDays))
    expect(results.every(v => Number.isFinite(v))).toBe(true)
  })
})