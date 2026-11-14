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
