import { describe, it, expect } from 'vitest'
import {
  computeEPF, computeLOP, computePayroll, isActive,
  EPF_RATE, PROFESSIONAL_TAX,
} from '../payroll'
import { epfWageCeilingToday } from '../statutoryRates'
import type { Employee } from '../../types'

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 'EMP-1', name: 'Test', email: 't@x.io', phone: '+91 0000000000',
  department: 'Engineering & Technology', deptId: 'eng', role: 'Engineer',
  location: 'Bengaluru HQ', doj: '2020-01-01', monthlyCTC: 100000,
  basicSalary: 50000, hra: 25000, specialAllowance: 25000,
  status: 'Active', gender: 'Female', performanceRating: 4,
  reportsTo: null, presentDays: 26, clBalance: 8, slBalance: 8,
  elBalance: 12, lopDays: 0, uan: '100000000000',
  ...over,
})

describe('computeEPF', () => {
  it('defaults to the wage ceiling in force today', () => {
    expect(computeEPF(50000)).toBe(Math.round(epfWageCeilingToday() * EPF_RATE))
  })
  it('applies 12% below the ceiling', () => {
    expect(computeEPF(10000)).toBe(1200)
  })
  it('returns 0 for a non-finite basic salary', () => {
    expect(computeEPF(NaN)).toBe(0)
  })
  it('returns 0 for a negative basic salary', () => {
    expect(computeEPF(-5000)).toBe(0)
  })
})

describe('computeEPF against the wage ceiling schedule', () => {
  it('caps at 15000 before 17 September 2026', () => {
    expect(computeEPF(50000, '2026-09-16')).toBe(1800)
  })
  it('caps at 25000 from 17 September 2026', () => {
    expect(computeEPF(50000, '2026-09-17')).toBe(3000)
  })
  it('applies 12% below the ceiling on both sides of the change', () => {
    expect(computeEPF(10000, '2026-09-16')).toBe(1200)
    expect(computeEPF(20000, '2026-09-17')).toBe(2400)
  })
  it('still returns 0 for a non-finite basic salary', () => {
    expect(computeEPF(NaN, '2026-09-17')).toBe(0)
  })
})

describe('computeLOP', () => {
  it('prorates a full working month at 26 days', () => {
    expect(computeLOP(26000, 1)).toBe(1000)
  })
  it('returns 0 for zero LOP days', () => {
    expect(computeLOP(26000, 0)).toBe(0)
  })
  it('clamps LOP days to the working month', () => {
    expect(computeLOP(26000, 99)).toBe(26000)
  })
  it('returns 0 for negative LOP days', () => {
    expect(computeLOP(26000, -3)).toBe(0)
  })
  it('returns 0 for a non-finite basic salary', () => {
    expect(computeLOP(NaN, 4)).toBe(0)
  })
})

describe('computePayroll', () => {
  it('deducts LOP from net payable', () => {
    const p = computePayroll(emp({ lopDays: 2 }))
    const expectedLOP = Math.round((50000 / 26) * 2)
    expect(p.lossOfPay).toBe(expectedLOP)
    expect(p.netPayable).toBe(p.gross - (p.epf + p.professionalTax + p.lossOfPay))
  })
  it('deducts Professional Tax from the net when there is no LOP', () => {
    const p = computePayroll(emp())
    expect(p.netPayable).toBe(100000 - (computeEPF(50000) + PROFESSIONAL_TAX))
  })
  it('never returns NaN for a corrupt CTC', () => {
    const p = computePayroll(emp({ monthlyCTC: NaN }))
    expect(Number.isFinite(p.netPayable)).toBe(true)
  })
  it('floors net payable at zero for a zero-CTC row', () => {
    // Professional Tax used to be charged unconditionally, so an explicit ₹0 CTC
    // produced netPayable = -200 and deflated the disbursable total.
    const p = computePayroll(emp({ monthlyCTC: 0, basicSalary: 0, hra: 0, specialAllowance: 0 }))
    expect(p.gross).toBe(0)
    expect(p.netPayable).toBe(0)
  })
})

describe('isActive', () => {
  it('excludes Resigned staff from the payroll run', () => {
    expect(isActive(emp({ status: 'Resigned' }))).toBe(false)
  })
  it('includes Probation and Notice Period staff', () => {
    expect(isActive(emp({ status: 'Probation' }))).toBe(true)
    expect(isActive(emp({ status: 'Notice Period' }))).toBe(true)
  })
  it('excludes Unknown staff: an unresolved import is not evidence of employment', () => {
    expect(isActive(emp({ status: 'Unknown' }))).toBe(false)
  })
  it('fails closed on a status outside the roster union', () => {
    // Only reachable through hand-edited storage, but a value the app does not
    // recognise must not be treated as evidence of employment.
    expect(isActive(emp({ status: 'Retiring' as Employee['status'] }))).toBe(false)
  })
})
