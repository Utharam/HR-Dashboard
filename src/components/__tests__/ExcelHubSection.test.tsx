import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { ExcelHubSection } from '../ExcelHubSection';

/**
 * Importing is the one control in this console that can destroy work the user cannot get
 * back. It used to be a single button that called `setEmployees(newEmps)` on click: no
 * question, no record of what was there, and a green "Successfully synchronized N staff
 * records" rendered AFTER the roster had already been overwritten and the persistence
 * effect had already written the destruction to `localStorage`.
 *
 * The contract these tests pin down:
 *   - ONE click on Sync asks a question and changes nothing;
 *   - the question states the consequence and offers BOTH outcomes, because "add to the
 *     register" and "throw the register away" are not degrees of the same decision;
 *   - cancelling keeps the parsed file, so a mis-click costs a keystroke and not a re-upload;
 *   - the panel never claims the register was synchronized. It parsed a file. Whether the
 *     roster was written is the parent's claim to make, and the parent is the only party
 *     that knows whether the write succeeded.
 */

const noop = () => {};

const ROSTER_ROWS = [
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
  {
    'Employee ID': 'EMP-9002',
    'Full Name': 'Bilal Khan',
    Department: 'Finance & Operations',
    'Designation / Role': 'Analyst',
    Location: 'Mumbai Hub',
    'Monthly CTC': 95000,
    'Attendance (Days Present)': 22,
    Status: 'Active',
    Gender: 'Male',
  },
];

const registerSize = 200;

const renderHub = (onImportEmployees = vi.fn()) =>
  render(
    <ExcelHubSection
      employees={[]}
      registerSize={registerSize}
      onImportEmployees={onImportEmployees}
      onExportEmployees={noop}
      onExportPayroll={noop}
    />,
  );

const uploadRoster = async (container: HTMLElement) => {
  const ws = XLSX.utils.json_to_sheet(ROSTER_ROWS);
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

const syncButton = () => screen.getByRole('button', { name: /sync into live dashboard/i });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ExcelHubSection import safety', () => {
  it('calls the import handler NOTHING on a single sync click', async () => {
    const onImport = vi.fn();
    const { container } = renderHub(onImport);
    await uploadRoster(container);

    await userEvent.click(syncButton());

    // This is the whole bug. Before the fix, this assertion was the other way round: one
    // click reached `setEmployees(newEmps)` and the persistence effect wrote the result to
    // storage in the same tick.
    expect(onImport).not.toHaveBeenCalled();
  });

  it('names what is about to be lost and what is about to replace it', async () => {
    const { container } = renderHub();
    await uploadRoster(container);

    await userEvent.click(syncButton());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/replace/i);
    expect(dialog).toHaveTextContent(new RegExp(String(registerSize)));
    expect(dialog).toHaveTextContent(new RegExp(String(ROSTER_ROWS.length)));
  });

  it('offers appending as a distinct action, not as a form of cancelling', async () => {
    const { container } = renderHub();
    await uploadRoster(container);
    await userEvent.click(syncButton());

    const dialog = screen.getByRole('dialog');
    const labels = Array.from(dialog.querySelectorAll('button')).map(b => b.textContent ?? '');
    expect(labels.some(l => /append|add to/i.test(l))).toBe(true);
    // Cancel must not be doing the job of the second outcome: choosing it has to leave the
    // register exactly as it was.
    expect(labels.some(l => /cancel/i.test(l))).toBe(true);
  });

  it('imports as a replace only once the question is answered with Replace', async () => {
    const onImport = vi.fn();
    const { container } = renderHub(onImport);
    await uploadRoster(container);

    await userEvent.click(syncButton());
    await userEvent.click(screen.getByRole('button', { name: /^replace roster$/i }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toHaveLength(ROSTER_ROWS.length);
    expect(onImport.mock.calls[0][1]).toBe('replace');
  });

  it('imports as an append when that is the answer given', async () => {
    const onImport = vi.fn();
    const { container } = renderHub(onImport);
    await uploadRoster(container);

    await userEvent.click(syncButton());
    await userEvent.click(screen.getByRole('button', { name: /append to the existing/i }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][1]).toBe('append');
  });

  it('changes nothing when the question is cancelled, and keeps the parsed file', async () => {
    const onImport = vi.fn();
    const { container } = renderHub(onImport);
    await uploadRoster(container);

    await userEvent.click(syncButton());
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onImport).not.toHaveBeenCalled();
    // The upload survives a cancelled question. Re-uploading a 200-row workbook to retry
    // is the cost of getting this wrong.
    expect(screen.getByRole('table', { name: /Pre-sync import preview/i })).toBeInTheDocument();
  });

  it('changes nothing when the question is dismissed with Escape', async () => {
    const onImport = vi.fn();
    const { container } = renderHub(onImport);
    await uploadRoster(container);

    await userEvent.click(syncButton());
    await userEvent.keyboard('{Escape}');

    expect(onImport).not.toHaveBeenCalled();
  });

  it('never claims the register was synchronized', async () => {
    const { container } = renderHub();
    await uploadRoster(container);

    await userEvent.click(syncButton());
    await userEvent.click(screen.getByRole('button', { name: /^replace roster$/i }));

    // The panel parsed a file; it cannot know whether the roster was written. The old
    // unconditional "Successfully synchronized N staff records into the live dashboard!"
    // sat beside App's persistence banner saying the change was NOT saved - two
    // contradictory claims about one action, one of them green.
    await waitFor(() => {
      expect(screen.queryByText(/successfully synchronized/i)).toBeNull();
    });
    expect(screen.queryByText(/into the live dashboard/i)).toBeNull();
  });

  it('still reports a parse, which is a claim it can actually make', async () => {
    const { container } = renderHub();
    await uploadRoster(container);
    expect(screen.getByText(/Successfully parsed 2 employee records/i)).toBeInTheDocument();
  });
});

describe('ExcelHubSection preview scroll region', () => {
  it('names the region by the axes it actually scrolls on', async () => {
    const { container } = renderHub();
    await uploadRoster(container);

    // The wrapper carries `.omni-table-wrap` (`overflow-x: auto`) AND an inline
    // `max-height` + `overflow-y: auto`, so it scrolls on both axes. The shared
    // `scrollRegionLabel` names only the horizontal one, which is a half-truth a screen
    // reader user acts on.
    const region = screen.getByRole('region', { name: /Pre-sync import preview/i });
    expect(region).toHaveAccessibleName(/vertically/i);
    expect(region).toHaveAttribute('tabindex', '0');
    expect(container.querySelector('.app-shell')).toBeNull();
  });
});