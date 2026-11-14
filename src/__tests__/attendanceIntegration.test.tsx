import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DataSnapshot,
  type DataStore,
  type StoreResult,
} from '../data/DataStore';
import { DATA_SCHEMA_VERSION } from '../utils/storage';
import { buildAttendanceWorkbook } from '../utils/attendanceExcel';
import { monthKey, workingDateKeys } from '../utils/attendance';
import { toDateKey } from '../utils/leavePlanner';
import { computeAttendancePct } from '../utils/dates';
import { computeLOP } from '../utils/payroll';
import { formatINR } from '../utils/formatters';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import type { AttendanceRecord, Employee, Holiday, LeavePlan } from '../types';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and the other integration suites.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Integration: the attendance workspace under its own tab, with App holding the
 * state and the store holding the persistence.
 *
 * The console is mounted through `renderApp` (the data seam of design decision
 * D9): the snapshot below is what the DataGate would hand over, and the spy
 * store records every write while delegating to a real MemoryStore. The
 * section's own matrix/cell/day-panel/holiday/import contracts are pinned in
 * AttendanceSection.test.tsx; these tests prove the WIRING - what App holds
 * after an edit, what reaches the store, and which register payroll and the
 * overview end up reading (design decision D8's rollup with legacy fallback).
 *
 * A custom roster is used on purpose: the demo seed belongs to the store layer
 * and only installs itself for the exact demo set, so these tests see exactly
 * the data they put in.
 */

const EMPLOYEE_A: Employee = {
  ...INITIAL_EMPLOYEES[0],
  id: 'EMP-ATT-A',
  name: 'Zora Daily',
  email: 'zora.daily@omnixhr.io',
  status: 'Active',
  // Legacy monthly values that MUST be overridden by the rollup wherever this
  // employee has daily records in the current month, and kept where they has not.
  presentDays: 10,
  lopDays: 0,
};
const EMPLOYEE_B: Employee = {
  ...INITIAL_EMPLOYEES[0],
  id: 'EMP-ATT-B',
  name: 'Amit Ledger',
  email: 'amit.ledger@omnixhr.io',
  status: 'Active',
  presentDays: 22,
  lopDays: 0,
};
const ONE_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-ATT-1', title: 'Attendance seed policy' };

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 2,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: [EMPLOYEE_A, EMPLOYEE_B],
    policies: [ONE_POLICY],
    leavePlans: [],
    attendance: [],
    holidays: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS },
    ...overrides,
  };
}

/** A store that records every save App makes while still behaving like a real one. */
function makeSpyStore() {
  const inner = new MemoryStore({
    employees: [EMPLOYEE_A, EMPLOYEE_B],
    policies: [ONE_POLICY],
    leavePlans: [],
  });
  const saveAttendance = vi.fn(
    (rows: AttendanceRecord[]): Promise<StoreResult> => inner.saveAttendance(rows),
  );
  const saveHolidays = vi.fn(
    (rows: Holiday[]): Promise<StoreResult> => inner.saveHolidays(rows),
  );
  const store: DataStore = {
    backend: 'memory',
    load: () => inner.load(),
    saveEmployees: (rows) => inner.saveEmployees(rows),
    savePolicies: (rows) => inner.savePolicies(rows),
    saveLeavePlans: (rows) => inner.saveLeavePlans(rows),
    saveAttendance,
    saveHolidays,
    saveSettings: (settings) => inner.saveSettings(settings),
    exportSnapshot: () => inner.exportSnapshot(),
    importSnapshot: (snapshot) => inner.importSnapshot(snapshot),
    clearBusinessData: () => inner.clearBusinessData(),
  };
  return { store, inner, saveAttendance, saveHolidays };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

interface RenderedMonth {
  year: number;
  monthIndex: number;
}

// "Today" is read once at module load and shared by the seed data and the
// expectations: the console is always mounted on the same calendar day.
const TODAY = new Date();
const CURRENT: RenderedMonth = { year: TODAY.getFullYear(), monthIndex: TODAY.getMonth() };
const PREVIOUS: RenderedMonth =
  CURRENT.monthIndex === 0
    ? { year: CURRENT.year - 1, monthIndex: 11 }
    : { year: CURRENT.year, monthIndex: CURRENT.monthIndex - 1 };

const monthLabel = (month: RenderedMonth): string =>
  `${MONTH_NAMES[month.monthIndex]} ${month.year}`;

const dayKey = (month: RenderedMonth, day: number): string =>
  toDateKey(new Date(month.year, month.monthIndex, day));

const recordFor = (
  month: RenderedMonth,
  employeeId: string,
  day: number,
  status: AttendanceRecord['status'],
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

const holidayFor = (month: RenderedMonth, day: number, name: string): Holiday => {
  const date = dayKey(month, day);
  return { id: `holiday-${date}`, date, name };
};

const openAttendance = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Time & Attendance' }));
  expect(
    await screen.findByRole('heading', { level: 2, name: monthLabel(CURRENT) }),
  ).toBeInTheDocument();
};

/** The matrix cell button for one employee's day, matched by accessible name. */
const cellButton = (month: RenderedMonth, name: string, day: number) => {
  const row = screen.getByRole('row', { name: new RegExp(name) });
  return within(row).getByRole('button', {
    name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${day}, ${month.year}`),
  });
};

const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

/** Waits until a fresh store read satisfies the assertion. */
const waitForStore = (assert: (snapshot: DataSnapshot) => void) =>
  waitFor(async () => {
    const loaded = await innerStore.load();
    assert(loaded.snapshot);
  });

// The current spy store, set by `mountConsole` so `waitForStore` can read it.
let innerStore: MemoryStore;

/** Mounts the console with the given snapshot and a spy store over the same data. */
const mountConsole = async (overrides: Partial<DataSnapshot> = {}) => {
  const spies = makeSpyStore();
  innerStore = spies.inner;
  await renderApp({ initialData: makeSnapshot(overrides), dataStore: spies.store });
  return spies;
};

const dayNumber = (dateKey: string): number => Number(dateKey.slice(-2));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Attendance integration — state and persistence', () => {
  it('renders the matrix from App state and persists the seed through the store', async () => {
    const holiday = holidayFor(CURRENT, 5, 'Founders Day');
    // The plan goes on a WORKING day: a plan on a Sunday or holiday would be
    // shown as a derived WO/H cell, not as approved leave awaiting a record.
    const planDay = dayNumber(workingDateKeys(CURRENT.year, CURRENT.monthIndex, [holiday])[2]);
    const plan: LeavePlan = {
      id: 'plan-att-1',
      employeeId: EMPLOYEE_A.id,
      startDate: dayKey(CURRENT, planDay),
      endDate: dayKey(CURRENT, planDay),
      type: 'SL',
      status: 'Approved',
      halfDay: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { saveAttendance, saveHolidays } = await mountConsole({
      attendance: [
        recordFor(CURRENT, EMPLOYEE_A.id, 10, 'Present'),
        recordFor(CURRENT, EMPLOYEE_B.id, 10, 'Absent'),
      ],
      holidays: [holiday],
      leavePlans: [plan],
    });

    await openAttendance();

    // The matrix shows exactly what App holds: one row per employee, the
    // recorded day cells with their codes, and the derived holiday cell.
    const rowA = rowFor(EMPLOYEE_A.name);
    expect(within(rowA).getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[CURRENT.monthIndex]} 10, ${CURRENT.year}`),
    })).toHaveTextContent('P');
    const rowB = rowFor(EMPLOYEE_B.name);
    expect(within(rowB).getByRole('button', {
      name: new RegExp(`${MONTH_NAMES[CURRENT.monthIndex]} 10, ${CURRENT.year}`),
    })).toHaveTextContent('A');
    expect(within(rowA).getByText('H')).toHaveAttribute('title', 'Holiday — Founders Day');

    // The planner stays the source of approved leave: the ghost cell appears
    // where no record exists, and NO record is invented for it anywhere.
    expect(within(rowA).getByText('SL')).toBeInTheDocument();
    await waitForStore((snapshot) => {
      expect(
        snapshot.attendance.some(
          (record) =>
            record.employeeId === EMPLOYEE_A.id && record.date === dayKey(CURRENT, planDay),
        ),
      ).toBe(false);
    });

    // Mount persistence: the datasets App started with go to the store exactly
    // like the register and the policies do.
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    await waitForStore((snapshot) => {
      expect(snapshot.attendance).toHaveLength(2);
    });
    await waitFor(() => expect(saveHolidays).toHaveBeenCalled());
    await waitForStore((snapshot) => {
      expect(snapshot.holidays).toEqual([holiday]);
    });
  });

  it('saving a record through the cell editor writes through the store', async () => {
    await mountConsole();

    await openAttendance();
    // An unmarked WORKING day: a Sunday has no cell button to click.
    const saveDay = dayNumber(workingDateKeys(CURRENT.year, CURRENT.monthIndex, [])[3]);
    await userEvent.click(cellButton(CURRENT, EMPLOYEE_B.name, saveDay));

    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'Work from home');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save attendance' }));

    // The record App accepted is the record the store holds, with its identity.
    const id = `${EMPLOYEE_B.id}|${dayKey(CURRENT, saveDay)}`;
    await waitForStore((snapshot) => {
      const saved = snapshot.attendance.find((record) => record.id === id);
      expect(saved).toMatchObject({
        employeeId: EMPLOYEE_B.id,
        date: dayKey(CURRENT, saveDay),
        status: 'WFH',
        source: 'manual',
      });
    });
  });

  it('deleting a record through the cell editor removes it from the store', async () => {
    const seed = recordFor(CURRENT, EMPLOYEE_A.id, 10, 'Absent');
    await mountConsole({ attendance: [seed] });

    await openAttendance();
    // The pre-existing record reaches the store first, so the later removal is
    // observed as a change rather than as a store that never had it.
    await waitForStore((snapshot) => {
      expect(snapshot.attendance.some((record) => record.id === seed.id)).toBe(true);
    });

    await userEvent.click(cellButton(CURRENT, EMPLOYEE_A.name, 10));
    await userEvent.click(screen.getByRole('button', { name: 'Delete record' }));
    const confirm = screen.getByRole('dialog', { name: /Delete this attendance record/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete record' }));

    await waitForStore((snapshot) => {
      expect(snapshot.attendance.some((record) => record.id === seed.id)).toBe(false);
    });
  });

  it('replacing a month removes only that month and leaves other months untouched', async () => {
    const holiday = holidayFor(CURRENT, 5, 'Founders Day');
    const oldCurrentRecord = recordFor(CURRENT, EMPLOYEE_A.id, 3, 'Absent');
    const previousMonthRecord = recordFor(PREVIOUS, EMPLOYEE_A.id, 2, 'Present');
    const { inner } = await mountConsole({
      attendance: [oldCurrentRecord, previousMonthRecord],
      holidays: [holiday],
    });

    await openAttendance();

    // The workbook is the same monthly matrix the toolbar generates: full
    // roster, Sundays/holidays derived, working days prefilled as Present.
    const workbook = buildAttendanceWorkbook({
      employees: [EMPLOYEE_A, EMPLOYEE_B],
      holidays: [holiday],
      leavePlans: [],
      year: CURRENT.year,
      monthIndex: CURRENT.monthIndex,
      prefillPresent: true,
    });
    const file = new File(
      [XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })],
      'attendance.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );

    await userEvent.upload(screen.getByLabelText('Choose attendance file'), file);

    // Nothing is written until the preview is confirmed.
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    const storedBefore = await inner.load();
    expect(storedBefore.snapshot.attendance).toHaveLength(2);

    await userEvent.click(
      within(preview).getByRole('button', { name: `Replace ${monthLabel(CURRENT)}` }),
    );

    const currentPrefix = `${monthKey(CURRENT.year, CURRENT.monthIndex)}-`;
    const previousPrefix = `${monthKey(PREVIOUS.year, PREVIOUS.monthIndex)}-`;
    const workingDays = workingDateKeys(CURRENT.year, CURRENT.monthIndex, [holiday]).length;

    await waitForStore((snapshot) => {
      // The previous month is byte-for-byte untouched.
      expect(
        snapshot.attendance.filter((record) => record.date.startsWith(previousPrefix)),
      ).toEqual([previousMonthRecord]);

      // The current month is exactly the imported file: every old record (the
      // day-3 Absent included) is gone, the working days are stored, and the
      // holiday date is derived rather than stored.
      const currentRecords = snapshot.attendance.filter((record) =>
        record.date.startsWith(currentPrefix),
      );
      expect(currentRecords).toHaveLength(workingDays * 2);
      expect(currentRecords.every((record) => record.source === 'excel')).toBe(true);
      expect(
        currentRecords.some((record) => record.date === holiday.date),
      ).toBe(false);
    });
  });

  it('adding and deleting a holiday persists through the store', async () => {
    const seed = holidayFor(CURRENT, 5, 'Founders Day');
    await mountConsole({ holidays: [seed] });

    await openAttendance();
    await waitForStore((snapshot) => {
      expect(snapshot.holidays).toEqual([seed]);
    });

    // Add a second holiday for this month.
    await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    const dialog = screen.getByRole('dialog', { name: /Add holiday/ });
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: dayKey(CURRENT, 20) },
    });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Ops Day');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save holiday' }));

    const added = holidayFor(CURRENT, 20, 'Ops Day');
    await waitForStore((snapshot) => {
      expect(snapshot.holidays).toEqual(expect.arrayContaining([seed, added]));
      expect(snapshot.holidays).toHaveLength(2);
    });

    // Delete the seeded one, through its own list item: the card now lists two
    // holidays, each carrying a Delete button.
    const card = screen
      .getByText('Holidays', { selector: '.omni-card-title' })
      .closest('.omni-card') as HTMLElement;
    const seededItem = within(card).getByText(seed.name).closest('li');
    if (!(seededItem instanceof HTMLElement)) throw new Error('No list item for the seed');
    await userEvent.click(within(seededItem).getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('dialog', { name: /Delete this holiday/ });
    expect(confirm).toHaveTextContent(seed.name);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete holiday' }));

    await waitForStore((snapshot) => {
      expect(snapshot.holidays).toEqual([added]);
    });
  });
});

describe('Attendance integration — payroll and overview rollup', () => {
  it('payroll and overview use the current-month rollup where records exist', async () => {
    // Three working days: two full absences and one LOP half-day. The rollup
    // therefore reports 2.5 LOP days and (workingDays - 2.5) present days.
    const workingDays = workingDateKeys(CURRENT.year, CURRENT.monthIndex, []);
    const records: AttendanceRecord[] = [
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[0]), 'Absent'),
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[1]), 'Absent'),
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[2]), 'HalfDay', {
        leaveType: 'LOP',
        halfDay: 'AM',
      }),
    ];
    await mountConsole({
      employees: [EMPLOYEE_A],
      attendance: records,
    });

    // The payslip reads the DAILY ledger: the legacy lopDays was 0, so a row
    // naming 2.5 LOP days can only come from the rollup.
    await userEvent.click(screen.getByRole('button', { name: 'Payroll & Compensation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Slip' }));
    const payslip = screen.getByRole('dialog', { name: new RegExp(EMPLOYEE_A.name) });
    expect(payslip).toHaveTextContent('Loss of Pay (2.5 days @ Basic/26)');
    expect(payslip).toHaveTextContent(
      `−₹${formatINR(computeLOP(EMPLOYEE_A.basicSalary, 2.5))}`,
    );
    await userEvent.keyboard('{Escape}');

    // The overview attendance rate reads the same rollup - and the legacy
    // presentDays (10) would have produced a very different percentage. Present
    // counts only P/W and half-days: the two absences add nothing, so the
    // rollup's present figure is the half-day's 0.5.
    await userEvent.click(screen.getByRole('button', { name: 'Executive Overview' }));
    const tile = screen
      .getByText('Attendance Rate', { selector: '.kpi-label' })
      .closest('.kpi-card') as HTMLElement;
    expect(within(tile).getByText(`${computeAttendancePct(0.5).toFixed(1)}%`)).toBeInTheDocument();
  });

  it('falls back to the legacy monthly values when the month has no records', async () => {
    // The only daily record is in the PREVIOUS month: the current-month rollup
    // must not touch this employee's payroll or overview figures.
    await mountConsole({
      employees: [EMPLOYEE_A],
      attendance: [recordFor(PREVIOUS, EMPLOYEE_A.id, 3, 'Absent')],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Executive Overview' }));
    const tile = screen
      .getByText('Attendance Rate', { selector: '.kpi-label' })
      .closest('.kpi-card') as HTMLElement;
    expect(
      within(tile).getByText(`${computeAttendancePct(EMPLOYEE_A.presentDays).toFixed(1)}%`),
    ).toBeInTheDocument();

    // The payslip has no LOP row at all: lopDays stays at the legacy 0.
    await userEvent.click(screen.getByRole('button', { name: 'Payroll & Compensation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Slip' }));
    const payslip = screen.getByRole('dialog', { name: new RegExp(EMPLOYEE_A.name) });
    expect(within(payslip).queryByText(/Loss of Pay/)).toBeNull();
  });
});
