import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
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
import { snapshotToJson } from '../data/snapshot';
import { INITIAL_EMPLOYEES } from '../data/initialData';
import { INITIAL_POLICIES } from '../data/initialPolicies';
import type { Employee } from '../types';

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and shell.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

/**
 * Integration: the Admin page under its own tab - the snapshot card wired to the
 * DataGate's store, with the existing Excel Hub below it.
 *
 * The console is mounted through `renderApp` (design decision D9's data seam):
 * the snapshot below is what the DataGate would hand over, and the spy store
 * records the exchange while delegating to a real MemoryStore. The card's own
 * export/import/confirmation contract is pinned in AdminSection.test.tsx; these
 * tests prove the WIRING - App passes its datasets and the store through, and
 * reloads its state when a confirmed import has replaced the store's contents.
 */

const ONE_EMPLOYEE: Employee = { ...INITIAL_EMPLOYEES[0], id: 'EMP-SEED-1', name: 'Zora Seed' };
const ONE_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-SEED-1', title: 'Seed policy' };

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 2,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: [ONE_EMPLOYEE],
    policies: [ONE_POLICY],
    leavePlans: [],
    attendance: [],
    holidays: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS },
    ...overrides,
  };
}

/** A store that records the exchange while still behaving like a real one. */
function makeSpyStore() {
  const inner = new MemoryStore({ employees: [ONE_EMPLOYEE], policies: [ONE_POLICY], leavePlans: [] });
  const importSnapshot = vi.fn(
    (snapshot: DataSnapshot): Promise<StoreResult> => inner.importSnapshot(snapshot),
  );
  const exportSnapshot = vi.fn(() => inner.exportSnapshot());
  const store: DataStore = {
    backend: 'memory',
    load: () => inner.load(),
    saveEmployees: (rows) => inner.saveEmployees(rows),
    savePolicies: (rows) => inner.savePolicies(rows),
    saveLeavePlans: (rows) => inner.saveLeavePlans(rows),
    saveAttendance: (rows) => inner.saveAttendance(rows),
    saveHolidays: (rows) => inner.saveHolidays(rows),
    saveSettings: (settings) => inner.saveSettings(settings),
    exportSnapshot,
    importSnapshot,
    clearBusinessData: () => inner.clearBusinessData(),
  };
  return { store, inner, importSnapshot, exportSnapshot };
}

const IMPORTED_SNAPSHOT: DataSnapshot = makeSnapshot({
  employees: [
    { ...INITIAL_EMPLOYEES[0], id: 'EMP-IMPORT-1', name: 'Nina Import' },
    { ...INITIAL_EMPLOYEES[0], id: 'EMP-IMPORT-2', name: 'Omar Import' },
    { ...INITIAL_EMPLOYEES[0], id: 'EMP-IMPORT-3', name: 'Priya Import' },
  ],
  settings: { maxConcurrentLeave: 4 },
});

const snapshotFile = (snapshot: unknown): File =>
  new File(
    [typeof snapshot === 'string' ? snapshot : snapshotToJson(snapshot as DataSnapshot)],
    'omnihr-snapshot.json',
    { type: 'application/json' },
  );

const openAdmin = async () => {
  const nav = screen.getByRole('navigation');
  await userEvent.click(within(nav).getByRole('button', { name: 'Admin' }));
  // The Excel Hub is on the same page; waiting for one of its controls proves
  // the whole Admin composition rendered, not just the card.
  await screen.findByRole('button', { name: /Download Payroll Sheet/i });
};

/** The count tile whose dt reads `label`. */
const countBlock = (label: string): HTMLElement => {
  const block = screen.getByText(label).closest('.admin-snapshot__count');
  if (!(block instanceof HTMLElement)) throw new Error(`No count tile for ${label}`);
  return block;
};

// ── Download plumbing (jsdom implements neither object URLs nor navigation) ──

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
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
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Admin integration', () => {
  it('shows the snapshot card and the Excel Hub under the Admin tab, labelled Admin throughout', async () => {
    const snapshot = makeSnapshot();
    const { store } = makeSpyStore();

    await renderApp({ initialData: snapshot, dataStore: store });
    await openAdmin();

    // The page is Admin now: the header names it and the sidebar carries the new
    // label - and the old Excel tab is gone from the navigation entirely.
    expect(
      screen.getByRole('heading', { level: 2, name: /Admin & Data Exchange/ }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /Excel Data Hub/i })).toBeNull();

    // The snapshot card reports the datasets App holds, through the store.
    const card = screen.getByRole('region', { name: 'Data snapshot' });
    expect(within(card).getByText('In-memory store')).toBeInTheDocument();
    expect(within(countBlock('Employees')).getByText('1')).toBeInTheDocument();
    expect(within(countBlock('Policies')).getByText('1')).toBeInTheDocument();
    expect(within(countBlock('Leave plans')).getByText('0')).toBeInTheDocument();
    expect(within(countBlock('Peak threshold')).getByText('3')).toBeInTheDocument();

    // The Excel Hub lives on the same page, below the card.
    expect(screen.getByRole('button', { name: /Download Payroll Sheet/i })).toBeInTheDocument();
  });

  it('export downloads a dated snapshot file built from the live datasets', async () => {
    const { store, exportSnapshot } = makeSpyStore();
    await renderApp({ initialData: makeSnapshot(), dataStore: store });
    await openAdmin();

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    // The file is serialised from the datasets App passed through - the truth
    // the screen shows - not by re-reading the store behind the console's back.
    expect(exportSnapshot).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const anchor = anchorClick.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^omnihr-snapshot-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // And the file carries what the console is showing.
    const parsed = JSON.parse(await (createObjectURL.mock.calls[0][0] as Blob).text());
    expect(parsed.employees.map((emp: Employee) => emp.id)).toEqual(['EMP-SEED-1']);
  });

  it('a confirmed import replaces the store, and App reloads its data from it', async () => {
    const { store, inner, importSnapshot } = makeSpyStore();
    await renderApp({ initialData: makeSnapshot(), dataStore: store });
    await openAdmin();

    await userEvent.upload(
      screen.getByLabelText('Choose snapshot file'),
      snapshotFile(IMPORTED_SNAPSHOT),
    );

    // The question names both sides of the replacement before anything is written.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/3 employee records/);
    expect(dialog).toHaveTextContent(/currently 1 employee record/);
    expect(importSnapshot).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace data' }));

    // The store actually holds the file's contents now.
    expect(importSnapshot).toHaveBeenCalledTimes(1);
    const stored = await inner.load();
    expect(stored.snapshot.employees.map((e) => e.id)).toEqual([
      'EMP-IMPORT-1',
      'EMP-IMPORT-2',
      'EMP-IMPORT-3',
    ]);

    // And the console followed: the card's counts are the file's counts, including
    // the planner settings - proof App reloaded all four datasets from the store.
    await waitFor(() =>
      expect(within(countBlock('Employees')).getByText('3')).toBeInTheDocument(),
    );
    expect(within(countBlock('Peak threshold')).getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Snapshot imported/i);
  });

  it('an invalid file is refused with an error and never reaches the store', async () => {
    const { store, importSnapshot } = makeSpyStore();
    await renderApp({ initialData: makeSnapshot(), dataStore: store });
    await openAdmin();

    await userEvent.upload(
      screen.getByLabelText('Choose snapshot file'),
      snapshotFile('this is not { json'),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/not valid JSON/i);
    expect(importSnapshot).not.toHaveBeenCalled();
    // Nothing changed on the card either.
    expect(within(countBlock('Employees')).getByText('1')).toBeInTheDocument();
  });

  it('a snapshot from another version is refused before the confirmation', async () => {
    const { store, importSnapshot } = makeSpyStore();
    await renderApp({ initialData: makeSnapshot(), dataStore: store });
    await openAdmin();

    await userEvent.upload(
      screen.getByLabelText('Choose snapshot file'),
      snapshotFile({ ...IMPORTED_SNAPSHOT, v: 3 }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/different version/i);
    expect(importSnapshot).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
