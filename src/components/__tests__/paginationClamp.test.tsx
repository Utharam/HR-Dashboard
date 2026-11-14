import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Employee } from '../../types';
import { DirectorySection } from '../DirectorySection';
import { PayrollSection } from '../PayrollSection';

const emp = (n: number): Employee => ({
  id: `EMP-${n}`,
  name: `Person ${n}`,
  email: `p${n}@x.io`,
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
});

const roster = (n: number) => Array.from({ length: n }, (_, i) => emp(i + 1));

const body = () => screen.getAllByRole('rowgroup')[1];
// Queried by class, not by /Showing /: the header says "No results" on an empty roster,
// and a text matcher that requires "Showing" cannot observe the case it exists to fix.
const count = () => document.querySelector('.pagination__count') as HTMLElement;
const rowIds = () =>
  within(body())
    .queryAllByRole('cell')
    .filter((c) => /^EMP-/.test(c.textContent ?? ''))
    .map((c) => c.textContent);

const clickNext = (times: number) => {
  for (let i = 0; i < times; i += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }
};

// The two sections share one `currentPage` shape, so they share one failure
// mode and must be proven to share one fix. Each is driven through the same
// stale-page sequence. (AttendanceSection left this suite when the monthly
// register became the day-by-day matrix, which has no pagination.)
const SECTIONS = [
  {
    name: 'DirectorySection',
    render: (employees: Employee[]) => (
      <DirectorySection employees={employees} onSelectEmployee={() => {}} />
    ),
    emptyText: /No staff records found/i,
  },
  {
    name: 'PayrollSection',
    render: (employees: Employee[]) => (
      <PayrollSection employees={employees} onSelectEmployee={() => {}} />
    ),
    emptyText: /No payroll records match/i,
  },
];

describe.each(SECTIONS)('$name pagination', ({ render: renderSection, emptyText }) => {
  it('shows the first page of a full roster', () => {
    render(renderSection(roster(200)));

    expect(count()).toHaveTextContent('Showing 1 - 25 of 200');
    expect(rowIds()).toHaveLength(25);
    expect(screen.getByText('Page 1 of 8')).toBeInTheDocument();
  });

  it('advances page by page and truncates the last page', () => {
    render(renderSection(roster(200)));
    clickNext(7);

    expect(count()).toHaveTextContent('Showing 176 - 200 of 200');
    expect(rowIds()).toHaveLength(25);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  /**
   * THE regression. Page 8 of 200 records, then a search that matches 3 people.
   * `currentPage` was local state that only the Prev/Next handlers moved, so it stayed
   * at 8: `employees.slice(175, 200)` on a 3-element array is `[]`, the table claimed
   * "No records found" while three matching records existed, and the header read
   * "Showing 176 - 3 of 3".
   */
  it('stays on a valid page when the dataset shrinks under it', () => {
    const many = roster(200);
    const few = many.slice(0, 3);
    const { rerender } = render(renderSection(many));

    clickNext(7);
    expect(screen.getByText('Page 8 of 8')).toBeInTheDocument();

    rerender(renderSection(few));

    // The rows must be there, not an empty-state banner.
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
    expect(rowIds()).toEqual(['EMP-1', 'EMP-2', 'EMP-3']);
    // The header must describe what is on screen.
    expect(count()).toHaveTextContent('Showing 1 - 3 of 3');
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('sends Prev nowhere once the dataset has shrunk to one page', () => {
    const many = roster(200);
    const { rerender } = render(renderSection(many));

    clickNext(7);
    rerender(renderSection(many.slice(0, 3)));

    // Prev was `Math.max(1, currentPage - 1)` against an unclamped `currentPage`, so it
    // walked *backwards* into other empty pages instead of staying put.
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    expect(count()).toHaveTextContent('Showing 1 - 3 of 3');
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('does not render an inverted range when the roster is emptied', () => {
    const { rerender } = render(renderSection(roster(200)));
    clickNext(7);
    rerender(renderSection([]));

    expect(count()).toHaveTextContent('No results');
    expect(screen.queryByText('Showing 176 - 0 of 0')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByText(emptyText)).toBeInTheDocument();
  });

  it('reports a partial last page rather than padding it', () => {
    render(renderSection(roster(60)));
    clickNext(2);

    expect(count()).toHaveTextContent('Showing 51 - 60 of 60');
    expect(rowIds()).toEqual(['EMP-51', 'EMP-52', 'EMP-53', 'EMP-54', 'EMP-55', 'EMP-56', 'EMP-57', 'EMP-58', 'EMP-59', 'EMP-60']);
  });
});