import { toISODate } from './dates'

/**
 * Effective-dated statutory rates.
 *
 * A statutory figure is not a constant: it is in force from a date. Storing it
 * as a schedule, resolved against an explicit date, is what keeps a stale rate
 * from silently surviving a revision. `from` is a `YYYY-MM-DD` calendar date and
 * is **inclusive** — the new rate applies on its commencement date, not the day
 * after. Dates are compared as strings; `YYYY-MM-DD` sorts chronologically, and
 * constructing `Date` objects here would reintroduce timezone dependence into a
 * purely calendar question.
 */

export interface EffectiveRate<T> {
  /** Commencement date, `YYYY-MM-DD`, inclusive. */
  readonly from: string
  readonly value: T
}

/**
 * The entry in force on `asOf`: the greatest `from` that is `<= asOf`.
 *
 * If `asOf` precedes every entry, the earliest entry is returned — we assume the
 * earliest known regime rather than inventing a value. Pre-2014 payroll is out of
 * scope. Declaration order does not matter.
 *
 * An empty schedule is a programming error, not a date question, so it throws
 * instead of returning `undefined` to a caller that expects a rate.
 */
export function rateAsOf<T>(schedule: readonly EffectiveRate<T>[], asOf: string): T {
  if (schedule.length === 0) {
    throw new Error('rateAsOf requires a non-empty schedule')
  }

  let earliest = schedule[0]
  let chosen: EffectiveRate<T> | undefined

  for (const entry of schedule) {
    if (entry.from < earliest.from) earliest = entry
    if (entry.from <= asOf && (chosen === undefined || entry.from > chosen.from)) {
      chosen = entry
    }
  }

  return (chosen ?? earliest).value
}

/**
 * EPF wage ceiling, in rupees per month.
 *
 * ₹15,000 from 1 September 2014.
 *
 * ₹25,000 with effect from 17 September 2026 — Gazette of India **S.O. 5109(E)**,
 * Ministry of Labour and Employment, 17 September 2026, made under clause (89) of
 * section 2 of the Code on Social Security 2020. It supersedes S.O. 2702(E) of
 * 29 May 2026. Corroborated by the PIB release "Cabinet Approves Higher EPFO Wage
 * Ceiling of Rs. 25,000" and the PMO release of 16 September 2026.
 *
 * Re-verify against the gazette before changing or extending this schedule.
 */
export const EPF_WAGE_CEILING_SCHEDULE: readonly EffectiveRate<number>[] = [
  { from: '2014-09-01', value: 15000 },
  { from: '2026-09-17', value: 25000 },
]

/** EPF wage ceiling in force on `asOf` (`YYYY-MM-DD`). */
export function epfWageCeiling(asOf: string): number {
  return rateAsOf(EPF_WAGE_CEILING_SCHEDULE, asOf)
}

/**
 * EPF wage ceiling in force today, read from LOCAL calendar components via
 * `toISODate`. Never build this string with `toISOString()`, which shifts the
 * date a day back east of Greenwich.
 */
export function epfWageCeilingToday(): number {
  return epfWageCeiling(toISODate(new Date()))
}
