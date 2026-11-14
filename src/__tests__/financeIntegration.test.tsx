import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import { monthKey as toMonthKey } from '../utils/attendance';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import type { Employee, PayrollBonus } from '../types';

// jsdom has no 2D canvas; the overview's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * The Finance Report's place in the shell: a top-level destination after
 * Payslip Designer, its own header title, no page toolbar, and the FULL
 * register instead of the toolbar-filtered roster. The report page itself is
 * pinned in components/__tests__/FinanceReportSection.test.tsx.
 */

const NOW = new Date();
const MONTH = toMonthKey(NOW.getFullYear(), NOW.getMonth());

const EMPLOYEE: Employee = {
  ...INITIAL_EMPLOYEES[0],
  id: 'EMP-FIN-1',
  name: 'Asha Finance',
  status: 'Active',
};

const BONUS: PayrollBonus = {
  id: 'bonus-fin-1',
  employeeId: EMPLOYEE.id,
  monthKey: MONTH,
  kind: 'Performance',
  label: 'Finance test bonus',
  amount: 2500,
  rating: 5,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const kpiValue = (label: string): string => {
  const card = screen.getByText(label, { selector: '.kpi-label' }).closest('.kpi-card');
  if (!card) throw new Error(`No KPI card for ${label}`);
  return card.querySelector('.kpi-value')?.textContent ?? '';
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Finance Report navigation and App wiring', () => {
  it('sits after Payslip Designer, titles the page, shows no toolbar and reads the full register', async () => {
    const user = userEvent.setup();
    await renderApp({
      dataStore: new MemoryStore({
        employees: [EMPLOYEE],
        attendance: [],
        payrollBonuses: [BONUS],
      }),
    });

    const nav = screen.getByRole('navigation');
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '');
    expect(labels.indexOf('Finance Report')).toBeGreaterThan(
      labels.indexOf('Payslip Designer'),
    );
    expect(labels.indexOf('Finance Report')).toBeLessThan(
      labels.indexOf('Performance & 9-Box'),
    );

    // Leave a search behind on the Directory tab: the report must still read the
    // full register, because it is a company statement, not a filtered view.
    await user.click(within(nav).getByRole('button', { name: 'Employee Directory' }));
    await user.type(screen.getByLabelText('Search staff, ID or role'), 'zzz-no-such-person');

    await user.click(within(nav).getByRole('button', { name: 'Finance Report' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Finance Report' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Month-close salary/)).toBeInTheDocument();
    expect(document.querySelector('.page-toolbar')).toBeNull();
    expect(screen.getByRole('region', { name: 'Report controls' })).toBeInTheDocument();

    // One paid employee and the current month's bonus, despite the stale search.
    expect(kpiValue('Employees paid')).toBe('1');
    expect(kpiValue('Bonuses')).toBe('₹2,500');
    expect(screen.getByText('Asha Finance')).toBeInTheDocument();
  }, 20_000);

  it('opens a historical report payslip with that month’s EPF ceiling and bonuses', async () => {
    const user = userEvent.setup();
    await renderApp({
      dataStore: new MemoryStore({
        employees: [EMPLOYEE],
        attendance: [],
        payrollBonuses: [],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Finance Report' }));
    fireEvent.change(screen.getByLabelText('Report month'), {
      target: { value: '2026-08' },
    });

    // August 2026: the EPF ceiling was still ₹15,000, so Basic 1,79,166 is
    // capped at ₹1,800 — not the ₹3,000 today's ₹25,000 ceiling would charge.
    await user.click(
      await screen.findByRole('button', {
        name: `Open payslip for ${EMPLOYEE.name}`,
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Employee Provident Fund (EPF 12%)');
    expect(dialog).toHaveTextContent('−₹1,800');
  }, 20_000);
});
