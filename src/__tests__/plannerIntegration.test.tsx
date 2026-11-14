import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DataSnapshot,
  type DataStore,
  type StoreResult,
} from '../data/DataStore';
import { DATA_SCHEMA_VERSION } from '../utils/storage';
import type { LeavePlan, PlannerEvent, PlannerSettings } from '../types';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import { toDateKey } from '../utils/leavePlanner';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and shell.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Integration: the Planner under its own tab, with App holding the state
 * and the store holding the persistence.
 *
 * The console is mounted through `renderApp` (the data seam of design decision
 * D9): the snapshot below is what the DataGate would hand over, and the spy
 * store records every write while delegating to a real MemoryStore. The bare
 * localStorage contract is pinned by App.test.tsx and is not repeated here.
 */

const ONE_EMPLOYEE = { ...INITIAL_EMPLOYEES[0], id: 'EMP-LEAVE-1', name: 'Zora Leave' };
const ONE_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-LEAVE-1', title: 'Leave seed policy' };

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 3,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: [ONE_EMPLOYEE],
    policies: [ONE_POLICY],
    leavePlans: [],
    attendance: [],
    holidays: [],
    plannerEvents: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS },
    ...overrides,
  };
}

/**
 * A store that records every save App makes while still behaving like a real
 * one, so the assertions are about what App wrote - not a stub's echo.
 */
function makeSpyStore() {
  const inner = new MemoryStore();
  const saveLeavePlans = vi.fn(
    (rows: LeavePlan[]): Promise<StoreResult> => inner.saveLeavePlans(rows),
  );
  const saveSettings = vi.fn(
    (settings: PlannerSettings): Promise<StoreResult> => inner.saveSettings(settings),
  );
  const savePlannerEvents = vi.fn(
    (rows: PlannerEvent[]): Promise<StoreResult> => inner.savePlannerEvents(rows),
  );
  const store: DataStore = {
    backend: 'memory',
    load: () => inner.load(),
    saveEmployees: (rows) => inner.saveEmployees(rows),
    savePolicies: (rows) => inner.savePolicies(rows),
    saveLeavePlans,
    saveAttendance: (rows) => inner.saveAttendance(rows),
    saveHolidays: (rows) => inner.saveHolidays(rows),
    savePlannerEvents,
    saveSettings,
    exportSnapshot: () => inner.exportSnapshot(),
    importSnapshot: (snapshot) => inner.importSnapshot(snapshot),
    clearBusinessData: () => inner.clearBusinessData(),
  };
  return { store, saveLeavePlans, saveSettings, savePlannerEvents };
}

// The planner's month heading is the only level-2 heading that reads as
// "<Month> <Year>"; the page title is a level-2 heading too and must not match.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_HEADING = new RegExp(`^(${MONTH_NAMES.join('|')}) \\d{4}$`);

const readRenderedMonth = () => {
  const label = screen
    .getByRole('heading', { level: 2, name: MONTH_HEADING })
    .textContent?.trim();
  const [monthName, yearText] = (label ?? '').split(' ');
  const monthIndex = MONTH_NAMES.indexOf(monthName as (typeof MONTH_NAMES)[number]);
  expect(monthIndex).toBeGreaterThanOrEqual(0);
  return { year: Number(yearText), monthIndex };
};

const dayKey = (month: { year: number; monthIndex: number }, day: number): string =>
  toDateKey(new Date(month.year, month.monthIndex, day));

const openPlanner = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Planner' }));
  return readRenderedMonth();
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Planner integration', () => {
  it('renders the planner calendar and summary under its own tab', async () => {
    const snapshot = makeSnapshot();
    const { store, saveLeavePlans, saveSettings, savePlannerEvents } = makeSpyStore();

    await renderApp({ initialData: snapshot, dataStore: store });

    // Mount persistence: the planner's (empty) datasets and its settings go to
    // the store exactly like the register and the policies do.
    expect(saveLeavePlans).toHaveBeenCalledWith([]);
    expect(savePlannerEvents).toHaveBeenCalledWith([]);
    expect(saveSettings).toHaveBeenCalledWith(snapshot.settings);

    await userEvent.click(screen.getByRole('button', { name: 'Planner' }));

    // Calendar: a month heading, the Monday-first weekday row and 42 day cells.
    const month = readRenderedMonth();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: `${MONTH_NAMES[month.monthIndex]} ${month.year}`,
      }),
    ).toBeInTheDocument();
    const weekdays = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(screen.getAllByRole('button', { name: /\d{4}, / })).toHaveLength(42);

    // The summary tiles render even with nothing planned.
    expect(screen.getByText('People on leave today')).toBeInTheDocument();
    expect(screen.getByText('Peak day this month')).toBeInTheDocument();
    expect(screen.getByText('Upcoming leave · 30 days')).toBeInTheDocument();
    expect(screen.getByText('Working days booked')).toBeInTheDocument();

    // The page header names the new page.
    expect(
      screen.getByRole('heading', { level: 2, name: /Leave, Events & Coverage/ }),
    ).toBeInTheDocument();
  });

  it('renders the leave plans handed over in the snapshot', async () => {
    // The range spans the whole current month, so one mid-month day is covered
    // no matter which day the test runs on.
    const now = new Date();
    const monthStart = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const plan: LeavePlan = {
      id: 'plan-gate-1',
      employeeId: ONE_EMPLOYEE.id,
      startDate: monthStart,
      endDate: monthEnd,
      type: 'CL',
      status: 'Approved',
      halfDay: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const { store, saveLeavePlans } = makeSpyStore();

    await renderApp({ initialData: makeSnapshot({ leavePlans: [plan] }), dataStore: store });
    const month = await openPlanner();

    // The snapshot's plans - not seed data, not an empty planner - are on the calendar.
    const midMonthCell = screen.getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[month.monthIndex]} 15, ${month.year}`),
    });
    expect(midMonthCell).toHaveAccessibleName(/1 person on leave/);

    // And the mount save persisted the snapshot's plans, not an empty list.
    expect(saveLeavePlans).toHaveBeenCalledWith([plan]);
  });

  it('adds a leave entry through the modal, updates the calendar and saves through the store', async () => {
    const snapshot = makeSnapshot();
    const { store, saveLeavePlans } = makeSpyStore();
    const employee = snapshot.employees[0];

    await renderApp({ initialData: snapshot, dataStore: store });
    const month = await openPlanner();

    await userEvent.click(screen.getByRole('button', { name: 'Add leave' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), employee.id);
    fireEvent.change(within(dialog).getByLabelText('Start date'), {
      target: { value: dayKey(month, 10) },
    });
    fireEvent.change(within(dialog).getByLabelText('End date'), {
      target: { value: dayKey(month, 10) },
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );

    // The entry modal closed and the day now counts one person on leave.
    expect(screen.queryByRole('dialog')).toBeNull();
    const dayCell = screen.getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[month.monthIndex]} 10, ${month.year}`),
    });
    expect(dayCell).toHaveAccessibleName(/1 person on leave/);

    // The save went through the store with the plan App now holds - and never
    // to localStorage, which is the whole point of the seam.
    expect(saveLeavePlans).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: employee.id,
          startDate: dayKey(month, 10),
          endDate: dayKey(month, 10),
          status: 'Planned',
          halfDay: null,
        }),
      ]),
    );
    expect(localStorage.getItem('omnihr_leave_plans')).toBeNull();
  });

  it('renders the events handed over in the snapshot on the calendar', async () => {
    const now = new Date();
    const monthStart = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const event: PlannerEvent = {
      id: 'event-gate-1',
      title: 'Quarterly Business Review',
      startDate: monthStart,
      endDate: monthEnd,
      type: 'Event',
      location: 'Bengaluru HQ',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const { store, savePlannerEvents } = makeSpyStore();

    await renderApp({ initialData: makeSnapshot({ plannerEvents: [event] }), dataStore: store });
    const month = await openPlanner();

    // The snapshot's events - not seed data, not an empty calendar - are on the
    // calendar: a day inside the range names the event even with no leave on it.
    const midMonthCell = screen.getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[month.monthIndex]} 15, ${month.year}`),
    });
    expect(midMonthCell).toHaveAccessibleName(/no leave, 1 event/);

    // The mount save persisted the snapshot's events, not an empty list.
    expect(savePlannerEvents).toHaveBeenCalledWith([event]);
  });

  it('adds an event through the modal and saves it through the store', async () => {
    const snapshot = makeSnapshot();
    const { store, savePlannerEvents } = makeSpyStore();

    await renderApp({ initialData: snapshot, dataStore: store });
    const month = await openPlanner();

    await userEvent.click(screen.getByRole('button', { name: 'Add event' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Manager training day');
    fireEvent.change(within(dialog).getByLabelText('Start date'), {
      target: { value: dayKey(month, 8) },
    });
    fireEvent.change(within(dialog).getByLabelText('End date'), {
      target: { value: dayKey(month, 9) },
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save event entry' }),
    );

    // The event modal closed, the day shows the event, and the save went
    // through the store with the event App now holds - never to localStorage.
    expect(screen.queryByRole('dialog')).toBeNull();
    const dayCell = screen.getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[month.monthIndex]} 8, ${month.year}`),
    });
    expect(dayCell).toHaveAccessibleName(/no leave, 1 event/);

    expect(savePlannerEvents).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Manager training day',
          startDate: dayKey(month, 8),
          endDate: dayKey(month, 9),
          type: 'Event',
        }),
      ]),
    );
    expect(localStorage.getItem('omnihr_planner_events')).toBeNull();
  });

  it('lists snapshot events in the day panel and deletes them through the store', async () => {
    const now = new Date();
    const day = toDateKey(new Date(now.getFullYear(), now.getMonth(), 12));
    const event: PlannerEvent = {
      id: 'event-gate-2',
      title: 'Manager Training Day',
      startDate: day,
      endDate: day,
      type: 'Training',
      department: 'People & Human Resources',
      notes: 'Bring laptops',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const { store, savePlannerEvents } = makeSpyStore();

    await renderApp({ initialData: makeSnapshot({ plannerEvents: [event] }), dataStore: store });
    const month = await openPlanner();

    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`${MONTH_NAMES[month.monthIndex]} 12, ${month.year}`),
      }),
    );

    // The badge and the toolbar select share the word "Training", so the
    // assertion is scoped to the event entry in the day panel.
    const entry = screen
      .getByText('Manager Training Day')
      .closest('.planner-entry--event');
    expect(entry).not.toBeNull();
    expect(within(entry as HTMLElement).getByText('Training')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete event' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete event' }),
    );

    // The removal is reported through the store as the event-less dataset.
    expect(savePlannerEvents).toHaveBeenLastCalledWith([]);
  });
});
