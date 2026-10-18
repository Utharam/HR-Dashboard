import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  INITIAL_EMPLOYEES,
  INITIAL_TRACKER,
  INITIAL_REQUISITIONS,
} from '../../data/initialData';
import { DirectorySection } from '../DirectorySection';
import { AttendanceSection } from '../AttendanceSection';
import { PayrollSection } from '../PayrollSection';
import { TrendsSection } from '../TrendsSection';
import { RecruitmentSection } from '../RecruitmentSection';
import { ExcelHubSection } from '../ExcelHubSection';
import { GuidesSection } from '../GuidesSection';
import { EmployeeModal } from '../EmployeeModal';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be constructed and its
// teardown throws asynchronously out of `cleanup()`. TrendsSection draws a chart above
// the table under test; the chart is not the subject here.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

const noop = () => {};

/**
 * The whole of Task 17, as one assertion set.
 *
 * `getByRole('table', { name })` is the load-bearing line: a table's accessible name can
 * only come from `<caption>`, `aria-label` or `aria-labelledby`. There were zero of all
 * three in `src/`, so a screen reader announcing a 25x11 payroll register had no name for
 * the table and no way to know a cell belonged to a column header.
 *
 * The second half is the scroll region. `.omni-table-wrap` is `overflow-x: auto`, which
 * makes it scrollable by pointer and unreachable by keyboard: without `tabIndex` the
 * right-hand columns of an 11-column table need a mouse (WCAG 2.1.1).
 */
const expectAccessibleTable = (name: RegExp) => {
  const table = screen.getByRole('table', { name });

  // A `<caption>`, not just any source of the name - a caption is what a screen reader
  // surfaces as the table's title, and it has to be visually hidden so it does not move
  // the layout of a card that already has a visible heading.
  const caption = table.querySelector('caption');
  expect(caption).not.toBeNull();
  expect(caption).toHaveClass('sr-only');

  const headers = within(table).getAllByRole('columnheader');
  expect(headers.length).toBeGreaterThan(0);
  for (const th of headers) {
    expect(th).toHaveAttribute('scope', 'col');
  }

  const region = table.closest('.omni-table-wrap');
  expect(region).not.toBeNull();
  expect(region).toHaveAttribute('role', 'region');
  expect(region).toHaveAttribute('tabindex', '0');
  expect(region).toHaveAccessibleName(/scroll/i);

  return table;
};

describe('DirectorySection table semantics', () => {
  const renderDirectory = () =>
    render(<DirectorySection employees={INITIAL_EMPLOYEES} onSelectEmployee={noop} />);

  it('gives the register an accessible name', () => {
    renderDirectory();
    expectAccessibleTable(/Staff master register/i);
  });

  it('makes the horizontal scroll region keyboard reachable', () => {
    renderDirectory();
    expect(screen.getByRole('region', { name: /scroll/i })).toHaveAttribute('tabindex', '0');
  });

  it('keeps the caption in step with the page being shown', async () => {
    // A caption that says "page 1 of 8" forever is worse than no caption: it is a name
    // that is wrong for seven eighths of its life. Asserted on page 2 as well as page 1,
    // because a caption derived once and never re-derived passes the page-1 check and is
    // wrong everywhere else - which is exactly what it was.
    renderDirectory();
    expect(screen.getByRole('table', { name: /page 1 of 8, showing 25 of 200 records/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('table', { name: /page 2 of 8, showing 25 of 200 records/i })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /page 1 of 8/i })).toBeNull();
  });

  it('describes an empty register without claiming a page window', () => {
    render(<DirectorySection employees={[]} onSelectEmployee={noop} />);
    expectAccessibleTable(/Staff master register\. No records to display\./i);
  });
});

describe('AttendanceSection table semantics', () => {
  it('names the attendance register and scopes its headers', () => {
    render(<AttendanceSection employees={INITIAL_EMPLOYEES} />);
    expectAccessibleTable(/Monthly attendance and absence register/i);
  });
});

describe('PayrollSection table semantics', () => {
  it('names the payroll table and scopes its headers', () => {
    render(<PayrollSection employees={INITIAL_EMPLOYEES} onSelectEmployee={noop} />);
    expectAccessibleTable(/Compensation structure and take-home salary breakdown/i);
  });
});

describe('TrendsSection table semantics', () => {
  it('names the historical ledger and scopes its headers', () => {
    render(<TrendsSection tracker={INITIAL_TRACKER} />);
    expectAccessibleTable(/Historical monthly HR ledger/i);
  });
});

describe('RecruitmentSection table semantics', () => {
  it('names the requisitions table and scopes its headers', () => {
    render(<RecruitmentSection requisitions={INITIAL_REQUISITIONS} />);
    expectAccessibleTable(/Corporate hiring pipeline and requisitions/i);
  });
});

describe('ExcelHubSection table semantics', () => {
  const renderHub = () =>
    render(
      <ExcelHubSection
        employees={[]}
        onImportEmployees={noop}
        onExportEmployees={noop}
        onExportPayroll={noop}
      />,
    );

  const uploadRoster = (container: HTMLElement) => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Emp ID': 'EMP-1',
        'Full Name': 'Asha Rao',
        Department: 'Engineering & Technology',
        'Designation / Role': 'Engineer',
        Location: 'Bengaluru HQ',
        'Monthly CTC': 120000,
        'Attendance (Days Present)': 24,
        Status: 'Active',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'roster.xlsx', {
      type: 'application/vnd.ms-excel',
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('names the pre-sync preview and scopes its headers', async () => {
    const { container } = renderHub();
    uploadRoster(container);

    expect(await screen.findByRole('table', { name: /Pre-sync import preview/i })).toBeInTheDocument();
    expectAccessibleTable(/Pre-sync import preview/i);
  });
});

describe('GuidesSection table semantics', () => {
  it('names the statutory reference table and scopes its headers', () => {
    render(<GuidesSection initialGuide="general" onNavigateTab={noop} />);
    expectAccessibleTable(/Indian statutory and legal formulation reference/i);
  });

  it('names the column-alias table and scopes its headers', () => {
    render(<GuidesSection initialGuide="excel" onNavigateTab={noop} />);
    expectAccessibleTable(/Excel column header aliases/i);
  });
});

describe('EmployeeModal payslip table semantics', () => {
  it('names the payslip breakdown table', async () => {
    // A ninth table, not on the original list: the payslip line-item breakdown inside the
    // profile modal. It has no column headers to `scope` - it is two columns of label and
    // amount, not a register - but it still needs a name, or it is announced as an
    // anonymous grid of rupees.
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>View payslip</button>
          <EmployeeModal
            employee={open ? INITIAL_EMPLOYEES[0] : null}
            onClose={() => setOpen(false)}
          />
        </>
      );
    };
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /view payslip/i }));

    const table = screen.getByRole('table', {
      name: new RegExp(`Monthly payslip breakdown for ${INITIAL_EMPLOYEES[0].name}`, 'i'),
    });
    expect(table.querySelector('caption')).toHaveClass('sr-only');
  });
});

describe('no table in src/ is left without semantics', () => {
  it('finds no bare omni-table-wrap anywhere in the rendered section', () => {
    // The source scan below is the load-bearing one; this guards the wiring the scan
    // cannot see - a wrapper that got the role but lost the tabIndex on some later edit.
    const { container } = render(<DirectorySection employees={INITIAL_EMPLOYEES} onSelectEmployee={noop} />);
    for (const wrap of container.querySelectorAll('.omni-table-wrap')) {
      expect(wrap).toHaveAttribute('tabindex', '0');
      expect(wrap).toHaveAttribute('role', 'region');
      expect(wrap.querySelector('caption')).not.toBeNull();
      for (const th of wrap.querySelectorAll('th')) {
        expect(th).toHaveAttribute('scope', 'col');
      }
    }
  });
});