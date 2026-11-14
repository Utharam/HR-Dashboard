# OmniHR — Enterprise Workforce & HR Management Suite
# General Application Guide & Operational Manual (v1.1.0)

Welcome to the **OmniHR Enterprise Workforce & HR Intelligence Suite**. OmniHR is a high-performance, general-purpose enterprise human resources dashboard and workforce analytics platform engineered with **React 19, TypeScript, Chart.js, SheetJS, and Tailwind-inspired custom CSS design tokens**.

This manual provides an exhaustive operational reference for HR administrators, People Ops leaders, Payroll managers, and C-suite executives utilizing OmniHR.

---

## Table of Contents

1. [System Architecture & Core Philosophy](#1-system-architecture--core-philosophy)
2. [Navigation & Global Controls](#2-navigation--global-controls)
3. [Module Deep Dives](#3-module-deep-dives)
   - [3.1 Executive Workforce Overview](#31-executive-workforce-overview)
   - [3.2 Employee Master Directory](#32-employee-master-directory)
   - [3.3 Time, Attendance & Leave Quotas](#33-time-attendance--leave-quotas)
   - [3.4 Payroll & Compensation Engine](#34-payroll--compensation-engine)
   - [3.5 Performance & 9-Box Talent Matrix](#35-performance--9-box-talent-matrix)
   - [3.6 Talent Acquisition & Hiring Pipeline](#36-talent-acquisition--hiring-pipeline)
   - [3.7 Statutory EOSB & Gratuity Calculator](#37-statutory-eosb--gratuity-calculator)
   - [3.8 33-Month Financial & Headcount Analytics](#38-33-month-financial--headcount-analytics)
   - [3.9 Excel Data Hub & Synchronization](#39-excel-data-hub--synchronization)
   - [3.10 Corporate HR Policy & Benefits Hub](#310-corporate-hr-policy--benefits-hub)
   - [3.11 Leave Planner & Coverage Calendar](#311-leave-planner--coverage-calendar)
   - [3.12 Admin & Data Exchange (Excel Hub)](#312-admin--data-exchange-excel-hub)
4. [Statutory & Legal Indian HR Compliances](#4-statutory--legal-indian-hr-compliances)
5. [Operational Workflows](#5-operational-workflows)
6. [Offline Architecture & Data Privacy](#6-offline-architecture--data-privacy)
7. [Keyboard Shortcuts & Print Utilities](#7-keyboard-shortcuts--print-utilities)
8. [Frequently Asked Questions (FAQ)](#8-frequently-asked-questions-faq)

---

## 1. System Architecture & Core Philosophy

OmniHR is built on four core architectural pillars:

- **Local-First & Zero-Cloud Latency:** All 200 default employee records, financial ledgers, and requisitions are stored client-side in browser **IndexedDB** (migrated once from the legacy `localStorage` keys; a `localStorage` fallback keeps the app running where IndexedDB is blocked). No sensitive corporate payroll records or PII are transmitted to external servers without administrative intent.
- **Strict Indian Labour Law Compliance:** Exact statutory mathematical formulas are encoded for EPF wage ceilings, Professional Tax (PT), Loss of Pay (LOP) calculations, Payment of Gratuity Act 1972 rounding rules, and Industrial Disputes Act retrenchment compensations.
- **Bi-Directional Spreadsheet Interoperability:** Deep integration with SheetJS (`xlsx`) ensures frictionless round-trip compatibility between custom Excel files, third-party HRMS exports (Workday, SAP SuccessFactors, BambooHR, Darwinbox), and OmniHR's native schema.
- **C-Suite Visual Intelligence:** Instantaneous reactive Chart.js visualizations that summarize headcount distribution, payroll burn rate, attrition metrics, and talent bell curves.

---

## 2. Navigation & Global Controls

The OmniHR interface is divided into two primary zones:

### 2.1 Left Navigation Sidebar
- **OmniHR Brand Badge:** Displays the suite version (`v1.1.0`).
- **Navigation Tabs (12 Sections):**
  1. `Executive Overview` — C-suite KPI metrics & visual charts.
  2. `Employee Directory` — Master roster with multi-column filtering.
  3. `Time & Attendance` — 26-day working cycle & leave ledger.
  4. `Leave Planner` — Month coverage calendar of who is away.
  5. `Payroll & Compensation` — Disbursable net pay & payslip viewer.
  6. `Performance & 9-Box` — Potential vs performance matrix & bell curve.
  7. `Recruitment Pipeline` — Active requisitions & candidate stages.
  8. `EOSB & Gratuity Calc` — End-of-service settlement engine.
  9. `3-Year Headcount Trends` — 33-month historical financial ledger.
  10. `Admin` — Business-data snapshots, storage status and the Excel ingestion hub.
  11. `HR Policy Hub` — Statutory leave policies, benefits and custom rules.
  12. `User Guides & Manual` — In-app documentation and Excel handling guide.
- **Quick Action Buttons:**
  - `Export Roster (Excel)`: Instant download of the current filtered employee roster.
  - `Reset Demo State`: Restores the application to the pristine 200-employee master demo data.

### 2.2 Global Top Header
- **Dynamic Context Header:** Displays the title and subtitle of the currently active view.
- **Global Search Bar:** Real-time text search across employee names, IDs (e.g. `EMP-1001`), designations, work emails, and departments.
- **Department Filter:** Narrows the active dataset across 7 corporate departments:
  - Engineering & Technology
  - Product Design & UX
  - Sales & Business Development
  - Marketing & Communications
  - Finance & Accounts
  - People & Human Resources
  - Customer Success & Support
- **Office Location Filter:** Filters by 5 geographical hubs:
  - Bengaluru HQ
  - Mumbai Hub
  - Delhi-NCR Regional Office
  - Hyderabad Tech Center
  - Remote / Hybrid
- **Header Action Buttons:**
  - `Add Staff`: Opens the interactive new hire registration modal.
  - `Admin`: Fast jump to the Admin & Data Exchange page (business-data snapshots, storage status and the Excel Hub).
  - `Guides`: Fast jump to the operational manuals.

---

## 3. Module Deep Dives

### 3.1 Executive Workforce Overview
Provides high-level decision support for Chief Human Resources Officers (CHRO) and Chief Financial Officers (CFO):
- **KPI Summary Cards:**
  - **Total Headcount:** Real-time tally of active and probation staff.
  - **Monthly Payroll CTC:** Consolidated monthly gross remuneration in ₹ Crores, with average annual CTC.
  - **Workforce Attendance Rate:** Real-time presence percentage based on the standard 26-day working cycle.
  - **Annualized Attrition Rate:** Turnover rate benchmarked against tech industry standards (1.4% vs 3.5% benchmark).
  - **Gender Diversity:** Proportion of female, male, and non-binary staff across the organization.
  - **Star Performers:** Count of employees with top-tier 5.0 appraisal ratings.
- **Visual Analytics:**
  - *Headcount by Department* (Bar Chart)
  - *Monthly Payroll Spend by Department in ₹ Lakhs* (Bar Chart)
  - *Workforce Status Split* (Doughnut Chart: Active, Probation, Notice, Resigned)
  - *Gender Demographics* (Doughnut Chart)
- **High Potential Talent Showcase:** Clickable drawer showing top-rated team members.

---

### 3.2 Employee Master Directory
The core operational staff ledger:
- **Comprehensive Profiles:** 200 standard profiles pre-populated with realistic designations, reporting relationships, contact details, PF UAN numbers, and compensation.
- **Fast Pagination:** 25 records per page with previous/next controls and dynamic record tallies.
- **Status Badges:** Color-coded status indicators:
  - `Active` (Emerald Green)
  - `Probation` (Amber Gold)
  - `Notice Period` (Coral Red)
  - `Resigned` (Slate Gray)
- **Profile Inspector Drawer:** Clicking **View** on any row displays the employee's verified payslip, leave balances, and personal records.

---

### 3.3 Time, Attendance & Leave Quotas
Manages time tracking, leave balances, and wage deductions:
- **Standard Working Cycle:** 26 business days per calendar month (excluding 4 Sundays/weekly offs).
- **Leave Categorization:**
  - **Casual Leave (CL):** 12 days annual quota (for personal emergencies).
  - **Sick Leave (SL):** 12 days annual quota (for medical recovery).
  - **Privilege/Earned Leave (EL):** 15 days annual quota (encashable at separation).
- **Loss of Pay (LOP) Deduction:**
  - When an employee exhausts paid leave and misses days, LOP is triggered.
  - Formula: $\text{LOP Deduction} = \left(\frac{\text{Monthly Basic Salary}}{26}\right) \times \text{LOP Days}$
- **Attendance Percentage:** $\text{Attendance \%} = \left(\frac{\text{Present Days}}{26}\right) \times 100$

---

### 3.4 Payroll & Compensation Engine
Implements standard Indian corporate compensation structures:
- **Cost to Company (CTC) Breakdown:**
  - **Basic Salary:** Fixed at 50% of Gross Monthly CTC.
  - **House Rent Allowance (HRA):** Fixed at 25% of Gross Monthly CTC (50% of Basic).
  - **Special / Executive Allowance:** Balancing 25% of Gross Monthly CTC.
- **Statutory Deductions:**
  - **EPF (Employees' Provident Fund):** Under the Employees' Provident Funds Act 1952, employee contribution is 12% of eligible Basic, capped at the statutory wage ceiling of ₹15,000/month:
    $$\text{EPF} = \min(\text{Basic Salary}, 15000) \times 12\% = \text{Maximum ₹1,800/month}$$
  - **Professional Tax (PT):** State statutory deduction of ₹200/month.
  - **Loss of Pay (LOP):** Computed dynamically based on absence days.
- **Disbursable Net Salary (Take-Home):**
  $$\text{Net Pay} = \text{Monthly CTC} - (\text{EPF} + \text{PT} + \text{LOP})$$
- **Verified Executive Payslip Modal:** Displays line-by-line earnings, deductions, leave balance summary, and includes a **Print Payslip** button optimized for clean PDF generation.

---

### 3.5 Performance & 9-Box Talent Matrix
Facilitates talent appraisal, succession planning, and performance management:
- **Strategic 9-Box Talent Matrix:**
  - **Future Leaders / Stars (Rating 5.0):** High performance and high potential. Priority candidates for leadership succession and stock options (ESOPs).
  - **High Performers (Rating 4.0):** Consistent overachievers driving departmental KPIs.
  - **Core Backbone (Rating 3.0):** Reliable contributors meeting organizational expectations.
  - **Performance Improvement (PIP / Rating 1.0 - 2.0):** Employees enrolled in 90-day coaching and remediation programs.
- **Bell Curve Appraisal Distribution:** Interactive bar chart visualizing the appraisal rating curve across all 5 tiers.
- **Top Talent Showcase:** Quick profile cards of all 5-star employees.

---

### 3.6 Talent Acquisition & Hiring Pipeline
Tracks open corporate requisitions and candidate progression:
- **Pipeline Metrics:**
  - Active Requisitions count across departments.
  - Total active candidate volume.
  - Average Time-to-Hire (benchmark: 24.5 days vs 32 days industry average).
  - Month-to-date offers extended and offer acceptance ratio.
- **Funnel Stages:**
  1. `Sourcing` — Candidate identification and outreach.
  2. `Screening` — HR resume review and initial phone screening.
  3. `Interviewing` — Technical, functional, and bar-raiser rounds.
  4. `Offer Extended` — Formal compensation proposal shared.
  5. `Hired` — Candidate accepted with scheduled Date of Joining (DOJ).

---

### 3.7 Statutory EOSB & Gratuity Calculator
Computes legal separation settlements in strict conformity with Indian Labour Laws:
- **Payment of Gratuity Act 1972 Compliance:**
  - **Eligibility:** Mandatory minimum 5 continuous years of service (except in cases of death or disablement).
  - **Rounding Rule:** If the service fraction in the final year is $\ge 6$ months (0.5 years), it rounds UP to the next completed year. If $< 0.5$ years, it rounds DOWN.
  - **Statutory Formula:**
    $$\text{Gratuity} = \frac{15 \times \text{Last Drawn Basic Salary} \times \text{Rounded Service Tenure}}{26}$$
  - **Statutory Ceiling:** Maximum payable gratuity is legally capped at **₹20,00,000 (₹20 Lakhs)** under the Payment of Gratuity (Amendment) Act, 2018.
- **Privilege Leave Encashment:**
  $$\text{Leave Encashment} = \left(\frac{\text{Last Drawn Basic}}{30}\right) \times \min(\text{Accumulated Leaves}, 30)$$
- **Separation Categorization:**
  - **Voluntary Resignation:** Gratuity + Privilege Leave Encashment.
  - **Involuntary Retrenchment / Layoff (Section 25F Industrial Disputes Act 1947):**
    - Gratuity
    - Privilege Leave Encashment
    - 1-Month Notice Pay in lieu of notice
    - Retrenchment Compensation: 15 days average pay for every completed year of service:
      $$\text{Retrenchment Compensation} = \frac{15 \times \text{Basic Salary} \times \text{Tenure Years}}{30}$$

---

### 3.8 33-Month Financial & Headcount Analytics
Historical macro workforce analytics spanning **January 2024 through September 2026**:
- **Dual-Axis Trend Line Chart:**
  - Left Y-Axis (Green): Workforce Headcount progression (from 175 to 200 staff).
  - Right Y-Axis (Indigo): Consolidated Monthly Gross Payroll spend in ₹ Crores (from ₹2.01 Cr to ₹2.30 Cr).
- **Historical Monthly HR Ledger:** Chronological 12-month table recording:
  - Headcount
  - Gross Payroll spend (INR)
  - Net monthly additions (Hires)
  - Exits (Resignations/Retirements)
  - Attrition Rate %
  - Average Attendance %

---

### 3.9 Excel Data Hub & Synchronization
The central data interchange module, now rendered inside the **Admin** page (see [3.12](#312-admin--data-exchange-excel-hub)):
- **Ingestion:** Drag-and-drop parsing of `.xlsx`, `.xls`, and `.csv` files.
- **Live Preview:** Displays recognized column mappings, warnings, and table preview before committing.
- **Export Master Roster:** Downloads the complete 200-employee directory with all 24 columns, including the canonical department ID and reporting line; the workbook can be re-imported without losing either.
- **Export Payroll Register:** Downloads bank-ready payroll register with earnings and deductions.
- **Download Standard Template:** Generates a pre-formatted template with sample rows.

---

### 3.10 Corporate HR Policy & Benefits Hub
The centralized policy engine enabling enterprise governance, family welfare programs, leave quotas, separation notice rules, sabbaticals, and custom rules creation:

1. **Maternal Provisions (Maternity Benefit Act 2017):**
   - **Leave Duration:** 182 days (26 weeks) 100% fully paid leave for up to the first 2 surviving children (12 weeks for 3rd child onwards).
   - **Availing Window:** Up to 8 weeks before anticipated delivery, remaining 18 weeks post-delivery.
   - **Illness Extension:** Additional 30 days paid leave for certified medical complications.
   - **Nursing Breaks & Creche:** 4 daily nursing breaks until the child turns 15 months; on-site creche or ₹5,000/mo creche stipend.
   - **Corporate Gift Presets:**
     - Newborn Deluxe Welcome Hamper (worth ₹15,000)
     - Baby Care Essentials Stash & Diaper Caddy (worth ₹12,000)
     - Direct Cash Wellness Grant (₹25,000)
     - Mother & Child Health Insurance Booster (₹3 Lakhs)
     - Ergonomic Nursing Chair & Feeding Pillow Set (worth ₹18,000)
     - Postpartum Wellness & Nutrition Basket (worth ₹10,000)

2. **Paternal Provisions (Paternity Leave & Family Care):**
   - **Leave Duration:** 15 business days 100% fully paid leave.
   - **Availing Window:** Within 180 calendar days (6 months) of childbirth or legal adoption.
   - **Tranches:** Taken in a single continuous block or split into up to 2 distinct periods.
   - **Corporate Gift Presets:**
     - New Father Celebration Kit & Diaper Bag Essentials (worth ₹10,000)
     - Paternity Care Package & Milestone Keepsake (worth ₹8,000)
     - Direct Cash Family Grant (₹15,000)
     - Gourmet Family Feast Dining Voucher (worth ₹7,500)
     - Baby Monitor & Smart Nursery Gadget Set (worth ₹12,000)

3. **Core Leave Quotas:**
   - **Casual Leave (CL):** 12 days/year; max 3 consecutive days; no medical proof required; lapses Dec 31.
   - **Sick Leave (SL):** 12 days/year; medical certificate required after 2 days; accumulation ceiling 30 days; non-encashable.
   - **Privilege / Earned Leave (EL):** 15 days/year (accrued quarterly); requires 7 days notice; encashable at separation; accumulation cap 45 days.
   - **Compensatory Off (Comp-Off):** 1:1 replacement for weekend/holiday work; valid for 60 days.
   - **Bereavement Leave:** 5 to 7 days paid leave for immediate family demise.
   - **Marriage Leave:** 5 paid days with Luxury Weekend Retreat Voucher (worth ₹25,000) or Corporate Silver Shield.

4. **Separation & Notice Period Policy:**
   - Standard 60 calendar days for confirmed staff; 30 days during probation; 90 days for VP and executive levels.
   - Notice buyout allowed upon mutual agreement; management option to enforce Garden Leave.

5. **Sabbatical & Extended Career Break Policy:**
   - Unpaid sabbatical from 90 days (3 months) up to 365 days (1 year) for higher education, certified research, or family caregiving.
   - Full job band and designation re-entry guarantee with retained employee stock options (ESOPs).

6. **Custom Rules Engine:**
   - HR leaders can configure, edit, toggle, or delete customized enterprise policies.
   - Custom parameters: Title, Category, Days Allowed, Time Unit (Days, Weeks, Months), Paid/Unpaid, Selectable Gift/Perk Presets or write-in custom perk, Eligibility, and Custom rule terms.
   - Saved through the app's data store (IndexedDB; the `omnihr_policies` `localStorage` key is the fallback) for instant offline persistence.

---

### 3.11 Leave Planner & Coverage Calendar
A single view of who is away, for HR input and for leadership coverage reviews:

1. **Leave Entries:**
   - One record per employee per spell: type (`CL`, `SL`, `EL`, `LOP`, `Maternity`, `Paternity`, `Comp Off`, `Other`), status (`Planned`, `Approved`, `Cancelled`), optional AM/PM half-day (single-day entries only), and an optional note.
   - Validation blocks an end date before the start date, a half-day on a multi-day range, and duplicate identical entries. Overlapping bookings are allowed but flagged live — HR decides.
   - Add entries via **Add leave**, or click a calendar day to open, edit or delete its entries.

2. **Calendar:**
   - Monday-first month grid with **prev / today / next** navigation.
   - Each day shows a count of people away, up to three employee initials, and a `+N` overflow. Sundays are muted.
   - Days at or above the coverage threshold are highlighted and listed under **Peak days**.

3. **Filters & Summary Tiles:**
   - Filters: department, office location, employee search, leave type and status.
   - Tiles: people on leave today, peak day this month, upcoming leave in the next 30 days, and working days booked this month.

4. **Coverage Threshold:**
   - `maxConcurrentLeave` (default 3) is editable in the planner panel.
   - Durations count working days, excluding Sundays, matching the app's 26-day working month.

### 3.12 Admin & Data Exchange (Excel Hub)
The former **Excel Data Hub** tab is now the **Admin** page (sidebar and header shortcuts point to **Admin**); the Excel Hub and its guide link are unchanged inside it:

1. **Data Snapshot Card:**
   - Record counts, the active storage backend (IndexedDB or the `localStorage` fallback), whether the pre-migration legacy `localStorage` backup exists, and the last export/import timestamps for this browser.

2. **Export Snapshot:**
   - Downloads `omnihr-snapshot-YYYY-MM-DD.json` — every business dataset (employees, policies, leave plans, planner settings) in one versioned JSON file.
   - Snapshots are the backup: save each exported file to Google Drive, OneDrive or any shared drive.

3. **Import Snapshot:**
   - The chosen file is validated (snapshot format version and row schema) and confirmed with record counts before anything is replaced; an invalid or wrong-version file changes nothing.
   - After a confirmed import, the console shows the data from the file.
   - **Imported copies are local:** a snapshot loaded into one browser does not propagate changes back to HR or to any other browser.

---

## 4. Statutory & Legal Indian HR Compliances

OmniHR implements the following Indian statutory regulations:

| Regulation | Statutory Rule / Ceiling | OmniHR Mathematical Implementation |
| :--- | :--- | :--- |
| **Maternity Benefit (Amendment) Act, 2017** | 26 weeks (182 days) paid maternity leave, 4 daily nursing breaks, creche facility for establishments with $\ge 50$ staff. | 182 days 100% paid salary; nursing intervals until 15 months. |
| **Employees' Provident Funds Act, 1952** | 12% employee contribution on eligible Basic salary capped at ₹15,000/mo. | `Math.round(Math.min(basicSalary, 15000) * 0.12)` |
| **Payment of Gratuity Act, 1972** | 15 days wages per year of completed service based on a 26-day working month. Minimum 5 years service. Max ceiling ₹20 Lakhs. | `(15 * basicSalary * roundedTenure) / 26`, capped at `2000000` |
| **Industrial Disputes Act, 1947 (Sec 25F)** | 1 month notice pay + 15 days average pay per completed year of service for retrenched workmen. | `Basic + (15 * Basic * Tenure / 30)` |
| **State Professional Tax Acts** | Monthly state tax deduction on salaried income. | Standard `₹200 / month` |
| **Standard Monthly Working Cycle** | 26 working days excluding 4 weekly off days (Sundays). | LOP deduction = `(Basic / 26) * LOP Days` |
| **CTC Structure Guidelines** | 50% Basic, 25% HRA, 25% Special Allowance. | Basic = 50% CTC; HRA = 50% Basic; Special = CTC - (Basic + HRA) |

---

## 5. Operational Workflows

### Workflow 1: Onboarding a New Employee
1. Click the **+ Add Staff** button in the top header.
2. Enter the employee's Full Name, Phone, and choose their Department.
3. Select their Designation/Title, Office Location Hub, and Date of Joining (DOJ).
4. Enter their agreed Monthly Gross CTC in INR (e.g., `180000`).
5. Select Gender and click **Save Staff Profile**.
6. OmniHR automatically generates a sequential ID (`EMP-xxxx`), derives their Basic (50%), HRA (25%), Special Allowance (25%), assigns standard leave quotas (10 CL, 10 SL, 15 EL), generates a PF UAN, and syncs the record into IndexedDB.

### Workflow 2: Generating and Printing a Monthly Payslip
1. Navigate to the **Payroll & Compensation** tab (or **Employee Directory**).
2. Locate the employee using the search bar or department dropdown.
3. Click the **Slip** (or **View**) button next to their name.
4. The verified executive payslip modal displays the complete compensation breakdown: Gross CTC, Basic, HRA, Special Allowance, EPF, PT, LOP deductions, and Net Take-Home.
5. Click **Print Payslip** to open the browser print dialog. Unnecessary UI elements (sidebar, headers, buttons) are automatically hidden via `@media print` CSS for a clean, professional PDF.

### Workflow 3: Calculating Employee Separation & Gratuity
1. Navigate to the **EOSB & Gratuity Calc** tab.
2. Select an employee from the dropdown. Their last drawn basic salary, tenure, and unused leave days populate automatically.
3. Choose the separation type:
   - *Voluntary Resignation*
   - *Involuntary Layoff / Retrenchment*
4. Click **Compute Statutory Settlement**.
5. The engine displays the exact statutory gratuity (with tenure rounding applied), leave encashment, notice pay, retrenchment compensation, and final net settlement payable.

---

## 6. Offline Architecture & Data Privacy

- **100% Client-Side Processing:** All data parsing, calculations, and Chart.js graphics execute strictly within your local browser runtime.
- **IndexedDB Primary Store:** Business data — employees, policies, leave plans and planner settings — is persisted in the browser's IndexedDB database `omnihr` (stores `employees`, `policies`, `leavePlans`, `meta`).
- **One-Time Migration:** On the first load, data under the legacy `omnihr_employees` / `omnihr_policies` `localStorage` keys is copied into IndexedDB in a single transaction. The legacy keys are kept untouched as a read-only backup, and the Admin page reports that they exist.
- **`localStorage` Fallback:** If IndexedDB is unavailable (private mode or a blocked database), OmniHR saves to `localStorage` instead and shows a visible warning banner. Theme and session always stay in `localStorage`.
- **Snapshot Backups:** Export the full business-data JSON snapshot from **Admin** and save it to Google Drive, OneDrive or any shared drive; import replaces all business data in that browser after a validated confirmation.
- **Restoring Default State:** If you wish to restore the factory 200-employee corporate dataset at any time, click **Reset Demo State** in the sidebar.

---

## 7. Keyboard Shortcuts & Print Utilities

- **Global Search:** Click the search box in the header or press `Tab` to navigate to it.
- **Quick Print:** Press `Ctrl + P` (or `Cmd + P` on macOS) while viewing any employee modal to print the official payslip.
- **Modal Dismissal:** Click outside the modal card or click the `X` button in the upper-right corner.

---

## 8. Frequently Asked Questions (FAQ)

#### Q1: Can I use OmniHR without an active internet connection?
**Yes.** Once the application bundle is loaded in your browser, OmniHR is 100% offline-capable. IndexedDB (with a `localStorage` fallback) maintains your state across browser restarts.

#### Q2: What happens if I import an Excel sheet with custom column names?
OmniHR includes a flexible column alias matching engine that automatically detects common column titles from Workday, SAP, BambooHR, Darwinbox, and custom sheets. For detailed schema information, consult the [Excel Sheet Handling Guide](EXCEL_SHEET_HANDLING_GUIDE.md).

#### Q3: How do I export employee records for bank disbursement?
Navigate to the **Admin** page (sidebar **Admin** or the **Admin** header button), find the **Excel Data Hub** card, and click **Download Payroll Sheet (.xlsx)**. This produces a formatted spreadsheet detailing every employee's Net Disbursable Salary and statutory deduction breakdown.
