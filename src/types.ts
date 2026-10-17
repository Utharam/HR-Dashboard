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
  status: 'Active' | 'Probation' | 'Notice Period' | 'Resigned';
  gender: 'Female' | 'Male' | 'Non-Binary';
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

