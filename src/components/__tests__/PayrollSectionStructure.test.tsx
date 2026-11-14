import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PayrollSection } from '../PayrollSection';
import { createDefaultPayStructure } from '../../utils/payStructure';
import { formatCrores } from '../../utils/formatters';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../../types';

/*
 * The Payroll register priced by `computePayrollWithStructure` (design §6.2):
 * structure-agnostic columns, totals that match the calculation the payslip
 * and the export use, and the "Bonuses this month" card wired to App's
 * add/edit/delete handlers through the shared BonusModal.
 */

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

const EMPLOYEES: Employee[] = [
  emp({ id: 'EMP-1', name: 'Asha Menon' }),
  emp({
    id: 'EMP-2',
    name: 'Ravi Kumar',
    monthlyCTC: 80000,
    basicSalary: 40000,
    hra: 20000,
    specialAllowance: 20000,
  }),
  emp({ id: 'EMP-3', name: 'Resigned Rita', status: 'Resigned' }),
];

const MONTH = '2026-11';

// 40% CTC Basic, 25%-of-Basic HRA, remainder balance, PT off.
const CUSTOM_STRUCTURE: PayStructure = {
  components: [
    { id: 'basic', name: 'Base Pay', basis: 'PercentOfCTC', value: 40, isBasic: true },
    { id: 'hra', name: 'House Allowance', basis: 'PercentOfBasic', value: 25 },
    { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
  ],
  epfEnabled: true,
  professionalTaxEnabled: false,
  performanceBonusRules: createDefaultPayStructure().performanceBonusRules,
  updatedAt: '2026-11-01T00:00:00.000Z',
};

// Ravi is overridden: Fixed 20,000 Basic + remainder, EPF off.
const OVERRIDE: PayStructureOverride = {
  employeeId: 'EMP-2',
  components: [
    { id: 'basic', name: 'Contract Base', basis: 'Fixed', value: 20000, isBasic: true },
    { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
  ],
  epfEnabled: false,
  professionalTaxEnabled: false,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const BONUS_THIS_MONTH: PayrollBonus = {
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

const BONUS_OTHER_MONTH: PayrollBonus = {
  ...BONUS_THIS_MONTH,
  id: 'bonus-2',
  label: 'October spot award',
  amount: 1000,
  monthKey: '2026-10',
};

const baseProps = (overrides: Partial<Parameters<typeof PayrollSection>[0]> = {}) => ({
  employees: EMPLOYEES,
  structure: CUSTOM_STRUCTURE,
  overrides: [OVERRIDE],
  bonuses: [BONUS_THIS_MONTH, BONUS_OTHER_MONTH],
  monthKey: MONTH,
  onSelectEmployee: vi.fn(),
  onSaveBonus: vi.fn(),
  onDeleteBonus: vi.fn(),
  ...overrides,
});

const rowFor = (name: RegExp): HTMLElement => {
  const row = screen.getByRole('row', { name });
  return row as unknown as HTMLElement;
};

describe('PayrollSection — structure-aware columns', () => {
  it('replaces the fixed 50/25/25 columns with structure-agnostic ones', () => {
    render(<PayrollSection {...baseProps()} />);

    const header = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(header).toEqual([
      'Emp ID',
      'Employee',
      'Department',
      'Status',
      'Monthly CTC',
      'Gross Earnings',
      'Bonus',
      'EPF (12%)',
      'PT',
      'LOP',
      'Net Disbursable',
      'Payslip',
    ]);
    expect(header).not.toContain('Basic (50%)');
    expect(header).not.toContain('HRA (25%)');
  });

  it('prices each row by the structure, the override and the month bonus', () => {
    render(<PayrollSection {...baseProps()} />);

    // Asha on the company template: Basic 40k, HRA 10k, balance 50k, EPF 3k
    // (the wage ceiling), PT off, +2,500 bonus → net 99,500.
    const asha = rowFor(/Asha Menon/);
    expect(asha.textContent).toContain('₹1,00,000'); // Monthly CTC
    expect(asha.textContent).toContain('₹1,02,500'); // Gross incl. bonus
    expect(asha.textContent).toContain('+₹2,500'); // Bonus column
    expect(asha.textContent).toContain('−₹3,000'); // EPF
    expect(asha.textContent).toContain('−₹0'); // PT off on the structure
    expect(asha.textContent).toContain('₹99,500'); // Net

    // Ravi on his override: Fixed 20,000 Basic, EPF off → net 80,000.
    const ravi = rowFor(/Ravi Kumar/);
    expect(ravi.textContent).toContain('₹80,000'); // Gross = CTC
    expect(ravi.textContent).toContain('—'); // No bonus this month
    expect(ravi.textContent).toContain('₹80,000'); // Net = gross

    // Resigned Rita is priced for the record but carries the badge that says
    // why her Net is not in the active-only cards above.
    const rita = rowFor(/Resigned Rita/);
    expect(within(rita).getByText('Resigned')).toBeInTheDocument();
  });

  it('reports the KPI totals the active rows sum to', () => {
    render(<PayrollSection {...baseProps()} />);

    const activeCTC = EMPLOYEES.filter((e) => e.status === 'Active').reduce(
      (sum, e) => sum + e.monthlyCTC,
      0,
    );
    const ctcCard = screen.getByText('Total Monthly CTC').closest('.omni-card');
    expect(ctcCard?.querySelector('.kpi-value')?.textContent).toBe(formatCrores(activeCTC));

    // Gross earnings include the bonus; the sub says how much of it is one-off.
    // (The column header shares the label, so the unique sub text finds the KPI.)
    const grossCard = screen
      .getByText(/Including ₹2,500 of this month's bonuses/)
      .closest('.omni-card');
    expect(grossCard?.textContent).toContain("this month's bonuses");
    // EPF 3,000 (Asha only) + PT 0.
    const statutoryCard = screen.getByText('Statutory EPF & PT').closest('.omni-card');
    expect(statutoryCard?.querySelector('.kpi-value')?.textContent).toBe('₹3,000');

    // Net payroll = 99,500 + 80,000.
    const netCard = screen.getByText('Disbursable Net Payroll').closest('.omni-card');
    expect(netCard?.querySelector('.kpi-value')?.textContent).toBe('₹0.02 Cr');
  });

  it('still renders truthfully with the legacy minimal props (default structure, no bonuses)', () => {
    render(
      <PayrollSection
        employees={EMPLOYEES}
        onSelectEmployee={() => {}}
      />,
    );

    // Default structure pricing for Asha: EPF min(50,000, 25,000) × 12%.
    const asha = rowFor(/Asha Menon/);
    expect(asha.textContent).toContain('−₹3,000');
    expect(asha.textContent).toContain('−₹200'); // PT on in the default structure
    // No bonus column entries and an empty bonus card.
    expect(asha.textContent).toContain('—');
    expect(screen.getByText(/No bonuses recorded for this month yet/i)).toBeInTheDocument();
  });
});

describe('PayrollSection — bonuses this month', () => {
  it('lists this month\'s bonuses with employee, kind, label and amount', () => {
    render(<PayrollSection {...baseProps()} />);

    const card = screen.getByRole('region', { name: 'Bonuses this month' });
    expect(card.textContent).toContain('November 2026');
    expect(within(card).getByText('Asha Menon')).toBeInTheDocument();
    expect(within(card).getByText('Performance')).toBeInTheDocument();
    expect(within(card).getByText('Q3 bonus')).toBeInTheDocument();
    expect(within(card).getByText('+₹2,500')).toBeInTheDocument();
    // Another month's bonus stays in its month.
    expect(within(card).queryByText('October spot award')).toBeNull();
  });

  it('wires Add through the bonus modal to the save handler', async () => {
    const user = userEvent.setup();
    const onSaveBonus = vi.fn();
    render(<PayrollSection {...baseProps({ onSaveBonus })} />);

    await user.click(screen.getByRole('button', { name: 'Add bonus' }));

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-2');
    await user.type(within(dialog).getByLabelText('Label'), 'Spot award');
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '1500');
    await user.click(within(dialog).getByRole('button', { name: 'Add bonus' }));

    expect(onSaveBonus).toHaveBeenCalledTimes(1);
    expect(onSaveBonus.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        employeeId: 'EMP-2',
        monthKey: MONTH,
        kind: 'Custom',
        label: 'Spot award',
        amount: 1500,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('wires Edit to reopen the modal with the stored bonus and Delete to the handler', async () => {
    const user = userEvent.setup();
    const onSaveBonus = vi.fn();
    const onDeleteBonus = vi.fn();
    render(<PayrollSection {...baseProps({ onSaveBonus, onDeleteBonus })} />);

    const card = screen.getByRole('region', { name: 'Bonuses this month' });
    await user.click(within(card).getByRole('button', { name: /Edit Q3 bonus for Asha Menon/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Label')).toHaveValue('Q3 bonus');
    expect(within(dialog).getByLabelText('Amount (₹)')).toHaveValue(2500);

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(onSaveBonus).toHaveBeenCalledTimes(1);
    expect((onSaveBonus.mock.calls[0][0] as PayrollBonus).id).toBe('bonus-1');

    await user.click(within(card).getByRole('button', { name: /Delete Q3 bonus for Asha Menon/ }));
    expect(onDeleteBonus).toHaveBeenCalledWith('bonus-1');
  });
});
