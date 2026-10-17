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
import { parseExcelBuffer } from '../utils/excelParser';
import { formatINR } from '../utils/formatters';

interface ExcelHubSectionProps {
  employees: Employee[];
  onImportEmployees: (newEmps: Employee[]) => void;
  onExportEmployees: () => void;
  onExportPayroll: () => void;
  onNavigateToGuides?: (guideSection?: 'general' | 'excel') => void;
}

export const ExcelHubSection: React.FC<ExcelHubSectionProps> = ({
  employees,
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
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ 
        type: 'error', 
        text: `Failed to parse Excel file: ${err.message || 'Unknown error. Check file format.'}` 
      });
      setParsedPreview(null);
    }
  };

  const handleCommitImport = () => {
    if (parsedPreview && parsedPreview.length > 0) {
      onImportEmployees(parsedPreview);
      setStatusMessage({ 
        type: 'success', 
        text: `Successfully synchronized ${parsedPreview.length} staff records into the live dashboard!` 
      });
      setParsedPreview(null);
    }
  };

  const handleCancelPreview = () => {
    setParsedPreview(null);
    setRecognizedCols([]);
    setParseWarnings([]);
    setStatusMessage(null);
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
          Upload any HR master list, attendance punch sheet, or payroll register (.xlsx, .xls, .csv). Columns and formulas are automatically recognized.
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
            role="status"
            style={{ marginTop: 'var(--space-4)' }}
          >
            {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span>{statusMessage.text}</span>
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
                <button onClick={handleCommitImport} className="btn btn-primary">
                  <CheckCircle size={16} /> Sync into Live Dashboard
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

            <div className="omni-table-wrap" style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
              <table className="omni-table">
                <thead>
                  <tr>
                    <th>Emp ID</th>
                    <th>Full Name</th>
                    <th>Department</th>
                    <th>Role / Designation</th>
                    <th>Location</th>
                    <th>Monthly CTC</th>
                    <th>Attendance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPreview.slice(0, 10).map(p => (
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
            {parsedPreview.length > 10 && (
              <p className="text-dim" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-2)', textAlign: 'right' }}>
                Showing first 10 of {parsedPreview.length} records. All rows will sync into the dashboard.
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
            Download a multi-column Excel spreadsheet containing all {employees.length} employee profiles, reporting managers, PF UANs, and leave balances.
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
    </div>
  );
};
