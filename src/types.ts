export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  deptId: string;
  role: string;
  location: string;
  doj: string;
  monthlyCTC: number;
  basicSalary: number;
  hra: number;
  specialAllowance: number;
  // `Unknown` is a first-class value, not an absence: an imported row whose
  // status cannot be resolved must NOT be coerced to `Active` (billable, attending,
  // PF/PE-generating) nor to `Female` (biasing the diversity ratio). Consumers that
  // act on a status have to handle it explicitly — see `isActive` in utils/payroll.
  status: 'Active' | 'Probation' | 'Notice Period' | 'Resigned' | 'Unknown';
  gender: 'Female' | 'Male' | 'Non-Binary' | 'Prefer Not to Say' | 'Unknown';
  performanceRating: number;
  reportsTo: string | null;
  presentDays: number;
  clBalance: number;
  slBalance: number;
  elBalance: number;
  lopDays: number;
  uan: string;
}

export interface Department {
  id: string;
  name: string;
  head: string;
  roles: string[];
}

/**
 * An employee as the payroll-and-overview consumers see it (design decision D8).
 *
 * App derives these from `Employee` by folding in the current-month daily rollup:
 * an employee with daily records also carries the month's true figures, the
 * optional fields below; everyone else is the plain `Employee` and keeps the
 * legacy monthly fields (`presentDays`, `lopDays`) untouched.
 *
 * `attendancePct` is `present ÷ workingDays × 100` from the rollup (0 when the
 * month has no working days), and `workingDays` is the calendar fact behind it
 * (days in month − Sundays − holidays). They describe the MONTH, so they must
 * not be read as payroll constants: the LOP wage cut stays `(Basic / 26) × LOP
 * Days` — the 26-day denominator is the statutory/company policy for pricing
 * wages and is deliberately independent of how many days a given month has.
 */
export interface PayrollEmployee extends Employee {
  /** Present days as a share of the month's working days, 0–100, from the daily rollup. */
  attendancePct?: number;
  /** Working days of the rollup's month (Sundays and holidays excluded). */
  workingDays?: number;
}

export interface MonthlyTracker {
  month: string;
  headcount: number;
  grossPayroll: number;
  attritionPct: number;
  avgAttendance: number;
  hires: number;
  exits: number;
}

export interface JobRequisition {
  id: string;
  title: string;
  department: string;
  location: string;
  stage: 'Sourcing' | 'Screening' | 'Interviewing' | 'Offer Extended' | 'Hired';
  applicants: number;
  targetDOJ: string;
  salaryRange: string;
}

export type ActiveTab = 
  | 'overview' 
  | 'directory' 
  | 'attendance' 
  | 'leave'
  | 'payroll' 
  | 'performance' 
  | 'recruitment' 
  | 'retention' 
  | 'trends' 
  | 'admin'
  | 'policies'
  | 'guides';

/**
 * The theme preference the user chose. `system` is a preference, not a theme:
 * it is resolved against `prefers-color-scheme` before anything reaches the DOM.
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/** What the DOM and CSS actually see. `system` never reaches them. */
export type ResolvedTheme = 'dark' | 'light';

/**
 * The shape a backend will hand back. Kept deliberately small: identity and
 * lifetime are the only things the front door needs to make a routing decision.
 */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  org?: string;
}

export interface Session {
  user: SessionUser;
  issuedAt: string;
  expiresAt?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export type SsoProvider = 'microsoft' | 'okta' | 'domain';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export type PolicyCategory = 
  | 'Parental Provisions'
  | 'Leave & Quotas'
  | 'Separation & Notice'
  | 'Extended & Sabbatical'
  | 'Wellness & Special Perks'
  | 'Custom Rules';

export interface HRPolicy {
  id: string;
  title: string;
  category: PolicyCategory;
  shortDesc: string;
  daysAllowed: number;
  timeUnit: 'Days' | 'Weeks' | 'Months';
  isPaid: boolean;
  giftOrPerk?: string;
  giftOptions?: string[];
  eligibility: string;
  statutoryReference?: string;
  rules: string[];
  isActive: boolean;
  isCustom?: boolean;
}

/**
 * Leave planner domain.
 *
 * Leave dates are stored as local calendar keys (`YYYY-MM-DD`), never as instants:
 * a leave day is a day on the office calendar, not a moment in time. Half-days are
 * only meaningful for a single-day plan; `LeavePlan.halfDay` is `null` otherwise.
 */
export type LeaveType =
  | 'CL'
  | 'SL'
  | 'EL'
  | 'LOP'
  | 'Maternity'
  | 'Paternity'
  | 'Comp Off'
  | 'Other';

export type LeaveStatus = 'Planned' | 'Approved' | 'Cancelled';

/** `AM`/`PM` for a single-day plan, `null` for a full day. */
export type HalfDay = 'AM' | 'PM' | null;

export interface LeavePlan {
  id: string;
  employeeId: string;
  /** `YYYY-MM-DD`, local calendar date. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  endDate: string;
  type: LeaveType;
  status: LeaveStatus;
  halfDay: HalfDay;
  note?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface PlannerSettings {
  /** Days at or above this concurrent-leave count are flagged as peak/coverage risk. */
  maxConcurrentLeave: number;
}

/**
 * The Planner's general-event domain.
 *
 * An event is a range of local calendar days, like a leave plan, but it belongs to
 * the company rather than to one employee: a review, a training day, a meeting or a
 * company holiday. `department`/`location` narrow who it concerns; their absence
 * means "everyone" rather than "unknown". `notes` is free text and never parsed.
 */
export type PlannerEventType = 'Event' | 'Training' | 'Meeting' | 'Holiday' | 'Other';

export interface PlannerEvent {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, local calendar date. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  endDate: string;
  type: PlannerEventType;
  department?: string;
  location?: string;
  notes?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
}

/**
 * Daily attendance domain.
 *
 * A record is keyed by employee + date (the id is `${employeeId}|${date}`), and a date is
 * a local calendar day (`YYYY-MM-DD`), never an instant. Sundays and holidays are not
 * stored per employee: they are derived from the calendar and the holiday list.
 */
export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'WFH' | 'HalfDay';

export type AttendanceSource = 'manual' | 'excel' | 'leave' | 'seed';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  /** `YYYY-MM-DD`, local calendar date. */
  date: string;
  status: AttendanceStatus;
  /** Required when `status === 'Leave'`; also used by a half-day leave. */
  leaveType?: LeaveType;
  /** `AM`/`PM` for a half-day, `null` for a full day. */
  halfDay?: 'AM' | 'PM' | null;
  note?: string;
  source: AttendanceSource;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface Holiday {
  /** `holiday-${date}`. */
  id: string;
  /** `YYYY-MM-DD`, local calendar date. */
  date: string;
  name: string;
}

/**
 * Payroll pay-structure domain.
 *
 * A structure is an ordered list of earning components plus the statutory toggles.
 * Exactly one component is Basic; the remainder component (at most one) absorbs
 * whatever CTC is left after every other earning. Per-employee overrides are full
 * copies: an overridden employee is deliberately insulated from later company edits.
 */
export type PayComponentBasis =
  | 'PercentOfCTC'
  | 'PercentOfBasic'
  | 'Fixed'
  | 'Remainder';

export interface PayComponent {
  id: string;
  name: string;
  basis: PayComponentBasis;
  /** Percent (0–100+) for percent bases; rupees for Fixed; ignored for Remainder. */
  value: number;
  /** Exactly one earning component in a structure is Basic. */
  isBasic?: boolean;
}

export interface PerformanceBonusRule {
  /** 1–5, matching Employee.performanceRating. */
  rating: number;
  /** Percent of the computed Basic. */
  percentOfBasic: number;
}

export interface PayStructure {
  components: PayComponent[];
  epfEnabled: boolean;
  professionalTaxEnabled: boolean;
  performanceBonusRules: PerformanceBonusRule[];
  updatedAt: string;
}

export interface PayStructureOverride {
  employeeId: string;
  components: PayComponent[];
  epfEnabled: boolean;
  professionalTaxEnabled: boolean;
  note?: string;
  updatedAt: string;
}

export type PayrollBonusKind = 'Performance' | 'Custom';

export interface PayrollBonus {
  id: string;
  employeeId: string;
  /** `YYYY-MM`. */
  monthKey: string;
  kind: PayrollBonusKind;
  label: string;
  amount: number;
  /** Performance only, for traceability. */
  rating?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-employee totals for one month. `workingDays` excludes Sundays and holidays;
 * `holidayDays` and `weeklyOffDays` report the calendar facts that produced it.
 */
export interface AttendanceRollup {
  employeeId: string;
  presentDays: number;
  leaveDays: number;
  leaveByType: Partial<Record<LeaveType, number>>;
  absentDays: number;
  wfhDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  workingDays: number;
  lopDays: number;
  unmarkedDays: number;
  hasRecords: boolean;
}
