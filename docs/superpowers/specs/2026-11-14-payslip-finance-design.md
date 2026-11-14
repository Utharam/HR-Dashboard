# OmniHR — Payslip Designer, Pay Structure & Finance Report

**Status:** Approved for implementation (2026-11-14)
**Scope:** Phase B of the 2026-11-14 request list — items 2 (Finance report) and 8 (Payslip Designer).

## 1. Intent

Give HR control of the salary structure instead of a hard-coded 50/25/25 split, let them add performance-based and custom monthly bonuses, and give finance a month report that reconciles every rupee from gross earnings to net pay. The payslip, payroll register, payroll export and finance report must all read the same calculation.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | One **company pay-structure template** plus optional **per-employee overrides**. An employee without an override follows the company template; an overridden employee keeps a private copy and is unaffected by later company changes. |
| D2 | A structure is an ordered list of **earning components**. Each component has a name, a basis and a value. The company template must contain exactly one **Basic** component and at most one **Remainder** component. |
| D3 | Bases: `PercentOfCTC`, `PercentOfBasic`, `Fixed`, `Remainder`. Basic may not be `PercentOfBasic` or `Remainder`. The remainder absorbs CTC minus the other earnings, floored at zero. |
| D4 | Statutory deductions are **toggles** on the structure: EPF (12% of Basic capped at the EPF wage ceiling) and Professional Tax (₹200). LOP remains `(Basic / 26) × LOP days` and is not toggleable. |
| D5 | **Performance bonus** and **custom bonus** are monthly one-off earning records keyed by employee + month. A performance bonus carries the rating that suggested it and a configurable `rating → % of Basic` rule set; HR may override the amount before saving. Bonuses are added to gross and net but do not change EPF, PT or LOP. |
| D6 | The **Payslip Designer** is a top-level module. It edits the company template, per-employee overrides and the performance-bonus rules, with a live payslip preview. Bonus entry for the running month lives on the Payroll page. |
| D7 | The **Finance Report** is a top-level module. It has a month selector, computes that month's attendance rollup, and shows company totals, a department breakdown and an employee-level breakup. It exports an Excel workbook (Summary / Departments / Employees) and prints cleanly. |
| D8 | Snapshot **v4** adds `payStructure`, `payOverrides` and `payrollBonuses`. v1–v3 snapshots import with the default company structure, no overrides and no bonuses. IndexedDB schema **v4** adds the three stores and upgrades v3 databases in place. |
| D9 | `computePayroll(employee)` stays as the default-structure, no-bonus calculation so existing callers and tests keep their exact contract. The new `computePayrollWithStructure(employee, context)` is the one the UI, exports and report use. |
| D10 | The default structure reproduces today's arithmetic: Basic 50% of CTC, HRA 50% of Basic, Special Allowance as the remainder, EPF on, PT on. No bonus is auto-applied, so a fresh install pays exactly what it pays today. |
| D11 | No new runtime dependency. Tokens and existing table/card patterns only. |

## 3. Data model

```ts
export type PayComponentBasis =
  | 'PercentOfCTC'
  | 'PercentOfBasic'
  | 'Fixed'
  | 'Remainder'

export interface PayComponent {
  id: string
  name: string
  basis: PayComponentBasis
  /** Percent (0–100+) for percent bases; rupees for Fixed; ignored for Remainder. */
  value: number
  /** Exactly one earning component in a structure is Basic. */
  isBasic?: boolean
}

export interface PerformanceBonusRule {
  /** 1–5, matching Employee.performanceRating. */
  rating: number
  /** Percent of the computed Basic. */
  percentOfBasic: number
}

export interface PayStructure {
  components: PayComponent[]
  epfEnabled: boolean
  professionalTaxEnabled: boolean
  performanceBonusRules: PerformanceBonusRule[]
  updatedAt: string
}

export interface PayStructureOverride {
  employeeId: string
  components: PayComponent[]
  epfEnabled: boolean
  professionalTaxEnabled: boolean
  note?: string
  updatedAt: string
}

export type PayrollBonusKind = 'Performance' | 'Custom'

export interface PayrollBonus {
  id: string
  employeeId: string
  monthKey: string            // YYYY-MM
  kind: PayrollBonusKind
  label: string
  amount: number
  rating?: number             // Performance only, for traceability
  note?: string
  createdAt: string
  updatedAt: string
}
```

### Default structure

```ts
export const DEFAULT_PAY_STRUCTURE: PayStructure = {
  components: [
    { id: 'basic',   name: 'Basic Salary',                basis: 'PercentOfCTC',  value: 50, isBasic: true },
    { id: 'hra',     name: 'House Rent Allowance (HRA)',  basis: 'PercentOfBasic', value: 50 },
    { id: 'special', name: 'Special Allowance',           basis: 'Remainder',      value: 0 },
  ],
  epfEnabled: true,
  professionalTaxEnabled: true,
  performanceBonusRules: [
    { rating: 5, percentOfBasic: 10 },
    { rating: 4, percentOfBasic: 5 },
    { rating: 3, percentOfBasic: 0 },
    { rating: 2, percentOfBasic: 0 },
    { rating: 1, percentOfBasic: 0 },
  ],
  updatedAt: '2026-01-01T00:00:00.000Z',
}
```

## 4. Calculation contract

`computePayrollWithStructure(employee, context)` where `context` carries the company structure, the override list, the bonus list, the payroll month and the as-of date.

1. Resolve the structure: the employee's override if one exists, otherwise the company template.
2. Evaluate the Basic component first. `PercentOfCTC` = `CTC × value/100`; `Fixed` = value. Basic is rounded to the rupee.
3. Evaluate the remaining components in order. `PercentOfCTC` and `Fixed` as above; `PercentOfBasic` = computed Basic × value/100. Each is rounded.
4. The single `Remainder` component receives `max(0, CTC − sum(other earnings))`.
5. Gross = sum of all earning components.
6. Bonuses for the employee and month are summed and listed separately. Each amount is rounded.
7. EPF = enabled ? `round(min(Basic, EPF ceiling) × 12%)` : 0.
8. PT = enabled ? ₹200 : 0.
9. LOP = `round(Basic / 26 × min(max(lopDays, 0), 26))`.
10. Total deductions = EPF + PT + LOP. Net = `max(0, Gross + Bonuses − Total deductions)`.
11. Employer EPF = EPF (12% of capped Basic) when EPF is enabled; it is a company cost, not an employee deduction.
12. Return both the legacy fields (`gross`, `basic`, `hra`, `specialAllowance`, `epf`, `professionalTax`, `lossOfPay`, `totalDeductions`, `netPayable`) and the new detail (`earnings[]`, `bonuses[]`, `bonusTotal`, `employerEpf`). `hra`/`specialAllowance` map to the components with ids `hra`/`special` when present, else 0, so old callers stay honest.

### Validation rules

- A structure has at least one component, non-empty names and unique component ids.
- Exactly one component has `isBasic`; it is not `PercentOfBasic` or `Remainder`.
- At most one `Remainder`.
- Values are finite and non-negative; percent values are ≤ 1000 (a guard, not a business cap).
- EPF/PT flags are booleans; performance rules cover ratings 1–5 with non-negative percents.
- An override is valid when its employeeId is non-empty and its structure is valid.
- A bonus has a valid `YYYY-MM` month, a positive finite amount, a non-empty label, a known kind, and a rating only for Performance.
- Duplicate override employeeIds, duplicate bonus ids and duplicate component ids are rejected at the snapshot/store boundary.

## 5. Persistence

- `DataStore` gains `savePayStructure`, `savePayOverrides`, `savePayrollBonuses`.
- `DataSnapshot` v4 adds the three datasets; `SNAPSHOT_VERSION = 4`.
- `validateDataSnapshot` accepts v1–v4. v1–v3 are normalised to the default structure, `[]` overrides and `[]` bonuses. A v4 file is validated field by field.
- IndexedDB version 4 creates:
  - `payStructure` keyed by `id` with one record `{ id: 'company', ...PayStructure }`.
  - `payOverrides` keyed by `employeeId`.
  - `payrollBonuses` keyed by `id`.
  - v3 → v4 upgrade creates the stores; existing data is untouched.
- `LocalStorageStore` uses `omnihr_pay_structure`, `omnihr_pay_overrides`, `omnihr_payroll_bonuses`.
- `MemoryStore` mirrors the same behaviour.
- Demo seeding: the default structure is a constant; no demo overrides or bonuses. An absent key means the default structure, never a half-written one.
- Import/export/clear include the new datasets. `clearBusinessData` resets the structure to the default and empties overrides/bonuses.

## 6. UI

### 6.1 Payslip Designer

- Sidebar item **Payslip Designer** after Payroll & Compensation.
- Page title: “Payslip Designer — Structure, Overrides & Bonuses”.
- Two working areas:
  1. **Company template** — component editor, EPF/PT toggles, performance-bonus rules, live sample preview.
  2. **Employee overrides** — search/select employee, “Customize for this employee”, the same editor pre-filled from the company template, “Remove override”.
- Component editor rows: name, basis, value, Basic radio, remove. “Add earning component”.
- Live preview uses the draft structure/override and the selected employee, including current-month bonuses.
- Save is disabled with a visible list of validation errors. Reset to default is a local draft action until saved.
- Unsaved changes are called out; navigating away does not silently save.

### 6.2 Payroll page

- KPI cards: Total Monthly CTC (computed gross), Gross Earnings (including bonuses), Statutory EPF & PT, Net Payroll.
- Table columns become structure-agnostic: Emp ID, Employee, Department, Status, Monthly CTC, Gross Earnings, Bonus, EPF, PT, LOP, Net Disbursable, Payslip.
- A **Bonuses this month** card lists performance/custom bonuses with employee, kind, label and amount; “Add bonus” opens a modal. Edit/delete per row.
- Bonus modal: employee, kind, label, amount, optional note. Performance kind preselects the employee's rating and suggests `rating% × Basic`; HR can overwrite the amount.

### 6.3 Payslip

- Shared `PayslipBreakdown` component used by `EmployeeModal` and the designer preview.
- Lines are the resolved earnings, then bonuses, then EPF/PT/LOP, then Net. Employer EPF is shown as a company cost note, never deducted.
- Print output remains clean.

### 6.4 Finance Report

- Sidebar item **Finance Report** after Payslip Designer.
- Month selector (default current month), with prev/next.
- For the selected month, compute `rollupMonth` and replace `presentDays`/`lopDays` only for employees with at least one working-day record, exactly as the current-month payroll does.
- Summary cards: Employees paid, Gross Earnings, Bonuses, Statutory Deductions, LOP Recovery, Net Payable, Employer EPF, Total Cost to Company.
- Department table: department, headcount, gross, deductions, net, employer EPF, total cost.
- Employee table: employee, department, gross, performance bonus, custom bonus, EPF, PT, LOP, net, employer EPF, payslip action.
- Export Excel: `Summary`, `Departments`, `Employees` sheets, with the month and generated timestamp in the Summary sheet.
- Print: a print-only header with company/month and a clean table; sidebar/toolbar/buttons hidden by the existing print CSS.
- The report is a read-only statement: no inline edits.

## 7. Navigation and Admin

- `ActiveTab` adds `payslip` and `finance`.
- Sidebar order: Overview, Directory, Attendance, Planner, Payroll, Payslip Designer, Finance Report, Performance, Workforce Planning group, Admin & Settings, HR Policy Hub, User Guides.
- Header titles:
  - `payslip`: “Payslip Designer”
  - `finance`: “Finance Report”
- No `PageToolbar` on either page; they own their controls.
- Admin & Settings snapshot counts add Overrides and Bonuses; the pay structure is reported as a fact (component count / EPF / PT).

## 8. Testing

- Payroll math: default equivalence, percent/fixed/remainder, Basic first, percent-of-basic, rounding, zero CTC, EPF/PT toggles, LOP cap, bonuses, employer EPF, override resolution, invalid structures.
- Persistence: v3→v4 snapshot import, v1/v2/v3 compatibility, IndexedDB v3→v4 upgrade, save/load, duplicate ids, round-trip, clear/import.
- Designer: component add/remove/reorder? (reorder not required), validation, Basic radio, remainder uniqueness, override save/remove, bonus rules, live preview, unsaved state.
- Payroll: dynamic columns, bonus card, bonus modal add/edit/delete, totals match `computePayrollWithStructure`.
- Payslip: dynamic lines, bonuses, employer EPF note, print button.
- Finance: month rollup, totals reconcile, department grouping, export workbook, print affordance, empty month.
- Full gate after every task: `npm run test`, `npm run lint`, `npm run build`.

## 9. Deferred

- Payroll history by month (the report can price any month from the attendance ledger and current employee terms; it is not a stored payroll run).
- Tax slabs/TDS, reimbursements, loans, arrears, full-and-final settlement integration.
- Gratuity/leave encashment reading the configured Basic (they still use the employee record's `basicSalary`).
- Role-based access (finance read-only, HR-only designer).
- Multiple company entities or per-location structures.
