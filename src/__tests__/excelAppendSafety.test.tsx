import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { renderApp } from '../test/renderApp';
import { MemoryStore } from '../data/MemoryStore';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import type { Employee } from '../types';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be constructed and its
// teardown throws asynchronously out of `cleanup()`. Same reason as App.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Excel imports and duplicate staff IDs.
 *
 * Everything downstream of `App` rejects duplicate IDs - the stores refuse the save,
 * and a keyed store would otherwise collapse rows silently - so the import handler is
 * the boundary that must resolve them, visibly. These tests pin three behaviours:
 *
 *  1. append keeps existing IDs untouched, adds new ones once, and REPORTS the skips;
 *  2. replace keeps the first row per duplicated ID;
 *  3. a file that adds nothing is said so, without an Undo button.
 *
 * Persistence is proven through a real MemoryStore reload, not through component
 * state: a register that looks right on screen but does not survive the store is the
 * loss these guards exist to prevent.
 */

const makeEmployee = (id: string, name: string): Employee => ({
  ...INITIAL_EMPLOYEES[0],
  id,
  name,
});

const EXISTING_REGISTER = [
  makeEmployee('EMP-9001', 'Asha Rao Original'),
  makeEmployee('EMP-9002', 'Boje Singh'),
];

/** Same-ID-as-the-register row, a new row, and a repeat of the new row. */
const IMPORT_ROWS = [
  {
    'Employee ID': 'EMP-9001',
    'Full Name': 'Asha Rao IMPORTED',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    'Office Location': 'Bengaluru HQ',
    'Monthly CTC': 120000,
    'Attendance (Days Present)': 24,
    Status: 'Active',
    Gender: 'Female',
  },
  {
    'Employee ID': 'EMP-9003',
    'Full Name': 'Chitra New',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    'Office Location': 'Bengaluru HQ',
    'Monthly CTC': 130000,
    'Attendance (Days Present)': 25,
    Status: 'Active',
    Gender: 'Female',
  },
  {
    'Employee ID': 'EMP-9003',
    'Full Name': 'Chitra Duplicate',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    'Office Location': 'Bengaluru HQ',
    'Monthly CTC': 140000,
    'Attendance (Days Present)': 25,
    Status: 'Active',
    Gender: 'Female',
  },
];

const ALL_DUPLICATE_ROW = [
  {
    'Employee ID': 'EMP-9001',
    'Full Name': 'Asha Duplicate',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    'Office Location': 'Bengaluru HQ',
    'Monthly CTC': 120000,
    'Attendance (Days Present)': 24,
    Status: 'Active',
    Gender: 'Female',
  },
];

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
  // The Admin page also carries the snapshot card's JSON input, so the hub's input
  // is picked by its own id rather than by the first file input on the page.
  const input = document.getElementById('excelFileInput') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await screen.findByRole('table', { name: /Pre-sync import preview/i });
};

const storedIds = async (store: MemoryStore): Promise<string[]> => {
  const loaded = await store.load();
  return loaded.snapshot.employees.map((e) => e.id);
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Excel import duplicate-ID safety', () => {
  it('append keeps existing IDs unchanged, adds new ones once, and reports the skips', async () => {
    const store = new MemoryStore({ employees: EXISTING_REGISTER, leavePlans: [] });
    await renderApp({ dataStore: store });
    await openAdmin();
    await uploadRoster(IMPORT_ROWS);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Added 1 imported staff record to the register/i);
    expect(confirmation).toHaveTextContent(/2 duplicate rows were skipped/i);
    // Something WAS added, so the mistake stays recoverable.
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeInTheDocument();

    // Proven in the store, not on the screen: the existing record is byte-for-byte
    // the original, the new one landed exactly once, in file order after the rest.
    await waitFor(async () => {
      expect(await storedIds(store)).toEqual(['EMP-9001', 'EMP-9002', 'EMP-9003']);
    });
    const loaded = await store.load();
    expect(loaded.snapshot.employees.find((e) => e.id === 'EMP-9001')?.name).toBe(
      'Asha Rao Original',
    );
    expect(loaded.snapshot.employees.find((e) => e.id === 'EMP-9003')?.name).toBe('Chitra New');
  });

  it('replace keeps the first row per duplicated ID and skips later repeats', async () => {
    const store = new MemoryStore({ employees: EXISTING_REGISTER, leavePlans: [] });
    await renderApp({ dataStore: store });
    await openAdmin();
    await uploadRoster(IMPORT_ROWS);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /^replace roster$/i }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Replaced the register with 2 imported staff records/i);
    expect(confirmation).toHaveTextContent(/1 duplicate row was skipped/i);

    await waitFor(async () => {
      expect(await storedIds(store)).toEqual(['EMP-9001', 'EMP-9003']);
    });
    const loaded = await store.load();
    // The FIRST row per ID wins, so the file's later Chitra Duplicate row is gone.
    expect(loaded.snapshot.employees.find((e) => e.id === 'EMP-9001')?.name).toBe(
      'Asha Rao IMPORTED',
    );
    expect(loaded.snapshot.employees.find((e) => e.id === 'EMP-9003')?.name).toBe('Chitra New');
  });

  it('append with nothing new says so, offers no Undo, and changes the store not at all', async () => {
    const store = new MemoryStore({ employees: EXISTING_REGISTER, leavePlans: [] });
    await renderApp({ dataStore: store });
    await openAdmin();
    await uploadRoster(ALL_DUPLICATE_ROW);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Nothing was added/i);
    // An Undo button with nothing behind it is worse than none.
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();

    const loaded = await store.load();
    expect(loaded.snapshot.employees.map((e) => e.name)).toEqual([
      'Asha Rao Original',
      'Boje Singh',
    ]);
  });

  it('still imports, but says the change cannot be undone, when the backup cannot be written', async () => {
    const original = Storage.prototype.setItem;
    const backupFailure = new Error('origin is full');
    backupFailure.name = 'QuotaExceededError';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'omnihr_employees_backup') throw backupFailure;
      return original.call(this, key, value);
    });

    const store = new MemoryStore({ employees: EXISTING_REGISTER, leavePlans: [] });
    await renderApp({ dataStore: store });
    await openAdmin();
    await uploadRoster(IMPORT_ROWS);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Added 1 imported staff record to the register/i);
    expect(confirmation).toHaveTextContent(/cannot be undone/i);
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();

    // The import itself still went through.
    await waitFor(async () => {
      expect(await storedIds(store)).toEqual(['EMP-9001', 'EMP-9002', 'EMP-9003']);
    });
  });
});

describe('Add Staff ID collision', () => {
  it('suffixes a generated staff ID that already exists in the register', async () => {
    // A register of 200 rows occupying EMP-1401..EMP-1600: the modal derives its next
    // ID from the register SIZE (EMP-1201 + 200 = EMP-1401), which is already taken.
    const roster = Array.from({ length: 200 }, (_, i) =>
      makeEmployee(`EMP-${1401 + i}`, `Person ${i + 1}`),
    );
    const store = new MemoryStore({ employees: roster, leavePlans: [] });
    await renderApp({ dataStore: store });

    await userEvent.click(screen.getByRole('button', { name: /Add Staff/ }));
    await userEvent.type(screen.getByLabelText(/Full Name/), 'Rhea Kapoor');
    await userEvent.selectOptions(screen.getByLabelText(/Gender/), 'Female');
    await userEvent.click(screen.getByRole('button', { name: /Save Staff Profile/ }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Rhea Kapoor \(EMP-1401-2\)/);

    // Exactly one record per ID in the store, and the hire is in it.
    const loaded = await store.load();
    const ids = loaded.snapshot.employees.map((e) => e.id);
    expect(ids).toContain('EMP-1401-2');
    expect(ids.filter((id) => id === 'EMP-1401')).toHaveLength(1);
    expect(loaded.snapshot.employees).toHaveLength(201);
  });
});
