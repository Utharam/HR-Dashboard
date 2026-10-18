import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { ExcelHubSection } from './ExcelHubSection';

const noop = () => {};

const renderHub = () =>
  render(
    <ExcelHubSection
      employees={[]}
      onImportEmployees={noop}
      onExportEmployees={noop}
      onExportPayroll={noop}
    />,
  );

/** The file input the dropzone is built around. */
const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

const upload = async (container: HTMLElement, bytes: ArrayBuffer | string, name = 'roster.xlsx') => {
  const data = typeof bytes === 'string' ? bytes : new Uint8Array(bytes);
  const file = new File([data], name, { type: 'application/vnd.ms-excel' });
  fireEventChange(fileInput(container), file);
};

function fireEventChange(el: Element, file: File) {
  Object.defineProperty(el, 'files', { value: [file], configurable: true });
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const workbookOf = (rows: unknown[]): ArrayBuffer => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

beforeEach(() => {
  // The panel logs the underlying error for developers; it is not the assertion target.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ExcelHubSection import errors', () => {
  it('shows the parser hint, not the raw library message, for a file that is not a workbook', async () => {
    const { container } = renderHub();

    await upload(container, '<html><body><h1>Invoice</h1></body></html>', 'invoice.html');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be opened as an Excel workbook/i);
    // This is the string the old `err.message` interpolation put on screen.
    expect(alert).not.toHaveTextContent(/invalid html|could not find <table>/i);
    expect(alert).not.toHaveTextContent(/Failed to parse Excel file:/i);
  });

  it('reports an empty file as unreadable, not as a roster with no rows', async () => {
    const { container } = renderHub();

    // The end-to-end version of the gate: a 0-byte file must not be described to the
    // user as having column headings and no staff rows.
    await upload(container, new ArrayBuffer(0), 'empty.xlsx');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/That file could not be opened/i);
    expect(alert).toHaveTextContent(/no readable spreadsheet content/i);
    expect(alert).not.toHaveTextContent(/column headings/i);
    expect(alert).not.toHaveTextContent(/fill in at least one employee/i);
  });

  it('explains a vendor invoice instead of confirming a parse', async () => {
    const { container } = renderHub();

    await upload(
      container,
      workbookOf([{ Invoice: 'INV-1', Customer: 'Acme', Amount: 50000 }]),
      'invoice.xlsx',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Not an OmniHR staff roster/i);
    expect(alert).toHaveTextContent(/Download the Staff Roster template/i);
    expect(screen.queryByText(/Successfully parsed/i)).toBeNull();
  });

  it('names the payroll register rather than calling it an unrecognised sheet', async () => {
    const { container } = renderHub();

    await upload(
      container,
      workbookOf([{ 'Employee ID': 'EMP-1', 'Basic (50%)': 92500, 'Net Salary Payable': 149000 }]),
      'OmniHR_Payroll_Register_2026-01-31.xlsx',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Wrong kind of OmniHR file/i);
    expect(alert).toHaveTextContent(/payroll register/i);
    expect(alert).toHaveTextContent(/Import the Staff Roster instead/i);
  });

  it('reports a header-only sheet as having no staff rows', async () => {
    const { container } = renderHub();

    await upload(container, workbookOf([{ 'Employee ID': '', 'Full Name': '', Department: '' }]));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/No staff rows in that sheet/i);
    // Reworded from "fill in at least one employee": that instruction was unconditional
    // and untrue for a file with no headings at all, so it is now scoped to the template.
    expect(alert).toHaveTextContent(/add at least one employee below the headings/i);
    expect(alert).not.toHaveTextContent(/column headings but no staff rows/i);
  });

  it('reports a sheet over the row cap', async () => {
    const { container } = renderHub();
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      'Employee ID': `E${i}`,
      'Full Name': `N${i}`,
      'Monthly CTC': 100000,
    }));

    await upload(container, workbookOf(rows));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Too many rows to import/i);
    expect(alert).toHaveTextContent(/5,001 rows/);
  });

  it('clears a previous preview when a later file fails to parse', async () => {
    const { container } = renderHub();

    await upload(
      container,
      workbookOf([
        {
          'Employee ID': 'EMP-1001',
          'Full Name': 'Asha Menon',
          Department: 'Engineering & Technology',
          'Monthly CTC': 185000,
          Status: 'Active',
          Gender: 'Female',
        },
      ]),
    );
    await screen.findByText(/Successfully parsed 1 employee records/i);
    expect(screen.getByText(/Pre-Sync Inspection/i)).toBeInTheDocument();

    await upload(container, workbookOf([{ Invoice: 'INV-2', Amount: 10 }]), 'invoice.xlsx');

    await waitFor(() => {
      expect(screen.queryByText(/Pre-Sync Inspection/i)).toBeNull();
    });
    // Otherwise the Sync button would still be holding the PREVIOUS file's employees.
    expect(screen.queryByText(/Successfully parsed/i)).toBeNull();
  });

  it('still reports a good import as a success', async () => {
    const { container } = renderHub();

    await upload(
      container,
      workbookOf([
        {
          'Employee ID': 'EMP-1001',
          'Full Name': 'Asha Menon',
          Department: 'Engineering & Technology',
          'Monthly CTC': 185000,
          Status: 'Active',
          Gender: 'Female',
        },
      ]),
    );

    expect(await screen.findByText(/Successfully parsed 1 employee records/i)).toBeInTheDocument();
  });
});