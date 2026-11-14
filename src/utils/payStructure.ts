/**
 * Configurable pay structures and the structure-aware payroll calculation.
 *
 * WHY THIS EXISTS
 *
 * `computePayroll` prices the split stored on the employee record (Basic/HRA/Special
 * columns). That was correct while the split was fixed at 50/25/25, but HR now owns
 * the company template and may override it per employee. This module is the single
 * source of truth for that richer domain:
 *
 *   - the component model and its validation rules;
 *   - `evaluateEarnings`, the ordered Basic-first earning evaluation;
 *   - `computePayrollWithStructure`, which adds monthly bonuses, EPF/PT toggles,
 *     LOP, employer EPF and the legacy named fields the payslip/exports use.
 *
 * `computePayroll` deliberately stays exactly as it was: it is the legacy contract
 * for callers (and tests) that price the stored employee split. The default
 * structure reproduces its arithmetic for the default 50/25/25 roster, which is the
 * fresh-install case; the structure-aware path is what the UI, exports and report
 * use from Phase B onward.
 *
 * Evaluation order is significant. The Basic component is computed first because a
 * PercentOfBasic line may appear before it in the component list; every line is
 * rounded to the rupee, and the single Remainder line absorbs CTC minus the other
 * earnings, floored at zero. Bonuses are added AFTER gross and never change EPF,
 * PT or LOP: they are a one-off earning, not a change to the salary structure.
 */

import type {
  Employee,
  PayComponent,
  PayComponentBasis,
  PayrollBonus,
  PayrollBonusKind,
  PayStructure,
  PayStructureOverride,
  PerformanceBonusRule,
} from '../types';
import { toISODate } from './dates';
import {
  PROFESSIONAL_TAX,
  computeEPF,
  computeLOP,
  type PayrollBreakdown,
} from './payroll';

/**
 * The fresh-install structure: today's 50% Basic / 50%-of-Basic HRA / remainder
 * Special split, EPF and Professional Tax on, and no automatic bonus.
 *
 * `updatedAt` is fixed rather than "now" so a default structure is deterministic:
 * it is a documented seed, not an edit that happened at import time.
 */
export const DEFAULT_PAY_STRUCTURE: PayStructure = {
  components: [
    { id: 'basic', name: 'Basic Salary', basis: 'PercentOfCTC', value: 50, isBasic: true },
    { id: 'hra', name: 'House Rent Allowance (HRA)', basis: 'PercentOfBasic', value: 50 },
    { id: 'special', name: 'Special Allowance', basis: 'Remainder', value: 0 },
  ],
  epfEnabled: true,
  professionalTaxEnabled: true,
  performanceBonusRules: [
    { rating: 5, percentOfBasic: 10 },
    { rating: 4, percentOfBasic: 5 },
    { rating: 3, percentOfBasic: 0 },
    { rating: 2, percentOfBasic: 0 },
    { rating: 1, percentOfBasic: 0 },
  ],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COMPONENT_BASES: readonly PayComponentBasis[] = [
  'PercentOfCTC',
  'PercentOfBasic',
  'Fixed',
  'Remainder',
];

const BONUS_KINDS: readonly PayrollBonusKind[] = ['Performance', 'Custom'];

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPayComponentBasis(value: unknown): value is PayComponentBasis {
  return typeof value === 'string' && COMPONENT_BASES.includes(value as PayComponentBasis);
}

function isPayrollBonusKind(value: unknown): value is PayrollBonusKind {
  return typeof value === 'string' && BONUS_KINDS.includes(value as PayrollBonusKind);
}

/** A deep copy so no caller can mutate the exported default through an instance. */
export function createDefaultPayStructure(): PayStructure {
  return {
    components: DEFAULT_PAY_STRUCTURE.components.map((component) => ({ ...component })),
    epfEnabled: DEFAULT_PAY_STRUCTURE.epfEnabled,
    professionalTaxEnabled: DEFAULT_PAY_STRUCTURE.professionalTaxEnabled,
    performanceBonusRules: DEFAULT_PAY_STRUCTURE.performanceBonusRules.map((rule) => ({
      ...rule,
    })),
    updatedAt: DEFAULT_PAY_STRUCTURE.updatedAt,
  };
}

function cloneStructure(structure: PayStructure): PayStructure {
  return {
    components: Array.isArray(structure.components)
      ? structure.components.map((component) => ({ ...component }))
      : [],
    epfEnabled: structure.epfEnabled,
    professionalTaxEnabled: structure.professionalTaxEnabled,
    performanceBonusRules: Array.isArray(structure.performanceBonusRules)
      ? structure.performanceBonusRules.map((rule) => ({ ...rule }))
      : [],
    updatedAt: structure.updatedAt,
  };
}

/**
 * The employee's effective structure: their override when one exists, otherwise
 * the company template.
 *
 * An override carries earnings and statutory toggles but not bonus rules. Bonus
 * rules are company policy, so a resolved override still reads the CURRENT company
 * rule set: HR editing a rating rule must not leave overridden employees priced
 * against a stale copy.
 */
export function resolvePayStructure(
  employeeId: string,
  structure: PayStructure,
  overrides: readonly PayStructureOverride[] = [],
): PayStructure {
  const override = overrides.find((row) => row.employeeId === employeeId);
  if (!override) return cloneStructure(structure);

  return {
    components: Array.isArray(override.components)
      ? override.components.map((component) => ({ ...component }))
      : [],
    epfEnabled: override.epfEnabled,
    professionalTaxEnabled: override.professionalTaxEnabled,
    performanceBonusRules: Array.isArray(structure.performanceBonusRules)
      ? structure.performanceBonusRules.map((rule) => ({ ...rule }))
      : [],
    updatedAt: override.updatedAt,
  };
}

function validateComponents(components: unknown, scope: 'structure' | 'override'): string[] {
  const prefix = scope === 'override' ? 'Override component' : 'Earning component';
  if (!Array.isArray(components)) return [`${prefix}s must be a list.`];
  if (components.length === 0) return ['Add at least one earning component.'];

  const errors: string[] = [];
  const ids = new Set<string>();
  let basicCount = 0;
  let remainderCount = 0;

  for (const raw of components) {
    const component = asRecord(raw);
    if (!component) {
      errors.push(`${prefix}s must be objects.`);
      continue;
    }

    if (!isNonEmptyString(component.id)) {
      errors.push(`Every ${prefix.toLowerCase()} needs an id.`);
    } else if (ids.has(component.id)) {
      errors.push(`Duplicate ${prefix.toLowerCase()} id "${component.id}".`);
    } else {
      ids.add(component.id);
    }

    if (!isNonEmptyString(component.name)) {
      errors.push(`Every ${prefix.toLowerCase()} needs a name.`);
    }

    if (!isPayComponentBasis(component.basis)) {
      errors.push(`Every ${prefix.toLowerCase()} needs a known basis.`);
      continue;
    }

    if (!isFiniteNumber(component.value) || component.value < 0) {
      errors.push(`${prefix} values must be finite and non-negative.`);
    } else if (
      (component.basis === 'PercentOfCTC' || component.basis === 'PercentOfBasic') &&
      component.value > 1000
    ) {
      errors.push('Percent values cannot exceed 1000.');
    }

    if (component.isBasic !== undefined && typeof component.isBasic !== 'boolean') {
      errors.push('The Basic flag must be true or false.');
    }

    if (component.isBasic === true) {
      basicCount += 1;
      if (component.basis === 'PercentOfBasic' || component.basis === 'Remainder') {
        errors.push('The Basic component cannot be a percentage of Basic or the remainder.');
      }
    }

    if (component.basis === 'Remainder') remainderCount += 1;
  }

  if (basicCount !== 1) errors.push('Exactly one earning component must be Basic.');
  if (remainderCount > 1) errors.push('Only one Remainder component is allowed.');

  return errors;
}

function validatePerformanceBonusRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return ['Performance bonus rules must be a list.'];

  const errors: string[] = [];
  const seen = new Set<number>();

  for (const raw of rules) {
    const rule = asRecord(raw);
    if (!rule) {
      errors.push('Performance bonus rules must be objects.');
      continue;
    }

    const rating = rule.rating;
    if (
      typeof rating !== 'number' ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      errors.push('Performance bonus ratings must be whole numbers from 1 to 5.');
      continue;
    }

    if (seen.has(rating)) {
      errors.push(`Rating ${rating} has more than one performance bonus rule.`);
    }
    seen.add(rating);

    const percent = rule.percentOfBasic;
    if (!isFiniteNumber(percent) || percent < 0) {
      errors.push('Performance bonus percentages must be finite and non-negative.');
    }
  }

  for (let rating = 1; rating <= 5; rating += 1) {
    if (!seen.has(rating)) {
      errors.push(`Add a performance bonus rule for rating ${rating}.`);
    }
  }

  return errors;
}

function validateFlags(
  record: Record<string, unknown>,
  scope: 'structure' | 'override',
): string[] {
  const prefix = scope === 'override' ? 'Override' : 'Structure';
  const errors: string[] = [];
  if (typeof record.epfEnabled !== 'boolean') {
    errors.push(`${prefix} EPF setting must be on or off.`);
  }
  if (typeof record.professionalTaxEnabled !== 'boolean') {
    errors.push(`${prefix} Professional Tax setting must be on or off.`);
  }
  return errors;
}

/** Human-readable validation errors; an empty array means the structure is valid. */
export function validatePayStructure(value: unknown): string[] {
  const structure = asRecord(value);
  if (!structure) return ['Pay structure must be an object.'];

  const errors = [
    ...validateComponents(structure.components, 'structure'),
    ...validateFlags(structure, 'structure'),
    ...validatePerformanceBonusRules(structure.performanceBonusRules),
  ];

  if (!isIsoTimestamp(structure.updatedAt)) {
    errors.push('Pay structure needs a valid updated timestamp.');
  }

  return errors;
}

/** Human-readable validation errors; an empty array means the override is valid. */
export function validatePayStructureOverride(value: unknown): string[] {
  const override = asRecord(value);
  if (!override) return ['Pay override must be an object.'];

  const errors: string[] = [];
  if (!isNonEmptyString(override.employeeId)) {
    errors.push('A pay override needs an employee.');
  }

  errors.push(...validateComponents(override.components, 'override'));
  errors.push(...validateFlags(override, 'override'));

  if (override.note !== undefined && typeof override.note !== 'string') {
    errors.push('A pay override note must be text.');
  }
  if (!isIsoTimestamp(override.updatedAt)) {
    errors.push('Pay override needs a valid updated timestamp.');
  }

  return errors;
}

/** Human-readable validation errors; an empty array means the bonus is valid. */
export function validatePayrollBonus(value: unknown): string[] {
  const bonus = asRecord(value);
  if (!bonus) return ['Payroll bonus must be an object.'];

  const errors: string[] = [];

  if (!isNonEmptyString(bonus.id)) errors.push('A payroll bonus needs an id.');
  if (!isNonEmptyString(bonus.employeeId)) errors.push('A payroll bonus needs an employee.');

  if (typeof bonus.monthKey !== 'string' || !MONTH_KEY.test(bonus.monthKey)) {
    errors.push('A payroll bonus needs a valid YYYY-MM month.');
  } else if (bonus.monthKey.startsWith('0000')) {
    errors.push('A payroll bonus needs a valid YYYY-MM month.');
  }

  if (!isPayrollBonusKind(bonus.kind)) {
    errors.push('A payroll bonus needs a known kind.');
  }

  if (!isNonEmptyString(bonus.label)) errors.push('A payroll bonus needs a label.');

  if (!isFiniteNumber(bonus.amount) || bonus.amount <= 0) {
    errors.push('A payroll bonus amount must be a positive finite number.');
  }

  if (bonus.note !== undefined && typeof bonus.note !== 'string') {
    errors.push('A payroll bonus note must be text.');
  }

  if (bonus.rating !== undefined) {
    if (bonus.kind === 'Custom') {
      errors.push('Only a performance bonus can carry a rating.');
    } else if (
      !isFiniteNumber(bonus.rating) ||
      !Number.isInteger(bonus.rating) ||
      bonus.rating < 1 ||
      bonus.rating > 5
    ) {
      errors.push('A performance bonus rating must be a whole number from 1 to 5.');
    }
  }

  if (!isIsoTimestamp(bonus.createdAt)) {
    errors.push('A payroll bonus needs a valid created timestamp.');
  }
  if (!isIsoTimestamp(bonus.updatedAt)) {
    errors.push('A payroll bonus needs a valid updated timestamp.');
  }

  return errors;
}

export interface EarningLine {
  componentId: string;
  name: string;
  basis: PayComponentBasis;
  value: number;
  amount: number;
}

export interface EarningsEvaluation {
  /** One line per component, in the structure's own display order. */
  earnings: EarningLine[];
  basic: number;
  gross: number;
  remainder: number;
}

/** Coerce anything unusable (NaN, Infinity, negative) to 0 so payroll never shows NaN. */
function safeAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function rounded(value: number): number {
  return Math.round(safeAmount(value));
}

function basicAmount(component: PayComponent, ctc: number): number {
  if (component.basis === 'PercentOfCTC') return rounded((ctc * component.value) / 100);
  if (component.basis === 'Fixed') return rounded(component.value);
  // Validation forbids these bases for Basic. Returning 0 is the safe reading of a
  // hand-edited structure: an invalid Basic is not evidence of a salary.
  return 0;
}

function earningAmount(component: PayComponent, ctc: number, basic: number): number {
  if (component.basis === 'PercentOfCTC') return rounded((ctc * component.value) / 100);
  if (component.basis === 'PercentOfBasic') return rounded((basic * component.value) / 100);
  if (component.basis === 'Fixed') return rounded(component.value);
  // Remainder is resolved in a second pass, after every other earning is known.
  return 0;
}

/**
 * Evaluates the structure's earning components for one employee.
 *
 * Basic is computed first regardless of its position; all other non-remainder
 * lines are computed next; the Remainder line then receives
 * `max(0, CTC − sum(other earnings))`. The returned lines keep the structure's
 * order so the designer preview and payslip read top-to-bottom as authored.
 */
export function evaluateEarnings(
  employee: Employee,
  structure: PayStructure,
): EarningsEvaluation {
  const ctc = safeAmount(employee.monthlyCTC);
  const components = Array.isArray(structure.components) ? structure.components : [];
  const amounts = new Array<number>(components.length).fill(0);

  let basic = 0;
  let basicIndex = -1;
  components.forEach((component, index) => {
    if (component.isBasic === true && basicIndex === -1) {
      basicIndex = index;
      basic = basicAmount(component, ctc);
      amounts[index] = basic;
    }
  });

  let otherEarnings = basic;
  components.forEach((component, index) => {
    if (index === basicIndex || component.basis === 'Remainder') return;
    const amount = earningAmount(component, ctc, basic);
    amounts[index] = amount;
    otherEarnings += amount;
  });

  let remainder = 0;
  let remainderAssigned = false;
  components.forEach((component, index) => {
    if (component.basis !== 'Remainder') return;
    const amount = remainderAssigned ? 0 : Math.max(0, Math.round(ctc - otherEarnings));
    amounts[index] = amount;
    remainder = amount;
    remainderAssigned = true;
  });

  const earnings: EarningLine[] = components.map((component, index) => ({
    componentId: component.id,
    name: component.name,
    basis: component.basis,
    value: component.value,
    amount: amounts[index],
  }));

  return {
    earnings,
    basic,
    gross: earnings.reduce((sum, line) => sum + line.amount, 0),
    remainder,
  };
}

export interface PayrollBonusLine {
  id: string;
  kind: PayrollBonusKind;
  label: string;
  amount: number;
  rating?: number;
}

export interface PayrollBreakdownWithStructure extends PayrollBreakdown {
  /** The resolved earning lines, in structure order. */
  earnings: EarningLine[];
  /** The bonuses for this employee and month, as separate earning lines. */
  bonuses: PayrollBonusLine[];
  bonusTotal: number;
  /**
   * The employer's matching EPF contribution. It is part of company cost and is
   * NEVER added to `totalDeductions` or subtracted from net pay.
   */
  employerEpf: number;
}

export interface PayrollContext {
  /** The company template. */
  structure: PayStructure;
  /** Per-employee overrides; the matching one wins. */
  overrides?: readonly PayStructureOverride[];
  /** Every bonus the app knows about; this function filters by employee and month. */
  bonuses?: readonly PayrollBonus[];
  /** `YYYY-MM` payroll month. Defaults to the month of `asOf`, or the current month. */
  monthKey?: string;
  /** ISO date used for the EPF wage ceiling. Defaults to today. */
  asOf?: string;
}

function payrollMonth(context: PayrollContext): string {
  if (typeof context.monthKey === 'string' && MONTH_KEY.test(context.monthKey)) {
    return context.monthKey;
  }
  const asOf = context.asOf ?? toISODate(new Date());
  return asOf.slice(0, 7);
}

/**
 * The structure-aware payroll calculation: the one the Payroll tab, payslip,
 * payroll export and Finance Report use.
 *
 * Contract (design §4):
 *   1. The employee's override wins over the company template.
 *   2. Basic first, then the other earnings in order; every line is rounded.
 *   3. The single Remainder line takes `max(0, CTC − other earnings)`.
 *   4. Gross is the sum of the earning lines; bonuses are added after gross.
 *   5. EPF and PT are toggles; LOP is always `(Basic / 26) × LOP days`, capped at 26.
 *   6. Net is floored at zero; employer EPF is reported but never deducted.
 */
export function computePayrollWithStructure(
  employee: Employee,
  context: PayrollContext,
): PayrollBreakdownWithStructure {
  const structure = resolvePayStructure(
    employee.id,
    context.structure,
    context.overrides ?? [],
  );
  const evaluation = evaluateEarnings(employee, structure);

  const asOf = context.asOf ?? toISODate(new Date());
  const monthKey = payrollMonth(context);
  const bonusLines: PayrollBonusLine[] = (context.bonuses ?? [])
    .filter((bonus) => bonus.employeeId === employee.id && bonus.monthKey === monthKey)
    .map((bonus) => ({
      id: bonus.id,
      kind: bonus.kind,
      label: bonus.label,
      amount: rounded(bonus.amount),
      ...(bonus.rating !== undefined ? { rating: bonus.rating } : {}),
    }));

  const bonusTotal = bonusLines.reduce((sum, line) => sum + line.amount, 0);

  const epf = structure.epfEnabled ? computeEPF(evaluation.basic, asOf) : 0;
  const professionalTax = structure.professionalTaxEnabled ? PROFESSIONAL_TAX : 0;
  const lossOfPay = computeLOP(evaluation.basic, employee.lopDays);
  const totalDeductions = epf + professionalTax + lossOfPay;
  const gross = evaluation.gross;

  const lineAmount = (componentId: string): number =>
    evaluation.earnings.find((line) => line.componentId === componentId)?.amount ?? 0;

  return {
    gross,
    basic: evaluation.basic,
    // The legacy field names map to the default component ids only. A custom
    // structure is described by `earnings[]`; these two stay 0 rather than
    // pretending an arbitrary allowance is HRA or Special Allowance.
    hra: lineAmount('hra'),
    specialAllowance: lineAmount('special'),
    epf,
    professionalTax,
    lossOfPay,
    totalDeductions,
    netPayable: Math.max(0, gross + bonusTotal - totalDeductions),
    earnings: evaluation.earnings,
    bonuses: bonusLines,
    bonusTotal,
    employerEpf: epf,
  };
}

export interface SuggestedPerformanceBonus {
  rating: number;
  percentOfBasic: number;
  amount: number;
}

/**
 * The performance bonus a rating suggests: `percentOfBasic × Basic`, rounded.
 *
 * HR may overwrite the amount before saving, which is why this is a suggestion
 * rather than a calculation baked into the stored bonus. An employee whose rating
 * has no configured rule suggests zero.
 */
export function suggestPerformanceBonus(
  employee: Employee,
  structure: PayStructure,
): SuggestedPerformanceBonus {
  const rating = Number.isFinite(employee.performanceRating)
    ? employee.performanceRating
    : 0;
  const rules = Array.isArray(structure.performanceBonusRules)
    ? structure.performanceBonusRules
    : [];
  const rule = rules.find((row) => row.rating === rating);
  const percentOfBasic =
    rule && Number.isFinite(rule.percentOfBasic) && rule.percentOfBasic > 0
      ? rule.percentOfBasic
      : 0;
  const basic = evaluateEarnings(employee, structure).basic;

  return {
    rating,
    percentOfBasic,
    amount: Math.round((basic * percentOfBasic) / 100),
  };
}

/** Type guard for a valid performance bonus rule (useful to the designer's drafts). */
export function isPerformanceBonusRule(value: unknown): value is PerformanceBonusRule {
  const rule = asRecord(value);
  if (!rule) return false;
  return (
    typeof rule.rating === 'number' &&
    Number.isInteger(rule.rating) &&
    rule.rating >= 1 &&
    rule.rating <= 5 &&
    isFiniteNumber(rule.percentOfBasic) &&
    rule.percentOfBasic >= 0
  );
}
