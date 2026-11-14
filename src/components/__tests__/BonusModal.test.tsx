import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BonusModal } from '../BonusModal';
import { createDefaultPayStructure } from '../../utils/payStructure';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../../types';

/*
 * The bonus form behind the Payroll page's "Bonuses this month" card
 * (design §6.2): month-scoped, performance-kind suggestions priced on the
 * employee's RESOLVED structure, HR-overwritable amounts, and
 * `validatePayrollBonus` as the save gate.
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
  emp({ id: 'EMP-2', name: 'Resigned Rita', status: 'Resigned', performanceRating: 5 }),
];

const EXISTING: PayrollBonus[] = [
  {
    id: 'bonus-9',
    employeeId: 'EMP-2',
    monthKey: '2026-10',
    kind: 'Custom',
    label: 'October spot award',
    amount: 1000,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

const baseProps = (overrides: Partial<Parameters<typeof BonusModal>[0]> = {}) => ({
  isOpen: true,
  onClose: () => {},
  onSave: () => {},
  employees: EMPLOYEES,
  bonuses: EXISTING,
  monthKey: '2026-11',
  structure: createDefaultPayStructure(),
  overrides: [] as PayStructureOverride[],
  bonusToEdit: null,
  ...overrides,
});

describe('BonusModal — add', () => {
  it('saves a custom bonus scoped to the payroll month', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BonusModal {...baseProps()} onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.selectOptions(screen.getByLabelText('Kind'), 'Custom');
    await user.type(screen.getByLabelText('Label'), 'Festival bonus');
    await user.type(screen.getByLabelText('Amount (₹)'), '3000');

    await user.click(screen.getByRole('button', { name: 'Add bonus' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as PayrollBonus;
    expect(saved).toEqual(
      expect.objectContaining({
        employeeId: 'EMP-1',
        monthKey: '2026-11',
        kind: 'Custom',
        label: 'Festival bonus',
        amount: 3000,
      }),
    );
    // No rating is carried by a custom bonus.
    expect(saved.rating).toBeUndefined();
    // The id is fresh and does not collide with the stored list.
    expect(saved.id).not.toBe('bonus-9');
    expect(EXISTING.some((bonus) => bonus.id === saved.id)).toBe(false);
  });

  it('preselects the employee rating and the suggested amount for a performance bonus', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BonusModal {...baseProps()} onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.selectOptions(screen.getByLabelText('Kind'), 'Performance');

    // Rating 4 → 5% of Basic 50,000 = 2,500, suggested into the amount field.
    const amount = screen.getByLabelText('Amount (₹)') as HTMLInputElement;
    await waitFor(() => expect(amount).toHaveValue(2500));
    expect(screen.getByText(/Suggested for ★4: 5% of Basic/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Label'), 'Q3 bonus');
    await user.click(screen.getByRole('button', { name: 'Add bonus' }));

    const saved = onSave.mock.calls[0][0] as PayrollBonus;
    expect(saved.kind).toBe('Performance');
    expect(saved.rating).toBe(4);
    expect(saved.amount).toBe(2500);
  });

  it('lets HR overwrite the suggested amount', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BonusModal {...baseProps()} onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.selectOptions(screen.getByLabelText('Kind'), 'Performance');
    await waitFor(() => expect(screen.getByLabelText('Amount (₹)')).toHaveValue(2500));

    const amount = screen.getByLabelText('Amount (₹)');
    await user.clear(amount);
    await user.type(amount, '4000');
    await user.type(screen.getByLabelText('Label'), 'Q3 bonus');
    await user.click(screen.getByRole('button', { name: 'Add bonus' }));

    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amount: 4000, rating: 4 }),
    );
  });

  it('prices the suggestion on the employee override, not the company template', async () => {
    const user = userEvent.setup();
    const override: PayStructureOverride = {
      employeeId: 'EMP-1',
      components: [
        { id: 'basic', name: 'Basic Salary', basis: 'Fixed', value: 30000, isBasic: true },
        { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
      ],
      epfEnabled: true,
      professionalTaxEnabled: true,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    render(<BonusModal {...baseProps({ overrides: [override] })} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.selectOptions(screen.getByLabelText('Kind'), 'Performance');

    // The default rating-4 rule is 5% of Basic — 5% of the override's Fixed
    // 30,000 = 1,500 (not 5% of the template's 50,000).
    await waitFor(() => expect(screen.getByLabelText('Amount (₹)')).toHaveValue(1500));
  });

  it('offers only the payroll run in the employee picker', () => {
    render(<BonusModal {...baseProps()} />);

    const select = screen.getByLabelText('Employee') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(['', 'EMP-1']);
  });

  it('explains a missing performance rule and leaves the amount to HR', async () => {
    const user = userEvent.setup();
    const structure: PayStructure = {
      ...createDefaultPayStructure(),
      performanceBonusRules: [
        { rating: 5, percentOfBasic: 10 },
        { rating: 4, percentOfBasic: 0 },
        { rating: 3, percentOfBasic: 0 },
        { rating: 2, percentOfBasic: 0 },
        { rating: 1, percentOfBasic: 0 },
      ],
    };
    render(<BonusModal {...baseProps({ structure })} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.selectOptions(screen.getByLabelText('Kind'), 'Performance');

    // Rating 4 has no configured percent: no suggested amount is typed into the
    // field (an empty field reads as "fill me in", not as a real ₹0).
    expect(screen.getByLabelText('Amount (₹)')).toHaveValue(null);
    expect(screen.getByText(/No performance rule is configured for ★4/i)).toBeInTheDocument();
  });

  it('refuses an incomplete bonus and keeps the form open', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BonusModal {...baseProps()} onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText('Employee'), 'EMP-1');
    await user.click(screen.getByRole('button', { name: 'Add bonus' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/A payroll bonus needs a label/i);
    expect(alert).toHaveTextContent(/A payroll bonus amount must be a positive/i);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
  });
});

describe('BonusModal — edit', () => {
  const STORED: PayrollBonus = {
    id: 'bonus-5',
    employeeId: 'EMP-1',
    monthKey: '2026-11',
    kind: 'Custom',
    label: 'Festival bonus',
    amount: 2500,
    note: 'From Diwali budget',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  };

  it('reopens with the stored values and keeps the bonus id and createdAt', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BonusModal {...baseProps({ bonusToEdit: STORED })} onSave={onSave} />);

    expect(screen.getByLabelText('Employee')).toHaveValue('EMP-1');
    expect(screen.getByLabelText('Kind')).toHaveValue('Custom');
    expect(screen.getByLabelText('Label')).toHaveValue('Festival bonus');
    expect(screen.getByLabelText('Amount (₹)')).toHaveValue(2500);
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('From Diwali budget');

    const amount = screen.getByLabelText('Amount (₹)');
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const saved = onSave.mock.calls[0][0] as PayrollBonus;
    expect(saved).toEqual(
      expect.objectContaining({
        id: 'bonus-5',
        employeeId: 'EMP-1',
        amount: 5000,
        createdAt: '2026-11-02T00:00:00.000Z',
      }),
    );
    expect(saved.updatedAt).not.toBe(STORED.updatedAt);
  });

  it('editing a performance bonus reopens with its own amount, not a fresh suggestion', () => {
    render(
      <BonusModal
        {...baseProps({
          bonusToEdit: {
            ...STORED,
            kind: 'Performance',
            label: 'Q3 bonus',
            amount: 9000,
            rating: 4,
            note: undefined,
          },
        })}
      />,
    );

    expect(screen.getByLabelText('Amount (₹)')).toHaveValue(9000);
  });

  it('closes without saving on cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BonusModal {...baseProps()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
