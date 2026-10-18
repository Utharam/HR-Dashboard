import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewSection } from '../OverviewSection';
import { PayrollSection } from '../PayrollSection';
import { INITIAL_EMPLOYEES, INITIAL_DEPARTMENTS } from '../../data/initialData';
import { isActive } from '../../utils/payroll';
import { formatCrores } from '../../utils/formatters';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be constructed.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

const cardValue = (label: RegExp) => {
  const card = screen.getByText(label).closest('.omni-card');
  if (!card) throw new Error(`no kpi card for ${label}`);
  return card.querySelector('.kpi-value')?.textContent ?? '';
};

describe('Overview and Payroll report the same payroll basis', () => {
  it('agrees on the monthly payroll CTC because both aggregate the active roster', () => {
    render(
      <OverviewSection
        employees={INITIAL_EMPLOYEES}
        departments={INITIAL_DEPARTMENTS}
        onSelectEmployee={vi.fn()}
      />,
    );
    render(<PayrollSection employees={INITIAL_EMPLOYEES} onSelectEmployee={vi.fn()} />);

    const overview = cardValue(/Monthly Payroll CTC/i);
    const payroll = cardValue(/Total Monthly CTC/i);

    const activeTotal = INITIAL_EMPLOYEES.filter(isActive).reduce((sum, e) => sum + e.monthlyCTC, 0);
    const allTotal = INITIAL_EMPLOYEES.reduce((sum, e) => sum + e.monthlyCTC, 0);

    // The two tabs must not present different numbers under the same name.
    expect(overview).toBe(payroll);
    expect(overview).toBe(formatCrores(activeTotal));
    // The defect: Overview summed every record, including the resigned one.
    expect(overview).not.toBe(formatCrores(allTotal));
  });
});
