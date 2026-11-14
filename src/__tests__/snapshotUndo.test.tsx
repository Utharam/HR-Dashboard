import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import { snapshotToJson } from '../data/snapshot';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DataSnapshot,
  type DataStore,
} from '../data/DataStore';
import { DATA_SCHEMA_VERSION } from '../utils/storage';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import type { Employee } from '../types';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be constructed and its
// teardown throws asynchronously out of `cleanup()`. Same reason as App.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Snapshot imports versus the Excel import's Undo.
 *
 * A snapshot import replaces ALL FOUR datasets in the store. The Excel Undo that may
 * still be on screen at that moment restores only the pre-import EMPLOYEES - pressing
 * it would write a stale roster over the freshly imported store, discarding part of
 * the snapshot the user was told had landed. `handleSnapshotImported` must therefore
 * destroy the confirmation and its backup once the reload succeeds, and report a
 * failed reload instead of letting it escape as an unhandled rejection.
 */

const BACKUP_KEY = 'omnihr_employees_backup';

const ONE_EMPLOYEE: Employee = { ...INITIAL_EMPLOYEES[0], id: 'EMP-SNAP-1', name: 'Nina Snapshot' };

const SNAPSHOT: DataSnapshot = {
  v: 3,
  dataVersion: DATA_SCHEMA_VERSION,
  exportedAt: '2026-11-14T09:30:00.000Z',
  employees: [ONE_EMPLOYEE],
  policies: [{ ...INITIAL_POLICIES[0], id: 'POL-SNAP-1', title: 'Snapshot policy' }],
  leavePlans: [],
  attendance: [],
  holidays: [],
  plannerEvents: [],
  settings: { ...DEFAULT_PLANNER_SETTINGS },
};

const EXCEL_ROWS = [
  {
    'Employee ID': 'EMP-9001',
    'Full Name': 'Asha Rao',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    'Office Location': 'Bengaluru HQ',
    'Monthly CTC': 120000,
    'Attendance (Days Present)': 24,
    Status: 'Active',
    Gender: 'Female',
  },
];

const snapshotFile = (snapshot: DataSnapshot): File =>
  new File([snapshotToJson(snapshot)], 'omnihr-snapshot.json', { type: 'application/json' });

const openAdmin = async () => {
  const nav = screen.getByRole('navigation');
  await userEvent.click(within(nav).getByRole('button', { name: 'Admin & Settings' }));
  await screen.findByRole('button', { name: /Download Payroll Sheet/i });
};

const uploadRoster = async (rows: Record<string, unknown>[]) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const file = new File(
    [XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer],
    'roster.xlsx',
    { type: 'application/vnd.ms-excel' },
  );
  const input = document.getElementById('excelFileInput') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await screen.findByRole('table', { name: /Pre-sync import preview/i });
};

/** Excel import, answered with append: one new record, so the banner carries an Undo. */
const importRosterUndoably = async () => {
  await openAdmin();
  await uploadRoster(EXCEL_ROWS);
  await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
  await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));
  await screen.findByRole('status');
  expect(screen.getByRole('button', { name: /^undo$/i })).toBeInTheDocument();
  expect(localStorage.getItem(BACKUP_KEY)).not.toBeNull();
};

const importSnapshot = async (snapshot: DataSnapshot) => {
  // The Excel import moved the console to the Directory tab, and the snapshot card
  // lives on Admin - go back before reaching for its file input.
  await openAdmin();
  await userEvent.upload(
    screen.getByLabelText('Choose snapshot file'),
    snapshotFile(snapshot),
  );
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Replace data' }),
  );
};

beforeEach(() => {
  localStorage.clear();
});

describe('snapshot import clears the stale Excel Undo', () => {
  it('an Excel Undo does not survive a successful snapshot import', async () => {
    const { store } = await renderApp();
    await importRosterUndoably();

    await importSnapshot(SNAPSHOT);

    // The reload succeeded, so the ONLY status on screen is the snapshot's own
    // confirmation - the Excel banner and its Undo are gone.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Snapshot imported/i),
    );
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();

    // The store holds exactly what the file said - an Undo from the earlier import
    // must not be able to put the pre-snapshot roster back.
    const loaded = await store.load();
    expect(loaded.snapshot.employees.map((e) => e.id)).toEqual(['EMP-SNAP-1']);
  });

  it('a failed reload after a snapshot import is reported, not thrown away', async () => {
    const inner = new MemoryStore();
    const loadFailure = new Error('readback failed');
    const store: DataStore = {
      backend: 'memory',
      load: vi.fn(async () => {
        throw loadFailure;
      }),
      saveEmployees: (rows) => inner.saveEmployees(rows),
      savePolicies: (rows) => inner.savePolicies(rows),
      saveLeavePlans: (rows) => inner.saveLeavePlans(rows),
      saveAttendance: (rows) => inner.saveAttendance(rows),
      saveHolidays: (rows) => inner.saveHolidays(rows),
      savePlannerEvents: (rows) => inner.savePlannerEvents(rows),
      saveSettings: (settings) => inner.saveSettings(settings),
      exportSnapshot: () => inner.exportSnapshot(),
      importSnapshot: (snapshot) => inner.importSnapshot(snapshot),
      clearBusinessData: () => inner.clearBusinessData(),
    };
    await renderApp({ initialData: (await inner.load()).snapshot, dataStore: store });

    await importRosterUndoably();
    await importSnapshot(SNAPSHOT);

    // The failure surfaces as a banner the user can act on, not as an unhandled
    // rejection (which Vitest would surface as an orphaned crash after the test).
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/snapshot import was saved/i);
    expect(alert).toHaveTextContent(/reading it back.*failed/i);
    // The stale Undo banner went with it: acting on it would persist the pre-import
    // screen over a store the snapshot already replaced.
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();

    // The app is still alive and the store still holds the imported snapshot.
    expect(
      screen.getByRole('heading', { level: 2, name: /Admin & Settings/ }),
    ).toBeInTheDocument();
    const stored = await store.exportSnapshot();
    expect(stored.employees.map((e) => e.id)).toEqual(['EMP-SNAP-1']);
  });
});
