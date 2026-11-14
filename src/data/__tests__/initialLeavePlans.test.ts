import { describe, it, expect } from 'vitest'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { INITIAL_EMPLOYEES } from '../initialData'
import {
  eachDateKey,
  isValidDateKey,
  parseDateKey,
  toDateKey,
} from '../../utils/leavePlanner'
import { isLeavePlanRow } from '../../utils/rowValidators'

const NOW = new Date(2026, 0, 15, 9, 30, 0) // Thursday, 15 January 2026 (local)

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

describe('createInitialLeavePlans', () => {
  const plans = createInitialLeavePlans(NOW)

  it('returns ten plans with stable ids', () => {
    expect(plans.map((plan) => plan.id)).toEqual([
      'leave-seed-1',
      'leave-seed-2',
      'leave-seed-3',
      'leave-seed-4',
      'leave-seed-5',
      'leave-seed-6',
      'leave-seed-7',
      'leave-seed-8',
      'leave-seed-9',
      'leave-seed-10',
    ])
  })

  it('is deterministic for a fixed now', () => {
    expect(createInitialLeavePlans(NOW)).toEqual(plans)
  })

  it('produces rows the persistence validator accepts', () => {
    for (const plan of plans) {
      expect(isLeavePlanRow(plan)).toBe(true)
    }
  })

  it('uses real employees from the seed roster', () => {
    const employeeIds = new Set(INITIAL_EMPLOYEES.map((employee) => employee.id))
    for (const plan of plans) {
      expect(employeeIds.has(plan.employeeId)).toBe(true)
    }
  })

  it('spreads plans across distinct employees', () => {
    expect(new Set(plans.map((plan) => plan.employeeId)).size).toBe(plans.length)
  })

  it('starts every plan inside the 45 days after now', () => {
    const todayKey = toDateKey(NOW)
    const lastKey = toDateKey(addDays(NOW, 44))
    for (const plan of plans) {
      expect(isValidDateKey(plan.startDate)).toBe(true)
      expect(plan.startDate >= todayKey).toBe(true)
      expect(plan.startDate <= lastKey).toBe(true)
      expect(plan.endDate >= plan.startDate).toBe(true)
      expect(plan.endDate <= lastKey).toBe(true)
    }
  })

  it('never puts a plan start, end or covered day on a Sunday', () => {
    for (const plan of plans) {
      expect(parseDateKey(plan.startDate).getDay()).not.toBe(0)
      expect(parseDateKey(plan.endDate).getDay()).not.toBe(0)
      for (const key of eachDateKey(plan.startDate, plan.endDate)) {
        expect(parseDateKey(key).getDay()).not.toBe(0)
      }
    }
  })

  it('only uses half-days on single-day plans', () => {
    for (const plan of plans) {
      if (plan.halfDay !== null) {
        expect(plan.startDate).toBe(plan.endDate)
        expect(['AM', 'PM']).toContain(plan.halfDay)
      }
    }
  })

  it('uses known leave types and statuses', () => {
    const types = new Set([
      'CL',
      'SL',
      'EL',
      'LOP',
      'Maternity',
      'Paternity',
      'Comp Off',
      'Other',
    ])
    const statuses = new Set(['Planned', 'Approved', 'Cancelled'])
    for (const plan of plans) {
      expect(types.has(plan.type)).toBe(true)
      expect(statuses.has(plan.status)).toBe(true)
    }
    expect(plans.some((plan) => plan.status === 'Cancelled')).toBe(true)
  })

  it('stamps created and updated timestamps from now', () => {
    for (const plan of plans) {
      expect(plan.createdAt).toBe(NOW.toISOString())
      expect(plan.updatedAt).toBe(NOW.toISOString())
    }
  })

  it('defaults to the current date when now is omitted', () => {
    const seeded = createInitialLeavePlans()
    expect(seeded).toHaveLength(10)
    for (const plan of seeded) {
      expect(isLeavePlanRow(plan)).toBe(true)
    }
  })
})
