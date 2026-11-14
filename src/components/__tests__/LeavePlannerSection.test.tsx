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

  it('clears a picked half-day when the range is extended and saves a full day', async () => {
    const onSave = vi.fn();
    const { month } = renderPlanner({ onSave });

    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('Employee'), 'EMP-A');
    fillDates(dialog, dayKey(month, 10), dayKey(month, 10));
    await userEvent.selectOptions(within(dialog).getByLabelText('Half-day'), 'AM');

    // Extending the range invalidates the half-day the user just picked: the
    // disabled select falls back to "Full day" instead of blocking the save.
    fillDates(dialog, dayKey(month, 10), dayKey(month, 12));
    const halfSelect = within(dialog).getByLabelText('Half-day');
    expect(halfSelect).toBeDisabled();
    expect(halfSelect).toHaveValue('');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save leave entry' }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      employeeId: 'EMP-A',
      startDate: dayKey(month, 10),
      endDate: dayKey(month, 12),
      halfDay: null,
    });
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

  it('clears the half-day when an edit extends a single-day AM/PM entry to a range', async () => {
    const onSave = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onSave });
    const existing = planFor(month, 'EMP-A', 10, { halfDay: 'AM' });
    rerenderWith({ leavePlans: [existing] });

    await userEvent.click(dayButton(month, 10));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Half-day')).toHaveValue('AM');

    // Extending the single-day entry clears the half-day instead of leaving a
    // value that could never be saved.
    fillDates(dialog, existing.startDate, dayKey(month, 12));
    const halfSelect = within(dialog).getByLabelText('Half-day');
    expect(halfSelect).toBeDisabled();
    expect(halfSelect).toHaveValue('');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: existing.id,
      endDate: dayKey(month, 12),
      halfDay: null,
    });
  });

  it('counts a plan spilling over the month edge on the adjacent-month cell too', async () => {
    const { month, rerenderWith } = renderPlanner();

    // A plan that starts on the last day of the month and runs two days past it.
    const lastDay = new Date(month.year, month.monthIndex + 1, 0).getDate();
    rerenderWith({
      leavePlans: [planFor(month, 'EMP-A', lastDay, { endDay: lastDay + 2 })],
    });

    const nextMonth =
      month.monthIndex === 11
        ? { year: month.year + 1, monthIndex: 0 }
        : { year: month.year, monthIndex: month.monthIndex + 1 };

    // The 42-cell grid always shows the first day of the next month; the plan
    // covers it, so the adjacent cell counts it and names it as leave.
    const edgeCell = dayButton(nextMonth, 1);
    expect(edgeCell.querySelector('.planner-day__count')).toHaveTextContent('1');
    expect(edgeCell).toHaveAccessibleName(/1 person on leave/);
    // The month-scoped count map would have called this cell empty.
    expect(edgeCell).not.toHaveAccessibleName(/no leave/);
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

  it('shows the fullest peak day in the tile, keeping the earliest day on ties', async () => {
    const { month, rerenderWith } = renderPlanner({
      settings: { maxConcurrentLeave: 2 },
    });
    rerenderWith({
      leavePlans: [
        planFor(month, 'EMP-A', 5),
        planFor(month, 'EMP-B', 5), // 2 people away on day 5
        planFor(month, 'EMP-A', 18),
        planFor(month, 'EMP-B', 18),
        planFor(month, 'EMP-C', 18), // 3 people away on day 18
      ],
    });

    const tile = screen
      .getByText('Peak day this month')
      .closest('.kpi-card') as HTMLElement;
    const shortLabel = (day: number) =>
      new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
        new Date(month.year, month.monthIndex, day),
      );

    // Day 18 carries the highest count; the earliest peak (day 5) must not win.
    expect(within(tile).getByText(shortLabel(18))).toBeInTheDocument();
    expect(within(tile).getByText('3 people away')).toBeInTheDocument();
    expect(within(tile).queryByText(shortLabel(5))).toBeNull();
  });

  it('books a Sunday half-day as 0 working days in the entry and the summary', async () => {
    const { month, rerenderWith } = renderPlanner();

    // The first Sunday of the rendered month.
    const firstSunday = Array.from({ length: 7 }, (_, index) => index + 1).find(
      (day) => new Date(month.year, month.monthIndex, day).getDay() === 0,
    );
    expect(firstSunday).toBeDefined();

    rerenderWith({
      leavePlans: [planFor(month, 'EMP-A', firstSunday as number, { halfDay: 'AM' })],
    });

    await userEvent.click(dayButton(month, firstSunday as number));

    // The entry describes 0 working days, not 0.5.
    expect(screen.getByText(/0 working days/)).toBeInTheDocument();

    // The booked-days tile counts the same: half of a non-working day is 0.
    const bookedTile = screen
      .getByText('Working days booked')
      .closest('.kpi-card') as HTMLElement;
    expect(within(bookedTile).getByText('0')).toBeInTheDocument();
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

  it("shows a selected day's entries and asks before deleting", async () => {
    const onDelete = vi.fn();
    const { month, rerenderWith } = renderPlanner({ onDelete });
    const existing = planFor(month, 'EMP-A', 18);
    rerenderWith({ leavePlans: [existing] });

    await userEvent.click(dayButton(month, 18));
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText(/1 working day/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Asked first: the dialog names the entry and nothing reaches the parent.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/Delete this leave entry\?/);
    expect(dialog).toHaveTextContent(/Ravi Kumar/);
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Confirming is what reports the deletion.
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete entry' }),
    );
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

  it('never reports a decimal, zero or blank threshold to the parent', async () => {
    const onSettingsChange = vi.fn();
    const { rerenderWith } = renderPlanner({
      onSettingsChange,
      settings: { maxConcurrentLeave: 3 },
    });
    const threshold = screen.getByLabelText('Coverage threshold');

    // Blank, decimal and non-positive drafts stay local while typing.
    fireEvent.change(threshold, { target: { value: '' } });
    fireEvent.change(threshold, { target: { value: '2.5' } });
    fireEvent.change(threshold, { target: { value: '0' } });
    fireEvent.change(threshold, { target: { value: '-1' } });
    expect(onSettingsChange).not.toHaveBeenCalled();

    // A whole positive number is reported verbatim.
    fireEvent.change(threshold, { target: { value: '4' } });
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({ maxConcurrentLeave: 4 });

    // The parent applies it, and the field shows the applied value.
    rerenderWith({ settings: { maxConcurrentLeave: 4 } });
    expect(threshold).toHaveValue(4);

    // A decimal drafted afterwards is still never reported...
    fireEvent.change(threshold, { target: { value: '9.5' } });
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    // ...and leaving the field snaps the draft back to the applied threshold.
    fireEvent.blur(threshold);
    expect(threshold).toHaveValue(4);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
  });
});
