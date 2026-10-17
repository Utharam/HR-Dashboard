import * as XLSX from 'xlsx'

/**
 * Timezone-independent date handling for the HR roster.
 *
 * Every helper here works in LOCAL calendar components and never calls
 * `toISOString()`. A `Date` built as `new Date(2021, 2, 15)` is local midnight;
 * converting that to UTC is 2021-03-14T18:30Z in India (UTC+05:30), so
 * `.toISOString().slice(0, 10)` silently shifted every joining date back one
 * day — and tenure, gratuity eligibility and the ₹20,00,000 statutory cap all
 * hang off that field. Arithmetic therefore goes through `Date.UTC` on the
 * *components*, which is timezone-invariant without touching local midnight.
 *
 * A value that cannot be understood returns `null` instead of a plausible
 * default: the previous silent `'2023-01-15'` fallback manufactured a fake
 * tenure for unparseable input rather than reporting that the data is bad.
 */

/** Working days in an Indian payroll month; the attendance denominator. */
export const WORKING_DAYS_PER_MONTH = 26

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const SLASH_DATE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
const MS_PER_DAY = 86400000

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Rebuild a date from components and confirm the components survived the round trip. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const probe = new Date(year, month - 1, day)
  probe.setFullYear(year)
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  )
}

function fromParts(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

/** Days elapsed between two calendar dates, immune to daylight-saving shifts. */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      MS_PER_DAY,
  )
}

/**
 * Formats a Date from its LOCAL calendar components.
 *
 * `toISODate(new Date(2021, 2, 15))` is `'2021-03-15'` in every timezone,
 * which is the only reason this function exists.
 */
export function toISODate(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Parses whatever a spreadsheet cell can hold into a `YYYY-MM-DD` string,
 * or `null` when the value cannot be understood.
 *
 * Slash dates are read the way an Indian roster is written: a component above
 * 12 can only be a day, and when both are ≤ 12 the day-first reading wins.
 * `'12/31/2021'` therefore becomes `'2021-12-31'` rather than the impossible
 * `'2021-31-12'` the previous hardcoded DD/MM branch produced.
 */
export function parseSpreadsheetDate(val: unknown): string | null {
  if (val === null || val === undefined) return null

  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : toISODate(val)
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val <= 0 || val >= 100000) return null
    try {
      const decoded = XLSX.SSF.parse_date_code(val)
      if (!decoded || !decoded.y || !decoded.m || !decoded.d) return null
      return fromParts(decoded.y, decoded.m, decoded.d)
    } catch {
      return null
    }
  }

  const str = String(val).trim()
  if (!str) return null

  const iso = str.match(ISO_DATE)
  if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const slash = str.match(SLASH_DATE)
  if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const year = Number(slash[3])
    // > 12 can only be a day; otherwise fall back to day-first (Indian roster).
    const [day, month] = first > 12 || second <= 12 ? [first, second] : [second, first]
    return fromParts(year, month, day)
  }

  const fallback = Date.parse(str)
  if (Number.isNaN(fallback)) return null
  return toISODate(new Date(fallback))
}

/**
 * Fractional years of service from a `YYYY-MM-DD` joining date, or `null` when
 * the date is blank or unusable — never `NaN`.
 *
 * Whole years are counted by anniversary and the remainder is the fraction of
 * the year actually served, so an employee is exactly N years old on their
 * anniversary date rather than a day-count approximation of one. The fraction is
 * reported for sub-year service too; rounding to whole years is the consumer's
 * job. A joining date in the future yields 0, not a negative tenure.
 */
export function computeTenureYears(doj: string, asOf: Date = new Date()): number | null {
  if (typeof doj !== 'string') return null
  if (Number.isNaN(asOf.getTime())) return null

  const match = doj.trim().match(ISO_DATE)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!isRealDate(year, month, day)) return null

  let whole = asOf.getFullYear() - year
  // Decrement only if the anniversary for `whole` is still ahead of asOf. The
  // comparison must be measured from asOf: measuring from `joined` is a
  // past-to-past interval that is always positive, which decremented every
  // time and let the fraction below saturate at 1, discarding the part-year.
  if (daysBetween(asOf, new Date(year + whole, month - 1, day)) > 0) whole -= 1

  const lastAnniversary = new Date(year + whole, month - 1, day)
  lastAnniversary.setFullYear(year + whole)
  const nextAnniversary = new Date(year + whole + 1, month - 1, day)
  nextAnniversary.setFullYear(year + whole + 1)

  const served = daysBetween(lastAnniversary, asOf)
  const span = daysBetween(lastAnniversary, nextAnniversary)
  const fraction = span > 0 ? served / span : 0

  // No early-out on `whole <= 0`: a sub-year joiner still has a real part-year to
  // report, and the consumer (computeStatutoryGratuity) applies the 6-months-round-up
  // rule itself, so pre-rounding here would only discard information. Clamping the
  // final value at 0 is what keeps a future date of joining from going negative.
  return Math.max(0, whole + Math.min(Math.max(fraction, 0), 1))
}

/**
 * Attendance as a percentage of the working month, to one decimal place.
 *
 * This is the single replacement for the persisted `attendancePct` column and
 * reproduces the seed roster's existing convention exactly (22 of 26 → 84.6).
 */
export function computeAttendancePct(presentDays: number): number {
  const days = Number.isFinite(presentDays) ? presentDays : 0
  const clamped = Math.min(WORKING_DAYS_PER_MONTH, Math.max(0, days))
  return Math.round((clamped / WORKING_DAYS_PER_MONTH) * 1000) / 10
}