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
  | 'payroll' 
  | 'performance' 
  | 'recruitment' 
  | 'retention' 
  | 'trends' 
  | 'excel'
  | 'policies'
  | 'guides';

/**
 * The theme preference the user chose. `system` is a preference, not a theme:
 * it is resolved against `prefers-color-scheme` before anything reaches the DOM.
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/** What the DOM and CSS actually see. `system` never reaches them. */
export type ResolvedTheme = 'dark' | 'light';

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

