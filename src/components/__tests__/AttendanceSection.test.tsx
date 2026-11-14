import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { AttendanceSection } from '../AttendanceSection';
import { buildAttendanceWorkbook } from '../../utils/attendanceExcel';
import { monthDateKeys, monthKey, workingDateKeys } from '../../utils/attendance';
import { toDateKey } from '../../utils/leavePlanner';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Holiday,
  LeavePlan,
} from '../../types';
import { INITIAL_EMPLOYEES } from '../../data/initialData';

/*
 * The section owns no data: it renders what it is given and reports intents
 * back through `onSaveRecord`/`onDeleteRecord`/`onReplaceMonth`/`onSaveHoliday`/
 * `onDeleteHoliday`. Every test below drives it the way the parent will - by
 * passing props and asserting on the callbacks.
 *
 * The displayed month is READ FROM THE RENDERED HEADING rather than from a
 * frozen clock, and every day-specific assertion first CLICKS the day column
 * it cares about, so the daily tiles describe that chosen day instead of
 * whatever "today" happens to be when the suite runs.
 */

const noop = () => {};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

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

const readRenderedMonth = (): RenderedMonth =>
  parseMonthLabel(screen.getByRole('heading', { level: 2 }).textContent);

const monthLabel = (month: RenderedMonth): string =>
  `${MONTH_NAMES[month.monthIndex]} ${month.year}`;

const dayKey = (month: RenderedMonth, day: number): string =>
  toDateKey(new Date(month.year, month.monthIndex, day));

const employee = (id: string, name: string, department: string, location: string): Employee => ({
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

const recordFor = (
  month: RenderedMonth,
  employeeId: string,
  day: number,
  status: AttendanceStatus,
  extra: Partial<AttendanceRecord> = {},
): AttendanceRecord => {
  const date = dayKey(month, day);
  return {
    id: `${employeeId}|${date}`,
    employeeId,
    date,
    status,
    source: 'seed',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
};

type SectionProps = ComponentProps<typeof AttendanceSection>;

const renderSection = (props: Partial<SectionProps> = {}) => {
  const base: SectionProps = {
    employees: EMPLOYEES,
    attendance: [],
    holidays: [],
    leavePlans: [],
    onSaveRecord: noop,
    onDeleteRecord: noop,
    onReplaceMonth: noop,
    onSaveHoliday: noop,
    onDeleteHoliday: noop,
    ...props,
  };
  const utils = render(<AttendanceSection {...base} />);
  const month = readRenderedMonth();
  return {
    ...utils,
    month,
    rerenderWith: (overrides: Partial<SectionProps>) => {
      utils.rerender(<AttendanceSection {...base} {...overrides} />);
    },
  };
};

/** The day-number button in the matrix header for `day` of the rendered month. */
const dayHead = (month: RenderedMonth, day: number) =>
  screen.getByRole('button', {
    name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${day}, ${month.year}.*Open the day editor`),
  });

/** The matrix cell button for one employee's day, matched by accessible name. */
const cellButton = (month: RenderedMonth, name: string, day: number) => {
  const row = screen.getByRole('row', { name: new RegExp(name) });
  return within(row).getByRole('button', {
    name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${day}, ${month.year}`),
  });
};

const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

/** The tile whose `.kpi-label` reads `label`; scoped so the legend cannot collide. */
const tile = (label: string): HTMLElement =>
  screen.getByText(label, { selector: '.kpi-label' }).closest('.kpi-card') as HTMLElement;

const dayDialog = async (month: RenderedMonth, day: number, name: string) => {
  await userEvent.click(cellButton(month, name, day));
  return screen.getByRole('dialog');
};

beforeEach(() => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  // jsdom implements neither object URLs nor anchor navigation; the toolbar
  // must drive both, so the tests provide them the way a browser would.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(noop);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AttendanceSection — month, matrix and tiles', () => {
  it('renders the current month, one row per employee and one column per day', () => {
    const now = new Date();
    const { month } = renderSection();

    expect(month).toEqual({ year: now.getFullYear(), monthIndex: now.getMonth() });
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(month) }),
    ).toBeInTheDocument();

    const matrix = screen.getByRole('table', { name: new RegExp(`Attendance matrix for ${monthLabel(month)}`, 'i') });
    const dayHeads = within(matrix).getAllByRole('columnheader').filter(
      (cell) => cell.querySelector('.attendance-day-head__btn') !== null,
    );
    expect(dayHeads).toHaveLength(monthDateKeys(month.year, month.monthIndex).length);

    for (const emp of EMPLOYEES) {
      expect(within(matrix).getByRole('row', { name: new RegExp(emp.name) })).toBeInTheDocument();
    }
  });

  it('shows month-scoped working days and holidays in the summary tiles', () => {
    const { month, rerenderWith } = renderSection();
    const holidays: Holiday[] = [
      { id: `holiday-${dayKey(month, 5)}`, date: dayKey(month, 5), name: 'Founders Day' },
    ];
    rerenderWith({ holidays });

    expect(
      within(tile('Working days')).getByText(
        String(workingDateKeys(month.year, month.monthIndex, holidays).length),
      ),
    ).toBeInTheDocument();
    expect(within(tile('Holidays')).getByText('1')).toBeInTheDocument();
  });

  it('summarises the selected day in the daily tiles', async () => {
    const { month, rerenderWith } = renderSection();
    rerenderWith({
      attendance: [
        recordFor(month, 'EMP-A', 10, 'Present'),
        recordFor(month, 'EMP-B', 10, 'WFH'),
        recordFor(month, 'EMP-C', 10, 'Leave', { leaveType: 'CL' }),
        recordFor(month, 'EMP-D', 10, 'Absent'),
      ],
    });

    await userEvent.click(dayHead(month, 10));

    expect(within(tile('Present')).getByText('1')).toBeInTheDocument();
    expect(within(tile('On leave')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Absent')).getByText('1')).toBeInTheDocument();
    expect(within(tile('WFH')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Unmarked')).getByText('0')).toBeInTheDocument();
  });

  it('counts a half-day as present and reports who is still unmarked', async () => {
    const { month, rerenderWith } = renderSection();
    rerenderWith({
      attendance: [
        recordFor(month, 'EMP-A', 10, 'HalfDay'),
        recordFor(month, 'EMP-B', 10, 'Present'),
      ],
    });

    await userEvent.click(dayHead(month, 10));

    expect(within(tile('Present')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Unmarked')).getByText('2')).toBeInTheDocument();
  });

  it('shows no daily numbers once the viewed month has no selected day', async () => {
    const { month } = renderSection();
    const next =
      month.monthIndex === 11
        ? { year: month.year + 1, monthIndex: 0 }
        : { year: month.year, monthIndex: month.monthIndex + 1 };

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { level: 2, name: monthLabel(next) })).toBeInTheDocument();

    expect(within(tile('Present')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Unmarked')).getByText('—')).toBeInTheDocument();
  });

  it('navigates months and changes the matrix width with them', async () => {
    const { month } = renderSection();
    const next =
      month.monthIndex === 11
        ? { year: month.year + 1, monthIndex: 0 }
        : { year: month.year, monthIndex: month.monthIndex + 1 };

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { level: 2, name: monthLabel(next) })).toBeInTheDocument();
    expect(dayHead(next, 1)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 2, name: monthLabel(month) })).toBeInTheDocument();

    const previous =
      month.monthIndex === 0
        ? { year: month.year - 1, monthIndex: 11 }
        : { year: month.year, monthIndex: month.monthIndex - 1 };
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      screen.getByRole('heading', { level: 2, name: monthLabel(previous) }),
    ).toBeInTheDocument();
  });

  it('narrows the matrix and the day editor with the filters', async () => {
    const { month, rerenderWith } = renderSection();
    rerenderWith({
      attendance: [recordFor(month, 'EMP-A', 10, 'Present')],
    });

    await userEvent.selectOptions(
      screen.getByLabelText('Filter by department'),
      'People & Human Resources',
    );
    expect(screen.getByText('1 of 4 employees')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Ravi Kumar/ })).toBeNull();
    expect(rowFor('Priya Sharma')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filter by department'), 'ALL');
    await userEvent.type(screen.getByLabelText('Search employees'), 'vikram');
    expect(screen.getByText('1 of 4 employees')).toBeInTheDocument();
    expect(rowFor('Vikram Rao')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search employees'));
    expect(screen.getByText('4 of 4 employees')).toBeInTheDocument();
  });
});

describe('AttendanceSection — matrix cells', () => {
  it('renders Sundays and holidays as derived, non-editable cells', () => {
    const { month, rerenderWith } = renderSection();
    const holidays: Holiday[] = [
      { id: `holiday-${dayKey(month, 5)}`, date: dayKey(month, 5), name: 'Founders Day' },
    ];
    rerenderWith({ holidays });

    const firstSunday = monthDateKeys(month.year, month.monthIndex)
      .find((key) => new Date(`${key}T00:00:00`).getDay() === 0);
    expect(firstSunday).toBeDefined();
    const sundayDay = Number(firstSunday?.slice(-2));

    const row = rowFor('Ravi Kumar');
    expect(within(row).getAllByText('WO').length).toBeGreaterThan(0);
    const holidayCell = within(row).getByText('H');
    expect(holidayCell).toHaveAttribute('title', 'Holiday — Founders Day');

    // Derived cells are not buttons: they are calendar facts, not records.
    expect(
      within(row).queryByRole('button', {
        name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${sundayDay}, ${month.year}`),
      }),
    ).toBeNull();
  });

  it('renders a record with its code and tone', () => {
    const { month, rerenderWith } = renderSection();
    rerenderWith({ attendance: [recordFor(month, 'EMP-A', 10, 'Absent')] });

    const cell = cellButton(month, 'Ravi Kumar', 10);
    expect(cell).toHaveTextContent('A');
    expect(cell).toHaveClass('attendance-cell--absent');
    expect(cell).toHaveAccessibleName(/Ravi Kumar, .*: A/);
  });

  it('shows an approved leave plan as a ghost cell when no record exists', async () => {
    const { month, rerenderWith } = renderSection();
    const plan: LeavePlan = {
      id: 'plan-1',
      employeeId: 'EMP-A',
      startDate: dayKey(month, 12),
      endDate: dayKey(month, 12),
      type: 'SL',
      status: 'Approved',
      halfDay: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    rerenderWith({ leavePlans: [plan] });

    const ghost = rowFor('Ravi Kumar').querySelector('.attendance-cell--ghost');
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveTextContent('SL');
    expect(ghost?.getAttribute('title')).toMatch(/Approved leave plan/);

    // A ghost cell opens the ordinary editor: there is no record behind it yet.
    await userEvent.click(ghost as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/unmarked/);
  });

  it('does not show a ghost cell where a record already exists', () => {
    const { month, rerenderWith } = renderSection();
    rerenderWith({
      leavePlans: [
        {
          id: 'plan-1',
          employeeId: 'EMP-A',
          startDate: dayKey(month, 12),
          endDate: dayKey(month, 12),
          type: 'SL',
          status: 'Approved',
          halfDay: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      attendance: [recordFor(month, 'EMP-A', 12, 'Leave', { leaveType: 'SL' })],
    });

    expect(rowFor('Ravi Kumar').querySelector('.attendance-cell--ghost')).toBeNull();
    expect(cellButton(month, 'Ravi Kumar', 12)).toHaveTextContent('SL');
  });
});

describe('AttendanceSection — cell editor', () => {
  it('saves a new record through the cell editor', async () => {
    const onSaveRecord = vi.fn();
    const { month } = renderSection({ onSaveRecord });

    const dialog = await dayDialog(month, 10, 'Ravi Kumar');
    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'Work from home');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save attendance' }));

    expect(onSaveRecord).toHaveBeenCalledTimes(1);
    expect(onSaveRecord.mock.calls[0][0]).toMatchObject({
      id: `EMP-A|${dayKey(month, 10)}`,
      employeeId: 'EMP-A',
      date: dayKey(month, 10),
      status: 'WFH',
      source: 'manual',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits an existing record and keeps its identity', async () => {
    const onSaveRecord = vi.fn();
    const { month, rerenderWith } = renderSection({ onSaveRecord });
    const saved = recordFor(month, 'EMP-A', 10, 'Leave', { leaveType: 'SL', source: 'excel' });
    rerenderWith({ attendance: [saved] });

    const dialog = await dayDialog(month, 10, 'Ravi Kumar');
    expect(within(dialog).getByLabelText('Leave type')).toHaveValue('SL');
    await userEvent.selectOptions(within(dialog).getByLabelText('Leave type'), 'EL');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save attendance' }));

    expect(onSaveRecord).toHaveBeenCalledTimes(1);
    expect(onSaveRecord.mock.calls[0][0]).toMatchObject({
      id: saved.id,
      employeeId: 'EMP-A',
      date: saved.date,
      status: 'Leave',
      leaveType: 'EL',
      source: 'manual',
    });
  });

  it('asks before clearing an existing record', async () => {
    const onDeleteRecord = vi.fn();
    const { month, rerenderWith } = renderSection({ onDeleteRecord });
    const saved = recordFor(month, 'EMP-A', 10, 'Absent');
    rerenderWith({ attendance: [saved] });

    await userEvent.click(cellButton(month, 'Ravi Kumar', 10));
    await userEvent.click(screen.getByRole('button', { name: 'Delete record' }));

    const confirm = screen.getByRole('dialog', { name: /Delete this attendance record/ });
    expect(confirm).toHaveTextContent(/Ravi Kumar/);
    expect(onDeleteRecord).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete record' }));
    expect(onDeleteRecord).toHaveBeenCalledWith(saved.id);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AttendanceSection — day editor', () => {
  it('opens the day editor from a day column and marks everyone present', async () => {
    const onSaveRecord = vi.fn();
    const { month, rerenderWith } = renderSection({ onSaveRecord });
    rerenderWith({ attendance: [recordFor(month, 'EMP-A', 10, 'Present')] });

    await userEvent.click(dayHead(month, 10));
    const panel = screen.getByRole('complementary', { name: 'Day editor' });
    expect(within(panel).getByText(/Mark all present/)).toBeInTheDocument();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(4);

    await userEvent.click(
      within(panel).getByRole('button', { name: 'Mark all present' }),
    );

    // The already-marked employee keeps their record; the other three are reported.
    expect(onSaveRecord).toHaveBeenCalledTimes(3);
    const targets = onSaveRecord.mock.calls.map((call) => call[0] as AttendanceRecord);
    for (const record of targets) {
      expect(record).toMatchObject({
        date: dayKey(month, 10),
        status: 'Present',
        source: 'manual',
      });
    }
    expect(targets.map((record) => record.employeeId).sort()).toEqual([
      'EMP-B', 'EMP-C', 'EMP-D',
    ]);
  });

  it('offers no bulk marking on a Sunday', async () => {
    const { month } = renderSection();
    const firstSunday = monthDateKeys(month.year, month.monthIndex)
      .find((key) => new Date(`${key}T00:00:00`).getDay() === 0);
    const sundayDay = Number(firstSunday?.slice(-2));

    await userEvent.click(dayHead(month, sundayDay));

    const panel = screen.getByRole('complementary', { name: 'Day editor' });
    expect(within(panel).getByRole('button', { name: 'Mark all present' })).toBeDisabled();
    expect(within(panel).getByText(/no bulk marking is offered/)).toBeInTheDocument();
  });

  it('opens the cell editor from the day editor list', async () => {
    const { month } = renderSection();

    await userEvent.click(dayHead(month, 10));
    const panel = screen.getByRole('complementary', { name: 'Day editor' });
    await userEvent.click(
      within(within(panel).getAllByRole('listitem')[1]).getByRole('button', { name: 'Edit' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/Attendance — Asha Menon/);
  });
});

describe('AttendanceSection — holiday card', () => {
  it('lists the month holidays and asks before deleting one', async () => {
    const onDeleteHoliday = vi.fn();
    const { month, rerenderWith } = renderSection({ onDeleteHoliday });
    const holiday: Holiday = {
      id: `holiday-${dayKey(month, 5)}`,
      date: dayKey(month, 5),
      name: 'Founders Day',
    };
    rerenderWith({ holidays: [holiday] });

    const card = screen.getByText('Holidays', { selector: '.omni-card-title' }).closest('.omni-card') as HTMLElement;
    expect(within(card).getByText('Founders Day')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('dialog', { name: /Delete this holiday/ });
    expect(confirm).toHaveTextContent(/Founders Day/);
    expect(onDeleteHoliday).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete holiday' }));
    expect(onDeleteHoliday).toHaveBeenCalledWith(holiday.id);
  });

  it('adds a holiday through the modal and reports it to the parent', async () => {
    const onSaveHoliday = vi.fn();
    const { month } = renderSection({ onSaveHoliday });

    await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    const dialog = screen.getByRole('dialog', { name: /Add holiday/ });
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: dayKey(month, 20) },
    });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Founders Day');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save holiday' }));

    expect(onSaveHoliday).toHaveBeenCalledWith({
      id: `holiday-${dayKey(month, 20)}`,
      date: dayKey(month, 20),
      name: 'Founders Day',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits a holiday in place', async () => {
    const onSaveHoliday = vi.fn();
    const { month, rerenderWith } = renderSection({ onSaveHoliday });
    const holiday: Holiday = {
      id: `holiday-${dayKey(month, 5)}`,
      date: dayKey(month, 5),
      name: 'Founders Day',
    };
    rerenderWith({ holidays: [holiday] });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: /Edit holiday/ });
    expect(within(dialog).getByLabelText('Date')).toHaveValue(holiday.date);
    await userEvent.clear(within(dialog).getByLabelText('Name'));
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Founders Day (observed)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(onSaveHoliday).toHaveBeenCalledWith({
      id: holiday.id,
      date: holiday.date,
      name: 'Founders Day (observed)',
    });
  });
});

describe('AttendanceSection — template download', () => {
  it('downloads a workbook named for the viewed month', async () => {
    const { month } = renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Download template/ }));

    const anchor = (HTMLAnchorElement.prototype.click as unknown as ReturnType<typeof vi.spyOn>)
      .mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`omnihr-attendance-${monthKey(month.year, month.monthIndex)}.xlsx`);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
  });

  it('toggles the prefill option without downloading', async () => {
    renderSection();

    const checkbox = screen.getByRole('checkbox', { name: /Prefill working days as Present/ });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('AttendanceSection — import', () => {
  const matrixFile = (month: RenderedMonth, name = 'attendance.xlsx'): File => {
    const workbook = buildAttendanceWorkbook({
      employees: EMPLOYEES,
      holidays: [{ id: `holiday-${dayKey(month, 5)}`, date: dayKey(month, 5), name: 'Founders Day' }],
      leavePlans: [],
      year: month.year,
      monthIndex: month.monthIndex,
      prefillPresent: true,
    });
    return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], name, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  /** The `<dd>` value under the `<dt>` labelled `label` in the preview card. */
  const previewCount = (preview: HTMLElement, label: string): string => {
    const dt = within(preview)
      .getAllByText(label)
      .find((el) => el.tagName === 'DT');
    return dt?.nextElementSibling?.textContent ?? '';
  };

  const chooseFile = async (file: File) => {
    await userEvent.upload(screen.getByLabelText('Choose attendance file'), file);
  };

  it('previews a valid matrix and replaces the month only after confirmation', async () => {
    const onReplaceMonth = vi.fn();
    const { month, rerenderWith } = renderSection({ onReplaceMonth });
    rerenderWith({ attendance: [recordFor(month, 'EMP-A', 2, 'Present')] });

    await chooseFile(matrixFile(month));

    const preview = screen.getByRole('region', { name: 'Import preview' });
    expect(previewCount(preview, 'Month')).toBe(monthLabel(month));
    expect(previewCount(preview, 'Employees matched')).toBe('4');
    const holidayRow = [{ id: `holiday-${dayKey(month, 5)}`, date: dayKey(month, 5), name: 'Founders Day' }];
    const workingDays = workingDateKeys(month.year, month.monthIndex, holidayRow).length;
    expect(previewCount(preview, 'Records to import')).toBe(String(workingDays * 4));
    expect(previewCount(preview, 'Records replaced')).toBe('1');
    expect(previewCount(preview, 'Issues')).toBe('0');

    // Nothing is reported until the user confirms.
    expect(onReplaceMonth).not.toHaveBeenCalled();

    await userEvent.click(
      within(preview).getByRole('button', { name: `Replace ${monthLabel(month)}` }),
    );

    expect(onReplaceMonth).toHaveBeenCalledTimes(1);
    const [replacedMonth, records] = onReplaceMonth.mock.calls[0] as [string, AttendanceRecord[]];
    expect(replacedMonth).toBe(monthKey(month.year, month.monthIndex));
    // H and WO cells never become records: only working days were prefilled.
    expect(records).toHaveLength(workingDays * 4);
    for (const record of records) {
      expect(record.source).toBe('excel');
      expect(record.date.startsWith(`${monthKey(month.year, month.monthIndex)}-`)).toBe(true);
    }
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(await screen.findByText(/replaced/i)).toBeInTheDocument();
  });

  it('lets the user back out of a preview without replacing anything', async () => {
    const onReplaceMonth = vi.fn();
    const { month } = renderSection({ onReplaceMonth });

    await chooseFile(matrixFile(month));
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Import preview' })).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(onReplaceMonth).not.toHaveBeenCalled();
  });

  it('reports issues and skips unknown employees but still previews the rest', async () => {
    const onReplaceMonth = vi.fn();
    const { month } = renderSection({ onReplaceMonth });

    const holidayRow = [{ id: `holiday-${dayKey(month, 5)}`, date: dayKey(month, 5), name: 'Founders Day' }];
    const dates = monthDateKeys(month.year, month.monthIndex);
    // The bad code must land on a real working day, whatever the month is.
    const badDay = Number(workingDateKeys(month.year, month.monthIndex, holidayRow)[0].slice(-2));
    const header = ['Employee ID', 'Employee Name', 'Department', ...dates.map((_, index) => index + 1)];
    const cellsFor = (badCodeDay = 0, badCode = '') =>
      dates.map((date, index) => {
        const day = index + 1;
        if (new Date(`${date}T00:00:00`).getDay() === 0) return '';
        if (day === 5) return 'H';
        if (badCodeDay === day) return badCode;
        return 'P';
      });
    const rows = [
      ['OmniHR Monthly Attendance'],
      ['Month', monthKey(month.year, month.monthIndex)],
      ['Generated', new Date().toISOString()],
      [''],
      header,
      ['EMP-A', 'Ravi', 'Eng', ...cellsFor()],
      ['EMP-GHOST', 'Ghost', 'Eng', ...cellsFor()],
      ['EMP-B', 'Asha', 'Eng', ...cellsFor(badDay, 'X')],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
    await chooseFile(
      new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'matrix.xlsx'),
    );

    const preview = screen.getByRole('region', { name: 'Import preview' });
    expect(within(preview).getByText(/Unknown employee IDs: EMP-GHOST/)).toBeInTheDocument();
    expect(within(preview).getByText(/Unknown attendance code "X"/)).toBeInTheDocument();
    expect(previewCount(preview, 'Employees matched')).toBe('2');
    expect(previewCount(preview, 'Issues')).toBe('2');

    await userEvent.click(
      within(preview).getByRole('button', { name: `Replace ${monthLabel(month)}` }),
    );
    expect(onReplaceMonth).toHaveBeenCalledTimes(1);
    const [, records] = onReplaceMonth.mock.calls[0] as [string, AttendanceRecord[]];
    // Only rows that matched an employee and carried a valid code became records.
    expect(records.every((record) => record.employeeId === 'EMP-A' || record.employeeId === 'EMP-B')).toBe(true);
  });

  it('refuses a file that is not an attendance matrix without any callback', async () => {
    const onReplaceMonth = vi.fn();
    renderSection({ onReplaceMonth });

    await chooseFile(new File(['this is not a workbook'], 'broken.xlsx'));

    expect(screen.getByRole('alert')).toHaveTextContent(/not a monthly attendance matrix/i);
    expect(onReplaceMonth).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
  });
});
