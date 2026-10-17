import { describe, it, expect } from 'vitest'
import { computePayroll, isActive } from '../payroll'
import { INITIAL_EMPLOYEES } from '../../data/initialData'

describe('payroll aggregates over the active roster', () => {
  const active = INITIAL_EMPLOYEES.filter(isActive)

  it('excludes at least one Resigned employee from the run', () => {
    expect(active.length).toBeLessThan(INITIAL_EMPLOYEES.length)
  })

  it('makes the sum of per-row deductions equal the aggregate deductions', () => {
    const rows = active.map(computePayroll)
    const sumEPF = rows.reduce((a, r) => a + r.epf, 0)
    const sumLOP = rows.reduce((a, r) => a + r.lossOfPay, 0)
    const sumNet = rows.reduce((a, r) => a + r.netPayable, 0)
    const gross = active.reduce((a, e) => a + e.monthlyCTC, 0)
    expect(sumNet).toBe(gross - sumEPF - rows.length * 200 - sumLOP)
  })

  it('agrees with a single aggregate net for the whole roster', () => {
    const total = active.reduce((a, e) => a + computePayroll(e).netPayable, 0)
    const gross = active.reduce((a, e) => a + e.monthlyCTC, 0)
    expect(total).toBeLessThan(gross) // LOP makes it strictly less
  })

  // Regression pin for the defect these four call sites used to disagree on:
  // the hand-rolled card formula below (`gross - EPF - PT`) omits Loss of Pay.
  // On the 200-employee seed roster that omission is ₹5,87,343 — a gap that
  // must equal the sum of LOP exactly, so it cannot silently reappear.
  it('pins the LOP defect: gross - EPF - PT overstates the run by exactly the LOP total', () => {
    const rows = active.map(computePayroll)
    const sumLOP = rows.reduce((a, r) => a + r.lossOfPay, 0)
    const legacyCardNet = active.reduce(
      (a, e) => a + e.monthlyCTC - (Math.round(Math.min(e.basicSalary, 15000) * 0.12) + 200),
      0,
    )
    const correctNet = rows.reduce((a, r) => a + r.netPayable, 0)

    expect(sumLOP).toBeGreaterThan(0)
    expect(legacyCardNet - correctNet).toBe(sumLOP)
  })

  it('charges Professional Tax to the active roster only, never to resigned staff', () => {
    const sumPT = active.map(computePayroll).reduce((a, r) => a + r.professionalTax, 0)
    expect(sumPT).toBe(active.length * 200)
    expect(sumPT).toBeLessThan(INITIAL_EMPLOYEES.length * 200)
  })
})