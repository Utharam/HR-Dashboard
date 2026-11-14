/**
 * Shape guards for the things this app persists.
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
 * Enum membership. `status` and `gender` are widened unions in `types.ts`. This validator
 * still does not reject an out-of-union value: discarding a whole roster because one HRMS
 * cell read "Retiring" would cost a user their entire register to fix one string - the
 * exact trade this batch is trying to stop making. A string is enough here; which string
 * is a data question, not a shape question. The consumers are what make that safe:
 * `isActive` checks an allow-list of payable statuses, and the diversity ratios count the
 * declared values explicitly, so an unrecognised status or gender is excluded rather than
 * paid or averaged in.
 */

import type {
  AttendanceRecord,
  AttendanceSource,
  AttendanceStatus,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
  LeaveStatus,
  LeaveType,
  PlannerSettings,
} from '../types';
import { isValidDateKey } from './leavePlanner';

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

const LEAVE_TYPES: readonly LeaveType[] = [
  'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
];

const LEAVE_STATUSES: readonly LeaveStatus[] = ['Planned', 'Approved', 'Cancelled'];

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'Present', 'Absent', 'Leave', 'WFH', 'HalfDay',
];

const ATTENDANCE_SOURCES: readonly AttendanceSource[] = ['manual', 'excel', 'leave', 'seed'];

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

/**
 * True when `row` is safe to hand to every consumer of a `LeavePlan`.
 *
 * A leave plan is date-range data, so unlike the employee/policy guards this one is
 * deliberately stricter than "is it a string": a key that is not a real
 * `YYYY-MM-DD` local date, an end before the start, or an AM/PM half-day on a
 * multi-day range would produce a calendar that is wrong rather than one that
 * crashes. Bad dates are rejected at the door.
 *
 * Type and status are closed unions here (unlike the widened Employee enums) because
 * the planner renders a label/badge per member; an unknown value would render blank.
 */
export function isLeavePlanRow(row: unknown): row is LeavePlan {
  const rec = asRecord(row);
  if (!rec) return false;

  // Both ids key UI rows and join plans to employees. An empty id is not a usable
  // identity, even though it is technically a string.
  if (typeof rec.id !== 'string' || rec.id.length === 0) return false;
  if (typeof rec.employeeId !== 'string' || rec.employeeId.length === 0) return false;

  if (!isValidDateKey(rec.startDate) || !isValidDateKey(rec.endDate)) return false;
  // Keys are zero-padded, so lexical order is calendar order.
  if (rec.startDate > rec.endDate) return false;

  if (typeof rec.type !== 'string' || !LEAVE_TYPES.includes(rec.type as LeaveType)) return false;
  if (typeof rec.status !== 'string' || !LEAVE_STATUSES.includes(rec.status as LeaveStatus)) {
    return false;
  }

  // `halfDay` is `null` for a full day; only AM/PM are half-days, and only on a
  // single-day plan. A half-day on a multi-day range has no coherent meaning.
  const halfDay = rec.halfDay;
  if (halfDay !== null && halfDay !== 'AM' && halfDay !== 'PM') return false;
  if (halfDay !== null && rec.startDate !== rec.endDate) return false;

  if (rec.note !== undefined && typeof rec.note !== 'string') return false;

  // Timestamps are rendered and compared; an unparseable one is not a display
  // fallback the planner can invent.
  for (const field of ['createdAt', 'updatedAt'] as const) {
    const value = rec[field];
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return false;
  }

  return true;
}

/**
 * True when `row` is safe to hand to every consumer of an `AttendanceRecord`.
 *
 * A record is the unit the month rollup and the matrix both trust, so the date must be
 * a real local key and the status/source must be values this build can render. Leave
 * rows carry the type that produces their code; a `Leave` row without one would render
 * as an untyped absence and cannot be turned back into a matrix cell, so it is rejected
 * at the door. `halfDay` is optional because a matrix `HD` has no AM/PM marker, but a
 * present value must be one this build understands.
 */
export function isAttendanceRecordRow(row: unknown): row is AttendanceRecord {
  const rec = asRecord(row);
  if (!rec) return false;

  // Both ids key records and join them to employees; an empty id is not an identity.
  if (typeof rec.id !== 'string' || rec.id.length === 0) return false;
  if (typeof rec.employeeId !== 'string' || rec.employeeId.length === 0) return false;

  if (!isValidDateKey(rec.date)) return false;

  if (
    typeof rec.status !== 'string' ||
    !ATTENDANCE_STATUSES.includes(rec.status as AttendanceStatus)
  ) {
    return false;
  }

  if (
    typeof rec.source !== 'string' ||
    !ATTENDANCE_SOURCES.includes(rec.source as AttendanceSource)
  ) {
    return false;
  }

  if (typeof rec.updatedAt !== 'string' || Number.isNaN(Date.parse(rec.updatedAt))) {
    return false;
  }

  const leaveType = rec.leaveType;
  if (leaveType !== undefined) {
    if (typeof leaveType !== 'string' || !LEAVE_TYPES.includes(leaveType as LeaveType)) {
      return false;
    }
  }
  // `Leave` without a type cannot produce a code or a `leaveByType` entry.
  if (rec.status === 'Leave' && leaveType === undefined) return false;

  const halfDay = rec.halfDay;
  if (halfDay !== undefined && halfDay !== null && halfDay !== 'AM' && halfDay !== 'PM') {
    return false;
  }

  if (rec.note !== undefined && typeof rec.note !== 'string') return false;

  return true;
}

/**
 * True when `row` is safe to hand to every consumer of a `Holiday`.
 *
 * Uniqueness by date is a store/snapshot rule, not a row-shape rule: a row validator
 * cannot see its siblings. Dates still have to be real local keys, because the holiday
 * set is compared against date keys in the matrix and working-day math.
 */
export function isHolidayRow(row: unknown): row is Holiday {
  const rec = asRecord(row);
  if (!rec) return false;

  if (typeof rec.id !== 'string' || rec.id.length === 0) return false;
  if (!isValidDateKey(rec.date)) return false;
  if (typeof rec.name !== 'string' || rec.name.trim().length === 0) return false;

  return true;
}

/**
 * True when `row` is a usable `PlannerSettings`.
 *
 * The threshold drives the peak-day comparison (`count >= maxConcurrentLeave`), so it
 * must be a positive integer. Zero, a fraction or NaN would make every day (or no
 * day) a peak, which is a settings bug rendered as a coverage signal.
 */
export function isPlannerSettingsRow(row: unknown): row is PlannerSettings {
  const rec = asRecord(row);
  if (!rec) return false;

  const threshold = rec.maxConcurrentLeave;
  return typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 1;
}
