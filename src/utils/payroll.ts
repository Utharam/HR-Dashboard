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
    // Floored at zero: an explicit ₹0 CTC (which `parseCurrencyCell` correctly reads as a
    // real amount) would otherwise carry a ₹200 Professional Tax deduction and a payslip
    // of -₹200, deflating the disbursable total. A negative net is never a real payment.
    netPayable: Math.max(0, gross - totalDeductions),
  }
}

/**
 * Resigned staff are not part of the payroll run; Probation and Notice Period are.
 *
 * `Unknown` is excluded too. An unresolved import is not evidence of employment: with
 * the old `status !== 'Resigned'` test, an unrecognised or blank status column put
 * those staff in the payroll run — generating PF, professional tax and a payslip for
 * someone the HRMS never confirmed was on the roster. The safer failure is to leave
 * them out of the disbursement until the status is resolved.
 *
 * This predicate is not self-enforcing; every consumer must apply it. It gates the
 * Payroll tab's aggregates and table figures (`PayrollSection`), the payroll-register
 * export (`App.tsx`) and the per-employee payslip (`EmployeeModal`). It deliberately
 * does NOT gate the staff-roster export or the roster views: a master roster is a
 * record of who is on file, not a statement of who is being paid, and batch B keeps
 * Resigned staff visible in the payroll table for the same reason.
 */
const PAYROLL_RUN_STATUSES: ReadonlySet<string> = new Set<Employee['status']>([
  'Active',
  'Probation',
  'Notice Period',
]);

export function isActive(employee: Employee): boolean {
  // An ALLOW-LIST, not `status !== 'Resigned' && status !== 'Unknown'`. The old test was
  // fail-open: any unrecognised string (only reachable through hand-edited storage, since
  // the parser normalises to the union) counted as evidence of employment. Naming the
  // includable members is the only version that actually fails closed - and `rowValidators`
  // is allowed to keep an unrecognised status on the roster because this predicate, its
  // consumer, now rejects it rather than paying it.
  return PAYROLL_RUN_STATUSES.has(employee.status);
}
