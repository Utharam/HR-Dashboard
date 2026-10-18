import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PayrollSection } from '../PayrollSection';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import { isActive } from '../../utils/payroll';

const noop = () => {};

describe('PayrollSection flags the rows that are not in the payroll run', () => {
  it('renders a Status value for a Resigned row instead of an unqualified Net figure', () => {
    const offRun = INITIAL_EMPLOYEES.filter((e) => !isActive(e));
    expect(offRun.length).toBeGreaterThan(0);

    render(<PayrollSection employees={offRun} onSelectEmployee={noop} />);

    const row = screen.getByRole('row', { name: new RegExp(offRun[0].name, 'i') });
    const badge = within(row).getByText(offRun[0].status);
    expect(badge).toHaveClass('badge', 'badge-resigned');
  });
});
