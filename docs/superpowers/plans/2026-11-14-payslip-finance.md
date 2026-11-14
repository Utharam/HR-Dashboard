# Payslip Designer, Pay Structure & Finance Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Replace the hard-coded 50/25/25 payroll split with a company pay-structure template plus per-employee overrides, add monthly performance/custom bonuses, and add a month-close Finance Report that reconciles gross to net.

**Architecture:** A pure `payStructure` module owns the component model, validation and `computePayrollWithStructure`. `computePayroll` remains the default-structure wrapper. Three new datasets (`payStructure`, `payOverrides`, `payrollBonuses`) join snapshot v4 and IndexedDB v4. Two new pages — Payslip Designer and Finance Report — read the same calculation; the payslip, payroll table and exports use it too.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library, IndexedDB, SheetJS, existing tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-payslip-finance-design.md`

## Global Constraints

- No new runtime dependency.
- `computePayroll(employee)` keeps its exact current contract; new behaviour goes through `computePayrollWithStructure`.
- The default structure must reproduce today's payroll for a fresh install.
- Snapshot v4 accepts v1–v4; v1–v3 normalise to the default structure and empty overrides/bonuses.
- IndexedDB v4 upgrades v3 in place without data loss.
- No push. Keep `pre-console-restructure` and create `pre-payslip-finance` before Phase B.
- Every task ends on `npm run test`, `npm run lint`, `npm run build`.
- One commit per task with the opencode identity.
- Keep the existing 1,134-test suite green.

## Review Focus

1. Default payroll is byte-for-byte the same as before.
2. A company structure change flows to every employee without an override; an override is isolated.
3. Bonuses are month-scoped and appear in payslip, payroll, finance report and exports.
4. Finance report reconciles gross + bonuses − deductions = net for every row and every total.
5. Snapshot/IndexedDB upgrades preserve existing data.
6. Designer validation prevents a structure with no Basic, two Remainders or a Basic that references itself.
7. No duplicate bonus/override rows can reach a keyed store.

---

### Task 1: Payroll domain model and calculation

**Files:** `src/types.ts`, `src/utils/payStructure.ts` (new), `src/utils/rowValidators.ts`, `src/utils/payroll.ts`, `src/utils/__tests__/payStructure.test.ts` (new), `src/utils/__tests__/payroll.test.ts`.

- Add `PayComponentBasis`, `PayComponent`, `PerformanceBonusRule`, `PayStructure`, `PayStructureOverride`, `PayrollBonusKind`, `PayrollBonus`.
- Add `DEFAULT_PAY_STRUCTURE`, `createDefaultPayStructure()`, `resolvePayStructure(employeeId, structure, overrides)`.
- Add `validatePayStructure`, `validatePayStructureOverride`, `validatePayrollBonus` returning a list of human-readable errors.
- Add `evaluateEarnings(employee, structure)` returning the ordered lines, Basic, gross and remainder.
- Add `computePayrollWithStructure(employee, context)` implementing the calculation contract (bonuses, EPF/PT toggles, LOP, employer EPF).
- Keep `computePayroll` as the default-structure, no-bonus wrapper; run the existing payroll tests unchanged.
- Add `suggestPerformanceBonus(employee, structure)` using the rating rule.
- Row validators for the three new datasets.
- Tests: default equivalence for several CTC values, percent/fixed/remainder, Basic first, percent-of-basic, zero/NaN CTC, EPF/PT toggles, LOP cap, bonus sum, employer EPF, override isolation, invalid structures, bonus suggestion.
- Commit: `feat(payroll): add configurable pay structure and bonus calculation`.

### Task 2: Persistence, snapshot v4 and IndexedDB v4

**Files:** `src/data/DataStore.ts`, `src/data/snapshot.ts`, `src/data/IndexedDbStore.ts`, `src/data/LocalStorageStore.ts`, `src/data/MemoryStore.ts`, `src/data/DataGate.tsx`, their tests.

- `DataSnapshot` v4 adds `payStructure`, `payOverrides`, `payrollBonuses`; `SNAPSHOT_VERSION = 4`.
- `validateDataSnapshot` accepts v1–v4 and normalises older files to the default structure, empty overrides and empty bonuses.
- `DataStore` gains save methods; every implementation writes and loads the three datasets.
- IndexedDB v4 stores and v3→v4 upgrade.
- LocalStorage keys; MemoryStore.
- Import/export/clear include the datasets; clear resets the structure to default.
- Admin snapshot counts and import confirmation mention the new datasets.
- Tests: v1/v2/v3 snapshot import, v3→v4 DB upgrade, save/load, duplicates, round-trip, clear, import confirmation counts.
- Commit: `feat(payroll): persist pay structure and bonuses with snapshot v4`.

### Task 3: Payslip Designer, bonus manager and payslip integration

**Files:** `src/components/PayslipDesignerSection.tsx` (new), `PayComponentEditor.tsx` (new), `BonusModal.tsx` (new), `PayslipBreakdown.tsx` (new), `PayrollSection.tsx`, `EmployeeModal.tsx`, `Sidebar.tsx`, `Header.tsx`, `App.tsx`, `src/index.css`, tests.

- Add the `payslip` tab, sidebar item and header title.
- Designer: company template editor, EPF/PT toggles, performance rules, live preview, validation errors, save.
- Employee overrides: search/select, customize (clone company template), save, remove, note, live preview.
- Bonus modal + Payroll page bonus card: add/edit/delete performance and custom bonuses for the current month; performance preselects rating and suggested amount.
- Payroll table switches to structure-agnostic columns and `computePayrollWithStructure`.
- `PayslipBreakdown` used by `EmployeeModal` and the designer; dynamic earnings, bonuses, EPF/PT/LOP, net, employer EPF note.
- App state, save effects and handlers; snapshot import reload.
- Tests: editor validation, override save/remove, rules, preview, bonus CRUD, payroll totals, payslip lines, persistence.
- Commit: `feat(payslip): add designer, overrides and monthly bonuses`.

### Task 4: Finance Report

**Files:** `src/components/FinanceReportSection.tsx` (new), `src/utils/financeReport.ts` (new), `src/App.tsx`, `Sidebar.tsx`, `Header.tsx`, `src/index.css`, tests.

- Add the `finance` tab, sidebar item and header title.
- Month selector with prev/next; compute `rollupMonth` for the selected month and apply present/LOP to employees with working-day records.
- Summary cards, department table, employee breakup table, payslip action.
- Export workbook with Summary / Departments / Employees sheets; print header.
- Tests: month rollup, reconciliation, department grouping, bonuses, export workbook, empty month, print affordance.
- Commit: `feat(finance): add monthly salary and cost report`.

### Task 5: Docs, visual pass and final review

- Update README, GENERAL and EXCEL guides for the pay structure, overrides, bonuses, payslip designer and finance report; snapshot v4.
- Visual pass 1440/1024/390 light/dark: designer company/override, bonus modal, payslip, finance report, print preview.
- Full gate and whole-branch review; fix Critical/Important findings.
- Commit: `docs: document payslip designer and finance report`.

## Execution Order

1. Tag `pre-payslip-finance`.
2. Task 1 + Task 2 (can be one agent or sequential; they share types/store seams).
3. Task 3.
4. Task 4.
5. Task 5 + final review.
