import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ThemeProvider } from '../theme/ThemeContext';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DataSnapshot,
  type DataStore,
  type StoreResult,
} from '../data/DataStore';
import { DATA_SCHEMA_VERSION } from '../utils/storage';
import { createDefaultPayStructure } from '../utils/payStructure';
import { snapshotToJson } from '../data/snapshot';
import { monthKey as toMonthKey } from '../utils/attendance';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../types';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Integration: the Payslip Designer and the bonus manager wired to App and
 * through App to the store.
 *
 * The console is mounted through `renderApp` (design decision D9's data seam).
 * The card/store exchange contracts are pinned in the data-layer suites; these
 * tests prove the WIRING - a designer save reaches `savePayStructure`, a bonus
 * reaches `savePayrollBonuses`, a confirmed snapshot import reloads the pay
 * datasets onto the screen, and the legacy localStorage fallback reads the same
 * envelopes the store layer writes.
 */

const ONE_EMPLOYEE: Employee = {
  ...INITIAL_EMPLOYEES[0],
  id: 'EMP-SEED-1',
  name: 'Zora Seed',
  status: 'Active',
};
const ONE_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-SEED-1', title: 'Seed policy' };

// The suite must price "this month" the way App does - from the clock - so the
// fixtures below stay valid whenever the suite runs.
const NOW = new Date();
const MONTH = toMonthKey(NOW.getFullYear(), NOW.getMonth());

function makeSpyStore() {
  const inner = new MemoryStore({
    employees: [ONE_EMPLOYEE],
    policies: [ONE_POLICY],
    leavePlans: [],
  });
  const savePayStructure = vi.fn(
    (structure: PayStructure): Promise<StoreResult> => inner.savePayStructure(structure),
  );
  const savePayOverrides = vi.fn(
    (rows: PayStructureOverride[]): Promise<StoreResult> => inner.savePayOverrides(rows),
  );
  const savePayrollBonuses = vi.fn(
    (rows: PayrollBonus[]): Promise<StoreResult> => inner.savePayrollBonuses(rows),
  );
  const store: DataStore = {
    backend: 'memory',
    load: () => inner.load(),
    saveEmployees: (rows) => inner.saveEmployees(rows),
    savePolicies: (rows) => inner.savePolicies(rows),
    saveLeavePlans: (rows) => inner.saveLeavePlans(rows),
    saveAttendance: (rows) => inner.saveAttendance(rows),
    saveHolidays: (rows) => inner.saveHolidays(rows),
    savePlannerEvents: (rows) => inner.savePlannerEvents(rows),
    savePayStructure,
    savePayOverrides,
    savePayrollBonuses,
    saveSettings: (settings) => inner.saveSettings(settings),
    exportSnapshot: () => inner.exportSnapshot(),
    importSnapshot: (snapshot) => inner.importSnapshot(snapshot),
    clearBusinessData: () => inner.clearBusinessData(),
  };
  return { store, inner, savePayStructure, savePayOverrides, savePayrollBonuses };
}

const navigate = async (tab: string) => {
  const nav = screen.getByRole('navigation');
  await userEvent.click(within(nav).getByRole('button', { name: tab }));
};

describe('Pay persistence — the Payslip Designer saves through the store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a company save reaches savePayStructure with the edited draft', async () => {
    const spy = makeSpyStore();
    await renderApp({ dataStore: spy.store });

    await navigate('Payslip Designer');

    await userEvent.click(screen.getByRole('button', { name: /EPF on/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save structure/ }));

    // The dataset's save effect also runs a harmless round-trip on mount, so
    // the assertion is on what App LAST wrote, not on the call count.
    await waitFor(() => {
      const last = spy.savePayStructure.mock.calls.at(-1)?.[0] as PayStructure | undefined;
      expect(last?.epfEnabled).toBe(false);
    });
    const saved = spy.savePayStructure.mock.calls.at(-1)?.[0] as PayStructure;
    expect(saved.professionalTaxEnabled).toBe(true);
    // The store took the whole structure, not a patch of it.
    expect(saved.components).toHaveLength(3);
  });

  it('an override save reaches savePayOverrides, and removal empties the list', async () => {
    const spy = makeSpyStore();
    await renderApp({ dataStore: spy.store });

    await navigate('Payslip Designer');
    await userEvent.click(
      screen.getByRole('button', { name: 'Customize for this employee' }),
    );
    // Both editors sit on the page once the draft is open; scope to the
    // override card's own editor.
    const overrideCard = screen.getByRole('region', { name: 'Employee overrides' });
    const firstValue = within(overrideCard).getAllByLabelText('Value')[0];
    await userEvent.clear(firstValue);
    await userEvent.type(firstValue, '60');
    await userEvent.click(
      within(overrideCard).getByRole('button', { name: /Save override/ }),
    );

    await waitFor(() => {
      const last = spy.savePayOverrides.mock.calls.at(-1)?.[0] as PayStructureOverride[] | undefined;
      expect(last).toHaveLength(1);
    });
    const saved = spy.savePayOverrides.mock.calls.at(-1)?.[0] as PayStructureOverride[];
    expect(saved[0]).toEqual(
      expect.objectContaining({ employeeId: ONE_EMPLOYEE.id }),
    );
    expect(saved[0].components[0]).toEqual(
      expect.objectContaining({ isBasic: true, value: 60 }),
    );

    await userEvent.click(
      within(overrideCard).getByRole('button', { name: /Remove override/ }),
    );
    await waitFor(() => {
      const last = spy.savePayOverrides.mock.calls.at(-1)?.[0] as PayStructureOverride[] | undefined;
      expect(last).toEqual([]);
    });
  });

  it('a bonus added on the Payroll page reaches savePayrollBonuses and the screen', async () => {
    const spy = makeSpyStore();
    const { store } = await renderApp({ dataStore: spy.store });

    await navigate('Payroll & Compensation');
    await userEvent.click(screen.getByRole('button', { name: 'Add bonus' }));

    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), ONE_EMPLOYEE.id);
    await userEvent.type(within(dialog).getByLabelText('Label'), 'Spot award');
    await userEvent.type(within(dialog).getByLabelText('Amount (₹)'), '2000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add bonus' }));

    await waitFor(() => expect(spy.savePayrollBonuses).toHaveBeenCalled());
    const rows = spy.savePayrollBonuses.mock.calls.at(-1)?.[0] as PayrollBonus[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        employeeId: ONE_EMPLOYEE.id,
        monthKey: MONTH,
        label: 'Spot award',
        amount: 2000,
      }),
    );

    // The save flows back through App's handler: the card lists the bonus and
    // the payslip preview inside the employee modal carries it.
    expect(await screen.findByText('Spot award')).toBeInTheDocument();

    // The loaded store holds the bonus too - a refresh would bring it back.
    const reloaded = await store.load();
    expect(reloaded.snapshot.payrollBonuses).toHaveLength(1);
    expect(reloaded.snapshot.payrollBonuses[0]).toEqual(
      expect.objectContaining({ label: 'Spot award' }),
    );
  });
});

describe('Pay persistence — snapshot import reloads the pay datasets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a confirmed import replaces the structure, overrides and bonuses on screen', async () => {
    const customStructure: PayStructure = {
      ...createDefaultPayStructure(),
      professionalTaxEnabled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const override: PayStructureOverride = {
      employeeId: 'EMP-IMPORT-2',
      components: [
        { id: 'basic', name: 'Contract Base', basis: 'Fixed', value: 10000, isBasic: true },
        { id: 'balance', name: 'Balance', basis: 'Remainder', value: 0 },
      ],
      epfEnabled: false,
      professionalTaxEnabled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const bonus: PayrollBonus = {
      id: 'bonus-import-1',
      employeeId: 'EMP-IMPORT-1',
      monthKey: MONTH,
      kind: 'Performance',
      label: 'Imported bonus',
      amount: 2000,
      rating: 5,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const imported: DataSnapshot = {
      v: 4,
      dataVersion: DATA_SCHEMA_VERSION,
      exportedAt: '2026-11-14T09:30:00.000Z',
      employees: [
        { ...INITIAL_EMPLOYEES[0], id: 'EMP-IMPORT-1', name: 'Nina Import', status: 'Active' },
        { ...INITIAL_EMPLOYEES[0], id: 'EMP-IMPORT-2', name: 'Omar Import', status: 'Active' },
      ],
      policies: [ONE_POLICY],
      leavePlans: [],
      attendance: [],
      holidays: [],
      plannerEvents: [],
      payStructure: customStructure,
      payOverrides: [override],
      payrollBonuses: [bonus],
      settings: { ...DEFAULT_PLANNER_SETTINGS },
    };

    const spy = makeSpyStore();
    await renderApp({ dataStore: spy.store });

    // Import through the Admin card, the one path a user has.
    await navigate('Admin & Settings');
    await userEvent.upload(
      screen.getByLabelText('Choose snapshot file'),
      new File([snapshotToJson(imported)], 'omnihr-snapshot.json', { type: 'application/json' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Replace data' }),
    );
    await screen.findByText(/Snapshot imported/i);

    // The Payroll page is priced by what the file carried: the bonus rides in
    // the card and in the row, and the imported structure/override turn the
    // statutory columns off where the file said so.
    await navigate('Payroll & Compensation');
    expect(await screen.findByText('Imported bonus')).toBeInTheDocument();

    const nina = (await screen.findAllByRole('row')).find((row) =>
      (row.textContent ?? '').includes('Nina Import'),
    );
    expect(nina?.textContent).toContain('+₹2,000');
    expect(nina?.textContent).toContain('−₹3,000'); // EPF on in the imported structure
    expect(nina?.textContent).toContain('−₹0'); // PT off in the imported structure
    const omar = (await screen.findAllByRole('row')).find((row) =>
      (row.textContent ?? '').includes('Omar Import'),
    );
    // The override's own toggles switch EPF off for Omar even though the
    // company template keeps it on.
    expect(omar?.textContent).toContain('−₹0');

    // The designer drafts FROM the imported structure now.
    await navigate('Payslip Designer');
    expect(
      await screen.findByRole('button', { name: /Professional Tax off/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      await screen.findByRole('button', { name: 'Customize for this employee' }),
    ).toBeInTheDocument();
  });
});

describe('Pay persistence — the legacy localStorage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the pay envelopes the store layer writes, and raises no banner for an absent key', async () => {
    const structure: PayStructure = {
      ...createDefaultPayStructure(),
      professionalTaxEnabled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const bonus: PayrollBonus = {
      id: 'bonus-legacy-1',
      employeeId: 'EMP-1001',
      monthKey: MONTH,
      kind: 'Custom',
      label: 'Legacy bonus',
      amount: 1500,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    localStorage.setItem(
      'omnihr_pay_structure',
      JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [structure] }),
    );
    localStorage.setItem(
      'omnihr_payroll_bonuses',
      JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [bonus] }),
    );

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    // Navigate to the Payroll page: the stored bonus is on screen for the
    // current month, and no pay dataset raised a discarded banner.
    await navigate('Payroll & Compensation');
    expect(await screen.findByText('Legacy bonus')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    // And the designer drafts from the stored structure, whose PT is off.
    await navigate('Payslip Designer');
    expect(
      await screen.findByRole('button', { name: /Professional Tax off/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when a stored pay dataset could not be read, and falls back safely', () => {
    localStorage.setItem(
      'omnihr_pay_overrides',
      JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ employeeId: 'EMP-1001' }] }),
    );

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/pay overrides saved in this browser/i);
  });
});
