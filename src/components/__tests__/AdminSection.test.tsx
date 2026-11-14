import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSection } from '../AdminSection';
import type { DataSnapshot, DataStore, StoreBackend, StoreResult } from '../../data/DataStore';
import { snapshotToJson } from '../../data/snapshot';
import { DATA_SCHEMA_VERSION } from '../../utils/storage';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import { INITIAL_POLICIES } from '../../data/initialPolicies';
import type {
  AttendanceRecord,
  Employee,
  Holiday,
  HRPolicy,
  LeavePlan,
} from '../../types';

/*
 * The snapshot card is the one screen where a click can replace EVERY dataset in
 * the browser, so the tests pin the whole exchange contract: what is shown, what
 * an export produces, and that an import asks before it writes - and never
 * writes anything the parser refused.
 */

const noop = () => {};

const OK: StoreResult = { ok: true };

const employee = (id: string, name: string): Employee => ({
  ...INITIAL_EMPLOYEES[0],
  id,
  name,
  email: `${id.toLowerCase()}@omnixhr.io`,
});

const EMPLOYEES: Employee[] = [
  employee('EMP-LOCAL-1', 'Ravi Kumar'),
  employee('EMP-LOCAL-2', 'Asha Menon'),
];

const POLICY: HRPolicy = { ...INITIAL_POLICIES[0], id: 'POL-LOCAL-1' };

const PLAN: LeavePlan = {
  id: 'plan-local-1',
  employeeId: 'EMP-LOCAL-1',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  type: 'CL',
  status: 'Planned',
  halfDay: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const record = (
  employeeId: string,
  date: string,
  status: AttendanceRecord['status'],
  extra: Partial<AttendanceRecord> = {},
): AttendanceRecord => ({
  id: `${employeeId}|${date}`,
  employeeId,
  date,
  status,
  source: 'seed',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});

const ATTENDANCE: AttendanceRecord[] = [
  record('EMP-LOCAL-1', '2026-11-10', 'Present'),
  record('EMP-LOCAL-1', '2026-11-11', 'Absent'),
  record('EMP-LOCAL-2', '2026-11-10', 'WFH'),
  record('EMP-LOCAL-2', '2026-11-12', 'HalfDay'),
];

const HOLIDAYS: Holiday[] = [
  { id: 'holiday-2026-12-25', date: '2026-12-25', name: 'Christmas' },
];

const SNAPSHOT_META_KEY = 'omnihr_snapshot_meta';

/** A mock store that records every call while behaving like a real one. */
function makeMockStore(snapshot: DataSnapshot, overrides: Partial<DataStore> = {}) {
  return {
    backend: 'memory' as StoreBackend,
    load: vi.fn(async () => ({ snapshot, legacyBackup: false })),
    saveEmployees: vi.fn(async () => OK),
    savePolicies: vi.fn(async () => OK),
    saveLeavePlans: vi.fn(async () => OK),
    saveAttendance: vi.fn(async () => OK),
    saveHolidays: vi.fn(async () => OK),
    savePlannerEvents: vi.fn(async () => OK),
    saveSettings: vi.fn(async () => OK),
    exportSnapshot: vi.fn(async () => snapshot),
    importSnapshot: vi.fn(async () => OK),
    clearBusinessData: vi.fn(async () => OK),
    ...overrides,
  };
}

type AdminProps = ComponentProps<typeof AdminSection>;

const baseProps = (overrides: Partial<AdminProps> = {}): AdminProps => ({
  employees: EMPLOYEES,
  policies: [POLICY],
  leavePlans: [PLAN],
  attendance: ATTENDANCE,
  holidays: HOLIDAYS,
  settings: { maxConcurrentLeave: 3 },
  store: makeMockStore({
    v: 3,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: EMPLOYEES,
    policies: [POLICY],
    leavePlans: [PLAN],
    attendance: ATTENDANCE,
    holidays: HOLIDAYS,
    plannerEvents: [],
    settings: { maxConcurrentLeave: 3 },
  }),
  backend: 'indexeddb',
  legacyBackup: true,
  onImported: vi.fn(),
  onExportRoster: vi.fn(),
  onResetData: vi.fn(),
  ...overrides,
});

/** The snapshot a "good" import file holds: three employees replace the local two. */
const IMPORTED_SNAPSHOT: DataSnapshot = {
  v: 3,
  dataVersion: DATA_SCHEMA_VERSION,
  exportedAt: '2026-11-14T09:30:00.000Z',
  employees: [
    employee('EMP-IMPORT-1', 'Nina Import'),
    employee('EMP-IMPORT-2', 'Omar Import'),
    employee('EMP-IMPORT-3', 'Priya Import'),
  ],
  policies: [{ ...INITIAL_POLICIES[0], id: 'POL-IMPORT-1' }],
  leavePlans: [PLAN],
  attendance: [
    record('EMP-IMPORT-1', '2026-12-01', 'Present', { source: 'excel' }),
  ],
  holidays: [{ id: 'holiday-2026-12-24', date: '2026-12-24', name: 'Foundation Day' }],
  plannerEvents: [],
  settings: { maxConcurrentLeave: 4 },
};

const snapshotFile = (snapshot: unknown, name = 'omnihr-snapshot.json'): File =>
  new File(
    [
      typeof snapshot === 'string' ? snapshot : snapshotToJson(snapshot as DataSnapshot),
    ],
    name,
    { type: 'application/json' },
  );

const chooseFile = async (file: File) => {
  await userEvent.upload(screen.getByLabelText('Choose snapshot file'), file);
};

const confirmDialog = () => screen.getByRole('dialog');

/** The `<dt>Label</dt><dd>value</dd>` row whose dt reads `label`. */
const factRow = (label: string): HTMLElement => {
  const row = screen.getByText(label).closest('.admin-fact');
  if (!(row instanceof HTMLElement)) throw new Error(`No fact row for ${label}`);
  return row;
};

/** The count tile whose dt reads `label`, scoped to the snapshot card. */
const countBlock = (label: string): HTMLElement => {
  const block = screen.getByText(label).closest('.admin-snapshot__count');
  if (!(block instanceof HTMLElement)) throw new Error(`No count tile for ${label}`);
  return block;
};

// ── Export plumbing ─────────────────────────────────────────────────────────

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  // jsdom implements neither object URLs nor anchor navigation; the card must
  // drive both, so the test provides them the way a browser would.
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
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(noop);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const downloadedAnchor = (): HTMLAnchorElement => {
  expect(anchorClick).toHaveBeenCalledTimes(1);
  return anchorClick.mock.instances[0] as HTMLAnchorElement;
};

const downloadedBlob = (): Blob => {
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  return createObjectURL.mock.calls[0][0] as Blob;
};

describe('Admin snapshot card — display', () => {
  it('shows the record counts, the storage backend and the legacy backup', () => {
    render(<AdminSection {...baseProps()} />);

    expect(screen.getByRole('heading', { name: 'Data snapshot' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Data snapshot' });

    expect(within(card).getByText('Employees')).toBeInTheDocument();
    expect(within(card).getByText('2')).toBeInTheDocument();
    expect(within(card).getByText('Leave plans')).toBeInTheDocument();
    expect(within(card).getByText('3')).toBeInTheDocument();

    // The daily ledger and the holiday calendar joined the card's counts.
    expect(within(countBlock('Attendance')).getByText('4')).toBeInTheDocument();
    expect(within(countBlock('Holidays')).getByText('1')).toBeInTheDocument();

    expect(within(card).getByText('IndexedDB (this browser)')).toBeInTheDocument();
    expect(
      within(card).getByText(/old localStorage copy/i),
    ).toBeInTheDocument();

    // The backup/handoff copy the spec requires on the card.
    expect(within(card).getByText(/Google Drive/)).toBeInTheDocument();
    expect(within(card).getByText(/OneDrive/)).toBeInTheDocument();
  });

  it('says the legacy copy is the active store on the real localStorage fallback pair', () => {
    // The fallback store always reports `legacyBackup: false` (it has no separate
    // copy), so this is the pair production actually mounts.
    render(<AdminSection {...baseProps({ backend: 'localstorage', legacyBackup: false })} />);

    expect(screen.getByText('localStorage fallback')).toBeInTheDocument();

    // The legacy copy is what this browser reads and writes on the fallback -
    // the row must not dress it up as a frozen backup made in an earlier era.
    const legacyRow = factRow('Legacy copy');
    expect(legacyRow.textContent).toContain('running on the localStorage fallback');
    expect(legacyRow.textContent).toContain('active store');
    expect(legacyRow.textContent).toContain('not a separate frozen backup');
    expect(legacyRow.textContent).not.toMatch(/read-only/i);
    expect(legacyRow.textContent).not.toMatch(/old localStorage copy/i);
    expect(screen.queryByText('None')).toBeNull();
  });

  it('reports no legacy backup on IndexedDB when the migration found none', () => {
    render(<AdminSection {...baseProps({ backend: 'indexeddb', legacyBackup: false })} />);

    expect(factRow('Legacy backup').textContent).toContain('None');
    expect(screen.queryByText(/old localStorage copy/i)).toBeNull();
  });
});

describe('Admin snapshot card — export', () => {
  it('exports the live datasets, downloads the file and records the last export', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    // Before any exchange the card says so, rather than showing a fake date.
    expect(screen.getAllByText('Never in this browser')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    // The file is built from the live props, never by re-reading the store: the
    // download must agree with what this session is showing.
    expect(props.store?.exportSnapshot).not.toHaveBeenCalled();

    const anchor = downloadedAnchor();
    expect(anchor.download).toMatch(/^omnihr-snapshot-\d{4}-\d{2}-\d{2}\.json$/);
    expect(anchor.href).toContain('blob:mock-url');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // The file serialises the datasets the card was given.
    const text = await downloadedBlob().text();
    expect(JSON.parse(text)).toEqual(
      expect.objectContaining({
        v: 3,
        dataVersion: DATA_SCHEMA_VERSION,
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 'EMP-LOCAL-1' }),
          expect.objectContaining({ id: 'EMP-LOCAL-2' }),
        ]),
        policies: [expect.objectContaining({ id: 'POL-LOCAL-1' })],
        leavePlans: [expect.objectContaining({ id: 'plan-local-1' })],
        // The daily ledger, the holiday calendar and the event calendar travel in
        // the snapshot too, or the backup would quietly lose them while claiming
        // to be complete.
        attendance: expect.arrayContaining([
          expect.objectContaining({ id: 'EMP-LOCAL-1|2026-11-10' }),
        ]),
        holidays: [expect.objectContaining({ id: 'holiday-2026-12-25' })],
        plannerEvents: [],
        settings: { maxConcurrentLeave: 3 },
      }),
    );

    // The exchange is recorded: persisted for the next visit and shown on the card.
    const storedMeta = JSON.parse(localStorage.getItem(SNAPSHOT_META_KEY) as string);
    expect(storedMeta.lastExportedAt).toBeTruthy();
    expect(factRow('Last exported').textContent).not.toContain('Never in this browser');
    expect(factRow('Last imported').textContent).toContain('Never in this browser');
    // A successful export is an info message; it never claims the file is stored anywhere.
    expect(screen.getByRole('alert')).toHaveTextContent(/Snapshot exported/i);
  });

  it('exports the live datasets even when the store holds different data', async () => {
    // The mock store holds the IMPORT snapshot's three employees and threshold 4 -
    // data this session does not render. The file must still carry the live two.
    const props = baseProps({ store: makeMockStore(IMPORTED_SNAPSHOT) });
    render(<AdminSection {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    const parsed = JSON.parse(await downloadedBlob().text());
    expect(
      parsed.employees.map((emp: Employee) => emp.id),
    ).toEqual(['EMP-LOCAL-1', 'EMP-LOCAL-2']);
    expect(parsed.leavePlans).toHaveLength(1);
    expect(parsed.settings).toEqual({ maxConcurrentLeave: 3 });
    expect(props.store?.exportSnapshot).not.toHaveBeenCalled();
  });

  it('shows a danger notice and records nothing when the export fails', async () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('download refused');
    });
    render(<AdminSection {...baseProps()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be downloaded/i);
    // A failed export is not an exchange: no timestamp is claimed or stored.
    expect(localStorage.getItem(SNAPSHOT_META_KEY)).toBeNull();
    expect(factRow('Last exported').textContent).toContain('Never in this browser');
  });

  it('exports the datasets it was given when the session has no store', async () => {
    const props = baseProps({ store: undefined });
    render(<AdminSection {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    const text = await downloadedBlob().text();
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(
      expect.objectContaining({
        v: 3,
        dataVersion: DATA_SCHEMA_VERSION,
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 'EMP-LOCAL-1' }),
          expect.objectContaining({ id: 'EMP-LOCAL-2' }),
        ]),
        policies: [expect.objectContaining({ id: 'POL-LOCAL-1' })],
        leavePlans: [expect.objectContaining({ id: 'plan-local-1' })],
        plannerEvents: [],
        settings: { maxConcurrentLeave: 3 },
      }),
    );
  });
});

describe('Admin snapshot card — import', () => {
  it('asks for confirmation with both sides of the replacement, then imports and reports up', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    await chooseFile(snapshotFile(IMPORTED_SNAPSHOT));

    // The question states what the file holds AND what it is about to overwrite.
    const dialog = confirmDialog();
    expect(dialog).toHaveTextContent(/3 employee records/);
    expect(dialog).toHaveTextContent(/currently 2 employee records/);
    // The new datasets are named on both sides too, so the replacement is stated
    // in full rather than hiding the attendance ledger it also deletes.
    expect(dialog).toHaveTextContent(/1 attendance records and 1 holiday records/);
    expect(dialog).toHaveTextContent(/4 attendance records and 1 holiday records/);
    // Asked, not answered: the store is untouched while the question is open.
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace data' }));

    await waitFor(() => expect(props.store?.importSnapshot).toHaveBeenCalledTimes(1));
    expect(props.store?.importSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        v: 3,
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 'EMP-IMPORT-1' }),
        ]),
      }),
    );
    // The parent reloads from the store; the card claims what happened.
    expect(props.onImported).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/Snapshot imported/i);
    expect(factRow('Last imported').textContent).not.toContain('Never in this browser');
    expect(
      JSON.parse(localStorage.getItem(SNAPSHOT_META_KEY) as string).lastImportedAt,
    ).toBeTruthy();
  });

  it('leaves everything untouched when the question is cancelled', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    await chooseFile(snapshotFile(IMPORTED_SNAPSHOT));
    await userEvent.click(within(confirmDialog()).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();
    // No failure is claimed either: declining an import is not an error.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_META_KEY)).toBeNull();
  });

  it('refuses a file that is not JSON without touching the store', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    await chooseFile(snapshotFile('this is not { json', 'broken.json'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/not valid JSON/i);
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses a snapshot made by another version of OmniHR', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    await chooseFile(
      snapshotFile({ ...IMPORTED_SNAPSHOT, v: 4 }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/different version/i);
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();
  });

  it('refuses a snapshot whose rows are malformed', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    await chooseFile(
      snapshotFile({
        ...IMPORTED_SNAPSHOT,
        employees: [{ id: 'EMP-BAD' }],
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/does not hold a valid OmniHR snapshot/i);
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();
  });

  it('reports a store that refuses the write and never claims success', async () => {
    const props = baseProps({
      store: makeMockStore(IMPORTED_SNAPSHOT, {
        importSnapshot: vi.fn(async (): Promise<StoreResult> => ({ ok: false, reason: 'quota' })),
      }),
    });
    render(<AdminSection {...props} />);

    await chooseFile(snapshotFile(IMPORTED_SNAPSHOT));
    await userEvent.click(within(confirmDialog()).getByRole('button', { name: 'Replace data' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/run out of storage space/i);
    expect(alert).toHaveTextContent(/current data is untouched/i);
    // The write was attempted and refused - it did not silently succeed.
    expect(props.store?.importSnapshot).toHaveBeenCalledTimes(1);
    expect(props.onImported).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_META_KEY)).toBeNull();
  });

  it('offers import only when the session has a store', () => {
    render(<AdminSection {...baseProps({ store: undefined })} />);

    const importButton = screen.getByRole('button', { name: 'Import snapshot' });
    expect(importButton).toBeDisabled();
    // Export still works without a store, so the fallback path is not a dead page.
    expect(screen.getByRole('button', { name: 'Export snapshot' })).toBeEnabled();
  });
});

describe('Admin workspace actions card', () => {
  /*
   * The sidebar footer's three quick actions (Export Roster, Reset Demo State,
   * Sign out) moved onto the Admin & Settings page (design decision D3). The
   * card is presentational-plus-intents like every other section: the callbacks
   * belong to App, which owns the datasets the export/reset act on and the
   * ConfirmDialog the reset asks through.
   */

  it('wires the Export Roster, Reset Demo State and Sign out actions', async () => {
    const onExportRoster = vi.fn();
    const onResetData = vi.fn();
    const onSignOut = vi.fn();
    render(
      <AdminSection
        {...baseProps({ onExportRoster, onResetData, onSignOut })}
      />,
    );

    const card = screen.getByRole('region', { name: 'Workspace actions' });
    expect(
      within(card).getByRole('button', { name: 'Export Roster (Excel)' }),
    ).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reset Demo State' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Export Roster (Excel)' }));
    expect(onExportRoster).toHaveBeenCalledTimes(1);

    await userEvent.click(within(card).getByRole('button', { name: 'Reset Demo State' }));
    // A reset is a QUESTION, not an action: the card reports the intent, App asks.
    expect(onResetData).toHaveBeenCalledTimes(1);

    await userEvent.click(within(card).getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('offers Sign out only when the console is hosted by a session', () => {
    render(<AdminSection {...baseProps({ onSignOut: undefined })} />);

    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    // The other two actions are session-independent and stay.
    expect(screen.getByRole('button', { name: 'Export Roster (Excel)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Demo State' })).toBeInTheDocument();
  });
});
