import { describe, it, expect } from 'vitest'
import { sumLeaveBalances } from '../leave'
import type { Employee } from '../../types'

// The brief wrote `Omit<Employee, 'id'>` on a fixture that includes `id`, which
// tsc rejects (TS2353); the fixture is a complete Employee, so it is checked as one.
const base = {
  id: 'E1', name: 'A', email: 'a@x.io', phone: '', department: 'Engineering & Technology',
  deptId: 'eng', role: 'R', location: 'Bengaluru HQ', doj: '2020-01-01', monthlyCTC: 1,
  basicSalary: 1, hra: 1, specialAllowance: 1, status: 'Active', gender: 'Female',
  performanceRating: 3, reportsTo: null, presentDays: 0,
  clBalance: 0, slBalance: 0, elBalance: 0, lopDays: 0, uan: '1',
} satisfies Employee

describe('sumLeaveBalances', () => {
  it('treats a genuine zero balance as zero', () => {
    expect(sumLeaveBalances([{ ...base, id: 'E1' } as Employee]).total).toBe(0)
  })
  it('sums the three leave buckets independently', () => {
    const r = sumLeaveBalances([{ ...base, clBalance: 3, slBalance: 4, elBalance: 5 } as Employee])
    expect(r).toEqual({ casual: 3, sick: 4, earned: 5, total: 12 })
  })
  it('never yields a negative total from an over-drawn balance', () => {
    expect(sumLeaveBalances([{ ...base, clBalance: -5 } as Employee]).casual).toBe(0)
  })
})
