import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { OverviewSection } from '../OverviewSection';
import { TrendsSection } from '../TrendsSection';
import { RecruitmentSection } from '../RecruitmentSection';
import { RetentionSection } from '../RetentionSection';
import type { Department, Employee, MonthlyTracker } from '../../types';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be constructed and its teardown
// throws asynchronously out of `cleanup()`. Two of the four sections under test draw a chart.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * The empty roster and the wall of zeros.
 *
 * A filter that excludes everything used to render a dashboard that looked exactly like a
 * working one, except every tile read `0`, `0.0%` or `₹0`. Nothing on the page said the
 * numbers were the absence of data rather than a workforce in trouble, and a wall of zeros
 * is the most expensive kind of wrong dashboard to receive: it is not obviously broken, so
 * nobody reports it.
 *
 * The same pass removes the figures that were never measured. `1.4%` attrition was a literal
 * in the markup and read identically whatever the filter said; `+14.3% Headcount Growth` was
 * a literal in a different file; `Across 6 Functional Orgs` contradicted the header's `7`.
 * A number nobody computed is a claim about an organisation that may not exist.
 */

const employee = (over: Partial<Employee> = {}): Employee => ({
  id: 'EMP-1',
  name: 'Asha Rao',
  email: 'asha@omnixhr.io',
  phone: '',
  department: 'Engineering & Technology',
  deptId: 'eng',
  role: 'Engineer',
  location: 'Bengaluru HQ',
  doj: '2020-01-01',
  monthlyCTC: 200000,
  basicSalary: 100000,
  hra: 50000,
  specialAllowance: 50000,
  status: 'Active',
  gender: 'Female',
  performanceRating: 4,
  reportsTo: null,
  presentDays: 24,
  clBalance: 5,
  slBalance: 5,
  elBalance: 10,
  lopDays: 0,
  uan: '100000000001',
  ...over,
});

const department = (id: string, name: string): Department => ({
  id,
  name,
  head: 'EMP-1',
  roles: ['Engineer'],
});

/** Ten records: seven on the payroll run, two resigned, one with an unresolved status. */
const ROSTER = [
  ...Array.from({ length: 7 }, (_, i) => employee({ id: `EMP-A${i}` })),
  employee({ id: 'EMP-R1', status: 'Resigned' }),
  employee({ id: 'EMP-R2', status: 'Resigned' }),
  employee({ id: 'EMP-U1', status: 'Unknown' }),
];

const TRACKER: MonthlyTracker[] = [
  { month: 'Aug 2026', headcount: 200, grossPayroll: 23000000, attritionPct: 1.2, avgAttendance: 94, hires: 4, exits: 2 },
  { month: 'Sep 2026', headcount: 260, grossPayroll: 29900000, attritionPct: 1.4, avgAttendance: 96, hires: 62, exits: 2 },
];

const kpiCard = (name: RegExp) =>
  screen.getByText(name).closest('.omni-card') as HTMLElement;

/**
 * The shared empty-state treatment, checked structurally rather than by wording. The
 * "way out" button is asserted separately, because it is only rendered when there are
 * filters to clear - offering it for a register that is genuinely empty would be a
 * control that does nothing.
 */
const expectEmptyState = () => {
  const block = document.querySelector('.empty-state');
  expect(block).not.toBeNull();
  expect(block?.querySelector('.empty-state__title')?.textContent?.trim()).toBeTruthy();
  expect(block?.querySelector('.empty-state__body')?.textContent?.trim()).toBeTruthy();
};

const REQUISITION = {
  id: 'REQ-1',
  title: 'Engineer',
  department: 'Engineering & Technology',
  location: 'Bengaluru HQ',
  stage: 'Sourcing' as const,
  applicants: 40,
  targetDOJ: '2026-01-01',
  salaryRange: '₹10L - ₹20L',
};

describe('OverviewSection with no matching employees', () => {
  it('shows an empty state instead of a wall of zeros', () => {
    render(
      <OverviewSection
        employees={[]}
        departments={[department('eng', 'Engineering & Technology')]}
        onSelectEmployee={vi.fn()}
      />,
    );

    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();
    expectEmptyState();
    // A ₹0 payroll tile next to a "0.0%" attendance rate is a statement about the
    // workforce, and this roster is not a workforce.
    expect(screen.queryByText(/Monthly Payroll CTC/i)).toBeNull();
    expect(screen.queryByText(/Annual Attrition Rate/i)).toBeNull();
  });

  it('lets the user clear the filters that emptied it', async () => {
    const onClearFilters = vi.fn();
    render(
      <OverviewSection
        employees={[]}
        departments={[]}
        onSelectEmployee={vi.fn()}
        onClearFilters={onClearFilters}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'Overview',
      (onClearFilters: () => void) => (
        <OverviewSection
          employees={[]}
          departments={[]}
          onSelectEmployee={vi.fn()}
          onClearFilters={onClearFilters}
        />
      ),
    ],
    [
      'Trends',
      (onClearFilters: () => void) => (
        <TrendsSection tracker={[]} onClearFilters={onClearFilters} />
      ),
    ],
    [
      'Recruitment',
      (onClearFilters: () => void) => (
        <RecruitmentSection requisitions={[]} onClearFilters={onClearFilters} />
      ),
    ],
    [
      'Retention',
      (onClearFilters: () => void) => (
        <RetentionSection employees={[]} onClearFilters={onClearFilters} />
      ),
    ],
  ])('offers the way out of an empty %s', async (_label, renderSection) => {
    // One action, and it is the same one in all four places: reset the filters that caused
    // the emptiness. A page that says "no results" without a route back is a dead end.
    const onClearFilters = vi.fn();
    render(renderSection(onClearFilters));

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('renders no KPI tiles at all rather than zero-filled ones', () => {
    render(<OverviewSection employees={[]} departments={[]} onSelectEmployee={vi.fn()} />);

    // The tiles that used to stand here are gone, not blank: a zero reads as a
    // measurement, an absent card reads as an absence.
    expect(document.querySelectorAll('.kpi-card')).toHaveLength(0);
  });
});

/**
 * The four section-level tests above each hand the section its own mock and assert only
 * that the button calls it. Nothing there proves the button is CONNECTED - that clicking
 * it actually resets the `searchQuery` / `selectedDept` / `selectedLocation` state the
 * emptiness came from. `onClearFilters={() => {}}` passes every one of them and ships a
 * dead button, so this drives the real `App`.
 */
describe('App clear-filters wiring', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores the register when the filters that emptied it are cleared', async () => {
    render(<App />);
    expect(screen.getByText(/active headcount/i)).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText(/Search staff, ID or role/i),
      'zzz-no-such-person',
    );

    // The filter is what emptied the view, and the section says so.
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();
    expect(document.querySelectorAll('.kpi-card')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    // Not a re-render of the same emptiness: the search box is emptied AND the register
    // is measurable again.
    expect(screen.getByLabelText(/Search staff, ID or role/i)).toHaveValue('');
    expect(screen.queryByText(/no staff match the current filters/i)).toBeNull();
    expect(screen.getByText(/active headcount/i)).toBeInTheDocument();
    // Scoped to the headcount card: the attrition tile's own sub-label also names a
    // record count in view, so an unscoped match is ambiguous on this page.
    expect(kpiCard(/active headcount/i)).toHaveTextContent(/200 records in view/i);
  });

  it('resets the department filter too, not just the search box', async () => {
    render(<App />);
    const deptSelect = screen.getByLabelText(/Filter by department/i);

    await userEvent.selectOptions(deptSelect, 'People & Human Resources');
    expect(screen.queryByText(/200 records in view/i)).toBeNull();

    // A department on its own never empties the register, so the search box has to be
    // emptied too - and clearing it alone would leave the department filter in place,
    // which is exactly the half-reset this asserts against.
    await userEvent.type(screen.getByLabelText(/Search staff, ID or role/i), 'zzz-no-such-person');
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(deptSelect).toHaveValue('ALL');
    expect(screen.queryByText(/no staff match the current filters/i)).toBeNull();
    expect(kpiCard(/active headcount/i)).toHaveTextContent(/200 records in view/i);
  });
});

describe('OverviewSection honest KPIs', () => {
  const renderOverview = (employees: Employee[]) =>
    render(
      <OverviewSection
        employees={employees}
        departments={[department('eng', 'Engineering & Technology')]}
        onSelectEmployee={vi.fn()}
      />,
    );

  it('computes attrition from the roster in view and names its denominator', () => {
    renderOverview(ROSTER);

    // Two resigned out of ten records in view. The hardcoded literal was `1.4%`.
    expect(kpiCard(/annual attrition rate/i)).toHaveTextContent('20.0%');
    expect(kpiCard(/annual attrition rate/i)).toHaveTextContent(/2 of 10 records in view/i);
  });

  it('does not fall back to the industry figure when the roster holds no exits', () => {
    renderOverview([employee({ id: 'EMP-A1' }), employee({ id: 'EMP-A2' })]);

    const card = kpiCard(/annual attrition rate/i);
    expect(card).toHaveTextContent('0.0%');
    // The `1.4%` literal survived in exactly this case: a roster with nobody resigned.
    expect(card).not.toHaveTextContent('1.4%');
  });

  it('reports the benchmark as a benchmark, not as a filtered measurement', () => {
    renderOverview(ROSTER);

    // "Below 3.5% Tech Industry Avg" reads as a claim about this roster. It is a claim
    // about an industry, and it must be labelled as one.
    expect(kpiCard(/annual attrition rate/i)).toHaveTextContent(/benchmark/i);
    expect(kpiCard(/annual attrition rate/i)).not.toHaveTextContent(/below 3\.5%/i);
  });

  it('counts the headcount tile with the payroll predicate the rest of the app uses', () => {
    renderOverview(ROSTER);

    // `isActive` excludes Resigned AND Unknown: seven records, not the ten the doughnut
    // beside it counts, and that difference is now stated rather than left to be inferred.
    const card = kpiCard(/active headcount/i);
    expect(card).toHaveTextContent('7');
    expect(card).toHaveTextContent(/10 records in view/i);
  });

  it('states the record count so the headcount tile cannot be read as the register size', () => {
    renderOverview(ROSTER);

    // The label used to be "Total Headcount" over `employees.length` - i.e. the same
    // number as the Workforce Status doughnut beside it, while the tile's own sub-label
    // quietly reported a different one.
    expect(screen.getByText(/active headcount/i)).toBeInTheDocument();
    expect(screen.queryByText(/^total headcount$/i)).toBeNull();
  });
});

describe('TrendsSection', () => {
  it('renders no NaN when the tracker is empty', () => {
    render(<TrendsSection tracker={[]} />);

    expect(document.body.textContent).not.toContain('NaN');
    expectEmptyState();
  });

  it('derives headcount growth from the ledger instead of printing a literal', () => {
    render(<TrendsSection tracker={TRACKER} />);

    // 200 -> 260 is +30.0%. The markup used to say "+14.3%" whatever the ledger held.
    const card = kpiCard(/latest recorded headcount/i);
    expect(card).toHaveTextContent('+30.0%');
    expect(card).not.toHaveTextContent('14.3');
  });

  it('counts the months it actually has rather than claiming 33', () => {
    render(<TrendsSection tracker={TRACKER} />);

    expect(screen.getAllByText(/2 recorded months/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/33 consecutive months/i)).toBeNull();
  });

  it('labels the tracker figures as history rather than as the live register', () => {
    render(<TrendsSection tracker={TRACKER} />);

    // The tracker's last month is a record of a month that has already closed. Reading it
    // as "Active Headcount" put a historical number beside live KPIs elsewhere in the
    // console as though both described now.
    expect(screen.queryByText(/^active headcount$/i)).toBeNull();
    expect(screen.getByText(/latest recorded headcount/i)).toBeInTheDocument();
    expect(screen.getAllByText(/historical/i).length).toBeGreaterThan(0);
  });

  it('averages over a single recorded month without inventing an average', () => {
    // The regression that mattered was `(0 / 0).toFixed(1)` on an empty tracker. A
    // one-month ledger is the other end of the same guard: the mean is that month's
    // figure, and it is the only month there is.
    render(
      <TrendsSection
        tracker={[
          {
            month: 'Sep 2026',
            headcount: 0,
            grossPayroll: 0,
            attritionPct: 0,
            avgAttendance: 0,
            hires: 0,
            exits: 0,
          },
        ]}
      />,
    );

    expect(document.body.textContent).not.toContain('NaN');
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});

describe('RecruitmentSection', () => {
  it('shows an empty state rather than a bare thead over no rows', () => {
    render(<RecruitmentSection requisitions={[]} departments={[]} />);

    expectEmptyState();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('derives the org count instead of contradicting the header', () => {
    render(
      <RecruitmentSection
        requisitions={[REQUISITION]}
        departments={[
          department('eng', 'Engineering & Technology'),
          department('sales', 'Sales & Business Development'),
          department('cs', 'Customer Success & Support'),
        ]}
      />,
    );

    // The literal said 6 while the header filter said 7, on the same screen.
    expect(screen.getByText(/Across 3 Functional Orgs/i)).toBeInTheDocument();
    expect(screen.queryByText(/across 6 functional orgs/i)).toBeNull();
  });

  it('averages applicants per opening from the openings rather than asserting 36', () => {
    render(
      <RecruitmentSection
        requisitions={[
          REQUISITION,
          { ...REQUISITION, id: 'REQ-2', applicants: 80 },
        ]}
        departments={[]}
      />,
    );

    // 120 applicants over 2 openings. The sub-label used to read a constant "36".
    expect(screen.getByText(/Avg 60 Applicants per Opening/i)).toBeInTheDocument();
  });
});

describe('RetentionSection', () => {
  it('shows an empty state when no profile can be selected', () => {
    render(<RetentionSection employees={[]} onClearFilters={vi.fn()} />);

    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();
    expectEmptyState();
    // The settlement engine's fields and its Compute button are all unusable without a
    // profile; showing them invites a calculation against nobody.
    expect(screen.queryByRole('button', { name: /Compute Statutory Settlement/i })).toBeNull();
  });

  it('renders the engine once there is somebody to settle', () => {
    render(<RetentionSection employees={[employee()]} />);

    expect(screen.getByRole('button', { name: /Compute Statutory Settlement/i })).toBeInTheDocument();
    expect(document.querySelector('.empty-state')).toBeNull();
  });
});