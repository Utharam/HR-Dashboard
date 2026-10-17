import { describe, it, expect } from 'vitest'
import { INITIAL_EMPLOYEES } from '../../data/initialData'
import { computeAttendancePct } from '../dates'

describe('Employee seed integrity', () => {
  it('does not persist a denormalised attendancePct field', () => {
    expect('attendancePct' in INITIAL_EMPLOYEES[0]).toBe(false)
  })
  it('recomputes attendance from presentDays for every seed row', () => {
    for (const e of INITIAL_EMPLOYEES) {
      expect(computeAttendancePct(e.presentDays)).toBeGreaterThanOrEqual(0)
      expect(computeAttendancePct(e.presentDays)).toBeLessThanOrEqual(100)
    }
  })
})