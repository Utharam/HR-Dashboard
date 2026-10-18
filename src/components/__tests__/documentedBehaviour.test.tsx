import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidesSection } from '../GuidesSection';
import { ExcelHubSection } from '../ExcelHubSection';

const noop = () => {};

const renderHub = () =>
  render(
    <ExcelHubSection
      employees={[]}
      registerSize={0}
      onImportEmployees={noop}
      onExportEmployees={noop}
      onExportPayroll={noop}
    />,
  );

describe('in-app copy matches the parser behaviour', () => {
  it('documents Date of Joining as blank-with-a-warning, not the removed default', () => {
    render(<GuidesSection initialGuide="excel" onNavigateTab={noop} />);

    expect(screen.queryByText('2023-01-15')).toBeNull();
    expect(screen.getByText('Blank (with a warning)')).toBeInTheDocument();
  });

  it('does not advertise a payroll register as an accepted upload', () => {
    renderHub();

    const sub = screen.getByText(/HR master list/i);
    expect(sub).not.toHaveTextContent(/or payroll register/i);
    expect(sub).toHaveTextContent(/will be rejected/i);
  });

  it('states that the master-roster export covers the current filter', () => {
    renderHub();

    expect(screen.getByText(/Download a multi-column Excel spreadsheet/i)).toHaveTextContent(
      /current filters/i,
    );
  });
});
