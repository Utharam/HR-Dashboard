import type { Employee } from '../types'

/**
 * Single source of truth for Indian payroll arithmetic.
 *
 * Every consumer (payroll summary card, per-row table, payslip modal and the
 * exported payroll register) must derive its figures from here so they cannot
 * drift apart. In particular `netPayable` deducts Loss of Pay: omitting it
 * overstated disbursable payroll by the full LOP total.
 */

export const EPF_WAGE_CEILING = 15000
export const EPF_RATE = 0.12
export const PROFESSIONAL_TAX = 200
export const WORKING_DAYS_PER_MONTH = 26

export interface PayrollBreakdown {
  gross: number
  basic: number
  hra: number
  specialAllowance: number
  epf: number
  professionalTax: number
  lossOfPay: number
  totalDeductions: number
  netPayable: number
}

/** Coerce anything unusable (NaN, Infinity, negative) to 0 so payroll never shows NaN. */
function safeAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

export function computeEPF(basicSalary: number): number {
  const basic = safeAmount(basicSalary)
  if (basic === 0) return 0
  return Math.round(Math.min(basic, EPF_WAGE_CEILING) * EPF_RATE)
}

export function computeLOP(basicSalary: number, lopDays: number): number {
  const basic = safeAmount(basicSalary)
  if (basic === 0) return 0
  if (!Number.isFinite(lopDays)) return 0
  // Clamp to the working month so a corrupt day count cannot run away.
  const days = Math.min(Math.max(lopDays, 0), WORKING_DAYS_PER_MONTH)
  if (days === 0) return 0
  return Math.round((basic / WORKING_DAYS_PER_MONTH) * days)
}

export function computePayroll(employee: Employee): PayrollBreakdown {
  const gross = safeAmount(employee.monthlyCTC)
  const basic = safeAmount(employee.basicSalary)
  const hra = safeAmount(employee.hra)
  const specialAllowance = safeAmount(employee.specialAllowance)

  const epf = computeEPF(basic)
  const professionalTax = PROFESSIONAL_TAX
  const lossOfPay = computeLOP(basic, employee.lopDays)
  const totalDeductions = epf + professionalTax + lossOfPay

  return {
    gross,
    basic,
    hra,
    specialAllowance,
    epf,
    professionalTax,
    lossOfPay,
    totalDeductions,
    netPayable: gross - totalDeductions,
  }
}

/** Resigned staff are not part of the payroll run; Probation and Notice Period are. */
export function isActive(employee: Employee): boolean {
  return employee.status !== 'Resigned'
}
