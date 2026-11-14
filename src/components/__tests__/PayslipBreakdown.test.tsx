import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PayslipBreakdown } from '../PayslipBreakdown';
import { computePayrollWithStructure } from '../../utils/payStructure';
import type { Employee, PayStructureOverride, PayrollBonus } from '../../types';

/*
 * The shared payslip lines (design §6.3): whatever structure or bonuses the
 * caller prices, the lines the reader sees are the RESOLVED earnings in
 * structure order, then bonuses, then the deductions, then net - and the
 * employer EPF stays a note under the table, never a deduction.
 */

const AS_OF = '2026-11-14';
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
  monthlyCTC: 100000,
  basicSalary: 50000,
  hra: 25000,
  specialAllowance: 25000,
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

const CUSTOM_STRUCTURE = {
  components: [
    { id: 'basic', name: 'Base Pay', basis: 'Fixed' as const, value: 60000, isBasic: true },
    { id: 'perf', name: 'Performance Allowance', basis: 'PercentOfBasic' as const, value: 10 },
    { id: 'balance', name: 'Balance', basis: 'Remainder' as const, value: 0 },
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
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const BONUS: PayrollBonus = {
  id: 'bonus-1',
  employeeId: 'EMP-1',
  monthKey: MONTH,
  kind: 'Performance',
  label: 'Q3 bonus',
  amount: 2500,
  rating: 4,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

// Fixed Basic 60,000 → allowance 6,000 → balance 34,000 → gross 100,000.
// EPF prices the wage ceiling in force on AS_OF: min(60000, 25000) × 12% = 3,000.
const breakdownWithBonus = computePayrollWithStructure(emp(), {
  structure: CUSTOM_STRUCTURE,
  bonuses: [BONUS],
  monthKey: MONTH,
  asOf: AS_OF,
});

const breakdownWithLop = computePayrollWithStructure(emp({ lopDays: 2 }), {
  structure: CUSTOM_STRUCTURE,
  monthKey: MONTH,
  asOf: AS_OF,
});

describe('PayslipBreakdown', () => {
  it('renders the resolved earning lines in structure order, named as authored', () => {
    render(<PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />);

    const lines = screen.getAllByRole('row')
      .map((row) => row.textContent ?? '')
      .filter((text) => text.includes('•'));
    expect(lines).toEqual([
      expect.stringContaining('Base Pay'),
      expect.stringContaining('Performance Allowance'),
      expect.stringContaining('Balance'),
      expect.stringContaining('Q3 bonus'),
    ]);
  });

  it('prices a Fixed Basic from the structure, not from the stored employee split', () => {
    render(<PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />);

    // The stored basicSalary is 50,000; the structure says Fixed 60,000.
    expect(screen.getByText('₹60,000')).toBeInTheDocument();
    // The remainder absorbs CTC minus the other earnings.
    expect(screen.getByText('₹34,000')).toBeInTheDocument();
  });

  it('shows bonuses as an added line with their kind, and gross including them', () => {
    render(<PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />);

    expect(screen.getByText(/Q3 bonus/)).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('+₹2,500')).toBeInTheDocument();
    // Gross Earnings = 100,000 structure gross + 2,500 bonus.
    expect(screen.getByText('₹1,02,500')).toBeInTheDocument();
  });

  it('shows the deductions and the net, floored arithmetic intact', () => {
    render(<PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />);

    expect(screen.getByText('−₹3,000')).toBeInTheDocument(); // EPF @ the 25k ceiling
    expect(screen.getByText('−₹200')).toBeInTheDocument(); // PT
    // Net = 102,500 − 3,200.
    expect(screen.getByText('₹99,300')).toBeInTheDocument();
  });

  it('shows the Loss of Pay line only when there is LOP to price', () => {
    const { rerender } = render(
      <PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />,
    );
    expect(screen.queryByText(/Loss of Pay/)).toBeNull();

    // 2 days @ Basic/26 = round(60000 / 26 × 2) = 4,615.
    rerender(<PayslipBreakdown employee={emp({ lopDays: 2 })} breakdown={breakdownWithLop} />);
    expect(screen.getByText(/Loss of Pay \(2 days @ Basic\/26\)/)).toBeInTheDocument();
    expect(screen.getByText('−₹4,615')).toBeInTheDocument();
  });

  it('states the employer EPF as a company-cost note, never as a deduction', () => {
    render(<PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />);

    const note = screen.getByText(/Employer EPF contribution/i);
    expect(note.textContent).toContain('₹3,000');
    expect(note.textContent).toContain('not deducted');
    // It is a note below the table, not a row inside it.
    expect(note.closest('tr')).toBeNull();
  });

  it('keeps the note off the payslip when EPF is off', () => {
    const breakdown = computePayrollWithStructure(emp(), {
      structure: { ...CUSTOM_STRUCTURE, epfEnabled: false },
      monthKey: MONTH,
      asOf: AS_OF,
    });
    render(<PayslipBreakdown employee={emp()} breakdown={breakdown} />);

    expect(screen.queryByText(/Employer EPF contribution/i)).toBeNull();
  });

  it('names the table for its employee by default and accepts a caller caption', () => {
    const { rerender } = render(
      <PayslipBreakdown employee={emp()} breakdown={breakdownWithBonus} />,
    );
    expect(
      screen.getByRole('table', { name: 'Monthly payslip breakdown for Asha Menon' }),
    ).toBeInTheDocument();

    rerender(
      <PayslipBreakdown
        employee={emp()}
        breakdown={breakdownWithBonus}
        caption="Override preview for Asha Menon"
      />,
    );
    expect(screen.getByRole('table', { name: 'Override preview for Asha Menon' })).toBeInTheDocument();
  });

  it('survives an override employee priced by their own copy', () => {
    const override: PayStructureOverride = {
      employeeId: 'EMP-1',
      components: [
        { id: 'basic', name: 'Contract Base', basis: 'Fixed', value: 40000, isBasic: true },
        { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
      ],
      epfEnabled: false,
      professionalTaxEnabled: false,
      updatedAt: '2026-11-02T00:00:00.000Z',
    };
    const breakdown = computePayrollWithStructure(emp(), {
      structure: CUSTOM_STRUCTURE,
      overrides: [override],
      bonuses: [BONUS],
      monthKey: MONTH,
      asOf: AS_OF,
    });
    render(<PayslipBreakdown employee={emp()} breakdown={breakdown} />);

    expect(screen.getByText('₹40,000')).toBeInTheDocument();
    // EPF/PT off on the override: no deduction lines beyond the net.
    expect(screen.queryByText(/Professional Tax/)).toBeNull();
    expect(screen.queryByText(/Provident Fund/)).toBeNull();
    // Net = 40,000 + 60,000 balance + 2,500 bonus = 1,02,500 (gross and net
    // agree when the override toggles both statutory deductions off).
    const netRow = screen.getByText('Net Take-Home Pay').closest('tr');
    expect(netRow?.textContent).toContain('₹1,02,500');
  });
});
