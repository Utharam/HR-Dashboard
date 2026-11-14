import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';

// jsdom has no 2D canvas; the overview's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and the other integration suites.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * The slim header versus the page-owned toolbar.
 *
 * The header used to carry the global search, the department/location filters,
 * Add Staff and Admin/Guides shortcuts on every tab; the Attendance and Leave
 * tabs also carried identical controls of their own, so one screen showed two
 * look-alike filter bars. The restructure pinned here (design decisions D1/D2)
 * makes the header title+theme only and moves the roster-page controls into a
 * `PageToolbar` that renders exactly where a section works on the filtered
 * roster: Overview, Directory, Payroll, Performance, Recruitment, Retention,
 * Trends - and nowhere else.
 */

/** The header element, so assertions can never match a section's own controls. */
const header = () => document.querySelector('header.page-header') as HTMLElement;

/** The page-owned tool row, rendered only on the filtered-roster tabs. */
const toolbar = () => document.querySelector('.page-toolbar') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Slim header', () => {
  it('carries only the menu toggle, the title block and the theme control on every tab', async () => {
    const user = userEvent.setup();
    await renderApp();

    const slimAssertions = () => {
      // The header still names the page...
      expect(within(header()).getByRole('heading', { level: 2 })).toBeInTheDocument();
      // ...and holds exactly two controls: the navigation toggle and the theme toggle.
      const controls = within(header()).getAllByRole('button');
      expect(controls).toHaveLength(2);
      expect(controls[0].getAttribute('aria-label')).toMatch(/navigation/i);
      expect(controls[1]).toHaveAccessibleName(/theme:/i);
      // No search, no filters, no Add Staff, no Admin/Guides shortcuts.
      expect(within(header()).queryByLabelText('Search staff, ID or role')).toBeNull();
      expect(within(header()).queryByLabelText('Filter by department')).toBeNull();
      expect(within(header()).queryByLabelText('Filter by office location')).toBeNull();
      expect(within(header()).queryByRole('button', { name: /Add Staff/ })).toBeNull();
      expect(within(header()).queryByRole('button', { name: /^Admin/ })).toBeNull();
      expect(within(header()).queryByRole('button', { name: /^Guides/ })).toBeNull();
    };

    for (const tab of [
      'Executive Overview',
      'Employee Directory',
      'Time & Attendance',
      'Leave Planner',
      'Payroll & Compensation',
      'Performance & 9-Box',
      'HR Policy Hub',
      'User Guides & Manual',
    ]) {
      await user.click(screen.getByRole('button', { name: tab }));
      slimAssertions();
    }

    // The Workforce Planning children and Admin & Settings live behind a group
    // toggle or a renamed label; the header is slim there too.
    await user.click(screen.getByRole('button', { name: 'Admin & Settings' }));
    slimAssertions();
  }, 20_000);
});

describe('PageToolbar presence by tab', () => {
  // The full matrix: the toolbar renders exactly where a section works on the
  // filtered roster (design decision D2) and nowhere else - including the
  // Workforce Planning children, which this also proves stay reachable and
  // navigable while the group is open.
  it.each([
    ['Executive Overview', true],
    ['Employee Directory', true],
    ['Time & Attendance', false],
    ['Leave Planner', false],
    ['Payroll & Compensation', true],
    ['Performance & 9-Box', true],
    ['Recruitment Pipeline', true],
    ['ESOB & Gratuity', true],
    ['3-Year Headcount Trends', true],
    ['Admin & Settings', false],
    ['HR Policy Hub', false],
    ['User Guides & Manual', false],
  ])('renders the toolbar on "%s" %s', async (tab, withToolbar) => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: tab }));
    expect(!!document.querySelector('.page-toolbar')).toBe(withToolbar);
  }, 15_000);

  it('renders the roster-page toolbar with search, filters and Add Staff', async () => {
    await renderApp();

    expect(within(toolbar()).getByLabelText('Search staff, ID or role')).toBeInTheDocument();
    expect(within(toolbar()).getByLabelText('Filter by department')).toBeInTheDocument();
    expect(within(toolbar()).getByLabelText('Filter by office location')).toBeInTheDocument();
    expect(within(toolbar()).getByRole('button', { name: /Add Staff/ })).toBeInTheDocument();
  }, 15_000);

  it('hides the toolbar on the Attendance tab, where the section owns its own filters', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Time & Attendance' }));

    // No page toolbar at all...
    expect(document.querySelector('.page-toolbar')).toBeNull();

    // ...and the section's OWN filters are the ones on screen, so the duplicate
    // bar is removed rather than the filtering capability.
    expect(screen.getByLabelText('Search employees')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by department')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument();
  }, 15_000);
});

describe('PageToolbar state', () => {
  // Navigating between tabs re-renders heavy sections (the attendance matrix is
  // 200 employees × 31 day columns), so under full-suite parallel load these
  // round trips exceed the default 5s per-test budget. The timeout is load
  // headroom, not a relaxed assertion.
  it('keeps the toolbar state across a round trip through a tab without one', async () => {
    const user = userEvent.setup();
    await renderApp();

    // A search left behind before visiting the Attendance tab must survive the
    // round trip: hiding the bar hides the CONTROLS, not the state.
    fireEvent.change(within(toolbar()).getByLabelText('Search staff, ID or role'), {
      target: { value: 'zzz-no-such-person' },
    });
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Time & Attendance' }));
    expect(document.querySelector('.page-toolbar')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Executive Overview' }));
    const search = within(toolbar()).getByLabelText('Search staff, ID or role');
    expect(search).toHaveValue('zzz-no-such-person');
    // The section's empty state is still wired to the same state.
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();
  }, 15_000);

  it('clears the retained filters through the section empty state', async () => {
    const user = userEvent.setup();
    await renderApp();

    fireEvent.change(within(toolbar()).getByLabelText('Search staff, ID or role'), {
      target: { value: 'zzz-no-such-person' },
    });
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();

    // The one action the empty state offers still empties the hidden state too.
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(within(toolbar()).getByLabelText('Search staff, ID or role')).toHaveValue('');
    expect(screen.queryByText(/no staff match the current filters/i)).toBeNull();
  }, 15_000);

  it('keeps the search working on the tabs that own it', async () => {
    const user = userEvent.setup();
    await renderApp();

    // The Directory tab narrows from the toolbar's search: typing a substring of
    // a seeded name must shrink the roster table, proving the toolbar is the
    // connected control, not a decorative duplicate.
    await user.click(screen.getByRole('button', { name: 'Employee Directory' }));
    const table = document.querySelector('.omni-table-wrap') as HTMLElement;
    const before = within(table).queryAllByRole('row').length;
    expect(before).toBeGreaterThan(1);

    await user.type(within(toolbar()).getByLabelText('Search staff, ID or role'), 'zzz-no-such-person');
    expect(screen.getByText(/no staff records found/i)).toBeInTheDocument();
  });
});
