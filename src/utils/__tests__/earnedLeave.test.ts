import { describe, it, expect } from 'vitest'
import { earnedLeaveBalance } from '../leave'
import type { Employee } from '../../types'

const base = {
  id: 'E1', name: 'A', email: 'a@x.io', phone: '', department: 'Engineering & Technology',
  deptId: 'eng', role: 'R', location: 'Bengaluru HQ', doj: '2020-01-01', monthlyCTC: 1,
  basicSalary: 45000, hra: 1, specialAllowance: 1, status: 'Active', gender: 'Female',
  performanceRating: 3, reportsTo: null, presentDays: 0,
  clBalance: 0, slBalance: 0, elBalance: 0, lopDays: 0, uan: '1',
} satisfies Employee

// This figure feeds the leave-encashment line of the final settlement
// statement: (basic / 30) * min(unusedLeaves, 30). A genuine 0 must therefore
// stay 0, not be promoted to a positive number of encashable days.
describe('earnedLeaveBalance', () => {
  it('keeps a genuine zero earned-leave balance at zero', () => {
    expect(earnedLeaveBalance({ ...base, elBalance: 0 } as Employee)).toBe(0)
  })

  it('reads the stored balance verbatim when it is usable', () => {
    expect(earnedLeaveBalance({ ...base, elBalance: 18 } as Employee)).toBe(18)
  })

  it('reports 0 rather than an unusable balance', () => {
    expect(earnedLeaveBalance({ ...base, elBalance: NaN } as Employee)).toBe(0)
    expect(earnedLeaveBalance({ ...base, elBalance: undefined } as unknown as Employee)).toBe(0)
  })

  it('never yields a negative number of encashable days', () => {
    expect(earnedLeaveBalance({ ...base, elBalance: -4 } as Employee)).toBe(0)
  })
})