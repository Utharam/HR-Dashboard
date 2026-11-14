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
import type { Employee, HRPolicy, LeavePlan } from '../../types';

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

const SNAPSHOT_META_KEY = 'omnihr_snapshot_meta';

/** A mock store that records every call while behaving like a real one. */
function makeMockStore(snapshot: DataSnapshot, overrides: Partial<DataStore> = {}) {
  return {
    backend: 'memory' as StoreBackend,
    load: vi.fn(async () => ({ snapshot, legacyBackup: false })),
    saveEmployees: vi.fn(async () => OK),
    savePolicies: vi.fn(async () => OK),
    saveLeavePlans: vi.fn(async () => OK),
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
  settings: { maxConcurrentLeave: 3 },
  store: makeMockStore({
    v: 1,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: EMPLOYEES,
    policies: [POLICY],
    leavePlans: [PLAN],
    settings: { maxConcurrentLeave: 3 },
  }),
  backend: 'indexeddb',
  legacyBackup: true,
  onImported: vi.fn(),
  ...overrides,
});

/** The snapshot a "good" import file holds: three employees replace the local two. */
const IMPORTED_SNAPSHOT: DataSnapshot = {
  v: 1,
  dataVersion: DATA_SCHEMA_VERSION,
  exportedAt: '2026-11-14T09:30:00.000Z',
  employees: [
    employee('EMP-IMPORT-1', 'Nina Import'),
    employee('EMP-IMPORT-2', 'Omar Import'),
    employee('EMP-IMPORT-3', 'Priya Import'),
  ],
  policies: [{ ...INITIAL_POLICIES[0], id: 'POL-IMPORT-1' }],
  leavePlans: [PLAN],
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

    expect(within(card).getByText('IndexedDB (this browser)')).toBeInTheDocument();
    expect(
      within(card).getByText(/old localStorage copy/i),
    ).toBeInTheDocument();

    // The backup/handoff copy the spec requires on the card.
    expect(within(card).getByText(/Google Drive/)).toBeInTheDocument();
    expect(within(card).getByText(/OneDrive/)).toBeInTheDocument();
  });

  it('reports the localStorage fallback and no legacy backup when there is none', () => {
    render(<AdminSection {...baseProps({ backend: 'localstorage', legacyBackup: false })} />);

    expect(screen.getByText('localStorage fallback')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByText(/old localStorage copy/i)).toBeNull();
  });
});

describe('Admin snapshot card — export', () => {
  it('exports through the store, downloads the file and records the last export', async () => {
    const props = baseProps();
    render(<AdminSection {...props} />);

    // Before any exchange the card says so, rather than showing a fake date.
    expect(screen.getAllByText('Never in this browser')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    expect(props.store?.exportSnapshot).toHaveBeenCalledTimes(1);

    const anchor = downloadedAnchor();
    expect(anchor.download).toMatch(/^omnihr-snapshot-\d{4}-\d{2}-\d{2}\.json$/);
    expect(anchor.href).toContain('blob:mock-url');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // The file is the store's snapshot, serialised.
    const text = await downloadedBlob().text();
    expect(JSON.parse(text)).toEqual(
      expect.objectContaining({ v: 1, employees: expect.any(Array) }),
    );

    // The exchange is recorded: persisted for the next visit and shown on the card.
    const storedMeta = JSON.parse(localStorage.getItem(SNAPSHOT_META_KEY) as string);
    expect(storedMeta.lastExportedAt).toBeTruthy();
    expect(factRow('Last exported').textContent).not.toContain('Never in this browser');
    expect(factRow('Last imported').textContent).toContain('Never in this browser');
    // A successful export is an info message; it never claims the file is stored anywhere.
    expect(screen.getByRole('alert')).toHaveTextContent(/Snapshot exported/i);
  });

  it('exports the datasets it was given when the session has no store', async () => {
    const props = baseProps({ store: undefined });
    render(<AdminSection {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    const text = await downloadedBlob().text();
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(
      expect.objectContaining({
        v: 1,
        dataVersion: DATA_SCHEMA_VERSION,
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 'EMP-LOCAL-1' }),
          expect.objectContaining({ id: 'EMP-LOCAL-2' }),
        ]),
        policies: [expect.objectContaining({ id: 'POL-LOCAL-1' })],
        leavePlans: [expect.objectContaining({ id: 'plan-local-1' })],
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
    // Asked, not answered: the store is untouched while the question is open.
    expect(props.store?.importSnapshot).not.toHaveBeenCalled();
    expect(props.onImported).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace data' }));

    await waitFor(() => expect(props.store?.importSnapshot).toHaveBeenCalledTimes(1));
    expect(props.store?.importSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        v: 1,
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
      snapshotFile({ ...IMPORTED_SNAPSHOT, v: 2 }),
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
