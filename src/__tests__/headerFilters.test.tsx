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
 * The header's global filters versus the sections that own their own.
 *
 * The Attendance and Leave tabs each carry a search box plus department and
 * location filters of their own. The header used to render the identical three
 * controls above them, so one screen showed two look-alike filter bars — and
 * the header's global state (left behind from another tab) narrowed the
 * register those sections receive without anything on screen explaining why.
 * These tests pin the resolution: on those two tabs the header hides its
 * controls, the section's own filters stay reachable, and the global filters
 * come back untouched on every other tab.
 */

/** The header element, so assertions can never match a section's own controls
 *  (both the header and the sections label a select "Filter by department"). */
const header = () => document.querySelector('header.page-header') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Header global filters vs section-owned filters', () => {
  it('hides the global search/department/location controls on the Attendance tab', async () => {
    const user = userEvent.setup();
    await renderApp();

    // On the overview the header owns the global filters, as everywhere else.
    expect(within(header()).getByLabelText('Search staff, ID or role')).toBeInTheDocument();
    expect(within(header()).getByLabelText('Filter by department')).toBeInTheDocument();
    expect(within(header()).getByLabelText('Filter by office location')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Time & Attendance' }));

    // The header's three controls are gone...
    expect(within(header()).queryByLabelText('Search staff, ID or role')).toBeNull();
    expect(within(header()).queryByLabelText('Filter by department')).toBeNull();
    expect(within(header()).queryByLabelText('Filter by office location')).toBeNull();

    // ...and the section's OWN filters are the ones on screen, so the duplicate
    // bar is removed rather than the filtering capability.
    expect(screen.getByLabelText('Search employees')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by department')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument();
  }, 15_000);

  it('hides the same controls on the Leave Planner tab', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Leave Planner' }));

    expect(within(header()).queryByLabelText('Search staff, ID or role')).toBeNull();
    expect(within(header()).queryByLabelText('Filter by department')).toBeNull();
    expect(within(header()).queryByLabelText('Filter by office location')).toBeNull();
  }, 15_000);

  // Navigating between tabs re-renders heavy sections (the attendance matrix is
  // 200 employees × 31 day columns), so under full-suite parallel load these
  // round trips exceed the default 5s per-test budget. The timeout is load
  // headroom, not a relaxed assertion.
  it('restores the global filters on other tabs, with their state intact', async () => {
    const user = userEvent.setup();
    await renderApp();

    // A global search left behind before visiting the Attendance tab must
    // survive the round trip: hiding the controls hides the BAR, not the state.
    fireEvent.change(within(header()).getByLabelText('Search staff, ID or role'), {
      target: { value: 'zzz-no-such-person' },
    });
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Time & Attendance' }));
    expect(within(header()).queryByLabelText('Search staff, ID or role')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Executive Overview' }));
    const search = within(header()).getByLabelText('Search staff, ID or role');
    expect(search).toHaveValue('zzz-no-such-person');
    // The section's empty state is still wired to the same state.
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();
  }, 15_000);

  it('clears the retained global filters through the section empty state', async () => {
    const user = userEvent.setup();
    await renderApp();

    fireEvent.change(within(header()).getByLabelText('Search staff, ID or role'), {
      target: { value: 'zzz-no-such-person' },
    });
    expect(screen.getByText(/no staff match the current filters/i)).toBeInTheDocument();

    // The one action the empty state offers still empties the hidden state too.
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(within(header()).getByLabelText('Search staff, ID or role')).toHaveValue('');
    expect(screen.queryByText(/no staff match the current filters/i)).toBeNull();
  }, 15_000);

  it('keeps the global search working on the tabs that own it', async () => {
    const user = userEvent.setup();
    await renderApp();

    // The Directory tab narrows from the header's search: typing a substring of
    // a seeded name must shrink the roster table, proving the hidden-state
    // treatment did not disconnect the control elsewhere.
    await user.click(screen.getByRole('button', { name: 'Employee Directory' }));
    const table = document.querySelector('.omni-table-wrap') as HTMLElement;
    const before = within(table).queryAllByRole('row').length;
    expect(before).toBeGreaterThan(1);

    await user.type(within(header()).getByLabelText('Search staff, ID or role'), 'zzz-no-such-person');
    expect(screen.getByText(/no staff records found/i)).toBeInTheDocument();
  });
});
