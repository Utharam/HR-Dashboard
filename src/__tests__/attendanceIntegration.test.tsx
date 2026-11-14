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
import { computeLOP, computePayroll } from '../utils/payroll';
import { formatINR } from '../utils/formatters';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import { createInitialAttendance } from '../data/initialAttendance';
import { createInitialHolidays } from '../data/initialHolidays';
import type { AttendanceRecord, Employee, Holiday, LeavePlan } from '../types';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and the other integration suites.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

// The payroll-register export ends in `XLSX.writeFile`, which in a browser turns
// the workbook into a download. jsdom has no download surface, and the module
// namespace cannot be spied on (its exports are not configurable), so the one
// function the export calls is replaced for this whole file. Everything else
// (`utils`, `write`, `read`) stays the real SheetJS, so a captured workbook
// round-trips exactly like the file a bank would receive. Only the export test
// touches it; no other test in this file reads `writeFile`.
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
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
    v: 3,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: [EMPLOYEE_A, EMPLOYEE_B],
    policies: [ONE_POLICY],
    leavePlans: [],
    attendance: [],
    holidays: [],
    plannerEvents: [],
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
    savePlannerEvents: (rows) => inner.savePlannerEvents(rows),
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

/** The matrix cell button for one employee's day, matched by accessible name.
 * Row lookups are scoped to the matrix table: the monthly register has a row
 * per employee too. */
const cellButton = (month: RenderedMonth, name: string, day: number) => {
  const row = within(
    screen.getByRole('table', { name: new RegExp(`Attendance matrix for ${monthLabel(month)}`, 'i') }),
  ).getByRole('row', { name: new RegExp(name) });
  return within(row).getByRole('button', {
    name: new RegExp(`${MONTH_NAMES[month.monthIndex]} ${day}, ${month.year}`),
  });
};

const rowFor = (name: string) =>
  within(
    screen.getByRole('table', { name: /Attendance matrix for/i }),
  ).getByRole('row', { name: new RegExp(name) });

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

/**
 * The seed stamps `updatedAt` with the moment it was created, so two
 * `createInitialAttendance` calls never compare equal field-by-field. Identity
 * (`employee|date` + status) is what the ledger means; the timestamp is noise.
 */
const attendanceSignature = (rows: AttendanceRecord[]): string[] =>
  rows.map((r) => `${r.id}:${r.status}`).sort();

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
    await userEvent.click(within(seededItem).getByRole('button', { name: `Delete ${seed.name}` }));
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
    // rollup's present figure is the half-day's 0.5. The rate is
    // `present / workingDays`, the month's real working-day count, not the
    // fixed 26-day baseline `computeAttendancePct` applies to legacy values.
    await userEvent.click(screen.getByRole('button', { name: 'Executive Overview' }));
    const tile = screen
      .getByText('Attendance Rate', { selector: '.kpi-label' })
      .closest('.kpi-card') as HTMLElement;
    const expectedPct = ((0.5 / workingDays.length) * 100).toFixed(1);
    expect(within(tile).getByText(`${expectedPct}%`)).toBeInTheDocument();
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

  it('rates a fully present November 2026 at 100%, not the legacy 96.2%', async () => {
    // November 2026 has 30 days and five Sundays (no holidays in the seed used
    // here), so its working-day count is 25. A ledger of Present on every one of
    // them must read 100% - the legacy 26-day baseline would price the same
    // month at 25/26 = 96.2%, which is exactly the mislabel this rate exists to
    // remove. The clock is pinned so the month is deterministic: App reads
    // `new Date()` once at mount for its rollup month.
    vi.useFakeTimers({ now: new Date(2026, 10, 15), toFake: ['Date'] });
    try {
      const NOVEMBER: RenderedMonth = { year: 2026, monthIndex: 10 };
      const working = workingDateKeys(NOVEMBER.year, NOVEMBER.monthIndex, []);
      expect(working).toHaveLength(25);
      await mountConsole({
        employees: [EMPLOYEE_A],
        attendance: working.map((date) =>
          recordFor(NOVEMBER, EMPLOYEE_A.id, dayNumber(date), 'Present'),
        ),
      });

      await userEvent.click(screen.getByRole('button', { name: 'Executive Overview' }));
      const tile = screen
        .getByText('Attendance Rate', { selector: '.kpi-label' })
        .closest('.kpi-card') as HTMLElement;
      expect(within(tile).getByText('100.0%')).toBeInTheDocument();
      // The legacy 26-day rate for the same fully-present ledger.
      expect(within(tile).queryByText('96.2%')).toBeNull();
      // The sub-label names the basis the figure was computed on.
      expect(tile.textContent).toMatch(/present ÷ working days/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Attendance integration — payroll register export', () => {
  it('the exported register prices LOP from the daily rollup, exactly like the Payroll tab', async () => {
    // The same ledger the payslip test above pins at 2.5 LOP days: two full
    // absences and one LOP half-day. The legacy `lopDays` on the record is 0, so a
    // register that priced LOP from it would write 0 for a ledger that costs money.
    const workingDays = workingDateKeys(CURRENT.year, CURRENT.monthIndex, []);
    const records: AttendanceRecord[] = [
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[0]), 'Absent'),
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[1]), 'Absent'),
      recordFor(CURRENT, EMPLOYEE_A.id, dayNumber(workingDays[2]), 'HalfDay', {
        leaveType: 'LOP',
        halfDay: 'AM',
      }),
    ];
    // A Resigned colleague with a legacy LOP of 5: whatever their old monthly
    // number was, they are not part of a statement of money payable.
    const resigned: Employee = {
      ...INITIAL_EMPLOYEES[0],
      id: 'EMP-ATT-R',
      name: 'Raj Settled',
      status: 'Resigned',
      lopDays: 5,
    };
    await mountConsole({ employees: [EMPLOYEE_A, resigned], attendance: records });

    // `writeFile` is the export's last step, so capturing the workbook reads back
    // the file a bank would receive without touching a real filesystem.
    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    const nav = screen.getByRole('navigation');
    await userEvent.click(within(nav).getByRole('button', { name: 'Admin' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Download Payroll Sheet/i }),
    );

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [workbook] = writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const readBack = XLSX.read(bytes, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      readBack.Sheets['Payroll_Register'],
    );

    // One row: the same `isActive` run the Payroll tab shows. The Resigned
    // colleague stays in the register they came from but not in this disbursement.
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row['Employee ID']).toBe(EMPLOYEE_A.id);

    // Sanity for the assertions below: the expected figures only prove the fix if
    // they differ from the legacy ones.
    expect(EMPLOYEE_A.lopDays).toBe(0);
    const priced = computePayroll({ ...EMPLOYEE_A, lopDays: 2.5 });
    expect(priced.lossOfPay).toBe(computeLOP(EMPLOYEE_A.basicSalary, 2.5));
    expect(priced.lossOfPay).toBeGreaterThan(0);

    // The register carries the rollup's LOP pricing, not the legacy `lopDays: 0`:
    // the same figure the payslip on the Payroll tab shows for this ledger.
    expect(row['Loss of Pay (LOP)']).toBe(priced.lossOfPay);
    expect(row['Total Deductions']).toBe(priced.totalDeductions);
    expect(row['Net Salary Payable']).toBe(priced.netPayable);
  });
});

describe('Attendance integration — demo reset', () => {
  it('Reset Demo State also restores the attendance ledger and the holiday calendar', async () => {
    // A ledger and calendar the reset must clear: a custom record and a holiday
    // the demo seed does not contain.
    const { saveHolidays } = await mountConsole({
      attendance: [recordFor(CURRENT, EMPLOYEE_A.id, 10, 'Present')],
      holidays: [holidayFor(CURRENT, 5, 'Founders Day')],
    });

    // The reset control lives in the sidebar footer, outside the <nav> element.
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/i }));

    // The question says what is lost, attendance and holidays included.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/daily attendance ledger/i);
    expect(dialog).toHaveTextContent(/company holiday calendar/i);
    await userEvent.click(within(dialog).getByRole('button', { name: /Reset demo data/i }));

    // The calendar is the fixed 2026 national seed, exactly what the stores
    // install on a first visit.
    const seedHolidays = createInitialHolidays(2026);
    await waitForStore((snapshot) => {
      expect(snapshot.holidays).toEqual(seedHolidays);
    });

    // The ledger is the demo roster's current-month seed. Custom records (the
    // day-10 Present) and the Founders Day holiday are gone with them.
    const expectedSeed = createInitialAttendance(INITIAL_EMPLOYEES, seedHolidays);
    expect(expectedSeed.length).toBeGreaterThan(0);
    await waitForStore((snapshot) => {
      expect(attendanceSignature(snapshot.attendance)).toEqual(
        attendanceSignature(expectedSeed),
      );
      // Every seeded record is dated in the current month: the demo ledger is a
      // month, not a history.
      const prefix = `${monthKey(CURRENT.year, CURRENT.monthIndex)}-`;
      expect(snapshot.attendance.every((r) => r.date.startsWith(prefix))).toBe(true);
    });

    // The confirmation says the ledger and the calendar came back too.
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/attendance ledger/i);
    expect(confirmation).toHaveTextContent(/holiday calendar/i);

    // The store's LAST holiday write carried the seed, superseding the mount-time
    // write of the custom calendar.
    await waitFor(() => {
      expect(saveHolidays).toHaveBeenLastCalledWith(seedHolidays);
    });
  });

  it('asks before resetting, and keeps the ledger and calendar until the answer', async () => {
    const seed = recordFor(CURRENT, EMPLOYEE_A.id, 10, 'Present');
    const holiday = holidayFor(CURRENT, 5, 'Founders Day');
    await mountConsole({ attendance: [seed], holidays: [holiday] });

    // The reset control lives in the sidebar footer, outside the <nav> element.
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/i }));

    // Asked, not answered: the datasets are still exactly what App started with.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitForStore((snapshot) => {
      expect(snapshot.attendance).toEqual([seed]);
      expect(snapshot.holidays).toEqual([holiday]);
    });

    // Escape is a refusal: nothing resets.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitForStore((snapshot) => {
      expect(snapshot.attendance).toEqual([seed]);
      expect(snapshot.holidays).toEqual([holiday]);
    });
  });
});
