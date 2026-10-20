import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { App } from '../../App';
import { ThemeProvider } from '../../theme/ThemeContext';
import { DATA_SCHEMA_VERSION } from '../../utils/storage';
import { INITIAL_EMPLOYEES } from '../../data/initialData';

// Same reason as App.test.tsx: jsdom has no 2D canvas, so a real Chart.js instance cannot
// be constructed and its teardown throws asynchronously out of `cleanup()`.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * The confirmation is only half of Task 12. The other half is that a mistake stays
 * recoverable: `handleImportEmployees` writes a snapshot through the same versioned
 * envelope as the live key BEFORE the roster changes, and the success banner carries the
 * Undo that reads it back.
 *
 * "Before" is the whole point, so it is measured rather than assumed: every `setItem` is
 * recorded in order, and the assertion is on the ORDER of the two writes, not merely on
 * both having happened. A backup written after the replace is a backup of the wrong thing.
 */

const BACKUP_KEY = 'omnihr_employees_backup';
const EMPLOYEES_KEY = 'omnihr_employees';

const IMPORTED_ROWS = [
  {
    'Employee ID': 'EMP-9001',
    'Full Name': 'Asha Rao',
    Department: 'Engineering & Technology',
    'Designation / Role': 'Engineer',
    Location: 'Bengaluru HQ',
    'Monthly CTC': 120000,
    'Attendance (Days Present)': 24,
    Status: 'Active',
    Gender: 'Female',
  },
];

interface Write {
  key: string;
  rows: { id: string }[];
}

/** Records every localStorage write in the order it happens, payload included. */
const recordWrites = () => {
  const writes: Write[] = [];
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    try {
      writes.push({ key, rows: JSON.parse(value).rows });
    } catch {
      writes.push({ key, rows: [] });
    }
    original.call(this, key, value);
  });
  return writes;
};

const storedRoster = () =>
  JSON.parse(localStorage.getItem(EMPLOYEES_KEY) as string).rows as { id: string; name: string }[];

const openExcelHub = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Excel Data Hub/i }));
  // The page title and the card heading both mention spreadsheet ingestion, so the tab is
  // recognised by the one control the hub alone owns.
  await screen.findByRole('button', { name: /Download Payroll Sheet/i });
};

const uploadRoster = async (container: HTMLElement) => {
  const ws = XLSX.utils.json_to_sheet(IMPORTED_ROWS);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const file = new File(
    [XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer],
    'q3-roster.xlsx',
    { type: 'application/vnd.ms-excel' },
  );
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await screen.findByRole('table', { name: /Pre-sync import preview/i });
};

const confirmReplacement = async () => {
  await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
  await userEvent.click(screen.getByRole('button', { name: /^replace roster$/i }));
};

beforeEach(() => {
  localStorage.clear();
});

describe('App destructive import', () => {
  it('leaves the register alone until the question is answered', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));

    // Asked, not answered.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(storedRoster()).toHaveLength(INITIAL_EMPLOYEES.length);
  });

  it('writes the pre-import snapshot BEFORE the replacement, and never clears it in passing', async () => {
    const writes = recordWrites();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(storedRoster()).toHaveLength(INITIAL_EMPLOYEES.length));

    await openExcelHub();
    await uploadRoster(document.body);
    await confirmReplacement();

    await waitFor(() => expect(storedRoster()).toHaveLength(1));

    const backupAt = writes.findIndex(w => w.key === BACKUP_KEY);
    const replaceAt = writes.findIndex(w => w.key === EMPLOYEES_KEY && w.rows.length === 1);
    expect(backupAt).toBeGreaterThanOrEqual(0);
    expect(replaceAt).toBeGreaterThanOrEqual(0);
    expect(backupAt).toBeLessThan(replaceAt);

    // And the snapshot is the register as it was, not the file that overwrote it.
    expect(writes[backupAt].rows).toHaveLength(INITIAL_EMPLOYEES.length);
    expect(writes[backupAt].rows[0].id).toBe(INITIAL_EMPLOYEES[0].id);
    // A backup that a later save quietly overwrote is not a backup.
    const backupWrites = writes.filter(w => w.key === BACKUP_KEY);
    expect(backupWrites).toHaveLength(1);
  });

  it('stores the snapshot in the same versioned envelope as the live register', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);
    await confirmReplacement();

    await waitFor(() => expect(localStorage.getItem(BACKUP_KEY)).not.toBeNull());
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) as string);
    expect(backup.v).toBe(DATA_SCHEMA_VERSION);
    expect(backup.rows).toHaveLength(INITIAL_EMPLOYEES.length);
  });

  it('restores the register from the snapshot when the banner Undo is used', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);
    await confirmReplacement();

    await waitFor(() => expect(storedRoster()).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /^undo$/i }));

    await waitFor(() => expect(storedRoster()).toHaveLength(INITIAL_EMPLOYEES.length));
    expect(storedRoster()[0].name).toBe(INITIAL_EMPLOYEES[0].name);
  });

  it('clears the snapshot once it has been used', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);
    await confirmReplacement();
    await waitFor(() => expect(localStorage.getItem(BACKUP_KEY)).not.toBeNull());

    await userEvent.click(screen.getByRole('button', { name: /^undo$/i }));

    // A snapshot left behind would be offered again by the next import, undoing something
    // the user has since decided to keep.
    await waitFor(() => expect(localStorage.getItem(BACKUP_KEY)).toBeNull());
  });

  it('adds rather than replaces when append is the answer given', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);

    await userEvent.click(screen.getByRole('button', { name: /sync into live dashboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));

    await waitFor(() =>
      expect(storedRoster()).toHaveLength(INITIAL_EMPLOYEES.length + IMPORTED_ROWS.length),
    );
    // Append means append: the imported row is added after the existing records, and
    // nothing already in the register is reordered or dropped.
    expect(storedRoster()[storedRoster().length - 1].id).toBe('EMP-9001');
    expect(storedRoster()[0].id).toBe(INITIAL_EMPLOYEES[0].id);
  });

  it('says what happened without claiming the write succeeded', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openExcelHub();
    await uploadRoster(document.body);
    await confirmReplacement();

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/replaced the register/i);
    // Whether it was saved is the persistence banner's claim, and this banner must not
    // contradict it either way.
    expect(confirmation).not.toHaveTextContent(/saved|persisted|stored/i);
  });

  it('does not offer an Undo for the reset confirmation, which has no snapshot', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/i }));
    await userEvent.click(screen.getByRole('button', { name: /Reset demo data/i }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/Demo data reset/i);
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();
  });
});