/**
 * Shape guards for the two things this app persists.
 *
 * WHY THESE EXIST
 *
 * `utils/storage.ts` accepts a persisted payload only when every row passes a validator
 * supplied by the caller, and falls back to seed data when one does not. That contract
 * is only as good as these predicates: a validator that checks less than its consumer
 * dereferences reintroduces the exact white screen the module exists to remove, just
 * one file away.
 *
 * So the rule here is deliberately mechanical - assert exactly what the consumers touch:
 *
 *   - `filteredEmployees` in App.tsx calls `.toLowerCase()` on `id`, `name`, `email`,
 *     `department` and `role`, and compares `location` by equality. A number or a
 *     missing key in any of them is `.toLowerCase is not a function` mid-render, which
 *     unmounts the root with the sidebar - and therefore "Reset Demo State" - gone.
 *   - the payroll, attendance and leave paths call `.toFixed()` on the numeric fields
 *     and add them together; a stringified number there is not a crash but a silently
 *     wrong payslip, which is worse.
 *   - `PolicySection` searches `p.rules` with `.some(r => r.toLowerCase())`, reads
 *     `daysAllowed` as a number and counts `p.isActive` as a boolean.
 *
 * WHAT IS DELIBERATELY NOT CHECKED
 *
 * Enum membership. `status` and `gender` are widened unions in `types.ts`, and both
 * consumers (`isActive`, the diversity ratios) already fail closed on a value they do
 * not recognise. Rejecting a whole roster because one HRMS cell read "Retiring" would
 * cost a user their entire register to fix one string - the exact trade this batch is
 * trying to stop making. A string is enough; which string is a data question, not a
 * shape question.
 */

import type { Employee, HRPolicy } from '../types';

/** Fields `filteredEmployees` calls a string method on. */
const EMPLOYEE_STRING_FIELDS = [
  'id', 'name', 'email', 'phone', 'department', 'deptId', 'role', 'location', 'doj', 'status', 'gender', 'uan',
] as const;

/** Fields the money, attendance and leave paths do arithmetic or formatting on. */
const EMPLOYEE_NUMBER_FIELDS = [
  'monthlyCTC', 'basicSalary', 'hra', 'specialAllowance',
  'performanceRating', 'presentDays', 'clBalance', 'slBalance', 'elBalance', 'lopDays',
] as const;

const POLICY_STRING_FIELDS = ['id', 'title', 'category', 'shortDesc', 'eligibility'] as const;

const asRecord = (row: unknown): Record<string, unknown> | null =>
  typeof row === 'object' && row !== null && !Array.isArray(row) ? (row as Record<string, unknown>) : null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * True when `row` is safe to hand to every consumer of an `Employee`.
 *
 * `isValidRow` for `loadPersisted('omnihr_employees', isEmployeeRow, ...)`.
 */
export function isEmployeeRow(row: unknown): row is Employee {
  const rec = asRecord(row);
  if (!rec) return false;

  for (const field of EMPLOYEE_STRING_FIELDS) {
    if (typeof rec[field] !== 'string') return false;
  }
  for (const field of EMPLOYEE_NUMBER_FIELDS) {
    if (!isFiniteNumber(rec[field])) return false;
  }

  // `reportsTo` is the one nullable field in the interface. It is checked as "string or
  // explicitly absent" rather than "truthy", so an employee with no manager survives.
  const reportsTo = rec.reportsTo;
  if (reportsTo !== null && reportsTo !== undefined && typeof reportsTo !== 'string') return false;

  return true;
}

/**
 * True when `row` is safe to hand to every consumer of an `HRPolicy`.
 *
 * `isValidRow` for `loadPersisted('omnihr_policies', isPolicyRow, ...)`.
 */
export function isPolicyRow(row: unknown): row is HRPolicy {
  const rec = asRecord(row);
  if (!rec) return false;

  for (const field of POLICY_STRING_FIELDS) {
    if (typeof rec[field] !== 'string') return false;
  }

  // `rules` is searched with `.some(r => r.toLowerCase()...)`.
  if (!Array.isArray(rec.rules) || rec.rules.some((rule) => typeof rule !== 'string')) return false;

  // `daysAllowed` is rendered next to `timeUnit` and feeds `safeBalance`. Zero is a
  // real answer here: a policy that grants no days is a configured value, not a
  // missing one, and treating it as absent is the bug the zero-value batch fixed.
  if (!isFiniteNumber(rec.daysAllowed)) return false;

  if (typeof rec.isActive !== 'boolean') return false;
  if (typeof rec.isPaid !== 'boolean') return false;
  if (typeof rec.timeUnit !== 'string') return false;

  // The gift fields are genuinely optional in the interface, and PolicySection already
  // guards each one, so only a present-but-wrong-typed value is rejected.
  if (rec.giftOrPerk !== undefined && typeof rec.giftOrPerk !== 'string') return false;
  if (rec.statutoryReference !== undefined && typeof rec.statutoryReference !== 'string') return false;
  if (rec.isCustom !== undefined && typeof rec.isCustom !== 'boolean') return false;
  if (
    rec.giftOptions !== undefined &&
    (!Array.isArray(rec.giftOptions) || rec.giftOptions.some((opt) => typeof opt !== 'string'))
  ) {
    return false;
  }

  return true;
}