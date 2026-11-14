import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeavePlannerSection } from '../LeavePlannerSection';
import type { Employee, LeavePlan, PlannerSettings } from '../../types';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import { toDateKey } from '../../utils/leavePlanner';

/*
 * The section owns no data: it renders what it is given and reports intents back
 * through `onSave`/`onDelete`/`onSettingsChange`. Every test below drives it the
 * way the parent will - by passing props and asserting on the callbacks.
 *
 * The displayed month is READ FROM THE RENDERED HEADING rather than from a frozen
 * clock. The tests render empty, read the month, build their fixtures inside it
 * and re-render with them. That keeps everything deterministic and free of fake
 * timers, while still placing the seeded plans on days the calendar shows.
 */

const noop = () => {};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const employee = (
  id: string,
  name: string,
  department: string,
  location: string,
): Employee => ({
  ...INITIAL_EMPLOYEES[0],
  id,
  name,
  department,
  location,
  email: `${id.toLowerCase()}@omnixhr.io`,
});

const EMPLOYEES: Employee[] = [
  employee('EMP-A', 'Ravi Kumar', 'Engineering & Technology', 'Mumbai Hub'),
  employee('EMP-B', 'Asha Menon', 'Engineering & Technology', 'Bengaluru HQ'),
  employee('EMP-C', 'Priya Sharma', 'People & Human Resources', 'Bengaluru HQ'),
  employee('EMP-D', 'Vikram Rao', 'Sales & Business Development', 'Pune Campus'),
];

type SectionProps = ComponentProps<typeof LeavePlannerSection>;

const DEFAULT_SETTINGS: PlannerSettings = { maxConcurrentLeave: 3 };

let planSeq = 0;

/** A leave plan anchored to `startDay` (and `endDay`) of the rendered month. */
const planFor = (
  month: RenderedMonth,
  employeeId: string,
  startDay: number,
  options: {
    endDay?: number;
    status?: LeavePlan['status'];
    type?: LeavePlan['type'];
    halfDay?: LeavePlan['halfDay'];
  } = {},
): LeavePlan => ({
  id: `test-plan-${(planSeq += 1)}`,
  employeeId,
  startDate: toDateKey(new Date(month.year, month.monthIndex, startDay)),
  endDate: toDateKey(new Date(month.year, month.monthIndex, options.endDay ?? startDay)),
  type: options.type ?? 'CL',
  status: options.status ?? 'Approved',
  halfDay: options.halfDay ?? null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

interface RenderedMonth {
  year: number;
  monthIndex: number;
}

const parseMonthLabel = (label: string | null): RenderedMonth => {
  const [monthName, yearText] = (label ?? '').trim().split(' ');
  const monthIndex = MONTH_NAMES.indexOf(monthName as (typeof MONTH_NAMES)[number]);
  expect(monthIndex).toBeGreaterThanOrEqual(0);
  return { year: Number(yearText), monthIndex };
};

const monthLabel = (month: RenderedMonth): string =>
  `${MONTH_NAMES[month.monthIndex]} ${month.year}`;

/** The month heading is the only level-2 heading until the modal opens. */
const readRenderedMonth = (): RenderedMonth =>
  parseMonthLabel(screen.getByRole('heading', { level: 2 }).textContent);

const dayKey = (month: RenderedMonth, day: number): string =>
  toDateKey(new Date(month.year, month.monthIndex, day));

/** Day cells are buttons whose accessible name starts with the long date. */
const dayButton = (month: RenderedMonth, day: number) =>
  screen.getByRole('button', {
    name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${day}, ${month.year}`),
  });

/**
 * Renders the section empty, reads back the month it displays, and returns a
 * `rerenderWith` that swaps in props (state such as the selected day survives).
 */
const renderPlanner = (props: Partial<SectionProps> = {}) => {
  const base: SectionProps = {
    employees: EMPLOYEES,
    leavePlans: [],
    settings: DEFAULT_SETTINGS,
    onSave: noop,
    onDelete: noop,
    onSettingsChange: noop,
    ...props,
  };
  const utils = render(<LeavePlannerSection {...base} />);
  const month = readRenderedMonth();
  return {
    ...utils,
    month,
    rerenderWith: (overrides: Partial<SectionProps>) => {
      utils.rerender(<LeavePlannerSection {...base} {...overrides} />);
    },
  };
};

const openModal = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add leave' }));
  return screen.getByRole('dialog');
};

const fillDates = (dialog: HTMLElement, start: string, end: string) => {
  fireEvent.change(within(dialog).getByLabelText('Start date'), {
    target: { value: start },
  });
  fireEvent.change(within(dialog).getByLabelText('End date'), {
    target: { value: end },
  });
};

describe('LeavePlannerSection', () => {
  it('renders the current month, a Monday-first weekday header and a 42-cell grid', () => {
    const now = new Date();
    renderPlanner();

    const month = readRenderedMonth();
    expect(month).toEqual({ year: now.getFullYear(), monthIndex: now.getMonth() });
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(month) }),
    ).toBeInTheDocument();

    // Monday-first: the header row reads Mon..Sun in exactly that order.
    const weekdays = screen
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

    // Six Monday-first weeks, so the calendar height never jumps between months.
    expect(screen.getAllByRole('button', { name: /\d{4}, / })).toHaveLength(42);
  });

  it('opens the modal from Add leave and saves a valid plan', async () => {
    const onSave = vi.fn();
    const { month } = renderPlanner({ onSave });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, dayKey(month, 10), dayKey(month, 12));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      employeeId: 'EMP-A',
      startDate: dayKey(month, 10),
      endDate: dayKey(month, 12),
      type: 'CL',
      status: 'Planned',
      halfDay: null,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    const onSave = vi.fn();
    const { month } = renderPlanner({ onSave });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, dayKey(month, 12), dayKey(month, 10));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/End date cannot be before the start date/);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('rejects a half-day on a multi-day range', async () => {
    const onSave = vi.fn();
    const { month } = renderPlanner({ onSave });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, dayKey(month, 10), dayKey(month, 10));
    await userEvent.selectOptions(within(dialog).getByLabelText('Half-day'), 'AM');
    // Extending the range invalidates the half-day the user just picked.
    fillDates(dialog, dayKey(month, 10), dayKey(month, 12));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Half-day applies only to a single-day leave/,
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a duplicate identical entry without saving', async () => {
    const onSave = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onSave });
    const existing = planFor(month, 'EMP-A', 11);
    rerenderWith({ leavePlans: [existing] });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, existing.startDate, existing.endDate);
    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'Approved');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /identical leave entry already exists/i,
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('flags an overlap with an existing plan but still allows the save', async () => {
    const onSave = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onSave });
    const existing = planFor(month, 'EMP-A', 11, { endDay: 13 });
    rerenderWith({ leavePlans: [existing] });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, dayKey(month, 12), dayKey(month, 14));

    expect(
      await screen.findByText(/overlaps one other leave entry/i),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      employeeId: 'EMP-A',
      startDate: dayKey(month, 12),
      endDate: dayKey(month, 14),
    });
  });

  it('edits an existing plan, preserving its identity and creation time', async () => {
    const onSave = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onSave });
    const existing = planFor(month, 'EMP-A', 10, { endDay: 12 });
    rerenderWith({ leavePlans: [existing] });

    await userEvent.click(dayButton(month, 11));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Employee')).toHaveValue('EMP-A');
    expect(within(dialog).getByLabelText('Start date')).toHaveValue(existing.startDate);
    expect(within(dialog).getByLabelText('End date')).toHaveValue(existing.endDate);

    await userEvent.selectOptions(within(dialog).getByLabelText('Leave type'), 'SL');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: existing.id,
      createdAt: existing.createdAt,
      type: 'SL',
      startDate: existing.startDate,
      endDate: existing.endDate,
    });
  });

  it('filters the calendar and the day panel by department and by leave type', async () => {
    const { month, rerenderWith } = renderPlanner();
    const engineering = planFor(month, 'EMP-A', 5); // Engineering & Technology
    const peopleOps = planFor(month, 'EMP-C', 6, { type: 'SL' }); // People & HR
    rerenderWith({ leavePlans: [engineering, peopleOps] });

    // Select a day whose only entry is the engineering plan.
    await userEvent.click(dayButton(month, 5));
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();

    // Department filter hides it from the selected-day panel.
    await userEvent.selectOptions(
      screen.getByLabelText('Filter by department'),
      'People & Human Resources',
    );
    expect(screen.queryByText('Ravi Kumar')).toBeNull();
    expect(screen.getByText('No leave entries for this day.')).toBeInTheDocument();

    // Type filter hides it too; resetting both brings it back.
    await userEvent.selectOptions(screen.getByLabelText('Filter by department'), 'ALL');
    await userEvent.selectOptions(screen.getByLabelText('Filter by leave type'), 'SL');
    expect(screen.queryByText('Ravi Kumar')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Filter by leave type'), 'ALL');
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
  });

  it('highlights a day at or above the coverage threshold and lists it under peak days', async () => {
    const { month, rerenderWith } = renderPlanner({
      settings: { maxConcurrentLeave: 3 },
    });
    const crowded = [
      planFor(month, 'EMP-A', 18),
      planFor(month, 'EMP-B', 18),
      planFor(month, 'EMP-C', 18),
      planFor(month, 'EMP-D', 18, { type: 'SL' }),
    ];
    rerenderWith({ leavePlans: crowded });

    // Four distinct people on one day: above the threshold of 3.
    const crowdedDay = dayButton(month, 18);
    expect(crowdedDay).toHaveClass('planner-day--peak');
    expect(within(crowdedDay).getByText('+1')).toBeInTheDocument();

    // A quiet day stays unhighlighted.
    expect(dayButton(month, 5)).not.toHaveClass('planner-day--peak');

    expect(screen.getByText('4 on leave')).toBeInTheDocument();
  });

  it('navigates months and returns to the current month with Today', async () => {
    const { month } = renderPlanner();
    const next =
      month.monthIndex === 11
        ? { year: month.year + 1, monthIndex: 0 }
        : { year: month.year, monthIndex: month.monthIndex + 1 };
    const previous =
      month.monthIndex === 0
        ? { year: month.year - 1, monthIndex: 11 }
        : { year: month.year, monthIndex: month.monthIndex - 1 };

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(next) }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(month) }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(previous) }),
    ).toBeInTheDocument();
  });

  it("shows a selected day's entries and reports deletions to the parent", async () => {
    const onDelete = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onDelete });
    const existing = planFor(month, 'EMP-A', 18);
    rerenderWith({ leavePlans: [existing] });

    await userEvent.click(dayButton(month, 18));
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText(/1 working day/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(existing.id);
  });

  it('renders an orphaned plan as Unknown employee instead of crashing', async () => {
    const { month, rerenderWith } = renderPlanner();
    const orphaned = planFor(month, 'EMP-GONE', 18);
    rerenderWith({ leavePlans: [orphaned] });

    await userEvent.click(dayButton(month, 18));
    expect(screen.getByText('Unknown employee')).toBeInTheDocument();
  });

  it('reports coverage threshold changes to the parent', async () => {
    const onSettingsChange = vi.fn();
    renderPlanner({ onSettingsChange });

    const threshold = screen.getByLabelText('Coverage threshold');
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '4');

    expect(onSettingsChange).toHaveBeenCalledWith({ maxConcurrentLeave: 4 });
  });
});
