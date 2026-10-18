import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  BookOpen, 
  Info,
  X
} from 'lucide-react';
import type { Employee } from '../types';
import { parseExcelBuffer, ExcelImportError } from '../utils/excelParser';
import type { ExcelErrorCode } from '../utils/excelParser';
import { formatINR } from '../utils/formatters';
import { describeTable } from '../utils/pagination';
import { ConfirmDialog } from './ConfirmDialog';

const PREVIEW_ROWS = 10;
const TABLE_TITLE = 'Pre-sync import preview';

/**
 * The preview wrapper is BOTH scroll containers: `.omni-table-wrap` gives it
 * `overflow-x: auto`, and the inline cap below gives it `max-height` + `overflow-y: auto`.
 * `scrollRegionLabel` names only the horizontal axis, which is half the truth a screen
 * reader user needs in order to know the rows continue downwards.
 */
const PREVIEW_REGION_LABEL = `${TABLE_TITLE} table, horizontally and vertically scrollable`;

/**
 * Short, plain heading for each rejection the parser can raise.
 *
 * The parser owns the sentence that tells the user what to DO (`hint`); this is only the
 * headline above it. Keeping them separate means a new `ExcelErrorCode` shows up as an
 * obvious missing entry rather than as a raw library message leaking through.
 */
const ERROR_TITLE: Record<ExcelErrorCode, string> = {
  UNREADABLE_FILE: 'That file could not be opened',
  NO_SHEET: 'That workbook is empty',
  NO_MATCHING_COLUMNS: 'Not an OmniHR staff roster',
  NO_DATA_ROWS: 'No staff rows in that sheet',
  TOO_MANY_ROWS: 'Too many rows to import',
  UNSUPPORTED_FILE: 'Wrong kind of OmniHR file',
};

/**
 * Turns a rejection into something a user can act on.
 *
 * An `ExcelImportError` carries its own hint. Anything else is an unexpected failure and
 * gets a fixed sentence: the old code interpolated `err.message`, which is how SheetJS
 * text like "Invalid HTML: could not find <table>" ended up on screen. The raw error is
 * still logged for debugging - it just is not what the user is shown.
 */
const describeImportError = (err: unknown): { title: string; hint: string } => {
  if (err instanceof ExcelImportError) {
    return { title: ERROR_TITLE[err.code] ?? 'Import failed', hint: err.hint };
  }
  return {
    title: 'Import failed',
    hint: 'Something went wrong while reading that file. Check that it is an Excel workbook exported from your HR system, and try again.',
  };
};

interface ExcelHubSectionProps {
  /** The rows the exports will write - the CURRENT FILTER, not the whole register. */
  employees: Employee[];
  /**
   * How many records the whole register holds, unfiltered.
   *
   * Deliberately separate from `employees`: the confirmation has to say how much is about
   * to be destroyed, and a number that silently became "3" because a search box was filled
   * in would understate the loss by two orders of magnitude on the one screen where the
   * user is deciding whether to lose it.
   */
  registerSize: number;
  onImportEmployees: (newEmps: Employee[], mode: 'replace' | 'append') => void;
  onExportEmployees: () => void;
  onExportPayroll: () => void;
  onNavigateToGuides?: (guideSection?: 'general' | 'excel') => void;
}

export const ExcelHubSection: React.FC<ExcelHubSectionProps> = ({
  employees,
  registerSize,
  onImportEmployees,
  onExportEmployees,
  onExportPayroll,
  onNavigateToGuides
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Employee[] | null>(null);
  const [recognizedCols, setRecognizedCols] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedSheetName, setUploadedSheetName] = useState<string>('');
const [statusMessage, setStatusMessage] = useState<
    | { type: 'success'; text: string }
    | { type: 'error'; title: string; text: string }
    | null
  >(null);
  // The roster is not touched until one of these two is set. The preview alone is harmless;
  // holding the parsed rows is not the same as having written them.
  const [pendingImport, setPendingImport] = useState<Employee[] | null>(null);

  // The preview is capped at 10 rows; the caption says so, so a screen reader is not told
  // about records that are not on screen. Derived once so the two cannot disagree.
  const previewRows = parsedPreview?.slice(0, PREVIEW_ROWS) ?? [];

  const handleFileUpload = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseExcelBuffer(buffer);

      setUploadedFileName(file.name);
      setUploadedSheetName(result.sheetName);
      setRecognizedCols(result.recognizedColumns);
      setParseWarnings(result.warnings);
      setParsedPreview(result.employees);

      setStatusMessage({
        type: 'success',
        text: `Successfully parsed ${result.totalRows} employee records from '${file.name}' (Sheet: ${result.sheetName}). Review preview below and sync.`
      });
    } catch (err) {
      // Kept for the developer console; deliberately not shown to the user.
      console.error(err);
      const { title, hint } = describeImportError(err);
      setStatusMessage({ type: 'error', title, text: hint });
      // A stale preview from a previous file must not survive a failed parse: the sync
      // button acts on `parsedPreview`, so leaving it in place would let a user commit
      // the PREVIOUS file's employees while reading a message about this one.
      setParsedPreview(null);
      setRecognizedCols([]);
      setParseWarnings([]);
      setPendingImport(null);
    }
  };

  // A destructive action is a QUESTION, and the question is state. This used to be a
  // button that called `onImportEmployees` and immediately reported success - which meant
  // the panel claimed the register had been synchronized while App's persistence banner
  // was free to say the same write never reached storage. Two claims about one action, one
  // of them green, neither of them this panel's to make.
  const handleRequestImport = () => {
    if (parsedPreview && parsedPreview.length > 0) setPendingImport(parsedPreview);
  };

  const handleCommitImport = (mode: 'replace' | 'append') => {
    if (!pendingImport || pendingImport.length === 0) return;
    onImportEmployees(pendingImport, mode);
    setPendingImport(null);
    setStatusMessage(null);
    setParsedPreview(null);
    setRecognizedCols([]);
    setParseWarnings([]);
  };

  const handleCancelPreview = () => {
    setParsedPreview(null);
    setRecognizedCols([]);
    setParseWarnings([]);
    setStatusMessage(null);
    setPendingImport(null);
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        'Employee ID': 'EMP-1001',
        'Full Name': 'Rajesh Menon',
        'Work Email': 'rajesh.menon@omnixhr.io',
        'Phone': '+91 9876543210',
        'Department': 'Engineering & Technology',
        'Designation / Role': 'VP of Engineering',
        'Office Location': 'Bengaluru HQ',
        'Date of Joining': '2021-03-15',
        'Monthly CTC': 350000,
        'Monthly Basic Salary': 175000,
        'HRA': 87500,
        'Special Allowance': 87500,
        'Status': 'Active',
        'Gender': 'Male',
        'Attendance (Days Present)': 25,
        'Performance Rating': 5,
        'CL Balance': 8,
        'SL Balance': 8,
        'EL Balance': 12,
        'LOP Days': 0,
        'PF UAN': '100123456789'
      },
      {
        'Employee ID': 'EMP-1002',
        'Full Name': 'Priya Nair',
        'Work Email': 'priya.nair@omnixhr.io',
        'Phone': '+91 9876543211',
        'Department': 'Sales & Business Development',
        'Designation / Role': 'Enterprise Sales Director',
        'Office Location': 'Mumbai Hub',
        'Date of Joining': '2022-06-10',
        'Monthly CTC': 280000,
        'Monthly Basic Salary': 140000,
        'HRA': 70000,
        'Special Allowance': 70000,
        'Status': 'Active',
        'Gender': 'Female',
        'Attendance (Days Present)': 26,
        'Performance Rating': 4,
        'CL Balance': 9,
        'SL Balance': 10,
        'EL Balance': 14,
        'LOP Days': 0,
        'PF UAN': '100123456790'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee_Master');
    XLSX.writeFile(wb, 'OmniHR_Employee_Template.xlsx');
  };

  return (
    <div className="section-stack">
      {/* Informational Guidance Banner */}
      <div className="omni-card callout">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Info size={22} className="text-primary" />
          <div>
            <h4 className="omni-card-title">
              Flexible Spreadsheet Column Mapping
            </h4>
            <p className="omni-card-sub">
              OmniHR automatically matches columns from Workday, SAP, BambooHR, Darwinbox, Zoho People, and custom sheets.
            </p>
          </div>
        </div>

        {onNavigateToGuides && (
          <button 
            onClick={() => onNavigateToGuides('excel')}
            className="btn btn-secondary btn-sm"
          >
            <BookOpen size={14} /> View Excel Handling Guide
          </button>
        )}
      </div>

      {/* Upload Drag & Drop Box */}
      <div className="omni-card">
        <h3 className="omni-card-title">
          Spreadsheet Ingestion & Synchronization Hub
        </h3>
        <p className="omni-card-sub" style={{ marginBottom: 'var(--space-5)' }}>
          Upload an HR master list or attendance punch sheet (.xlsx, .xls, .csv). Columns and formulas are automatically recognized. A payroll register is not a staff roster and will be rejected.
        </p>

        <div 
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
          }}
          className="dropzone"
          data-drag={dragOver}
          onClick={() => document.getElementById('excelFileInput')?.click()}
        >
          <Upload size={36} className={dragOver ? 'text-primary' : 'text-dim'} style={{ margin: '0 auto 12px' }} />
          <h4 className="omni-card-title" style={{ marginBottom: 'var(--space-1)' }}>
            Choose an Excel spreadsheet or drag and drop here
          </h4>
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            Compatible with .xlsx, .xls, and .csv workbooks (Auto-detects first worksheet)
          </p>
          <input 
            type="file" 
            id="excelFileInput" 
            accept=".xlsx,.xls,.csv" 
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) handleFileUpload(e.target.files[0]);
            }}
          />
        </div>

        {statusMessage && (
          <div
            className={`alert ${statusMessage.type === 'success' ? 'tone-success' : 'tone-danger'}`}
            role={statusMessage.type === 'error' ? 'alert' : 'status'}
            style={{ marginTop: 'var(--space-4)' }}
          >
            {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span>
              {statusMessage.type === 'error' && <strong>{statusMessage.title}. </strong>}
              {statusMessage.text}
            </span>
          </div>
        )}

        {/* Live Pre-Sync Preview */}
        {parsedPreview && (
          <div style={{ marginTop: 'var(--gap-section)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: '14px' }}>
              <div>
                <h4 className="omni-card-title">
                  Pre-Sync Inspection: {parsedPreview.length} Records Mapped
                </h4>
                <p className="omni-card-sub">
                  File: <strong>{uploadedFileName}</strong> (Sheet: <strong>{uploadedSheetName}</strong>)
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleCancelPreview} className="btn btn-secondary">
                  <X size={15} /> Cancel Preview
                </button>
                <button onClick={handleRequestImport} className="btn btn-primary">
                  <CheckCircle size={16} /> Sync into Live Dashboard…
                </button>
              </div>
            </div>

            {/* Recognized Columns Badge Matrix */}
            {recognizedCols.length > 0 && (
              <div className="inset-panel" style={{ marginBottom: 'var(--space-4)' }}>
                <span className="kpi-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                  Recognized Spreadsheet Columns ({recognizedCols.length}):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-micro)' }}>
                  {recognizedCols.map(col => (
                    <span key={col} className="badge badge-active">
                      ✓ {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings list if any */}
            {parseWarnings.length > 0 && (
              <div className="alert tone-warning" style={{ marginBottom: 'var(--space-4)' }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Data Sanitization Warnings:</strong>
                  <ul>
                    {parseWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div
              className="omni-table-wrap"
              role="region"
              aria-label={PREVIEW_REGION_LABEL}
              tabIndex={0}
              style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}
            >
              <table className="omni-table">
                <caption className="sr-only">
                  {describeTable(TABLE_TITLE, previewRows.length, parsedPreview.length, 1, 1)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Emp ID</th>
                    <th scope="col">Full Name</th>
                    <th scope="col">Department</th>
                    <th scope="col">Role / Designation</th>
                    <th scope="col">Location</th>
                    <th scope="col">Monthly CTC</th>
                    <th scope="col">Attendance</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(p => (
                    <tr key={p.id}>
                      <td className="cell-id">{p.id}</td>
                      <td className="cell-strong">{p.name}</td>
                      <td>{p.department}</td>
                      <td>{p.role}</td>
                      <td>{p.location}</td>
                      <td className="cell-strong text-success">₹{formatINR(p.monthlyCTC)}</td>
                      <td>{p.presentDays} / 26 days</td>
                      <td><span className="badge badge-active">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedPreview.length > PREVIEW_ROWS && (
              <p className="text-dim" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-2)', textAlign: 'right' }}>
                Showing first {PREVIEW_ROWS} of {parsedPreview.length} records. All rows will sync into the dashboard.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Export & Templates Hub */}
      <div className="grid grid--card">
        <div className="omni-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
            <FileSpreadsheet size={20} className="text-primary" />
            <h4 className="omni-card-title">Export Complete Master Roster</h4>
          </div>
          <p className="omni-card-sub" style={{ marginBottom: 'var(--space-4)' }}>
            Download a multi-column Excel spreadsheet containing all {employees.length} employee profiles matching the current filters, with reporting managers, PF UANs, and leave balances.
          </p>
          <button onClick={onExportEmployees} className="btn btn-primary btn-block">
            <Download size={16} /> Download Employee Master (.xlsx)
          </button>
        </div>

        <div className="omni-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
            <FileSpreadsheet size={20} className="text-success" />
            <h4 className="omni-card-title">Export Monthly Payroll Advice</h4>
          </div>
          <p className="omni-card-sub" style={{ marginBottom: 'var(--space-4)' }}>
            Generate a bank-ready payroll spreadsheet with Basic, HRA, Special Allowance, EPF, Professional Tax, LOP deductions, and Disbursable Net.
          </p>
          <button onClick={onExportPayroll} className="btn btn-success btn-block">
            <Download size={16} /> Download Payroll Sheet (.xlsx)
          </button>
        </div>

        <div className="omni-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
            <RefreshCw size={20} className="text-warning" />
            <h4 className="omni-card-title">Download Standard Template</h4>
          </div>
          <p className="omni-card-sub" style={{ marginBottom: 'var(--space-4)' }}>
            Get the pre-formatted Excel template with sample rows and recognized column headers for error-free bulk employee imports.
          </p>
          <button onClick={handleDownloadTemplate} className="btn btn-secondary btn-block">
            <Download size={16} /> Download Template (.xlsx)
          </button>
        </div>
      </div>

      {/*
        Rendered last so it stacks above the cards behind it. Two destructive outcomes of
        different severity, so the dialog carries three answers: replace the register,
        add to it, or change nothing. Nothing is committed until one of the first two is
        pressed, and Escape and Cancel are refusals.
      */}
      <ConfirmDialog
        isOpen={pendingImport !== null}
        title={`Replace ${registerSize} staff records with ${pendingImport?.length ?? 0} imported records?`}
        message={`Every record currently in the register - all ${registerSize} of them - will be discarded and replaced by the ${pendingImport?.length ?? 0} rows parsed from '${uploadedFileName}'. Append instead to keep them. A snapshot is taken first, so either can be undone from the banner afterwards.`}
        confirmLabel="Replace roster"
        secondaryAction={{
          label: `Append to the existing ${registerSize} records`,
          onClick: () => handleCommitImport('append'),
        }}
        onConfirm={() => handleCommitImport('replace')}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
};
