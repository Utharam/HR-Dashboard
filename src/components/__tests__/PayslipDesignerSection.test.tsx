import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PayslipDesignerSection } from '../PayslipDesignerSection';
import { createDefaultPayStructure } from '../../utils/payStructure';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../../types';

/*
 * The Payslip Designer (design §6.1): the company template editor and the
 * per-employee overrides, both with live previews. The component editor's
 * validation, the draft lifecycle (unsaved callout, reset-to-default), the
 * performance-bonus rules and the override save/remove contract are pinned
 * here; the arithmetic itself is pinned in utils/__tests__/payStructure.test.ts
 * and the payslip lines in PayslipBreakdown.test.tsx.
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
  emp({ id: 'EMP-2', name: 'Ravi Kumar', monthlyCTC: 80000, basicSalary: 40000, hra: 20000, specialAllowance: 20000 }),
  emp({ id: 'EMP-3', name: 'Resigned Rita', status: 'Resigned' }),
];

const BONUS: PayrollBonus = {
  id: 'bonus-1',
  employeeId: 'EMP-1',
  monthKey: '2026-11',
  kind: 'Performance',
  label: 'Q3 bonus',
  amount: 2500,
  rating: 4,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

/**
 * A harness that holds the datasets the way App does, so a save flows back in
 * as props and the section's post-save state (the "Custom structure" badge,
 * the Remove override button) can be asserted the way a user sees it.
 */
function createHarness(initial: {
  structure?: PayStructure;
  overrides?: PayStructureOverride[];
  bonuses?: PayrollBonus[];
}) {
  const spies = {
    onSaveStructure: vi.fn(),
    onSaveOverride: vi.fn(),
    onRemoveOverride: vi.fn(),
  };
  function Harness() {
    const [structure, setStructure] = useState<PayStructure>(
      initial.structure ?? createDefaultPayStructure(),
    );
    const [overrides, setOverrides] = useState<PayStructureOverride[]>(initial.overrides ?? []);
    return (
      <PayslipDesignerSection
        employees={EMPLOYEES}
        payStructure={structure}
        payOverrides={overrides}
        payrollBonuses={initial.bonuses ?? []}
        monthKey="2026-11"
        onSaveStructure={(next) => {
          spies.onSaveStructure(next);
          setStructure(next);
        }}
        onSaveOverride={(override) => {
          spies.onSaveOverride(override);
          setOverrides((prev) =>
            prev.some((row) => row.employeeId === override.employeeId)
              ? prev.map((row) =>
                  row.employeeId === override.employeeId ? override : row,
                )
              : [...prev, override],
          );
        }}
        onRemoveOverride={(employeeId) => {
          spies.onRemoveOverride(employeeId);
          setOverrides((prev) => prev.filter((row) => row.employeeId !== employeeId));
        }}
      />
    );
  }
  return { Harness, ...spies };
}

const companyCard = () => screen.getByRole('region', { name: 'Company template' }) as unknown as HTMLElement;
const overrideCard = () => screen.getByRole('region', { name: 'Employee overrides' }) as unknown as HTMLElement;

const rows = (scope: HTMLElement): HTMLElement[] =>
  Array.from(scope.querySelectorAll('.designer-row'));

const rowByIndex = (scope: HTMLElement, index: number): HTMLElement => {
  const row = rows(scope)[index];
  if (!row) throw new Error(`No component row ${index}`);
  return row;
};

describe('Payslip Designer — company template', () => {
  it('previews the first active employee on the company template', () => {
    const harness = createHarness({});
    render(<harness.Harness />);

    // Auto-selection: the first employee in the payroll run, not a resigned one.
    const picker = screen.getByLabelText('Pick the preview employee') as HTMLSelectElement;
    expect(picker.value).toBe('EMP-1');

    const companyTable = within(companyCard()).getByRole('table', {
      name: 'Company template preview for Asha Menon',
    });
    // The default template's lines, priced on the employee's CTC.
    expect(companyTable.textContent).toContain('• Basic Salary');
    expect(companyTable.textContent).toContain('₹50,000');
    expect(companyTable.textContent).toContain('₹25,000');
    // Net = 100,000 gross − 3,000 EPF (the 25k ceiling) − 200 PT.
    expect(companyTable.textContent).toContain('₹96,800');
  });

  it('calls out unsaved changes and saves the draft through onSaveStructure', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);
    expect(harness.onSaveStructure).not.toHaveBeenCalled();

    // Nothing is dirty yet.
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /EPF on/ }));
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save structure/ }));

    expect(harness.onSaveStructure).toHaveBeenCalledTimes(1);
    const saved = harness.onSaveStructure.mock.calls[0][0] as PayStructure;
    expect(saved.epfEnabled).toBe(false);
    expect(saved.professionalTaxEnabled).toBe(true);
    // The save is stamped as a new edit, not the imported default's timestamp.
    expect(saved.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');

    // The save flows back through App: the callout clears and the chip reads off.
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/i)).toBeNull());
    expect(within(companyCard()).getByRole('button', { name: /EPF off/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('lists validation errors and keeps Save disabled until the draft is valid', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    // Removing the Basic row breaks the structure.
    await user.click(
      within(rowByIndex(companyCard(), 0)).getByRole('button', { name: /Remove row 1/ }),
    );

    const alert = within(companyCard()).getByRole('alert');
    expect(alert).toHaveTextContent(/Exactly one earning component must be Basic/i);
    expect(within(companyCard()).getByRole('button', { name: /Save structure/ })).toBeDisabled();

    // A fresh row can be built back into a valid Basic.
    await user.click(within(companyCard()).getByRole('button', { name: /Add earning component/ }));
    const newRow = rowByIndex(companyCard(), 2);
    await user.type(within(newRow).getByLabelText(/Component 3 name/), 'Basic Salary');
    await user.selectOptions(within(newRow).getByLabelText('Basis'), '% of Monthly CTC');
    await user.click(within(newRow).getByLabelText('Basic'));

    await waitFor(() =>
      expect(within(companyCard()).queryByRole('alert')).toBeNull(),
    );
    expect(within(companyCard()).getByRole('button', { name: /Save structure/ })).toBeEnabled();

    await user.click(within(companyCard()).getByRole('button', { name: /Save structure/ }));
    const saved = harness.onSaveStructure.mock.calls[0][0] as PayStructure;
    expect(saved.components).toHaveLength(3);
    expect(saved.components.filter((c) => c.isBasic)).toHaveLength(1);
  });

  it('rejects two Remainder rows by validation', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    // Row 2 is the Remainder ("Special Allowance"); making the HRA row a second
    // remainder must be refused.
    const hraRow = rowByIndex(companyCard(), 1);
    await user.selectOptions(within(hraRow).getByLabelText('Basis'), 'Remainder of CTC');

    expect(within(companyCard()).getByRole('alert')).toHaveTextContent(
      /Only one Remainder component is allowed/i,
    );
    expect(within(companyCard()).getByRole('button', { name: /Save structure/ })).toBeDisabled();
  });

  it('edits the performance-bonus rules for ratings 5..1 and saves them', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.clear(screen.getByLabelText('Bonus percent of Basic for rating 5'));
    await user.type(screen.getByLabelText('Bonus percent of Basic for rating 5'), '15');
    await user.type(screen.getByLabelText('Bonus percent of Basic for rating 1'), '2');

    await user.click(within(companyCard()).getByRole('button', { name: /Save structure/ }));

    const saved = harness.onSaveStructure.mock.calls[0][0] as PayStructure;
    expect(saved.performanceBonusRules.find((rule) => rule.rating === 5)?.percentOfBasic).toBe(15);
    expect(saved.performanceBonusRules.find((rule) => rule.rating === 1)?.percentOfBasic).toBe(2);
  });

  it('treats Reset to default as a draft action until saved', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.click(screen.getByRole('button', { name: /Professional Tax on/ }));
    expect(within(companyCard()).getByRole('button', { name: /Save structure/ })).toBeEnabled();
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reset to default/ }));

    // The draft is back to the default; nothing reached the parent.
    expect(
      within(companyCard()).getByRole('button', { name: /Professional Tax on/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull();
    expect(harness.onSaveStructure).not.toHaveBeenCalled();
  });

  it('prices the company preview with the current month\'s bonuses only', () => {
    const harness = createHarness({
      bonuses: [
        BONUS,
        { ...BONUS, id: 'bonus-2', label: 'October spot award', amount: 1000, monthKey: '2026-10' },
      ],
    });
    render(<harness.Harness />);

    const table = within(companyCard()).getByRole('table', {
      name: 'Company template preview for Asha Menon',
    });
    expect(table.textContent).toContain('Q3 bonus');
    expect(table.textContent).toContain('+₹2,500');
    // Net = 100,000 + 2,500 − 3,200 = 99,300.
    expect(table.textContent).toContain('₹99,300');
    // Another month's bonus is not a November earning.
    expect(table.textContent).not.toContain('October spot award');
  });

  it('shows the no-payslip note for an employee outside the payroll run', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-3');

    const companyTable = within(companyCard()).queryByRole('table', {
      name: /Company template preview/,
    });
    expect(companyTable).toBeNull();
    expect(companyCard().textContent).toContain('not part of the payroll run');
  });
});

describe('Payslip Designer — employee overrides', () => {
  it('says an uncustomised employee follows the company template', () => {
    const harness = createHarness({});
    render(<harness.Harness />);

    expect(within(overrideCard()).getByText(/Follows the company template/i)).toBeInTheDocument();
    expect(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    ).toBeInTheDocument();
    expect(within(overrideCard()).queryByRole('button', { name: /Remove override/ })).toBeNull();
  });

  it('clones the resolved structure, saves the override and shows the saved state', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    // Pick Ravi (CTC 80,000 → template Basic 40,000) and customize.
    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-2');
    await user.click(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    );

    // The clone starts from the company template's OWN copy: editing it does not
    // touch the company draft. (The value field holds the PERCENT, not the
    // computed amount - 50% of Ravi's 80,000 prices 40,000.)
    const overrideRow = rowByIndex(overrideCard(), 0);
    expect(within(overrideRow).getByLabelText(/Component 1 name/)).toHaveValue('Basic Salary');
    expect(within(overrideRow).getByLabelText('Value')).toHaveValue(50);

    await user.clear(within(overrideRow).getByLabelText('Value'));
    await user.type(within(overrideRow).getByLabelText('Value'), '60');
    await user.type(screen.getByLabelText('Note (optional)'), 'Retention adjustment for 2026');

    await user.click(
      within(overrideCard()).getByRole('button', { name: /Save override/ }),
    );

    const saved = harness.onSaveOverride.mock.calls[0][0] as PayStructureOverride;
    expect(saved.employeeId).toBe('EMP-2');
    expect(saved.components[0]).toEqual(
      expect.objectContaining({ id: 'basic', value: 60, isBasic: true }),
    );
    expect(saved.note).toBe('Retention adjustment for 2026');

    // The save flows back in as props: the card shows the saved override.
    await waitFor(() =>
      expect(within(overrideCard()).getByText('Custom structure')).toBeInTheDocument(),
    );
    expect(overrideCard().textContent).toContain('Retention adjustment for 2026');
    expect(
      within(overrideCard()).getByRole('button', { name: /Remove override/ }),
    ).toBeInTheDocument();

    // The override preview prices the employee's own copy: Basic 60% of 80,000
    // CTC = 48,000.
    const preview = within(overrideCard()).getByRole('table', {
      name: 'Pay override preview for Ravi Kumar',
    });
    expect(preview.textContent).toContain('₹48,000');
  });

  it('lists override validation errors and keeps the save disabled', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-2');
    await user.click(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    );

    await user.click(
      within(rowByIndex(overrideCard(), 0)).getByRole('button', { name: /Remove row 1/ }),
    );

    expect(within(overrideCard()).getByRole('alert')).toHaveTextContent(
      /Exactly one earning component must be Basic/i,
    );
    expect(within(overrideCard()).getByRole('button', { name: /Save override/ })).toBeDisabled();
    expect(harness.onSaveOverride).not.toHaveBeenCalled();
  });

  it('edits an existing override through the same customize flow', async () => {
    const user = userEvent.setup();
    const existing: PayStructureOverride = {
      employeeId: 'EMP-2',
      components: [
        { id: 'basic', name: 'Contract Base', basis: 'Fixed', value: 45000, isBasic: true },
        { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
      ],
      epfEnabled: true,
      professionalTaxEnabled: false,
      note: 'Contractor terms',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const harness = createHarness({ overrides: [existing] });
    render(<harness.Harness />);

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-2');

    // The saved state is shown before the draft is opened.
    expect(within(overrideCard()).getByText('Custom structure')).toBeInTheDocument();
    expect(overrideCard().textContent).toContain('Contractor terms');

    await user.click(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    );

    // The draft is the OVERRIDE's copy, not the company template's.
    const overrideRow = rowByIndex(overrideCard(), 0);
    expect(within(overrideRow).getByLabelText(/Component 1 name/)).toHaveValue('Contract Base');
    expect(within(overrideRow).getByLabelText('Value')).toHaveValue(45000);
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Contractor terms');

    // EPF/PT toggles ride on the override, not on the company template.
    expect(
      within(overrideCard()).getByRole('button', { name: /Professional Tax off/ }),
    ).toHaveAttribute('aria-pressed', 'false');

    await user.click(
      within(overrideCard()).getByRole('button', { name: /Professional Tax off/ }),
    );
    await user.click(within(overrideCard()).getByRole('button', { name: /Save override/ }));

    const saved = harness.onSaveOverride.mock.calls[0][0] as PayStructureOverride;
    expect(saved.employeeId).toBe('EMP-2');
    expect(saved.professionalTaxEnabled).toBe(true);
    // The note survives an edit that did not touch it.
    expect(saved.note).toBe('Contractor terms');
  });

  it('removes an override and returns the employee to the template', async () => {
    const user = userEvent.setup();
    const existing: PayStructureOverride = {
      employeeId: 'EMP-2',
      components: createDefaultPayStructure().components,
      epfEnabled: true,
      professionalTaxEnabled: true,
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const harness = createHarness({ overrides: [existing] });
    render(<harness.Harness />);

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-2');
    await user.click(within(overrideCard()).getByRole('button', { name: /Remove override/ }));

    expect(harness.onRemoveOverride).toHaveBeenCalledWith('EMP-2');
    await waitFor(() =>
      expect(within(overrideCard()).getByText(/Follows the company template/i)).toBeInTheDocument(),
    );
    expect(within(overrideCard()).queryByRole('button', { name: /Remove override/ })).toBeNull();
  });

  it('abandons an open override draft when another employee is picked', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-2');
    await user.click(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    );
    expect(within(overrideCard()).getByLabelText('Note (optional)')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Pick the preview employee'), 'EMP-1');

    // The draft belonged to Ravi; switching away discards it rather than risking
    // a save onto the wrong payslip.
    expect(screen.queryByLabelText('Note (optional)')).toBeNull();
    expect(
      within(overrideCard()).getByRole('button', { name: 'Customize for this employee' }),
    ).toBeInTheDocument();
    expect(harness.onSaveOverride).not.toHaveBeenCalled();
  });

  it('searches the register and narrows the picker', async () => {
    const user = userEvent.setup();
    const harness = createHarness({});
    render(<harness.Harness />);

    await user.type(screen.getByLabelText('Search employees for the payslip preview'), 'ravi');
    const select = screen.getByLabelText('Pick the preview employee') as HTMLSelectElement;
    const options = Array.from(select.options);
    // The currently previewed employee stays selectable even when filtered out;
    // the search narrows everything else to the match.
    expect(options.map((option) => option.value)).toEqual(['EMP-1', 'EMP-2']);
    expect(options[1].textContent).toContain('Ravi Kumar');
  });
});
