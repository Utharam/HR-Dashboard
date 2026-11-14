/**
 * The Finance Report's pure model and Excel writer.
 *
 * WHY THIS EXISTS
 *
 * The Finance Report is a month-close statement: it answers what the company
 * paid, what it deducted and what the payroll cost the business for ONE month.
 * Every rupee in it is produced by `computePayrollWithStructure`; this module
 * only groups those already-computed rows, reconciles them and writes them down.
 * Keeping the grouping and workbook layout here (rather than inside the page)
 * means the on-screen statement and the downloaded file are built from the same
 * numbers, and both can be tested without a browser.
 *
 * Reconciliation is the contract: for every row and for the statement as a
 * whole, `gross + bonuses - totalDeductions = netPayable`. A row whose
 * deductions exceed its earnings is floored at zero (`computePayrollWithStructure`
 * never returns a negative payment); that write-off is recorded as an explicit
 * `netFloorShortfall` so the totals still add up instead of quietly disagreeing.
 */

import * as XLSX from 'xlsx';
import type {
  AttendanceRollup,
  Employee,
  PayrollEmployee,
} from '../types';
import type { PayrollBreakdownWithStructure } from './payStructure';

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `November 2026` for a well-formed `YYYY-MM`; the raw key otherwise. */
export function describeFinanceMonth(monthKey: string): string {
  const match = MONTH_KEY.exec(typeof monthKey === 'string' ? monthKey.trim() : '');
  if (!match) return monthKey;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * The register as the Finance Report should see it for the selected month.
 *
 * This is the same rule the Payroll tab applies to the current month: an
 * employee with at least one usable mark in the month has `presentDays`,
 * `lopDays`, `attendancePct` and `workingDays` replaced by the daily rollup.
 * Everyone else keeps the legacy monthly fields exactly as they were - an
 * unmarked month is not evidence of zero attendance.
 */
export function applyMonthAttendanceRollup(
  employees: readonly Employee[],
  rollups: ReadonlyMap<string, AttendanceRollup>,
): PayrollEmployee[] {
  return employees.map((employee) => {
    const rollup = rollups.get(employee.id);
    if (!rollup || !rollup.hasRecords) return employee;

    return {
      ...employee,
      presentDays: rollup.presentDays,
      lopDays: rollup.lopDays,
      attendancePct:
        rollup.workingDays > 0 ? (rollup.presentDays / rollup.workingDays) * 100 : 0,
      workingDays: rollup.workingDays,
    };
  });
}

/** One employee's computed payroll, as the report builder receives it. */
export interface FinanceReportRowInput {
  employee: Pick<Employee, 'id' | 'name' | 'department'>;
  breakdown: PayrollBreakdownWithStructure;
}

export interface FinanceReportInput {
  /** `YYYY-MM` the statement covers. */
  monthKey: string;
  /** ISO timestamp of when the statement was produced. */
  generatedAt: string;
  rows: readonly FinanceReportRowInput[];
}

export interface FinanceReportEmployeeRow {
  employeeId: string;
  employeeName: string;
  department: string;
  /** Fixed structure earnings, before bonuses. */
  gross: number;
  performanceBonus: number;
  customBonus: number;
  bonusTotal: number;
  epf: number;
  professionalTax: number;
  lossOfPay: number;
  totalDeductions: number;
  netPayable: number;
  employerEpf: number;
  totalCost: number;
  /** True when deductions exceeded earnings and net was floored at zero. */
  netFloored: boolean;
  /** The amount written off by the zero floor (0 unless `netFloored`). */
  netFloorShortfall: number;
}

export interface FinanceReportDepartmentRow {
  department: string;
  headcount: number;
  gross: number;
  bonuses: number;
  deductions: number;
  net: number;
  employerEpf: number;
  totalCost: number;
  /** Zero-floor write-off carried by this department's employees. */
  netFloorShortfall: number;
}

export interface FinanceReportSummary {
  employeesPaid: number;
  gross: number;
  bonuses: number;
  /** Employee EPF deduction. */
  epf: number;
  /** Professional Tax deduction. */
  professionalTax: number;
  /** EPF + Professional Tax - the statutory employee deductions. */
  statutoryDeductions: number;
  /** Loss-of-pay recovered from salaries. */
  lopRecovery: number;
  /** Statutory deductions + LOP. */
  totalDeductions: number;
  netPayable: number;
  employerEpf: number;
  /** Gross + bonuses + employer EPF. */
  totalCost: number;
  /** Total written off by the net-pay zero floor. */
  netFloorShortfall: number;
  /** Names of employees whose net pay hit the zero floor. */
  flooredEmployees: string[];
}

export interface FinanceReportModel {
  monthKey: string;
  monthLabel: string;
  generatedAt: string;
  employees: FinanceReportEmployeeRow[];
  departments: FinanceReportDepartmentRow[];
  summary: FinanceReportSummary;
}

function departmentName(department: string): string {
  const trimmed = typeof department === 'string' ? department.trim() : '';
  return trimmed || 'Unassigned';
}

function bonusTotalForKind(
  breakdown: PayrollBreakdownWithStructure,
  kind: 'Performance' | 'Custom',
): number {
  return breakdown.bonuses.reduce(
    (sum, bonus) => (bonus.kind === kind ? sum + bonus.amount : sum),
    0,
  );
}

function totalCostOf(gross: number, bonusTotal: number, employerEpf: number): number {
  return gross + bonusTotal + employerEpf;
}

/**
 * Groups computed payroll rows into the three views the page and the workbook
 * share: employee breakup, department totals and the company summary.
 */
export function buildFinanceReportModel(input: FinanceReportInput): FinanceReportModel {
  const employees: FinanceReportEmployeeRow[] = input.rows.map(({ employee, breakdown }) => {
    const gross = breakdown.gross;
    const bonusTotal = breakdown.bonusTotal;
    const totalDeductions = breakdown.totalDeductions;
    const rawNet = gross + bonusTotal - totalDeductions;
    const netPayable = Math.max(0, breakdown.netPayable);
    const netFloored = rawNet < 0;
    const netFloorShortfall = netFloored ? Math.abs(rawNet) : 0;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      department: departmentName(employee.department),
      gross,
      performanceBonus: bonusTotalForKind(breakdown, 'Performance'),
      customBonus: bonusTotalForKind(breakdown, 'Custom'),
      bonusTotal,
      epf: breakdown.epf,
      professionalTax: breakdown.professionalTax,
      lossOfPay: breakdown.lossOfPay,
      totalDeductions,
      netPayable,
      employerEpf: breakdown.employerEpf,
      totalCost: totalCostOf(gross, bonusTotal, breakdown.employerEpf),
      netFloored,
      netFloorShortfall,
    };
  });

  const departmentMap = new Map<string, FinanceReportDepartmentRow>();
  for (const row of employees) {
    let department = departmentMap.get(row.department);
    if (!department) {
      department = {
        department: row.department,
        headcount: 0,
        gross: 0,
        bonuses: 0,
        deductions: 0,
        net: 0,
        employerEpf: 0,
        totalCost: 0,
        netFloorShortfall: 0,
      };
      departmentMap.set(row.department, department);
    }

    department.headcount += 1;
    department.gross += row.gross;
    department.bonuses += row.bonusTotal;
    department.deductions += row.totalDeductions;
    department.net += row.netPayable;
    department.employerEpf += row.employerEpf;
    department.totalCost += row.totalCost;
    department.netFloorShortfall += row.netFloorShortfall;
  }

  const departments = Array.from(departmentMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department),
  );

  const summary = employees.reduce<FinanceReportSummary>(
    (totals, row) => {
      totals.employeesPaid += 1;
      totals.gross += row.gross;
      totals.bonuses += row.bonusTotal;
      totals.epf += row.epf;
      totals.professionalTax += row.professionalTax;
      totals.statutoryDeductions += row.epf + row.professionalTax;
      totals.lopRecovery += row.lossOfPay;
      totals.totalDeductions += row.totalDeductions;
      totals.netPayable += row.netPayable;
      totals.employerEpf += row.employerEpf;
      totals.totalCost += row.totalCost;
      totals.netFloorShortfall += row.netFloorShortfall;
      if (row.netFloored) totals.flooredEmployees.push(row.employeeName);
      return totals;
    },
    {
      employeesPaid: 0,
      gross: 0,
      bonuses: 0,
      epf: 0,
      professionalTax: 0,
      statutoryDeductions: 0,
      lopRecovery: 0,
      totalDeductions: 0,
      netPayable: 0,
      employerEpf: 0,
      totalCost: 0,
      netFloorShortfall: 0,
      flooredEmployees: [],
    },
  );

  return {
    monthKey: input.monthKey,
    monthLabel: describeFinanceMonth(input.monthKey),
    generatedAt: input.generatedAt,
    employees,
    departments,
    summary,
  };
}

type SheetCell = string | number;

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: SheetCell[][],
  widths: number[],
): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function buildSummarySheet(model: FinanceReportModel, companyName: string): SheetCell[][] {
  const reconciliation: SheetCell[][] = [
    ['Reconciliation', 'Amount (INR)'],
    ['Gross Earnings + Bonuses', model.summary.gross + model.summary.bonuses],
    ['Less: Total Deductions', -model.summary.totalDeductions],
  ];
  if (model.summary.netFloorShortfall > 0) {
    reconciliation.push(['Add: Net floor write-off', model.summary.netFloorShortfall]);
  }
  reconciliation.push(['Net Payable', model.summary.netPayable]);

  return [
    [`${companyName} — Finance Report`],
    ['Month', model.monthLabel],
    ['Month key', model.monthKey],
    ['Generated', model.generatedAt],
    [],
    ['Metric', 'Value (INR)'],
    ['Employees paid', model.summary.employeesPaid],
    ['Gross Earnings (fixed)', model.summary.gross],
    ['Bonuses', model.summary.bonuses],
    ['Statutory Deductions (EPF + PT)', model.summary.statutoryDeductions],
    ['LOP Recovery', model.summary.lopRecovery],
    ['Total Deductions', model.summary.totalDeductions],
    ['Net Payable', model.summary.netPayable],
    ['Employer EPF', model.summary.employerEpf],
    ['Total Cost to Company', model.summary.totalCost],
    [],
    ...reconciliation,
  ];
}

function buildDepartmentRows(model: FinanceReportModel): SheetCell[][] {
  const rows: SheetCell[][] = [
    [
      'Department',
      'Headcount',
      'Gross Earnings',
      'Bonuses',
      'Deductions',
      'Net Payable',
      'Employer EPF',
      'Total Cost',
      'Net Floor Write-off',
    ],
  ];

  for (const department of model.departments) {
    rows.push([
      department.department,
      department.headcount,
      department.gross,
      department.bonuses,
      department.deductions,
      department.net,
      department.employerEpf,
      department.totalCost,
      department.netFloorShortfall,
    ]);
  }

  rows.push([
    'Total',
    model.summary.employeesPaid,
    model.summary.gross,
    model.summary.bonuses,
    model.summary.totalDeductions,
    model.summary.netPayable,
    model.summary.employerEpf,
    model.summary.totalCost,
    model.summary.netFloorShortfall,
  ]);

  return rows;
}

function buildEmployeeRows(model: FinanceReportModel): SheetCell[][] {
  const rows: SheetCell[][] = [
    [
      'Employee ID',
      'Employee',
      'Department',
      'Gross Earnings',
      'Performance Bonus',
      'Custom Bonus',
      'EPF',
      'PT',
      'LOP',
      'Total Deductions',
      'Net Payable',
      'Employer EPF',
      'Total Cost',
      'Net Floored',
    ],
  ];

  for (const employee of model.employees) {
    rows.push([
      employee.employeeId,
      employee.employeeName,
      employee.department,
      employee.gross,
      employee.performanceBonus,
      employee.customBonus,
      employee.epf,
      employee.professionalTax,
      employee.lossOfPay,
      employee.totalDeductions,
      employee.netPayable,
      employee.employerEpf,
      employee.totalCost,
      employee.netFloored
        ? `Yes (₹${employee.netFloorShortfall.toLocaleString('en-IN')} written off)`
        : 'No',
    ]);
  }

  return rows;
}

/**
 * Builds the downloadable workbook: Summary, Departments and Employees.
 *
 * The builder is pure: the caller supplies the month, the generation timestamp
 * and the already-computed rows, so the file it writes is exactly the statement
 * the page showed at that moment.
 */
export function buildFinanceReportWorkbook(
  input: FinanceReportInput & { companyName?: string },
): XLSX.WorkBook {
  const model = buildFinanceReportModel(input);
  const companyName = input.companyName?.trim() || 'OmniHR';
  const workbook = XLSX.utils.book_new();

  appendSheet(workbook, 'Summary', buildSummarySheet(model, companyName), [34, 24, 18]);
  appendSheet(workbook, 'Departments', buildDepartmentRows(model), [
    30, 12, 16, 14, 14, 16, 14, 16, 20,
  ]);
  appendSheet(workbook, 'Employees', buildEmployeeRows(model), [
    14, 28, 30, 14, 16, 14, 12, 10, 12, 15, 14, 14, 14, 34,
  ]);

  return workbook;
}
