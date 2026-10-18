import type { Employee } from '../types'

/**
 * Single source of truth for the leave-balance KPI.
 *
 * The roster stores *remaining* balances (days still available), not days
 * consumed, so the only honest aggregate is the balance itself. The previous
 * site subtracted a hardcoded entitlement (`12 - (e.clBalance || 8)`) from a
 * remaining balance and published the result as "Leaves Availed"; that is
 * negative for every employee holding more EL than the 15-day cap assumed, and
 * the `|| 8` promoted a genuine zero balance to 8. Both are gone: this sums
 * what the data actually holds.
 */

/** Coerce anything unusable (missing, NaN, negative) to 0 so the KPI cannot go negative. */
function safeBalance(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0
  return value
}

export interface LeaveBalanceTotals {
  casual: number
  sick: number
  earned: number
  total: number
}

export function sumLeaveBalances(employees: Employee[]): LeaveBalanceTotals {
  let casual = 0
  let sick = 0
  let earned = 0

  for (const employee of employees) {
    casual += safeBalance(employee.clBalance)
    sick += safeBalance(employee.slBalance)
    earned += safeBalance(employee.elBalance)
  }

  return { casual, sick, earned, total: casual + sick + earned }
}

/**
 * One employee's encashable earned-leave days, through the same guard.
 *
 * This feeds the leave-encashment line of the final settlement statement —
 * `(basic / 30) * min(days, 30)` — which an exiting employee may act on. The
 * site this replaces read `emp.elBalance || 12`, so an employee who had
 * genuinely used every earned day (`elBalance: 0`) was credited 12 encashable
 * days: a fabricated settlement figure, not a display artefact. There is no
 * entitlement default to fall back on here; the record is either there or it
 * is not, and "not" is zero.
 */
export function earnedLeaveBalance(employee: Employee): number {
  return safeBalance(employee.elBalance)
}
