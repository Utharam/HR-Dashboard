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

/**
 * Normalise `-0` to `0` so no formatter emits a negative zero.
 *
 * `Math.round(-0.4)` is `-0`, and `(-0.4 / 100000).toFixed(1)` is `'-0.0'`, so
 * both the integer and fixed-decimal paths need it. `value === 0` is true for
 * both `0` and `-0`, so that comparison is enough for the numeric case.
 */
function toRoundedInt(val: number): number {
  const rounded = Math.round(val);
  return rounded === 0 ? 0 : rounded;
}

/** Fixed-decimal rendering that never starts with a minus sign for a zero value. */
function toFixedText(val: number, digits: number): string {
  const text = val.toFixed(digits);
  return /^-0(?:\.0+)?$/.test(text) ? text.slice(1) : text;
}

export function formatINR(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return new Intl.NumberFormat('en-IN').format(toRoundedInt(val));
}

export function formatLakhs(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return `₹${toFixedText(val / 100000, 1)}L`;
}

export function formatCrores(val: number): string {
  if (!Number.isFinite(val)) return EM_DASH;
  return `₹${toFixedText(val / 10000000, 2)} Cr`;
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