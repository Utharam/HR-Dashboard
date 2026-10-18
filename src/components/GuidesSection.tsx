import React, { useEffect, useState } from 'react';
import { 
  BookOpen, 
  FileSpreadsheet, 
  Search, 
  Copy, 
  Check, 
  ShieldCheck, 
  CreditCard, 
  Users, 
  Download, 
  Upload, 
  HelpCircle,
  Calculator,
  ArrowRight
} from 'lucide-react';
import type { ActiveTab } from '../types';

interface GuidesSectionProps {
  initialGuide?: 'general' | 'excel';
  onNavigateTab: (tab: ActiveTab) => void;
}

export const GuidesSection: React.FC<GuidesSectionProps> = ({
  initialGuide = 'general',
  onNavigateTab
}) => {
  const [activeGuideTab, setActiveGuideTab] = useState<'general' | 'excel'>(initialGuide);
  const [guideSearch, setGuideSearch] = useState('');
  // An OBJECT, not the bare key. Clicking the same column twice in a row has to restart
  // the two-second countdown; storing just the key would set the same string twice, React
  // would bail out of the re-render, and the first timer would expire mid-interaction and
  // wipe the confirmation.
  const [copied, setCopied] = useState<{ key: string } | null>(null);

  const handleCopy = (text: string, key: string) => {
    // `navigator.clipboard` does not exist on any origin the browser considers insecure -
    // plain http on an intranet, some corporate proxies. `writeText` is then not a rejected
    // promise but a synchronous TypeError thrown out of this handler, which took the whole
    // click with it and left an uncaught error in the console for every user on that origin.
    if (!navigator.clipboard) return;

    // The confirmation is only claimed once the write has actually succeeded. Setting it
    // optimistically told the user their text was on the clipboard when the browser had
    // refused, and they went off to paste something stale.
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied({ key }))
      .catch(() => {
        // Denied by permission policy, or the document lost focus. The column name is on
        // screen either way, so there is nothing to recover and nothing to say.
      });
  };

  // The timer lives in an effect so it is cancelled when the countdown restarts and when
  // the section unmounts. A bare `setTimeout` in the handler survived unmount and could
  // set state on a component that was no longer there.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const q = guideSearch.toLowerCase().trim();

  // Highlight or filter logic
  const matchGeneral = (text: string) => !q || text.toLowerCase().includes(q);

  return (
    <div className="section-stack">
      {/* Top Banner with Guide Switcher */}
      <div className="omni-card callout--docs">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--gap-micro)', flexWrap: 'wrap' }}>
              <span className="badge badge-primary">OmniHR Documentation v1.1.0</span>
              <span className="badge badge-active">Updated & Verified</span>
            </div>
            <h2 className="page-title">
              OmniHR Knowledge Base & Operational Guides
            </h2>
            <p className="page-sub">
              Exhaustive procedural manuals covering corporate human resources operations, statutory Indian payroll compliance, and spreadsheet synchronization.
            </p>
          </div>

          {/* Quick Search */}
          <div style={{ width: '280px' }}>
            <label className="omni-icon-field">
              <Search size={16} />
              <span className="sr-only">Search guides</span>
              <input 
                type="text"
                className="omni-input"
                style={{ background: 'var(--bg-card)' }}
                placeholder="Search guides, formulas, columns..."
                aria-label="Search guides, formulas and columns"
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Tab Selection Bar */}
        <div style={{ display: 'flex', gap: '10px', marginTop: 'var(--space-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
          <button
            type="button"
            onClick={() => setActiveGuideTab('general')}
            aria-pressed={activeGuideTab === 'general'}
            className={`btn ${activeGuideTab === 'general' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', fontSize: 'var(--fs-md)' }}
          >
            <BookOpen size={16} /> 1. General Application Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveGuideTab('excel')}
            aria-pressed={activeGuideTab === 'excel'}
            className={`btn ${activeGuideTab === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', fontSize: 'var(--fs-md)' }}
          >
            <FileSpreadsheet size={16} /> 2. Excel Sheet Handling Guide
          </button>
        </div>
      </div>

      {/* GUIDE 1: GENERAL APP GUIDE */}
      {activeGuideTab === 'general' && (
        <div className="section-stack">
          {/* Quick Summary Cards */}
          <div className="grid grid--panel">
            <div className="omni-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Users size={20} color="var(--primary)" />
                <h4 className="omni-card-title">Master Workforce Management</h4>
              </div>
              <p className="omni-card-sub">
                Multi-location staff registry with live department filtering, employee ID tracking, role hierarchy, and instant search.
              </p>
              <button 
                onClick={() => onNavigateTab('directory')}
                className="btn btn-secondary card-action"
              >
                Go to Directory <ArrowRight size={14} />
              </button>
            </div>

            <div className="omni-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <CreditCard size={20} color="var(--success)" />
                <h4 className="omni-card-title">Indian Statutory Payroll</h4>
              </div>
              <p className="omni-card-sub">
                50% Basic, 25% HRA, 25% Special Allowance, EPF 12% capped at ₹15k, Professional Tax (₹200), and Loss of Pay (LOP) calculations.
              </p>
              <button 
                onClick={() => onNavigateTab('payroll')}
                className="btn btn-secondary card-action"
              >
                Go to Payroll <ArrowRight size={14} />
              </button>
            </div>

            <div className="omni-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <ShieldCheck size={20} color="var(--purple)" />
                <h4 className="omni-card-title">Payment of Gratuity Act 1972</h4>
              </div>
              <p className="omni-card-sub">
                Statutory 15/26 formula with 6-month fraction rounding, 5-year eligibility threshold, and ₹20 Lakh statutory ceiling cap.
              </p>
              <button 
                onClick={() => onNavigateTab('retention')}
                className="btn btn-secondary card-action"
              >
                Go to Gratuity Calculator <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Section 1: Core System Architecture */}
          {matchGeneral('architecture local-first client-side privacy offline react typescript') && (
            <div className="omni-card">
              <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)' }}>
                <HelpCircle size={18} className="text-primary" /> 1. System Architecture & Privacy
              </h3>
              <p className="prose" style={{ marginBottom: 'var(--space-3)' }}>
                OmniHR is built on a <strong>Local-First, Zero-Server-Dependency architecture</strong> using React 19, TypeScript, Chart.js, and SheetJS. 
                All employee records, salary slips, attendance counts, and financial ledgers are evaluated entirely in your browser runtime and persisted in local storage (<code>localStorage.getItem('omnihr_employees')</code>).
              </p>
              <div className="inset-panel tone-success">
                <strong className="text-success-soft">✓ Complete Data Sovereignty:</strong> No employee personal details, phone numbers, or remuneration records leave your machine. The app remains fully functional without an active internet connection.
              </div>
            </div>
          )}

          {/* Section 2: Module-by-Module Walkthrough */}
          {matchGeneral('overview directory attendance payroll performance recruitment retention trends') && (
            <div className="omni-card">
              <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)' }}>
                2. Functional Module Walkthrough
              </h3>

              <div className="grid grid--tile">
                {/* Module 1 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Executive Workforce Overview</strong>
                    <span className="badge badge-primary">Tab: Overview</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Provides C-suite KPI metrics: Total Active Headcount, Monthly Payroll Burn in ₹ Crores, Average CTC, Workforce Attendance Rate %, Annualized Attrition (1.4% vs 3.5% benchmark), and Gender Demographics. Includes interactive Chart.js bar charts for departmental headcount and payroll spend.
                  </p>
                </div>

                {/* Module 2 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Employee Master Directory (200 Profiles)</strong>
                    <span className="badge badge-primary">Tab: Directory</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    A centralized corporate roster of 200 staff across 7 departments and 5 office hubs (Bengaluru, Mumbai, Delhi-NCR, Hyderabad, Remote). Supports real-time text search, department dropdown filtering, fast pagination (25 per page), and an interactive profile drawer with verified payslips and PF UAN records.
                  </p>
                </div>

                {/* Module 3 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Time, Attendance & Leave Quotas</strong>
                    <span className="badge badge-primary">Tab: Attendance</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Operates on a standard <strong>26-day corporate working cycle</strong> (excluding 4 Sundays). Tracks Casual Leave (CL), Sick Leave (SL), and Privilege Leave (EL) quotas. Automatically calculates Loss of Pay (LOP) deductions using the formula: <code>(Basic Salary / 26) * LOP Days</code>.
                  </p>
                </div>

                {/* Module 4 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Payroll & Compensation Engine</strong>
                    <span className="badge badge-primary">Tab: Payroll</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Complies with Indian statutory payroll standards: 50% Basic Salary, 25% HRA, 25% Special Allowance. Computes EPF (12% capped at ₹15,000 basic ceiling = ₹1,800/mo), Professional Tax (₹200/mo), and Net Take-Home Salary. Features one-click printable executive payslips.
                  </p>
                </div>

                {/* Module 5 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Performance & 9-Box Talent Matrix</strong>
                    <span className="badge badge-primary">Tab: Performance</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Categorizes workforce talent into 4 strategic tiers: Future Leaders / Stars (Rating 5.0), High Performers (Rating 4.0), Core Backbone (Rating 3.0), and Performance Improvement Plan PIP (Ratings 1.0 - 2.0). Features bell curve appraisal distribution analysis.
                  </p>
                </div>

                {/* Module 6 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Talent Acquisition & Hiring Pipeline</strong>
                    <span className="badge badge-primary">Tab: Recruitment</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Monitors open corporate requisitions across candidate lifecycle stages (Sourcing, Screening, Interviewing, Offer Extended, Hired). Tracks applicant volumes and average Time-to-Hire (24.5 days benchmark).
                  </p>
                </div>

                {/* Module 7 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Statutory EOSB & Gratuity Calculator</strong>
                    <span className="badge badge-primary">Tab: Retention</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Full legal compliance with the <strong>Payment of Gratuity Act 1972</strong>. Applies service fraction rounding (&ge; 6 months rounds up to the next full year), 5-year continuous service eligibility, and the statutory ₹20 Lakhs ceiling. Differentiates Voluntary Resignation from Involuntary Retrenchment under Section 25F of the Industrial Disputes Act.
                  </p>
                </div>

                {/* Module 8 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>33-Month Financial & Headcount Analytics</strong>
                    <span className="badge badge-primary">Tab: Trends</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Historical trends from January 2024 to September 2026. Features a dual-axis line chart comparing consolidated payroll spend (₹ Crores) with headcount growth, plus a monthly ledger of hires, exits, and attrition rates.
                  </p>
                </div>

                {/* Module 9 */}
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="text-bright" style={{ fontSize: 'var(--fs-base)' }}>Corporate HR Policy & Benefits Hub</strong>
                    <span className="badge badge-primary">Tab: HR Policy Hub</span>
                  </div>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Configure enterprise policies: 182-day Maternity Benefit (with newborn hampers and nursing breaks), 15-day Paternity Leave, Casual Leave (12d), Sick Leave (12d), Privilege Leave (15d), 60-day Notice Periods, Sabbaticals (up to 1 year), Marriage benefits, and Custom Rules creation with selectable gift presets.
                  </p>
                  <button 
                    onClick={() => onNavigateTab('policies')}
                    className="btn btn-secondary btn-sm" 
                    style={{ marginTop: 'var(--space-2)' }}
                  >
                    Open HR Policy Hub <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Statutory Compliances Table */}
          {matchGeneral('statutory legal epf gratuity ceiling formula retrenchment') && (
            <div className="omni-card">
              <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)' }}>
                <Calculator size={18} color="var(--warning)" /> 3. Indian Statutory & Legal Formulation Reference
              </h3>

              <div className="omni-table-wrap">
                <table className="omni-table">
                  <thead>
                    <tr>
                      <th>Statute / Rule</th>
                      <th>Legal Ceiling / Threshold</th>
                      <th>OmniHR Mathematical Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Employees' Provident Fund (EPF)</strong></td>
                      <td>₹15,000 monthly basic ceiling</td>
                      <td><code>Math.min(Basic, 15000) * 0.12</code> (= max ₹1,800/mo)</td>
                    </tr>
                    <tr>
                      <td><strong>Payment of Gratuity Act 1972</strong></td>
                      <td>₹20,00,000 (20 Lakhs) statutory cap</td>
                      <td><code>min(2000000, (15 * Basic * RoundedTenure) / 26)</code></td>
                    </tr>
                    <tr>
                      <td><strong>Gratuity Tenure Rounding</strong></td>
                      <td>Fraction &ge; 6 months (0.5 yrs)</td>
                      <td><code>fraction &ge; 0.5 ? ceil(tenure) : floor(tenure)</code></td>
                    </tr>
                    <tr>
                      <td><strong>Gratuity Eligibility</strong></td>
                      <td>Minimum 5 completed continuous years</td>
                      <td><code>tenure &lt; 5 ? ₹0 (Not eligible) : Gratuity Payable</code></td>
                    </tr>
                    <tr>
                      <td><strong>Section 25F Industrial Disputes Act</strong></td>
                      <td>Retrenchment / Layoff in lieu</td>
                      <td><code>1 Month Notice Basic + (15 * Basic * Tenure / 30)</code></td>
                    </tr>
                    <tr>
                      <td><strong>Loss of Pay (LOP)</strong></td>
                      <td>26-day working cycle deduction</td>
                      <td><code>(Basic / 26) * LOP Days</code></td>
                    </tr>
                    <tr>
                      <td><strong>Privilege Leave Encashment</strong></td>
                      <td>Maximum 30 accumulated days</td>
                      <td><code>(Basic / 30) * min(Unused Leaves, 30)</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 4: Operational Workflows */}
          {matchGeneral('workflows add employee print payslip export reset') && (
            <div className="omni-card">
              <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)' }}>
                4. Common Administrative Workflows
              </h3>

              <div className="grid grid--wide">
                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <strong className="text-primary-soft">• Adding a New Staff Member:</strong>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Click <strong>+ Add Staff</strong> in the header. Enter full name, department, role, location, DOJ, and monthly gross CTC. The system derives basic, HRA, and leaves automatically.
                  </p>
                </div>

                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <strong className="text-success-soft">• Inspecting & Printing Payslips:</strong>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    In the Directory or Payroll tab, click <strong>View</strong> or <strong>Slip</strong> on any employee. In the modal, click <strong>Print Payslip</strong> to generate a clean PDF with headers/footers suppressed.
                  </p>
                </div>

                <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                  <strong className="text-warning-soft">• Restoring Factory Demo Data:</strong>
                  <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                    Click <strong>Reset Demo State</strong> at the bottom of the sidebar. This clears your local browser storage and resets the roster back to the original 200 corporate staff records.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GUIDE 2: EXCEL SHEET HANDLING GUIDE */}
      {activeGuideTab === 'excel' && (
        <div className="section-stack">
          {/* Quick Actions Hub */}
          <div className="omni-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h4 className="omni-card-title">Bi-Directional Spreadsheet Ingestion Engine</h4>
              <p className="omni-card-sub">
                Powered by SheetJS. Compatible with Workday, SAP SuccessFactors, BambooHR, Darwinbox, Zoho People, and custom spreadsheets (.xlsx, .xls, .csv).
              </p>
            </div>
            <button 
              onClick={() => onNavigateTab('excel')} 
              className="btn btn-primary"
            >
              <Upload size={15} /> Open Excel Data Hub
            </button>
          </div>

          {/* Section 1: Ingestion & Column Mapping Matrix */}
          <div className="omni-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div>
                <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)' }}>
                  1. Master Column Mapping Reference Matrix
                </h3>
                <p className="omni-card-sub">
                  OmniHR flexibly maps incoming column headers. Click any column name below to copy it to your clipboard.
                </p>
              </div>
            </div>

            <div className="omni-table-wrap">
              <table className="omni-table">
                <thead>
                  <tr>
                    <th>Target OmniHR Field</th>
                    <th>Accepted Excel Column Headers (Aliases)</th>
                    <th>Data Type</th>
                    <th>Default Fallback Value</th>
                    <th>Quick Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { field: 'Employee ID', aliases: 'Employee ID, Emp ID, EmployeeID, id, ID, Staff ID', type: 'String', def: 'EMP-1201 + index', copy: 'Employee ID' },
                    { field: 'Full Name', aliases: 'Full Name, Employee Name, Name, name, Employee, Staff Name', type: 'String', def: 'Staff Member {idx}', copy: 'Full Name' },
                    { field: 'Department', aliases: 'Department, department, Dept, Dept Name, Division', type: 'String', def: 'Engineering & Technology', copy: 'Department' },
                    { field: 'Designation / Role', aliases: 'Designation / Role, Designation, Role, role, Title, Job Title', type: 'String', def: 'Software Engineer', copy: 'Designation / Role' },
                    { field: 'Office Location', aliases: 'Office Location, Location, location, Branch, City, Office', type: 'String', def: 'Bengaluru HQ', copy: 'Office Location' },
                    { field: 'Date of Joining', aliases: 'DOJ, Date of Joining, Joining Date, Hire Date, doj', type: 'Date / Serial / Str', def: '2023-01-15', copy: 'Date of Joining' },
                    { field: 'Monthly CTC', aliases: 'Monthly CTC, MonthlyCTC, Monthly Gross CTC, CTC, salary', type: 'Number (INR)', def: 'Annual / 12 or ₹1,20,000', copy: 'Monthly CTC' },
                    { field: 'Annual CTC', aliases: 'Annual CTC (INR), Annual CTC, AnnualCTC, Yearly CTC', type: 'Number (INR)', def: 'Monthly CTC * 12', copy: 'Annual CTC (INR)' },
                    { field: 'Basic Salary', aliases: 'Monthly Basic Salary, Basic Salary, BasicSalary, Basic', type: 'Number (INR)', def: '50% of Monthly CTC', copy: 'Basic Salary' },
                    { field: 'HRA', aliases: 'HRA, House Rent Allowance, hra', type: 'Number (INR)', def: '50% of Basic (25% CTC)', copy: 'HRA' },
                    { field: 'Special Allowance', aliases: 'Special Allowance, SpecialAllowance', type: 'Number (INR)', def: 'CTC - (Basic + HRA)', copy: 'Special Allowance' },
                    { field: 'Status', aliases: 'Status, status, Employment Status', type: 'Active | Probation | Notice | Resigned | Unknown', def: 'Unknown (if unmapped)', copy: 'Status' },
                    { field: 'Gender', aliases: 'Gender, gender, Sex', type: 'Female | Male | Non-Binary | Prefer Not to Say | Unknown', def: 'Unknown (if unmapped)', copy: 'Gender' },
                    { field: 'Performance Rating', aliases: 'Performance Rating, Rating, performanceRating', type: 'Number (1 - 5)', def: '4 (Exceeds Exp.)', copy: 'Performance Rating' },
                    { field: 'Attendance Days', aliases: 'Attendance (Days Present), Attendance Days, PresentDays', type: 'Number (0 - 26)', def: '25 Days', copy: 'Attendance (Days Present)' },
                    { field: 'Leave Balances', aliases: 'CL Balance, SL Balance, EL Balance, LOP Days', type: 'Number', def: 'CL: 8, SL: 8, EL: 12, LOP: derived', copy: 'CL Balance' },
                    { field: 'Work Email', aliases: 'Work Email, Work email, Email, email', type: 'String', def: '{name}@omnixhr.io', copy: 'Work Email' },
                    { field: 'Phone Number', aliases: 'Phone, Phone Number, Mobile, Contact', type: 'String', def: '+91 9876543210', copy: 'Phone' },
                    { field: 'PF UAN', aliases: 'PF UAN, UAN, UAN Number, uan', type: 'String (12 digits)', def: '100123456789', copy: 'PF UAN' }
                  ].map((row) => (
                    <tr key={row.field}>
                      <td><strong className="text-bright">{row.field}</strong></td>
                      <td className="cell-muted text-mono">{row.aliases}</td>
                      <td><span className="badge badge-primary">{row.type}</span></td>
                      <td className="cell-dim">{row.def}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleCopy(row.copy, row.field)}
                          className="btn btn-secondary btn-sm"
                        >
                          {copied?.key === row.field ? <Check size={12} className="text-success-soft" /> : <Copy size={12} />}
                          {copied?.key === row.field ? 'Copied' : 'Copy'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Step-by-Step Spreadsheet Sync Workflow */}
          <div className="omni-card">
            <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)' }}>
              2. Step-by-Step Spreadsheet Ingestion Guide
            </h3>

            <div className="grid grid--tile">
              <div className="inset-panel" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-2)' }}>
                  <div className="step-badge">1</div>
                  <strong className="text-bright">Prepare Spreadsheet</strong>
                </div>
                <p className="prose">
                  Place column headers in Row 1. Remove summary or total footer rows. Save as <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code>.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-2)' }}>
                  <div className="step-badge">2</div>
                  <strong className="text-bright">Upload to Excel Hub</strong>
                </div>
                <p className="prose">
                  Navigate to the Excel Data Hub. Drag and drop your file into the dashed ingestion zone, or click to browse files.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-2)' }}>
                  <div className="step-badge">3</div>
                  <strong className="text-bright">Inspect Preview & Warnings</strong>
                </div>
                <p className="prose">
                  Verify that the recognized column tags appear. Inspect the live table preview of mapped staff records and ensure salaries match.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-2)' }}>
                  <div className="step-badge">4</div>
                  <strong className="text-bright">Sync into Dashboard</strong>
                </div>
                <p className="prose">
                  Click <strong>Sync into Live Dashboard</strong>. Your records update in <code>localStorage</code> and directory, charts, and payslips immediately update.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Technical Details on Date Normalization & Salary Math */}
          <div className="omni-card">
            <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)' }}>
              3. Technical Normalization Rules
            </h3>

            <div className="grid grid--panel">
              <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                <strong className="text-info-soft">• Excel Serial Date Conversion:</strong>
                <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                  Excel serial numbers (e.g. <code>44927</code>) are automatically parsed via SheetJS's <code>XLSX.SSF.parse_date_code()</code> into canonical <code>YYYY-MM-DD</code>. Formats like <code>15/03/2021</code>, <code>15-03-2021</code>, and JS <code>Date</code> objects are parsed seamlessly.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                <strong className="text-success-soft">• Automatic Salary Component Derivation:</strong>
                <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                  If your spreadsheet only includes a single salary column (e.g. <strong>Monthly CTC</strong> or <strong>Annual CTC</strong>), OmniHR computes:
                  <br />• <strong>Basic</strong> = 50% of CTC
                  <br />• <strong>HRA</strong> = 25% of CTC (50% of Basic)
                  <br />• <strong>Special Allowance</strong> = CTC - (Basic + HRA)
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                <strong className="text-warning-soft">• Attendance & LOP Deduction Math:</strong>
                <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                  If <strong>Attendance Days</strong> is provided (e.g. 24 out of 26 days), <strong>Loss of Pay (LOP)</strong> days is calculated as <code>max(0, 26 - Present - 1)</code>. The wage cut is calculated as <code>(Basic / 26) * LOP Days</code>.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-3)' }}>
                <strong className="text-purple-soft">• Status & Gender Normalization:</strong>
                <p className="prose" style={{ marginTop: 'var(--gap-micro)' }}>
                  Text values like "active", "probation", "notice", "exit", "resigned" are mapped to the matching enum state; "active" is matched exactly, so "inactive" is not read as "Active". Gender values ("F", "Female", "M", "Male", "Non-Binary", "Other") are mapped too, and a declined answer ("prefer not to say") is kept as "Prefer Not to Say". Anything else is recorded as <strong>Unknown</strong> rather than guessed: an unmapped Status no longer becomes "Active" (which would put the person in the payroll run), and an unmapped Gender no longer becomes "Female" (which would skew the diversity ratio). Unknown-status staff are excluded from the payroll run and their badge is neutral.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Export Options */}
          <div className="omni-card">
            <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-3)' }}>
              4. Exporting Formats & Bank Registers
            </h3>

            <div className="grid grid--wide">
              <div className="inset-panel" style={{ padding: 'var(--space-3)', background: 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--gap-micro)' }} className="text-primary-soft">
                  <Download size={16} /> <strong>Staff Master Roster (.xlsx)</strong>
                </div>
                <p className="prose">
                  Multi-column complete workbook containing all 21 employee attributes, reporting managers, PF UANs, and contact emails.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-3)', background: 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--gap-micro)' }} className="text-success-soft">
                  <Download size={16} /> <strong>Monthly Payroll Advice (.xlsx)</strong>
                </div>
                <p className="prose">
                  Bank-ready payroll register spreadsheet with employee accounts, Basic, HRA, Special Allowance, EPF, PT, LOP, and Disbursable Net.
                </p>
              </div>

              <div className="inset-panel" style={{ padding: 'var(--space-3)', background: 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--gap-micro)' }} className="text-warning-soft">
                  <Download size={16} /> <strong>Standard Template (.xlsx)</strong>
                </div>
                <p className="prose">
                  Pre-formatted blank spreadsheet containing sample employee rows and recognized column headers for error-free bulk onboarding.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
