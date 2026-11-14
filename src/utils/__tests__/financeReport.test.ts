import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type {
  AttendanceRollup,
  Employee,
  PayrollBonus,
} from '../../types';
import {
  applyMonthAttendanceRollup,
  buildFinanceReportModel,
  buildFinanceReportWorkbook,
  describeFinanceMonth,
  type FinanceReportRowInput,
} from '../financeReport';
import {
  computePayrollWithStructure,
  createDefaultPayStructure,
} from '../payStructure';

/*
 * The Finance Report's pure layer (design §6.4):
 *
 * - the attendance rollup is applied to employees with records and nobody else;
 * - every row and every statement total reconciles gross + bonuses − deductions
 *   to net, with the zero-floor write-off carried explicitly;
 * - departments group the same rows without re-pricing them;
 * - the workbook has the Summary / Departments / Employees sheets and carries
 *   the month and generation timestamp;
 * - an empty month is a truthful zero statement, not NaN or a missing sheet.
 */

const MONTH = '2026-11';
const AS_OF = '2026-11-14';

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 'EMP-1',
  name: 'Asha Menon',
  email: 'asha@omnixhr.io',
  phone: '+91 9000000000',
  department: 'Engineering & Technology',
  deptId: 'eng',
  role: 'Engineer',
  location: 'Bengaluru HQ',
  doj: '2020-01-01',
  monthlyCTC: 52000,
  basicSalary: 26000,
  hra: 13000,
  specialAllowance: 13000,
  status: 'Active',
  gender: 'Female',
  performanceRating: 4,
  reportsTo: null,
  presentDays: 26,
  clBalance: 8,
  slBalance: 8,
  elBalance: 12,
  lopDays: 0,
  uan: '100000000000',
  ...over,
});

const bonus = (over: Partial<PayrollBonus> = {}): PayrollBonus => ({
  id: 'bonus-1',
  employeeId: 'EMP-1',
  monthKey: MONTH,
  kind: 'Performance',
  label: 'Q3 performance bonus',
  amount: 2500,
  rating: 4,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

const rollup = (over: Partial<AttendanceRollup> = {}): AttendanceRollup => ({
  employeeId: 'EMP-1',
  presentDays: 0,
  leaveDays: 0,
  leaveByType: {},
  absentDays: 0,
  wfhDays: 0,
  holidayDays: 0,
  weeklyOffDays: 0,
  workingDays: 22,
  lopDays: 0,
  unmarkedDays: 0,
  hasRecords: true,
  ...over,
});

const structure = createDefaultPayStructure();

const reportRow = (
  employee: Employee,
  bonuses: PayrollBonus[] = [],
): FinanceReportRowInput => ({
  employee,
  breakdown: computePayrollWithStructure(employee, {
    structure,
    bonuses,
    monthKey: MONTH,
    asOf: AS_OF,
  }),
});

describe('applyMonthAttendanceRollup', () => {
  it('replaces present, LOP and working-day figures only when the month has records', () => {
    const recorded = emp({ id: 'EMP-A', presentDays: 26, lopDays: 0 });
    const unrecorded = emp({ id: 'EMP-B', presentDays: 24, lopDays: 2 });

    const [rolled, legacy] = applyMonthAttendanceRollup(
      [recorded, unrecorded],
      new Map([
        [
          'EMP-A',
          rollup({ employeeId: 'EMP-A', presentDays: 18, lopDays: 4, workingDays: 22 }),
        ],
        [
          'EMP-B',
          rollup({
            employeeId: 'EMP-B',
            presentDays: 0,
            lopDays: 26,
            workingDays: 22,
            hasRecords: false,
          }),
        ],
      ]),
    );

    expect(rolled.presentDays).toBe(18);
    expect(rolled.lopDays).toBe(4);
    expect(rolled.workingDays).toBe(22);
    expect(rolled.attendancePct).toBeCloseTo((18 / 22) * 100);
    // An unmarked month is not evidence of zero attendance: the legacy monthly
    // fields survive untouched.
    expect(legacy.presentDays).toBe(24);
    expect(legacy.lopDays).toBe(2);
    expect(legacy.workingDays).toBeUndefined();
  });

  it('leaves an employee with no rollup entry on their legacy fields', () => {
    const [only] = applyMonthAttendanceRollup([emp({ lopDays: 3 })], new Map());
    expect(only.lopDays).toBe(3);
  });
});

describe('buildFinanceReportModel', () => {
  it('reconciles every employee row and the statement totals', () => {
    const rows = [
      reportRow(emp(), [bonus(), bonus({ id: 'bonus-2', kind: 'Custom', label: 'Diwali', amount: 1000 })]),
      reportRow(
        emp({
          id: 'EMP-2',
          name: 'Ravi Kumar',
          monthlyCTC: 80000,
          basicSalary: 40000,
          hra: 20000,
          specialAllowance: 20000,
        }),
      ),
    ];

    const model = buildFinanceReportModel({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows,
    });

    for (const row of model.employees) {
      expect(row.gross + row.bonusTotal - row.totalDeductions + row.netFloorShortfall).toBe(
        row.netPayable,
      );
      expect(row.netFloored).toBe(false);
    }

    expect(
      model.summary.gross +
        model.summary.bonuses -
        model.summary.totalDeductions +
        model.summary.netFloorShortfall,
    ).toBe(model.summary.netPayable);
    expect(model.summary.statutoryDeductions).toBe(
      model.summary.epf + model.summary.professionalTax,
    );
    expect(model.summary.totalDeductions).toBe(
      model.summary.statutoryDeductions + model.summary.lopRecovery,
    );
    expect(model.summary.totalCost).toBe(
      model.summary.gross + model.summary.bonuses + model.summary.employerEpf,
    );
    expect(model.monthLabel).toBe('November 2026');
  });

  it('groups rows by department with headcount, money and cost totals', () => {
    const rows = [
      reportRow(emp({ id: 'EMP-1', name: 'Asha Menon' })),
      reportRow(
        emp({
          id: 'EMP-2',
          name: 'Ravi Kumar',
          monthlyCTC: 80000,
          basicSalary: 40000,
          hra: 20000,
          specialAllowance: 20000,
        }),
      ),
      reportRow(
        emp({
          id: 'EMP-3',
          name: 'Meera Shah',
          department: 'Sales & Business Development',
          monthlyCTC: 60000,
          basicSalary: 30000,
          hra: 15000,
          specialAllowance: 15000,
        }),
      ),
    ];

    const model = buildFinanceReportModel({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows,
    });

    expect(model.departments.map((row) => row.department)).toEqual([
      'Engineering & Technology',
      'Sales & Business Development',
    ]);
    const engineering = model.departments[0];
    expect(engineering.headcount).toBe(2);
    expect(engineering.gross).toBe(rows[0].breakdown.gross + rows[1].breakdown.gross);
    expect(engineering.deductions).toBe(
      rows[0].breakdown.totalDeductions + rows[1].breakdown.totalDeductions,
    );
    expect(engineering.net).toBe(
      rows[0].breakdown.netPayable + rows[1].breakdown.netPayable,
    );
    expect(
      engineering.gross +
        engineering.bonuses -
        engineering.deductions +
        engineering.netFloorShortfall,
    ).toBe(engineering.net);

    const sales = model.departments[1];
    expect(sales.headcount).toBe(1);
    expect(sales.net).toBe(rows[2].breakdown.netPayable);
  });

  it('includes performance and custom bonuses in net without changing deductions', () => {
    const bonuses = [
      bonus(),
      bonus({ id: 'bonus-2', kind: 'Custom', label: 'Diwali bonus', amount: 1000 }),
      // Another month's bonus must not leak into this statement.
      bonus({ id: 'bonus-3', monthKey: '2026-10', amount: 9999 }),
    ];
    const withBonuses = reportRow(emp(), bonuses);
    const withoutBonuses = reportRow(emp());

    const model = buildFinanceReportModel({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows: [withBonuses],
    });

    expect(model.employees[0].performanceBonus).toBe(2500);
    expect(model.employees[0].customBonus).toBe(1000);
    expect(model.employees[0].bonusTotal).toBe(3500);
    expect(model.summary.bonuses).toBe(3500);
    // Bonuses add to net and cost, never to EPF, PT or LOP.
    expect(model.employees[0].netPayable).toBe(withoutBonuses.breakdown.netPayable + 3500);
    expect(model.employees[0].totalDeductions).toBe(withoutBonuses.breakdown.totalDeductions);
    expect(model.employees[0].epf).toBe(withoutBonuses.breakdown.epf);
    expect(model.employees[0].totalCost).toBe(
      withoutBonuses.breakdown.gross + 3500 + withoutBonuses.breakdown.employerEpf,
    );
  });

  it('carries the zero-floor write-off when deductions exceed earnings', () => {
    const zeroCtc = emp({
      id: 'EMP-ZERO',
      name: 'Zero CTC',
      monthlyCTC: 0,
      basicSalary: 0,
      hra: 0,
      specialAllowance: 0,
    });
    const model = buildFinanceReportModel({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows: [reportRow(zeroCtc)],
    });

    const row = model.employees[0];
    expect(row.netFloored).toBe(true);
    expect(row.netPayable).toBe(0);
    expect(row.netFloorShortfall).toBeGreaterThan(0);
    expect(model.summary.netFloorShortfall).toBe(row.netFloorShortfall);
    expect(model.summary.flooredEmployees).toEqual(['Zero CTC']);
    expect(
      model.summary.gross +
        model.summary.bonuses -
        model.summary.totalDeductions +
        model.summary.netFloorShortfall,
    ).toBe(model.summary.netPayable);
  });

  it('produces a truthful zero statement for a month with no active employees', () => {
    const model = buildFinanceReportModel({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows: [],
    });

    expect(model.employees).toEqual([]);
    expect(model.departments).toEqual([]);
    expect(model.summary).toMatchObject({
      employeesPaid: 0,
      gross: 0,
      bonuses: 0,
      statutoryDeductions: 0,
      lopRecovery: 0,
      totalDeductions: 0,
      netPayable: 0,
      employerEpf: 0,
      totalCost: 0,
      netFloorShortfall: 0,
      flooredEmployees: [],
    });
    expect(Object.values(model.summary).some((value) => Number.isNaN(value))).toBe(false);
  });

  it('labels a month deterministically', () => {
    expect(describeFinanceMonth('2026-01')).toBe('January 2026');
    expect(describeFinanceMonth('2026-12')).toBe('December 2026');
    expect(describeFinanceMonth('not-a-month')).toBe('not-a-month');
  });
});

describe('buildFinanceReportWorkbook', () => {
  const rows = [
    reportRow(emp(), [
      bonus(),
      bonus({ id: 'bonus-2', kind: 'Custom', label: 'Diwali bonus', amount: 1000 }),
    ]),
    reportRow(
      emp({
        id: 'EMP-2',
        name: 'Ravi Kumar',
        department: 'Sales & Business Development',
        monthlyCTC: 80000,
        basicSalary: 40000,
        hra: 20000,
        specialAllowance: 20000,
      }),
    ),
  ];

  const workbook = buildFinanceReportWorkbook({
    monthKey: MONTH,
    generatedAt: '2026-11-15T10:00:00.000Z',
    rows,
  });

  it('writes Summary, Departments and Employees sheets in order', () => {
    expect(workbook.SheetNames).toEqual(['Summary', 'Departments', 'Employees']);
  });

  it('puts the month and generation timestamp on Summary with reconciling totals', () => {
    const summary = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Summary, {
      header: 1,
      blankrows: true,
    });
    const findRow = (label: string): unknown[] | undefined =>
      summary.find((row) => row[0] === label);

    expect(summary[0][0]).toBe('OmniHR — Finance Report');
    expect(findRow('Month')?.[1]).toBe('November 2026');
    expect(findRow('Month key')?.[1]).toBe(MONTH);
    expect(findRow('Generated')?.[1]).toBe('2026-11-15T10:00:00.000Z');
    expect(findRow('Employees paid')?.[1]).toBe(2);
    expect(findRow('Net Payable')?.[1]).toBe(
      rows[0].breakdown.netPayable + rows[1].breakdown.netPayable,
    );
    expect(findRow('Total Cost to Company')?.[1]).toBe(
      rows[0].breakdown.gross +
        rows[0].breakdown.bonusTotal +
        rows[0].breakdown.employerEpf +
        rows[1].breakdown.gross +
        rows[1].breakdown.bonusTotal +
        rows[1].breakdown.employerEpf,
    );
  });

  it('writes grouped department rows plus a total row', () => {
    const departments = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets.Departments,
    );

    const engineering = departments.find(
      (row) => row.Department === 'Engineering & Technology',
    );
    expect(engineering).toMatchObject({
      Headcount: 1,
      Bonuses: 3500,
    });
    expect(engineering?.['Net Payable']).toBe(rows[0].breakdown.netPayable);

    const total = departments.find((row) => row.Department === 'Total');
    expect(total).toMatchObject({
      Headcount: 2,
      'Net Payable': rows[0].breakdown.netPayable + rows[1].breakdown.netPayable,
    });
  });

  it('writes employee rows with the bonus split and a payslip-friendly net', () => {
    const employees = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets.Employees,
    );

    expect(employees).toHaveLength(2);
    const asha = employees.find((row) => row['Employee ID'] === 'EMP-1');
    expect(asha).toMatchObject({
      'Employee': 'Asha Menon',
      'Department': 'Engineering & Technology',
      'Performance Bonus': 2500,
      'Custom Bonus': 1000,
      'Gross Earnings': rows[0].breakdown.gross,
      'Net Payable': rows[0].breakdown.netPayable,
      'Net Floored': 'No',
    });
    expect(asha?.['Total Cost']).toBe(
      rows[0].breakdown.gross + 3500 + rows[0].breakdown.employerEpf,
    );
  });

  it('still writes every sheet for an empty month', () => {
    const empty = buildFinanceReportWorkbook({
      monthKey: MONTH,
      generatedAt: '2026-11-15T10:00:00.000Z',
      rows: [],
    });

    expect(empty.SheetNames).toEqual(['Summary', 'Departments', 'Employees']);
    expect(
      XLSX.utils.sheet_to_json(empty.Sheets.Employees, { header: 1 }),
    ).toHaveLength(1);
    const summary = XLSX.utils.sheet_to_json<unknown[]>(empty.Sheets.Summary, {
      header: 1,
      blankrows: true,
    });
    expect(summary.find((row) => row[0] === 'Employees paid')?.[1]).toBe(0);
    expect(summary.find((row) => row[0] === 'Net Payable')?.[1]).toBe(0);
  });
});
