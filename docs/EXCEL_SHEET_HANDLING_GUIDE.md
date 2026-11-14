# OmniHR — Excel Sheet Handling & Spreadsheet Synchronization Guide
# Technical & Operational Reference Manual (v1.1.0)

This guide provides complete technical documentation and best practices for importing, mapping, validating, and exporting spreadsheets in the **OmniHR Enterprise Workforce Suite**.

Whether you are migrating from an enterprise HRMS (Workday, SAP SuccessFactors, BambooHR, Darwinbox, Zoho People) or maintaining custom payroll workbooks, OmniHR's **SheetJS** ingestion engine provides flexible, error-resilient column mapping and instant synchronization.

---

## Table of Contents

1. [Overview & Supported Formats](#1-overview--supported-formats)
2. [Master Column Mapping Reference Matrix](#2-master-column-mapping-reference-matrix)
3. [Salary & Statutory Component Derivation](#3-salary--statutory-component-derivation)
4. [Date Parsing & Technical Normalization](#4-date-parsing--technical-normalization)
5. [Attendance & Leave Calculation Rules](#5-attendance--leave-calculation-rules)
6. [Step-by-Step Spreadsheet Ingestion Workflow](#6-step-by-step-spreadsheet-ingestion-workflow)
7. [Export Formats & Bank-Ready Registers](#7-export-formats--bank-ready-registers)
8. [Data Validation, Edge Cases & Sanitization](#8-data-validation-edge-cases--sanitization)
9. [Third-Party HRMS Compatibility Profiles](#9-third-party-hrms-compatibility-profiles)
10. [Troubleshooting & Common Ingestion Errors](#10-troubleshooting--common-ingestion-errors)

---

## 1. Overview & Supported Formats

OmniHR provides bi-directional spreadsheet compatibility powered by **SheetJS (`xlsx`)**:

- **Supported File Extensions:**
  - `.xlsx` — Microsoft Excel OpenXML Spreadsheet (2007+)
  - `.xls` — Microsoft Excel 97-2004 Binary Format
  - `.csv` — Comma Separated Values
- **Sheet Detection:**
  - OmniHR automatically selects and parses the **first sheet** (`wb.SheetNames[0]`) in the uploaded workbook.
  - Cell formatting and dates are parsed with `{ cellDates: true }`.
- **Client-Side Privacy:**
  - The spreadsheet buffer is processed entirely in the user's browser memory (`ArrayBuffer`).
  - No spreadsheet files or employee salaries are ever transmitted across the network.

---

## 2. Master Column Mapping Reference Matrix

OmniHR uses a **flexible column alias engine** that dynamically matches spreadsheet headers regardless of naming variations, capitalization, or extra spacing.

| Target OmniHR Field | Accepted Column Headers / Aliases in Excel | Data Type | Default Fallback Value | Notes & Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Employee ID** | `Employee ID`, `Emp ID`, `EmployeeID`, `id`, `ID`, `Staff ID` | String | `EMP-1201 + row_index` | Unique identifier. Whitespace trimmed. |
| **Full Name** | `Full Name`, `Employee Name`, `Name`, `name`, `Employee`, `Staff Name` | String | `Staff Member {row}` | Used across directory and payslip headers. |
| **Department** | `Department`, `department`, `Dept`, `Dept Name`, `Division` | String | `Engineering & Technology` | Used for departmental grouping and charts. |
| **Designation / Role** | `Designation / Role`, `Designation`, `Role`, `role`, `Title`, `Job Title`, `Position` | String | `Software Engineer` | Job title displayed on profile cards. |
| **Office Location** | `Office Location`, `Location`, `location`, `Branch`, `City`, `Office` | String | `Bengaluru HQ` | Regional hub (Bengaluru, Mumbai, Delhi, etc.). |
| **Date of Joining** | `DOJ`, `Date of Joining`, `Joining Date`, `Hire Date`, `doj` | Date / String / Serial | Blank (with a warning) | Normalized to `YYYY-MM-DD`. Supports Excel serial numbers. An unreadable value is left blank rather than invented. |
| **Monthly CTC** | `Monthly CTC`, `MonthlyCTC`, `Monthly Gross CTC`, `CTC`, `salary`, `Gross Salary` | Number | Derived from Annual CTC or `120000` | Fixed gross monthly cost-to-company in INR. |
| **Annual CTC** | `Annual CTC (INR)`, `Annual CTC`, `AnnualCTC`, `Yearly CTC`, `package`, `Annual Salary` | Number | `Monthly CTC * 12` | If Monthly CTC is omitted, `Annual CTC / 12` is used. `Annual Salary` is the BambooHR report header. |
| **Basic Salary** | `Monthly Basic Salary`, `Basic Salary`, `BasicSalary`, `Basic`, `basic` | Number | `Monthly CTC * 0.50` | 50% of CTC under standard wage norms. |
| **HRA** | `HRA`, `House Rent Allowance`, `hra` | Number | `Basic Salary * 0.50` | Standard 25% of CTC (50% of Basic). |
| **Special Allowance** | `Special Allowance`, `SpecialAllowance`, `specialAllowance` | Number | `Monthly CTC - (Basic + HRA)` | Balancing executive allowance. |
| **Employment Status** | `Status`, `status`, `Employment Status` | String | `Unknown` | Normalized to: `Active`, `Probation`, `Notice Period`, `Resigned`, `Unknown`. |
| **Gender** | `Gender`, `gender`, `Sex` | String | `Unknown` | Normalized to: `Female`, `Male`, `Non-Binary`, `Prefer Not to Say`, `Unknown`. |
| **Performance Rating** | `Performance Rating`, `Rating`, `performanceRating`, `Score` | Number (1–5) | `4` (Exceeds Expectations) | Clamped to integer between 1 and 5. |
| **Attendance Days** | `Attendance (Days Present)`, `Attendance Days`, `Present Days`, `PresentDays`, `presentDays`, `Attendance` | Number (0–26) | `25` | Days present in standard 26-day business cycle. |
| **Casual Leave (CL)** | `CL Balance`, `Casual Leave Balance`, `clBalance` | Number | `8` | Annual remaining casual leave balance. |
| **Sick Leave (SL)** | `SL Balance`, `Sick Leave Balance`, `slBalance` | Number | `8` | Annual remaining sick leave balance. |
| **Privilege Leave (EL)**| `EL Balance`, `Earned Leave Balance`, `Privilege Leave Balance`, `elBalance` | Number | `12` | Accumulated privilege leave balance for encashment. |
| **Loss of Pay (LOP)** | `LOP Days`, `Loss of Pay Days`, `lopDays` | Number | Derived: `max(0, 26 - Present - 1)` | Unpaid absence days triggering wage cuts. |
| **Work Email** | `Work Email`, `Work email`, `Email`, `email` | String | `{name}@omnixhr.io` | Corporate work email. |
| **Phone Number** | `Phone`, `Phone Number`, `Mobile`, `Contact` | String | `+91 9876543210` | Contact phone number. |
| **PF UAN** | `PF UAN`, `UAN`, `UAN Number`, `uan` | String | `100123456789` | 12-digit EPFO Universal Account Number. |

---

## 3. Salary & Statutory Component Derivation

When ingesting spreadsheets where only the high-level **Monthly CTC** (or **Annual CTC**) is provided, OmniHR automatically derives the entire statutory breakdown:

$$\begin{aligned}
\text{Monthly CTC} &= \begin{cases} 
\text{Monthly CTC Column}, & \text{if present} \\
\frac{\text{Annual CTC Column}}{12}, & \text{if Annual CTC is provided} \\
1,20,000, & \text{otherwise}
\end{cases} \\
\text{Basic Salary} &= \text{Basic Column} \quad \text{or} \quad \text{round}(\text{Monthly CTC} \times 50\%) \\
\text{House Rent Allowance (HRA)} &= \text{HRA Column} \quad \text{or} \quad \text{round}(\text{Basic Salary} \times 50\%) \\
\text{Special Allowance} &= \text{Special Allowance Column} \quad \text{or} \quad \max(0, \text{Monthly CTC} - (\text{Basic} + \text{HRA}))
\end{aligned}$$

### Statutory Deductions Derived on Ingestion:
1. **Employees' Provident Fund (EPF):**
   $$\text{EPF} = \text{round}(\min(\text{Basic Salary}, 15000) \times 12\%) \quad (\text{Max ₹1,800/mo})$$
2. **Professional Tax (PT):**
   $$\text{PT} = ₹200/\text{month (standard corporate slab)}$$
3. **Loss of Pay (LOP) Wage Deduction:**
   $$\text{LOP Deduction} = \text{round}\left(\frac{\text{Basic Salary}}{26}\right) \times \text{LOP Days}$$
4. **Net Disbursable Salary:**
   $$\text{Net Pay} = \text{Monthly CTC} - (\text{EPF} + \text{PT} + \text{LOP Deduction})$$

---

## 4. Date Parsing & Technical Normalization

Spreadsheets originate from diverse operating systems (Windows, macOS, Linux) and represent dates inconsistently. OmniHR's date parser handles all variations:

### 1. Excel Serial Date Codes (e.g. `44927`)
- In Excel, dates are stored as floating point numbers representing elapsed days since `1899-12-30`.
- OmniHR parses these using `XLSX.SSF.parse_date_code(val)` to extract `{ y, m, d }` and returns formatted strings like `2023-01-01`.

### 2. ISO Standard Strings (`YYYY-MM-DD`)
- Standard formats like `2022-06-15` are detected and preserved without timezone shifting.

### 3. Regional Slash / Dash Strings (`DD/MM/YYYY` or `DD-MM-YYYY`)
- Dates formatted as `15/03/2021` or `15-03-2021` are parsed into canonical `2021-03-15`.

### 4. JavaScript `Date` Objects
- When `{ cellDates: true }` converts cells into native `Date` objects, OmniHR formats them safely via `.toISOString().slice(0, 10)`.

---

## 5. Attendance & Leave Calculation Rules

- **Legacy monthly columns:** the ingested `Attendance Days` / `LOP Days` columns are monthly totals, and the stored `Attendance Days` figure is evaluated against the fixed **26-day payroll baseline** (`presentDays / 26`), the same constant used to price LOP wages. This is a legacy baseline for rosters without a daily ledger, **not** a claim about any real month.
- **Attendance Percentage Calculation (legacy column):**
  $$\text{Attendance Rate \%} = \text{round}\left(\left(\frac{\text{Present Days}}{26}\right) \times 100, 1\right)$$
- **LOP Days Ingestion Logic:**
  - If the spreadsheet contains an explicit `LOP Days` column, that value is honored.
  - If `LOP Days` is omitted, OmniHR calculates it as:
    $$\text{LOP Days} = \max(0, 26 - \text{Present Days} - 1)$$
    *(Assuming 1 authorized approved leave day).*
  - The **LOP wage deduction itself always uses the statutory 26-day denominator**, `(Basic / 26) × LOP Days`, as company/statutory policy — regardless of how many working days the month actually has.

### 5.1 Daily attendance rollup (monthly matrix)

Once a month has daily attendance records (see the matrix in §7), the monthly figures are **derived** from the ledger instead of the ingested `presentDays`/`LOP Days` columns:

- **Present days** = `P` + `W` + 0.5×`HD`. A half-day with a leave type counts 0.5 present + 0.5 leave; without one, 0.5 present + 0.5 unmarked (no LOP).
- **Leave days** are counted by type (`CL`, `SL`, `EL`, `LOP`, `ML`, `PL`, `CO`, `O`); balances are not deducted automatically.
- **LOP days** = `A` absences + `LOP` leave days. Half-days without a leave type do not create LOP.
- **Working days** = days in month − Sundays − holidays (from the company holiday calendar).
- **Attendance % = present ÷ working days** of the month in view — the real calendar month, not a fixed 26-day cycle.
- **Sundays and holidays are derived**, never stored: the matrix displays `WO`/`H` and both the template and the importer ignore those cells.
- **Payroll/overview fallback:** for the current month, payroll and the overview use the daily rollup only for employees who have at least one record that month; everyone else keeps the legacy `presentDays`/`lopDays` values from the register. Months without daily records (including prior months) keep the legacy values everywhere. The LOP wage deduction keeps the statutory `(Basic / 26)` denominator in both paths.

---

## 6. Step-by-Step Spreadsheet Ingestion Workflow

```mermaid
flowchart TD
    A["Prepare Spreadsheet (.xlsx, .xls, .csv)"] --> B["Navigate to the Admin page (Excel Hub card)"]
    B --> C["Drag & Drop or Click to Select File"]
    C --> D["SheetJS Parses First Sheet into Memory"]
    D --> E["Column Alias Mapping & Type Coercion"]
    E --> F["Pre-Sync Live Preview & Warning Checks"]
    F --> G["Click 'Sync into Live Dashboard'"]
    G --> H["Data Store (IndexedDB) Updated & View Shifts to Directory"]
```

### Step 1: Prepare Your Spreadsheet
- Ensure column headers occupy the **first row** (Row 1).
- Remove trailing summary total rows (e.g., "Grand Total") or filter rows before uploading.
- Tip: Download the **Standard Template** from OmniHR to review an ideal pre-formatted structure.

### Step 2: Upload Workbook
- Navigate to the **Admin** page in the sidebar (or click the **Admin** header button) and locate the **Excel Hub** card.
- Drag your spreadsheet file into the upload dropzone, or click the dropzone to browse your local filesystem.

### Step 3: Review Pre-Sync Preview
- OmniHR immediately parses the file and presents:
  - **Success Alert:** Shows the total count of parsed employee records, file name, and worksheet name.
  - **Recognized Columns Badges:** Highlights which columns were detected (e.g., `Employee ID`, `Name`, `Monthly CTC`, `Basic Salary`, `Department`).
  - **Data Warnings:** Flags any missing salaries that defaulted to baseline figures.
  - **Live Table Preview:** Displays the first 8 records with formatted currency and IDs.

### Step 4: Commit Synchronization
- Click the **Sync into Live Dashboard** button.
- OmniHR commits the new staff roster into the app's data store (IndexedDB; `localStorage` is the fallback) and automatically shifts your view to the **Employee Directory**, where all metrics, charts, and payslips immediately reflect your imported data.

---

## 7. Export Formats & Bank-Ready Registers

OmniHR provides four standardized Excel export capabilities:

### 1. Complete Staff Master Roster (`OmniHR_Staff_Roster_YYYY-MM-DD.xlsx`)
- **Use Case:** Comprehensive backup, annual HR audit, insurance enrollment.
- **Includes 24 Columns:**
  `Employee ID`, `Full Name`, `Work Email`, `Phone`, `Department`, `Department ID`, `Designation / Role`, `Office Location`, `Date of Joining`, `Monthly CTC`, `Annual CTC (INR)`, `Monthly Basic Salary`, `HRA`, `Special Allowance`, `Status`, `Gender`, `Performance Rating`, `Reports To`, `Attendance (Days Present)`, `CL Balance`, `SL Balance`, `EL Balance`, `LOP Days`, `PF UAN`.
- **Round-trip safe:** the file is the same contract the importer reads. `Department ID` and `Reports To` are written explicitly, and `Date of Joining` is a native Excel date cell (number-formatted `yyyy-mm-dd`), so it can be sorted, filtered and used with `DATEDIF`. Re-importing the roster reproduces the register it was exported from.

### 2. Monthly Payroll Register (`OmniHR_Payroll_Register_YYYY-MM-DD.xlsx`)
- **Use Case:** Direct bank salary transfer advice, CFO approval, statutory compliance filing.
- **Includes 14 Columns:**
  `Employee ID`, `Employee Name`, `Department`, `Designation`, `Location`, `Monthly Gross CTC`, `Basic (50%)`, `HRA (25%)`, `Special Allowance (25%)`, `EPF (12% @ ₹15k cap)`, `Professional Tax`, `Loss of Pay (LOP)`, `Total Deductions`, `Net Salary Payable`.

### 3. Pre-Formatted Blank Template (`OmniHR_Employee_Template.xlsx`)
- **Use Case:** Distribution to departmental heads or branch managers for new employee data collection.
- **Contains:** Clean header rows pre-populated with 2 sample employee profiles demonstrating ideal data types.

### 4. Monthly Attendance Matrix (`omnihr-attendance-YYYY-MM.xlsx`)
- **Use Case:** Collecting daily attendance from HR or department leads, and correcting an existing month.
- **Where:** Attendance tab toolbar → **Download template** (optionally with "prefill working days as Present").
- **Sheets:**
  - `Attendance` — `A1` title, `A2` `Month` / `B2` `YYYY-MM`, `A3` `Generated` / `B3` timestamp, header row 5 (`Employee ID`, `Employee Name`, `Department`, then day numbers `1`..`N`), and one row per employee in roster order.
  - `Legend` — status code → meaning.
- **Cell codes:** `P` Present, `A` Absent, `W` WFH, `HD` Half-day, `HD-CL`/`HD-SL`/`HD-EL`/`HD-LOP`/`HD-ML`/`HD-PL`/`HD-CO`/`HD-O` half-day with a leave type, `CL`/`SL`/`EL`/`LOP`/`ML`/`PL`/`CO`/`O` typed leave, `H` holiday, `WO` Sunday, blank unmarked. Sundays are pre-filled `WO`, holidays from the company calendar `H`, existing records for the month are carried into the template as their own codes, approved leave plans are pre-filled with their code (approved half-day leave as `HD-<code>`), and other working days `P` when prefill-present is on.
- **Round-trip safe:** a generated template parsed back produces exactly the intended records; `H`/`WO`/blank cells never become records.
- **Import & replace-month semantics:** upload on the Attendance tab (`.xlsx`/`.xls` only). The month is read from `B2`, rows are matched by `Employee ID` (name/department columns are ignored), and the preview reports employees matched, records to create, existing records to replace, per-cell issues, and roster gaps (employee IDs not found on the sheet and day columns missing from the header). **Confirmation replaces the whole month's records** — every record dated in that month is removed and the parsed rows take their place — and never touches other months. Unknown employee IDs, invalid codes and day numbers outside the month become preview issues rather than silent skips. A failed import leaves the previous month untouched.

---

## 8. Data Validation, Edge Cases & Sanitization

| Edge Case Scenario | OmniHR Ingestion Handling |
| :--- | :--- |
| **Duplicate Employee IDs** | Resolved at import: **Append** skips rows whose Staff ID is already in the register or repeats within the file; **Replace** keeps the first row per ID and skips later repeats. The confirmation reports how many rows were skipped. |
| **Missing Employee ID** | Generates an auto-incremented ID formatted as `EMP-1201`, `EMP-1202`, etc. |
| **Missing Employee Name** | Assigns `Staff Member {row_number}` to prevent null reference exceptions. |
| **Missing Salary Values** | Default monthly CTC of `₹1,20,000` is assigned, and a warning is surfaced in the preview. |
| **Annual CTC provided instead of Monthly** | Automatically divides by 12 and rounds to nearest whole rupee. |
| **Case Mismatches (e.g. "active", "PROBATION")** | Normalized via case-insensitive matching to canonical enum values. |
| **Attendance Days > 26** | Clamped to maximum 26 business days. |
| **Performance Rating > 5 or < 1** | Clamped to the valid integer range between 1 and 5. |
| **Special Characters in Email/Phone** | Names are sanitized (`siddharth.verma@omnixhr.io`), whitespace stripped. |
| **Unknown Employee ID in the attendance matrix** | Becomes a preview issue; the row is not imported and the existing month is untouched until the preview is confirmed. |
| **Invalid status code in the attendance matrix** | Becomes a preview issue naming the row and cell; only valid codes (`P`, `A`, `W`, `HD`, `HD-<leave code>`, typed leave codes) are stored. |
| **Duplicate dates or duplicate attendance ids** | Refused by the store as a whole, so an import that could produce them collapses repeats by `employee|date` at the boundary instead. |
| **Holiday dates** | Company-wide and unique by date; the matrix and the rollup treat a holiday like a derived `H` day, and no attendance record is stored for it. |

---

## 9. Third-Party HRMS Compatibility Profiles

OmniHR has been verified with export formats from popular HRIS tools:

- **Workday:** Export report `Worker_Demographics_and_Compensation.xlsx` maps directly via `Employee ID`, `Employee Name`, `Position`, and `Monthly CTC`.
- **SAP SuccessFactors:** Standard User Directory export matches via `User ID` (`ID`), `First Name + Last Name` (`Name`), `Department`, and `Job Title` (`Role`).
- **BambooHR:** Employee custom report `.csv` maps via `Work Email`, `Hire Date` (`DOJ`), and `Annual Salary` (`Annual CTC`).
- **Darwinbox / Zoho People:** Attendance punch registers map directly through `Present Days` and `LOP Days`.

---

## 10. Troubleshooting & Common Ingestion Errors

### Error: "Spreadsheet contains no data rows"
- **Cause:** The first sheet of the workbook contains only empty rows or title banners without structured data.
- **Resolution:** Open the spreadsheet, ensure the first sheet contains column headers on Row 1, and re-save as `.xlsx`.

### Error: "Failed to parse Excel file: Unsupported file format"
- **Cause:** The file has an `.xlsx` extension but contains raw HTML or corrupted binary data.
- **Resolution:** Open the file in Microsoft Excel or Google Sheets, select **Save As -> Excel Workbook (.xlsx)**, and upload the newly saved file.

### Error: "Missing month or missing header row" (attendance matrix)
- **Cause:** The workbook is not an OmniHR attendance matrix — `B2` does not hold a `YYYY-MM` month, or the header row does not carry `Employee ID` and the day numbers.
- **Resolution:** Download a fresh template for the month from the Attendance tab, paste your marks into it, and upload that file.

### Question: "Can I import one month of attendance without touching the others?"
- **Answer:** Yes. The matrix carries its month in `B2`, and a confirmed import replaces only that month's records. Other months — and every other dataset — are untouched.

### Question: "How do I revert to the original 200 employee demo state?"
- **Answer:** Click the **Reset Demo State** button in the lower left of the sidebar. This restores the factory initial dataset (employees, policies, leave plans, planner settings, the current-month demo attendance ledger and the 2026 holiday calendar) through the app's data store, replacing what this browser holds.
