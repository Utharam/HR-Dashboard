import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { FinanceReportSection } from '../FinanceReportSection';
import { computePayrollWithStructure, createDefaultPayStructure } from '../../utils/payStructure';
import { formatINR } from '../../utils/formatters';
import type {
  AttendanceRecord,
  Employee,
  Holiday,
  PayrollBonus,
} from '../../types';

/*
 * The Finance Report page (design §6.4): its own month, the rollup applied to
 * the selected month, reconciliation-visible summaries, the two statement
 * tables and the export/print affordances. The workbook layout itself is pinned
 * in utils/__tests__/financeReport.test.ts; this suite proves the page wires the
 * ledger and pay datasets into it.
 */

// Export ends in `XLSX.writeFile`, which downloads in a browser. jsdom has no
// download surface, so capture the workbook; SheetJS itself stays real.
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});

const MONTH = '2026-11';

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

const absent = (date: string, employeeId = 'EMP-1'): AttendanceRecord => ({
  id: `${employeeId}|${date}`,
  employeeId,
  date,
  status: 'Absent',
  source: 'manual',
  updatedAt: '2026-11-03T09:00:00.000Z',
});

const holidays: Holiday[] = [];

const renderReport = (over: {
  employees?: Employee[];
  attendance?: AttendanceRecord[];
  bonuses?: PayrollBonus[];
  currentMonthKey?: string;
  onSelectEmployee?: (employee: Employee) => void;
} = {}) =>
  render(
    <FinanceReportSection
      employees={over.employees ?? [emp()]}
      attendance={over.attendance ?? []}
      holidays={holidays}
      currentMonthKey={over.currentMonthKey ?? MONTH}
      payrollBonuses={over.bonuses ?? []}
      onSelectEmployee={over.onSelectEmployee ?? (() => {})}
    />,
  );

const kpiGrid = (): HTMLElement => document.querySelector('.grid--kpi-lg') as HTMLElement;

const kpiValue = (label: string): string => {
  const card = within(kpiGrid()).getByText(label, { selector: '.kpi-label' }).closest('.kpi-card');
  if (!card) throw new Error(`No KPI card for ${label}`);
  return card.querySelector('.kpi-value')?.textContent ?? '';
};

const employeeTable = (): HTMLElement =>
  screen.getByRole('table', { name: /Employee salary and cost breakup/i });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Finance Report — month and rollup', () => {
  it('defaults to the current month and moves with the prev/next controls', async () => {
    const user = userEvent.setup();
    renderReport();

    const input = screen.getByLabelText('Report month') as HTMLInputElement;
    expect(input.value).toBe(MONTH);
    expect(screen.getAllByText('November 2026').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(input.value).toBe('2026-10');
    expect(screen.getAllByText('October 2026').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(input.value).toBe('2026-12');
  });

  it('prices the selected month from the ledger: absences become LOP', async () => {
    const user = userEvent.setup();
    renderReport({
      attendance: [absent('2026-11-02'), absent('2026-11-03')],
    });

    // Legacy lopDays is 0, so any LOP figure proves the rollup was applied.
    // Basic 26,000 / 26 × 2 absent days = ₹2,000.
    expect(within(employeeTable()).getByText('−₹2,000')).toBeInTheDocument();
    expect(kpiValue('LOP Recovery')).toBe('₹2,000');

    // A month with no ledger records keeps the legacy monthly fields.
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(within(employeeTable()).getByText('−₹0')).toBeInTheDocument();
    expect(kpiValue('LOP Recovery')).toBe('₹0');
  });

  it('excludes Resigned and Unknown staff from the statement', () => {
    renderReport({
      employees: [
        emp(),
        emp({ id: 'EMP-2', name: 'Resigned Rita', status: 'Resigned' }),
        emp({ id: 'EMP-3', name: 'Unknown Uma', status: 'Unknown' }),
      ],
    });

    expect(kpiValue('Employees paid')).toBe('1');
    const table = employeeTable();
    expect(within(table).queryByText('Resigned Rita')).toBeNull();
    expect(within(table).queryByText('Unknown Uma')).toBeNull();
  });
});

describe('Finance Report — summary and tables', () => {
  it('shows the reconciling summary, including performance and custom bonuses', () => {
    const bonuses = [
      bonus(),
      bonus({ id: 'bonus-2', kind: 'Custom', label: 'Diwali', amount: 1000 }),
    ];
    renderReport({ bonuses });

    // Read the expected statutory/net figures from the same calculation rather
    // than pinning the EPF ceiling in force on the day the suite runs.
    const priced = computePayrollWithStructure(emp(), {
      structure: createDefaultPayStructure(),
      bonuses,
      monthKey: MONTH,
    });

    expect(kpiValue('Employees paid')).toBe('1');
    expect(kpiValue('Gross Earnings (fixed)')).toBe('₹52,000');
    expect(kpiValue('Bonuses')).toBe('₹3,500');
    expect(kpiValue('Statutory Deductions (EPF + PT)')).toBe(
      `₹${formatINR(priced.epf + priced.professionalTax)}`,
    );
    expect(kpiValue('LOP Recovery')).toBe('₹0');
    expect(kpiValue('Net Payable')).toBe(`₹${formatINR(priced.netPayable)}`);
    expect(kpiValue('Employer EPF')).toBe(`₹${formatINR(priced.employerEpf)}`);
    expect(kpiValue('Total Cost to Company')).toBe(
      `₹${formatINR(priced.gross + priced.bonusTotal + priced.employerEpf)}`,
    );

    const row = within(employeeTable()).getByRole('row', { name: /Asha Menon/ });
    expect(row).toHaveTextContent('+₹2,500');
    expect(row).toHaveTextContent('+₹1,000');
    expect(row).toHaveTextContent(`₹${formatINR(priced.netPayable)}`);
  });

  it('groups departments and totals the department table', () => {
    renderReport({
      employees: [
        emp(),
        emp({
          id: 'EMP-2',
          name: 'Ravi Kumar',
          department: 'Sales & Business Development',
          monthlyCTC: 80000,
          basicSalary: 40000,
          hra: 20000,
          specialAllowance: 20000,
        }),
      ],
    });

    const departments = screen.getByRole('table', {
      name: /Department salary and cost breakdown/i,
    });
    const engineering = within(departments).getByRole('row', {
      name: /Engineering & Technology/,
    });
    expect(engineering).toHaveTextContent('1');
    expect(engineering).toHaveTextContent('₹52,000');
    const sales = within(departments).getByRole('row', {
      name: /Sales & Business Development/,
    });
    expect(sales).toHaveTextContent('₹80,000');
    expect(within(departments).getByRole('row', { name: /^Total/ })).toHaveTextContent('2');
  });

  it('offers a payslip action that hands the employee back to App', async () => {
    const user = userEvent.setup();
    const onSelectEmployee = vi.fn();
    renderReport({ onSelectEmployee });

    await user.click(
      within(employeeTable()).getByRole('button', {
        name: 'Open payslip for Asha Menon',
      }),
    );
    expect(onSelectEmployee).toHaveBeenCalledWith(emp(), MONTH);
  });
});

describe('Finance Report — empty month, export and print', () => {
  it('shows a truthful zero statement and an empty-state message', () => {
    renderReport({ employees: [] });

    expect(kpiValue('Employees paid')).toBe('0');
    expect(kpiValue('Gross Earnings (fixed)')).toBe('₹0');
    expect(kpiValue('Bonuses')).toBe('₹0');
    expect(kpiValue('Net Payable')).toBe('₹0');
    expect(kpiValue('Total Cost to Company')).toBe('₹0');
    expect(screen.getAllByText(/No active employees for November 2026/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('exports the month workbook through XLSX.writeFile', async () => {
    const user = userEvent.setup();
    renderReport({
      bonuses: [bonus(), bonus({ id: 'bonus-2', kind: 'Custom', label: 'Diwali', amount: 1000 })],
    });

    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [workbook, filename] = writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    expect(filename).toBe('OmniHR_Finance_Report_2026-11.xlsx');
    expect(workbook.SheetNames).toEqual(['Summary', 'Departments', 'Employees']);

    const employees = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets.Employees,
    );
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({
      'Employee': 'Asha Menon',
      'Performance Bonus': 2500,
      'Custom Bonus': 1000,
    });
  });

  it('prints through window.print and renders a company/month/generated masthead', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderReport({ currentMonthKey: MONTH });

    expect(screen.getByText('Finance Report — November 2026')).toBeInTheDocument();
    expect(screen.getByText(/^Month: November 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Generated/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Print report' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
