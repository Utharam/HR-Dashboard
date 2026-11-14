import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ThemeProvider } from '../theme/ThemeContext';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and shell.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * The navigation restructure (design decisions D3/D4/D5), end to end:
 *
 * - the sidebar's Workforce Planning group folds the three workforce modules
 *   (Recruitment Pipeline, ESOB & Gratuity, 3-Year Headcount Trends) under one
 *   expandable parent, whose active child is the page marker;
 * - Admin is renamed Admin & Settings and owns the workspace actions the
 *   sidebar footer used to carry - Export Roster, Reset Demo State, Sign out -
 *   so those actions exist nowhere else.
 *
 * The header-slim and toolbar-presence contracts live in
 * `headerFilters.test.tsx`; the group/a11y contracts are pinned here.
 */

const renderConsole = () => render(<ThemeProvider><App /></ThemeProvider>);

const nav = () => screen.getByRole('navigation');

const groupParent = () => within(nav()).getByRole('button', { name: 'Workforce Planning' });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Workforce Planning sidebar group', () => {
  it('starts expanded and collapses and re-expands from its parent toggle', async () => {
    const user = userEvent.setup();
    renderConsole();

    // Expanded by default: the three modules were ordinary top-level pages
    // before, so hiding them behind a first click would bury destinations the
    // user never asked to have folded away.
    expect(groupParent()).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav()).getByRole('button', { name: 'Recruitment Pipeline' })).toBeInTheDocument();
    expect(within(nav()).getByRole('button', { name: 'ESOB & Gratuity' })).toBeInTheDocument();
    expect(within(nav()).getByRole('button', { name: '3-Year Headcount Trends' })).toBeInTheDocument();

    await user.click(groupParent());
    expect(groupParent()).toHaveAttribute('aria-expanded', 'false');
    // A collapsed group hides its children from the accessibility tree too -
    // "collapsed" that still tab-stops into invisible buttons is a disclosure
    // that lies to a keyboard user.
    expect(within(nav()).queryByRole('button', { name: 'Recruitment Pipeline' })).toBeNull();
    expect(within(nav()).queryByRole('button', { name: 'ESOB & Gratuity' })).toBeNull();
    expect(within(nav()).queryByRole('button', { name: '3-Year Headcount Trends' })).toBeNull();

    await user.click(groupParent());
    expect(groupParent()).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav()).getByRole('button', { name: 'Recruitment Pipeline' })).toBeInTheDocument();
  });

  it('navigates from a child and highlights that child as the current page', async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.click(within(nav()).getByRole('button', { name: 'ESOB & Gratuity' }));

    // The child's page really rendered...
    expect(
      screen.getByRole('heading', { level: 2, name: /Statutory EOSB & Gratuity Calculator/ }),
    ).toBeInTheDocument();
    // ...the group stayed open under the user, and the CHILD is the page marker.
    expect(groupParent()).toHaveAttribute('aria-expanded', 'true');
    const current = within(nav()).getAllByRole('button', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('ESOB & Gratuity');
  });

  it('re-expands the group when a child becomes active again while it is closed', async () => {
    const user = userEvent.setup();
    renderConsole();

    // Collapse the group, then reach the child from OUTSIDE the sidebar - the
    // Guides' cross-tab shortcut plays that role in the real UI - so the
    // highlight would otherwise open into a closed panel.
    await user.click(groupParent());
    expect(groupParent()).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'User Guides & Manual' }));
    await user.click(screen.getByRole('button', { name: /Go to Gratuity Calculator/ }));

    expect(groupParent()).toHaveAttribute('aria-expanded', 'true');
    const current = within(nav()).getAllByRole('button', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('ESOB & Gratuity');
  });
});

describe('Sidebar footer actions moved to Admin & Settings', () => {
  it('shows no Export Roster, Reset Demo State or Sign out outside the Admin & Settings page', async () => {
    const user = userEvent.setup();
    renderConsole();

    // The sidebar is navigation only now; the overview carries no workspace
    // actions at all.
    expect(screen.queryByRole('button', { name: /Export Roster/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reset Demo State/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();

    // ...and neither does a second tab, including the sidebar's own nav region.
    await user.click(screen.getByRole('button', { name: 'Employee Directory' }));
    expect(screen.queryByRole('button', { name: /Export Roster/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reset Demo State/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });

  it('wires the workspace actions on the Admin & Settings page to App', async () => {
    const onSignOut = vi.fn();
    render(<ThemeProvider><App onSignOut={onSignOut} /></ThemeProvider>);

    await userEvent.click(screen.getByRole('button', { name: 'Admin & Settings' }));

    const card = screen.getByRole('region', { name: 'Workspace actions' });
    expect(within(card).getByRole('button', { name: 'Export Roster (Excel)' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reset Demo State' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renames Admin to Admin & Settings in the sidebar and the header', async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.click(screen.getByRole('button', { name: 'Admin & Settings' }));

    expect(
      screen.getByRole('heading', { level: 2, name: /Admin & Settings/ }),
    ).toBeInTheDocument();
    expect(within(nav()).getByRole('button', { name: 'Admin & Settings' })).toBeInTheDocument();
    // The old label is gone everywhere, so no screen can still call it Admin.
    expect(within(nav()).queryByRole('button', { name: /^Admin$/ })).toBeNull();
  });
});
