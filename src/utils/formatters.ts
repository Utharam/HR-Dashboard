/**
 * Display formatters for Indian currency and statutory settlement figures.
 *
 * The governing rule here: a broken input must never render as a confident
 * zero. `Math.round(val || 0)` mapped `NaN` to `0`, so an unparseable tenure
 * surfaced on a settlement statement as a legitimate-looking `₹0` owed.
 * Non-finite values now render as an em dash, which reads as "no figure" and
 * forces the caller to deal with the missing number.
 */

const EM_DASH = '—';

/** Normalise `-0` to `0` so no formatter emits a negative zero. */
function toDisplayNumber(val: number): number {
  const rounded = Math.round(val);
  return rounded === 0 ? 0 : rounded;
}

export function formatINR(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return new Intl.NumberFormat('en-IN').format(toDisplayNumber(val));
}

export function formatLakhs(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return `₹${(val / 100000).toFixed(1)}L`;
}

export function formatCrores(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return `₹${(val / 10000000).toFixed(2)} Cr`;
}

export interface StatutoryGratuity {
  gratuity: number;
  roundedTenure: number;
  eligible: boolean;
  /**
   * True when either input was unusable (absent, NaN, infinite or negative).
   * Consumers must check this before trusting `gratuity`: the old eligibility
   * test was `roundedTenure < 5`, which is `false` for `NaN` and therefore sent
   * an unparseable tenure down the *eligible* branch.
   */
  invalid: boolean;
}

// Payment of Gratuity Act 1972 statutory tenure rounding:
// If service fraction >= 6 months (0.5 years), round UP to next completed year.
export function computeStatutoryGratuity(basicSalary: number, tenureYears: number | null): StatutoryGratuity {
  const unusable =
    !Number.isFinite(basicSalary) ||
    basicSalary < 0 ||
    tenureYears === null ||
    !Number.isFinite(tenureYears) ||
    tenureYears < 0;

  if (unusable) {
    return { gratuity: 0, roundedTenure: 0, eligible: false, invalid: true };
  }

  const fraction = tenureYears - Math.floor(tenureYears);
  const roundedTenure = fraction >= 0.5 ? Math.ceil(tenureYears) : Math.floor(tenureYears);

  if (roundedTenure < 5) {
    return { gratuity: 0, roundedTenure, eligible: false, invalid: false };
  }

  // Statutory Formula: (15 * Last Basic * Rounded Tenure) / 26
  const rawGratuity = Math.round((15 * basicSalary * roundedTenure) / 26);
  // Statutory ceiling cap of ₹20,00,000 (Payment of Gratuity Amendment Act 2018)
  const cappedGratuity = Math.min(rawGratuity, 2000000);

  return { gratuity: cappedGratuity, roundedTenure, eligible: true, invalid: false };
}