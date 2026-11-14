import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { renderApp } from '../test/renderApp';

// jsdom has no 2D canvas; the overview's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

// The roster export ends in `XLSX.writeFile`, which in a browser turns the
// workbook into a download. jsdom has no download surface, so capture the
// workbook instead; everything else stays the real SheetJS.
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});

/**
 * Export Roster lives on Admin & Settings, which has no page toolbar. A search
 * left behind on Directory used to narrow the download with no visible sign on
 * the page doing the exporting. The workspace action is the master-list backup,
 * so it must always write the full register.
 */
describe('Admin & Settings roster export', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports the full register even when a Directory search is still active', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Employee Directory' }));
    await user.type(screen.getByLabelText('Search staff, ID or role'), 'Divya');

    await user.click(screen.getByRole('button', { name: 'Admin & Settings' }));
    const card = screen.getByRole('region', { name: 'Workspace actions' });

    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    await user.click(within(card).getByRole('button', { name: 'Export Roster (Excel)' }));

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [workbook] = writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['Staff_Roster'],
    );

    // The demo register is 200 staff. The active "Divya" search must not shrink it.
    expect(rows).toHaveLength(200);
    expect(rows.some((row) => row['Full Name'] !== 'Divya Nair')).toBe(true);
  }, 20_000);
});
