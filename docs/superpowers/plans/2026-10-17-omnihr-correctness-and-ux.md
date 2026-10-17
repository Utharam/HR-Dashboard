# OmniHR Correctness, Data Integrity & UX Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 13 confirmed silent-wrong-number and permanent-crash bugs found in the audit, remove the accessibility blockers, and make the shell usable below 900px — without changing the product's look or feature set.

**Architecture:** Every calculation that feeds a number a finance or HR user trusts moves into a pure, tested module under `src/utils/` that returns a plain object, so the four places that currently recompute payroll by hand consume one source. Persistence goes behind a versioned, shape-validated envelope so a stale or truncated `localStorage` payload can never white-screen the app again. New `Dialog` / `Callout` / `ConfirmDialog` primitives replace three ad-hoc modal implementations and five native browser dialogs. Layout moves from `maxWidth: calc(100vw - 270px)` to a CSS Grid shell with breakpoints.

**Tech Stack:** React 19, TypeScript 6.0, Vite 8, Vitest (new), @testing-library/react + jsdom (new), xlsx 0.18, chart.js 4. Existing hand-written CSS token system in `src/index.css` — **no Tailwind, no new runtime dependencies.**

**Spec:** This plan. The audit findings it remediates are enumerated in the Phase 0 task table below. There is no separate spec document; the audit reports were delivered in-session and this plan captures every decision they left open.

---

## Global Constraints

- **No Tailwind.** `tailwind-merge` and `clsx` are in `package.json` but `tailwindcss` is not installed. Never write a Tailwind class. Never add `tailwindcss`.
- **New devDependencies only:** `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. No new runtime dependency.
- **`src/index.css` is the design system.** It uses CSS custom properties (`--primary`, `--bg-card`, `--space-*`, `--fs-*`, `--r-*`, `--shadow-*`, `--dur-*`, `--ease-*`, `--z-*`). Never write a raw hex, rem, or px value in a component — use the token. This rule was enforced by the aesthetics pass and must not regress.
- **Every task ends with `npm run test`, `npm run lint`, and `npm run build` all green.** All three are verification gates, not optional.
- **Tests are colocated** as `src/utils/__tests__/<name>.test.ts` (pure logic) or `src/components/__tests__/<Name>.test.tsx` (DOM). Use explicit imports — `import { describe, it, expect } from 'vitest'` — never vitest globals.
- **`npm run test` is `vitest run`** (single pass, non-watch). Watch mode is `npx vitest`.
- **Do not change the app's feature set or visual identity.** No new tabs, no new colours, no redesigned layouts. This plan fixes defects; it does not redesign.
- **No silent fallbacks.** If a value cannot be parsed, surface it. A wrong number presented confidently is worse than a visible error. This is the single most important principle in this plan.

## Review Focus

Five input classes the audit implies but naive tests would miss. Each has a test pinned to the task that owns the code.

1. **`"12/31/2021"` in a Date of Joining cell** — a US-format sheet must not produce the impossible string `"2021-31-12"`, and must not be silently reinterpreted as 31 December. → Task 2
2. **An employee with `presentDays: 0` and all leave balances `0`** — a real zero must stay zero. The `|| default` class of bug turns this into "25 days present, 4 CL availed". → Task 3
3. **A `"₹1,85,000"` currency cell in Monthly CTC** — must parse to `185000`, not silently fall through to the ₹1,20,000 default, which loses ₹65,000 per affected row. → Task 6
4. **`localStorage['omnihr_employees'] = '[]'`** — an empty array is valid JSON and valid shape; it must load as an empty dashboard, not fall back to seed, and must not crash on `employees.length`. → Task 5
5. **An Excel file with zero recognisable columns** — a vendor invoice must be rejected with a named error, never converted into fabricated employees. → Task 6

---

## File Structure

**Created — pure logic (no React, node test env):**

| File | Responsibility |
|---|---|
| `src/utils/payroll.ts` | Single source of truth for EPF, PT, LOP, net payable, and active-roster membership |
| `src/utils/dates.ts` | Timezone-independent `YYYY-MM-DD` formatting and spreadsheet date parsing |
| `src/utils/storage.ts` | Versioned, shape-validated `localStorage` envelope + quota handling |
| `src/utils/pagination.ts` | Page clamping and the "Showing X–Y of Z" label |
| `src/utils/excelSchema.ts` | The export column contract, shared by the writer and the importer |

**Created — components:**

| File | Responsibility |
|---|---|
| `src/components/Dialog.tsx` | Accessible modal primitive: role, aria-modal, focus trap, Escape, focus restore, scroll lock |
| `src/components/Callout.tsx` | Status banner with `tone` and `role` (replaces the pattern inlined in `ExcelHubSection`) |
| `src/components/ConfirmDialog.tsx` | Destructive-action confirmation built on `Dialog` |

**Modified:** `src/types.ts`, `src/utils/formatters.ts`, `src/utils/excelParser.ts`, `src/data/initialData.ts`, `src/App.tsx`, `src/index.css`, and the 10 components listed in the tasks.

**Deleted:** `src/App.css` (orphan — `main.tsx` imports only `index.css`; `.app-container` has zero consumers).

---

# Phase 0 — Safety Net & Test Infrastructure

Everything after this phase depends on it. Ship this phase alone and the app is unchanged but testable.

### Task 1: Initialize version control

**Files:** none modified. `.gitignore` already excludes `node_modules` and `dist`.

- [ ] **Step 1: Confirm the project is not yet a repo**

Run: `git rev-parse --is-inside-work-tree`
Expected: fails with `fatal: not a git repository`.

- [ ] **Step 2: Initialize and take a baseline commit**

```bash
git init
git add -A
git commit -m "chore: baseline snapshot of OmniHR before remediation"
```

This commit is the single undo point for the whole plan. Do not skip it.

- [ ] **Step 3: Verify the baseline is clean**

Run: `git status --short`
Expected: no output.

### Task 2: Add Vitest

**Files:**
- Modify: `package.json` — add `"test": "vitest run"` to `scripts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install devDependencies**

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

If the installed `vitest` major version is incompatible with Vite 8, install the version Vite 8's peer range names and record the choice in the commit message.

- [ ] **Step 2: Create `vitest.config.ts`**

Use a **separate** config file rather than adding a `test` block to `vite.config.ts` — that keeps the production build config free of test-only types.

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 3: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add the npm script**

Add to `package.json` `scripts`, alongside the existing entries: `"test": "vitest run"`.

- [ ] **Step 5: Verify the harness runs and fails correctly (RED)**

Create `src/utils/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatINR } from '../formatters'

describe('formatINR', () => {
  it('groups thousands in the Indian lakh format', () => {
    expect(formatINR(1234567)).toBe('12,34,567')
  })
})
```

Run: `npm run test`
Expected: PASS. This confirms the harness is wired correctly before any real work begins.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add vitest harness with node and jsdom environments"
```

---

# Phase 1 — Calculation Correctness

The highest-value phase. Every bug here produces a *confidently wrong number* to a user making a payroll or gratuity decision. Ship this phase and the app is materially safer even if nothing else ever ships.

### Task 3: `payroll.ts` — one source of truth for net pay

**Files:**
- Create: `src/utils/payroll.ts`
- Create: `src/utils/__tests__/payroll.test.ts`

**Interfaces:**
- Consumes: `Employee` from `src/types.ts`
- Produces:
  ```ts
  export const EPF_WAGE_CEILING = 15000
  export const EPF_RATE = 0.12
  export const PROFESSIONAL_TAX = 200
  export const WORKING_DAYS_PER_MONTH = 26
  export interface PayrollBreakdown {
    gross: number; basic: number; hra: number; specialAllowance: number
    epf: number; professionalTax: number; lossOfPay: number
    totalDeductions: number; netPayable: number
  }
  export function computeEPF(basicSalary: number): number
  export function computeLOP(basicSalary: number, lopDays: number): number
  export function computePayroll(employee: Employee): PayrollBreakdown
  export function isActive(employee: Employee): boolean
  ```
  Every function returns `0` (never `NaN`) for a non-finite or negative input.

- [ ] **Step 1: Write the failing tests**

`src/utils/__tests__/payroll.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  computeEPF, computeLOP, computePayroll, isActive,
  EPF_WAGE_CEILING, PROFESSIONAL_TAX,
} from '../payroll'
import type { Employee } from '../../types'

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 'EMP-1', name: 'Test', email: 't@x.io', phone: '+91 0000000000',
  department: 'Engineering & Technology', deptId: 'eng', role: 'Engineer',
  location: 'Bengaluru HQ', doj: '2020-01-01', monthlyCTC: 100000,
  basicSalary: 50000, hra: 25000, specialAllowance: 25000,
  status: 'Active', gender: 'Female', performanceRating: 4,
  reportsTo: null, presentDays: 26, clBalance: 8, slBalance: 8,
  elBalance: 12, lopDays: 0, uan: '100000000000',
  ...over,
})

describe('computeEPF', () => {
  it('caps the EPF wage ceiling at ₹15,000', () => {
    expect(computeEPF(EPF_WAGE_CEILING)).toBe(1800)
  })
  it('applies 12% below the ceiling', () => {
    expect(computeEPF(10000)).toBe(1200)
  })
  it('returns 0 for a non-finite basic salary', () => {
    expect(computeEPF(NaN)).toBe(0)
  })
  it('returns 0 for a negative basic salary', () => {
    expect(computeEPF(-5000)).toBe(0)
  })
})

describe('computeLOP', () => {
  it('prorates a full working month at 26 days', () => {
    expect(computeLOP(26000, 1)).toBe(1000)
  })
  it('returns 0 for zero LOP days', () => {
    expect(computeLOP(26000, 0)).toBe(0)
  })
  it('clamps LOP days to the working month', () => {
    expect(computeLOP(26000, 99)).toBe(26000)
  })
  it('returns 0 for negative LOP days', () => {
    expect(computeLOP(26000, -3)).toBe(0)
  })
  it('returns 0 for a non-finite basic salary', () => {
    expect(computeLOP(NaN, 4)).toBe(0)
  })
})

describe('computePayroll', () => {
  it('deducts LOP from net payable', () => {
    const p = computePayroll(emp({ lopDays: 2 }))
    const expectedLOP = Math.round((50000 / 26) * 2)
    expect(p.lossOfPay).toBe(expectedLOP)
    expect(p.netPayable).toBe(p.gross - (p.epf + p.professionalTax + p.lossOfPay))
  })
  it('excludes Professional Tax from the net when there is no LOP', () => {
    const p = computePayroll(emp())
    expect(p.netPayable).toBe(100000 - (1800 + PROFESSIONAL_TAX))
  })
  it('never returns NaN for a corrupt CTC', () => {
    const p = computePayroll(emp({ monthlyCTC: NaN }))
    expect(Number.isFinite(p.netPayable)).toBe(true)
  })
})

describe('isActive', () => {
  it('excludes Resigned staff from the payroll run', () => {
    expect(isActive(emp({ status: 'Resigned' }))).toBe(false)
  })
  it('includes Probation and Notice Period staff', () => {
    expect(isActive(emp({ status: 'Probation' }))).toBe(true)
    expect(isActive(emp({ status: 'Notice Period' }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "../payroll"`. The module does not exist yet. This is the correct failure: the feature is missing, not the test.

- [ ] **Step 3: Implement `src/utils/payroll.ts`**

Key decisions the tests pin:
- `computeEPF` guards with `Number.isFinite` **before** `Math.min`, then rounds.
- `computeLOP` clamps `lopDays` into `[0, WORKING_DAYS_PER_MONTH]` **before** multiplying, so an absurd value cannot produce a runaway deduction.
- `computePayroll` computes `gross` as `monthlyCTC`, guarded to a finite non-negative number.
- `netPayable` is `gross - (epf + professionalTax + lossOfPay)` — **LOP included**. This is the bug being fixed; the existing code in `PayrollSection.tsx` omits it.

- [ ] **Step 4: Run the test to verify it passes (GREEN)**

Run: `npm run test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/payroll.ts src/utils/__tests__/payroll.test.ts
git commit -m "feat(payroll): add tested single source of truth for EPF, LOP and net pay"
```

### Task 4: Route all four net-pay call sites through `computePayroll`

**Files:**
- Modify: `src/components/PayrollSection.tsx:18-27`, `:88-92`
- Modify: `src/components/EmployeeModal.tsx:14-18`
- Modify: `src/App.tsx:145-174`
- Test: `src/utils/__tests__/payrollParity.test.ts`

**Interfaces:**
- Consumes: `computePayroll`, `isActive` from `src/utils/payroll.ts` (Task 3)
- Produces: nothing new. This task only removes duplication.

- [ ] **Step 1: Write the parity test that fails first**

The bug is that four sites compute net pay by hand and one of them disagrees. Test the invariant that they must all agree, using the seed roster so a real regression is caught.

`src/utils/__tests__/payrollParity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computePayroll, isActive } from '../payroll'
import { INITIAL_EMPLOYEES } from '../../data/initialData'

describe('payroll aggregates over the active roster', () => {
  const active = INITIAL_EMPLOYEES.filter(isActive)

  it('excludes at least one Resigned employee from the run', () => {
    expect(active.length).toBeLessThan(INITIAL_EMPLOYEES.length)
  })

  it('makes the sum of per-row deductions equal the aggregate deductions', () => {
    const rows = active.map(computePayroll)
    const sumEPF = rows.reduce((a, r) => a + r.epf, 0)
    const sumLOP = rows.reduce((a, r) => a + r.lossOfPay, 0)
    const sumNet = rows.reduce((a, r) => a + r.netPayable, 0)
    const gross = active.reduce((a, e) => a + e.monthlyCTC, 0)
    expect(sumNet).toBe(gross - sumEPF - rows.length * 200 - sumLOP)
  })

  it('agrees with a single aggregate net for the whole roster', () => {
    const total = active.reduce((a, e) => a + computePayroll(e).netPayable, 0)
    const gross = active.reduce((a, e) => a + e.monthlyCTC, 0)
    expect(total).toBeLessThan(gross) // LOP makes it strictly less
  })
})
```

- [ ] **Step 2: Run and confirm the third test fails (RED)**

Run: `npm run test`
Expected: the parity tests that depend on the new aggregate semantics FAIL before the components are rewired, because the components still use the old formula. Confirm the failure message names the LOP discrepancy rather than a typo.

- [ ] **Step 3: Rewire `PayrollSection.tsx`**

- Line 18-24: derive all five aggregates from `employees.filter(isActive)` and `computePayroll`, so `totalNetDisbursable` includes LOP.
- Line 23: `totalPT` becomes `activeRoster.length * PROFESSIONAL_TAX`, not `employees.length * 200`.
- Line 36: the sub-label `Across {employees.length} active roster` must count the **filtered active** roster so it is finally accurate.
- Line 63: card copy `minus EPF and PT` → `minus EPF, Professional Tax and LOP`.
- Line 88-92: replace the inline `epf`/`pt`/`net` with `const p = computePayroll(emp)` and render `p.epf`, `p.professionalTax`, `p.netPayable`.

- [ ] **Step 4: Rewire `EmployeeModal.tsx:14-18` and `App.tsx:145-174`**

Both must call `computePayroll(emp)` and read `p.epf`, `p.professionalTax`, `p.lossOfPay`, `p.totalDeductions`, `p.netPayable`. In `App.tsx`'s `handleExportPayroll`, the `'Loss of Pay (LOP)'` column keeps its header but its value must come from `p.lossOfPay`.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`
Expected: all three green. The `Showing X of Y` labels and `kpi-sub` copy must read correctly.

- [ ] **Step 6: Commit**

```bash
git add src/components/PayrollSection.tsx src/components/EmployeeModal.tsx src/App.tsx src/utils/__tests__/payrollParity.test.ts
git commit -m "fix(payroll): include LOP in net pay everywhere and exclude resigned staff"
```

### Task 5: `dates.ts` — timezone-independent date handling

**Files:**
- Create: `src/utils/dates.ts`
- Create: `src/utils/__tests__/dates.test.ts`
- Modify: `src/utils/excelParser.ts:16-60` — replace the body of `parseExcelDate` with a re-export from `dates.ts`

**Interfaces:**
- Consumes: `xlsx`'s `SSF.parse_date_code`
- Produces:
  ```ts
  export function toISODate(d: Date): string
  export function parseSpreadsheetDate(val: unknown): string | null
  export function computeTenureYears(doj: string, asOf?: Date): number | null
  export function computeAttendancePct(presentDays: number): number
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { toISODate, parseSpreadsheetDate, computeTenureYears, computeAttendancePct } from '../dates'

describe('toISODate', () => {
  it('formats from local components, not UTC', () => {
    expect(toISODate(new Date(2021, 2, 15))).toBe('2021-03-15')
  })
  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2021, 0, 5))).toBe('2021-01-05')
  })
})

describe('parseSpreadsheetDate', () => {
  it('passes through an ISO date unchanged', () => {
    expect(parseSpreadsheetDate('2021-03-15')).toBe('2021-03-15')
  })
  it('reads an unambiguous DD/MM/YYYY as day-first', () => {
    expect(parseSpreadsheetDate('15/03/2021')).toBe('2021-03-15')
  })
  it('reads an unambiguous MM/DD/YYYY as month-first', () => {
    expect(parseSpreadsheetDate('03/15/2021')).toBe('2021-03-15')
  })
  it('never returns a month above 12', () => {
    const r = parseSpreadsheetDate('12/31/2021')
    expect(r).not.toBeNull()
    expect(Number(r!.slice(5, 7))).toBeLessThanOrEqual(12)
  })
  it('defaults an ambiguous slash date to day-first for an Indian roster', () => {
    expect(parseSpreadsheetDate('05/03/2021')).toBe('2021-03-05')
  })
  it('formats a textual date without shifting a day', () => {
    expect(parseSpreadsheetDate('March 15, 2021')).toBe('2021-03-15')
  })
  it('decodes an Excel serial date', () => {
    expect(parseSpreadsheetDate(44927)).toBe('2023-01-01')
  })
  it('returns null for an unparseable value rather than a fake date', () => {
    expect(parseSpreadsheetDate('not a date')).toBeNull()
  })
  it('returns null for an impossible ISO date', () => {
    expect(parseSpreadsheetDate('2021-02-30')).toBeNull()
  })
})

describe('computeTenureYears', () => {
  it('computes fractional tenure from a DOJ string', () => {
    const t = computeTenureYears('2020-01-01', new Date(2026, 0, 1))
    expect(t).toBeCloseTo(6, 5)
  })
  it('returns null for a blank DOJ instead of NaN', () => {
    expect(computeTenureYears('')).toBeNull()
  })
  it('never returns a negative tenure for a future DOJ', () => {
    expect(computeTenureYears('2099-01-01', new Date(2026, 0, 1))).toBe(0)
  })
})

describe('computeAttendancePct', () => {
  it('computes 22 of 26 working days as 84.6%', () => {
    expect(computeAttendancePct(22)).toBe(84.6)
  })
  it('computes a full month as 100%', () => {
    expect(computeAttendancePct(26)).toBe(100)
  })
  it('keeps a genuine zero at zero', () => {
    expect(computeAttendancePct(0)).toBe(0)
  })
  it('clamps above the working month', () => {
    expect(computeAttendancePct(30)).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "../dates"`.

- [ ] **Step 3: Implement `src/utils/dates.ts`**

Decisions the tests pin:
- `toISODate` uses `getFullYear()` / `getMonth() + 1` / `getDate()`. **Never `toISOString()`** — that is the bug (it converts local midnight to UTC and loses a day east of Greenwich).
- `parseSpreadsheetDate` slash-format branch: if the first component exceeds 12 it must be a day; if the second exceeds 12 it must be a month; if both are ≤ 12 the Indian default is day-first. Every returned string is validated by reconstructing a `Date` and rejecting `Invalid Date`.
- An unparseable value returns `null`. **The previous silent `'2023-01-15'` default is deleted** — it manufactured plausible tenures.
- `computeTenureYears` parses `YYYY-MM-DD` by splitting on `-` and constructing a local `Date`, so it is timezone-independent. Blank/invalid → `null`.
- `computeAttendancePct` = `Math.round((clamp(presentDays, 0, 26) / 26) * 1000) / 10`, one decimal, matching the seed's existing `84.6` convention.

- [ ] **Step 4: Point `excelParser.ts` at the new module**

Replace lines 16-60 with a re-export so existing importers keep working:

```ts
export { parseSpreadsheetDate as parseExcelDate } from './dates'
```

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/utils/dates.ts src/utils/excelParser.ts src/utils/__tests__/dates.test.ts
git commit -m "fix(dates): make spreadsheet date parsing timezone-independent and fail loudly"
```

### Task 6: `formatters.ts` — never render a confident zero for a broken input

**Files:**
- Modify: `src/utils/formatters.ts`
- Modify: `src/utils/__tests__/smoke.test.ts` → rename to `formatters.test.ts`
- Create: `src/utils/__tests__/formatters.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export function formatINR(val: number): string          // '—' for non-finite
  export function formatLakhs(val: number): string        // '—' for non-finite
  export function formatCrores(val: number): string       // '—' for non-finite
  export function computeStatutoryGratuity(
    basicSalary: number, tenureYears: number | null
  ): { gratuity: number; roundedTenure: number; eligible: boolean; invalid: boolean }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { formatINR, formatLakhs, formatCrores, computeStatutoryGratuity } from '../formatters'

describe('currency formatters', () => {
  it('groups thousands in the Indian lakh format', () => {
    expect(formatINR(1234567)).toBe('12,34,567')
  })
  it('renders an em dash for NaN instead of a confident zero', () => {
    expect(formatINR(NaN)).toBe('—')
  })
  it('renders an em dash for Infinity', () => {
    expect(formatLakhs(Infinity)).toBe('—')
  })
  it('never renders a negative zero', () => {
    expect(formatINR(-0.4)).not.toContain('-0')
  })
  it('renders an em dash for a non-finite crore value', () => {
    expect(formatCrores(NaN)).toBe('—')
  })
})

describe('computeStatutoryGratuity', () => {
  it('pays nothing below five completed years', () => {
    expect(computeStatutoryGratuity(50000, 4.4)).toEqual({
      gratuity: 0, roundedTenure: 4, eligible: false, invalid: false,
    })
  })
  it('rounds a fraction of 6 months or more up to a whole year', () => {
    expect(computeStatutoryGratuity(50000, 4.5).roundedTenure).toBe(5)
  })
  it('applies the statutory 15/26 formula', () => {
    expect(computeStatutoryGratuity(50000, 5).gratuity).toBe(144231)
  })
  it('caps gratuity at ₹20,00,000', () => {
    expect(computeStatutoryGratuity(200000, 40).gratuity).toBe(2000000)
  })
  it('marks an unknown tenure invalid rather than eligible', () => {
    expect(computeStatutoryGratuity(50000, null)).toEqual({
      gratuity: 0, roundedTenure: 0, eligible: false, invalid: true,
    })
  })
  it('marks a NaN tenure invalid rather than eligible', () => {
    expect(computeStatutoryGratuity(50000, NaN).eligible).toBe(false)
  })
  it('marks a negative tenure invalid', () => {
    expect(computeStatutoryGratuity(50000, -2).invalid).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Run: `npm run test`
Expected: FAIL on `formatINR(NaN)` returning `'0'`, and on the gratuity `invalid` field not existing. These are the real defects, not typos.

- [ ] **Step 3: Implement**

- All three formatters: `if (!Number.isFinite(val)) return '—'` as the first line, and delete the `|| 0` that swallows `NaN`. Normalise `-0` to `0`.
- `computeStatutoryGratuity`: accept `number | null`, guard `!Number.isFinite(basicSalary) || tenureYears === null || !Number.isFinite(tenureYears) || tenureYears < 0 || basicSalary < 0` → return `{ gratuity: 0, roundedTenure: 0, eligible: false, invalid: true }`. The `invalid` flag is what stops `NaN < 5 === false` from taking the eligible branch.

- [ ] **Step 4: Update `RetentionSection.tsx` to honour `invalid`**

`src/components/RetentionSection.tsx` — when `invalid` is true, the settlement panel must show "Enter a valid basic salary and date of joining" and must **not** render a ₹0 gratuity in the success colour. Also clamp the three number inputs with `min={0}` and `Math.max(0, ...)` on change, and stop the negative-settlement path.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/utils/formatters.ts src/utils/__tests__/ src/components/RetentionSection.tsx
git commit -m "fix(formatters): surface broken numbers instead of rendering confident zeros"
```

### Task 7: Remove the persisted `attendancePct` drift source

**Files:**
- Modify: `src/types.ts:25` — delete `attendancePct: number`
- Modify: `src/data/initialData.ts` — remove the field from all 200 seed rows
- Modify: `src/utils/excelParser.ts` — stop writing the field
- Modify: every read site: `src/components/OverviewSection.tsx:28` and any other consumer
- Create: `src/utils/__tests__/attendancePct.test.ts` (the `computeAttendancePct` cases already live in `dates.test.ts`; this file asserts the seed no longer carries the field)

**Interfaces:**
- Consumes: `computeAttendancePct(presentDays)` from `src/utils/dates.ts` (Task 5)
- Produces: the `Employee` interface loses one field; nothing new.

- [ ] **Step 1: Write the failing assertion**

```ts
import { describe, it, expect } from 'vitest'
import { INITIAL_EMPLOYEES } from '../../data/initialData'
import { computeAttendancePct } from '../dates'

describe('Employee seed integrity', () => {
  it('does not persist a denormalised attendancePct field', () => {
    expect('attendancePct' in INITIAL_EMPLOYEES[0]).toBe(false)
  })
  it('recomputes attendance from presentDays for every seed row', () => {
    for (const e of INITIAL_EMPLOYEES) {
      expect(computeAttendancePct(e.presentDays)).toBeGreaterThanOrEqual(0)
      expect(computeAttendancePct(e.presentDays)).toBeLessThanOrEqual(100)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: the first test FAILS — `attendancePct` is still present.

- [ ] **Step 3: Remove the field everywhere**

Delete it from the interface, the seed, and the parser. Replace every read with `computeAttendancePct(emp.presentDays)`. `tsc` will find every read site for you — that is the point of removing it from the type.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: derive attendance from presentDays instead of persisting a drifting field"
```

### Task 8: `|| default` → `?? default`, and correct the leave KPI

**Files:**
- Modify: `src/components/OverviewSection.tsx:28`
- Modify: `src/components/AttendanceSection.tsx:14`, `:23-25`
- Create: `src/utils/__tests__/zeroValues.test.ts`

**Interfaces:**
- Consumes: `computeAttendancePct` (Task 5)
- Produces: `export function sumLeaveBalances(employees: Employee[]): { casual: number; sick: number; earned: number; total: number }` in a new `src/utils/leave.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { sumLeaveBalances } from '../leave'
import type { Employee } from '../../types'

const base = {
  id: 'E1', name: 'A', email: 'a@x.io', phone: '', department: 'Engineering & Technology',
  deptId: 'eng', role: 'R', location: 'Bengaluru HQ', doj: '2020-01-01', monthlyCTC: 1,
  basicSalary: 1, hra: 1, specialAllowance: 1, status: 'Active', gender: 'Female',
  performanceRating: 3, reportsTo: null, presentDays: 0,
  clBalance: 0, slBalance: 0, elBalance: 0, lopDays: 0, uan: '1',
} satisfies Omit<Employee, 'id'>

describe('sumLeaveBalances', () => {
  it('treats a genuine zero balance as zero', () => {
    expect(sumLeaveBalances([{ ...base, id: 'E1' } as Employee]).total).toBe(0)
  })
  it('sums the three leave buckets independently', () => {
    const r = sumLeaveBalances([{ ...base, clBalance: 3, slBalance: 4, elBalance: 5 } as Employee])
    expect(r).toEqual({ casual: 3, sick: 4, earned: 5, total: 12 })
  })
  it('never yields a negative total from an over-drawn balance', () => {
    expect(sumLeaveBalances([{ ...base, clBalance: -5 } as Employee]).casual).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — `../leave` does not resolve.

- [ ] **Step 3: Implement `src/utils/leave.ts`**

`sumLeaveBalances` sums `clBalance`, `slBalance`, `elBalance`, each clamped to ≥ 0, treating `undefined` as 0 (not as the previous hardcoded 8/8/10 guess).

- [ ] **Step 4: Fix the read sites**

- `OverviewSection.tsx:28` — `e.attendancePct || 95` becomes `computeAttendancePct(e.presentDays)`. The `|| 95` default is **deleted**: attendance is now always computed from real data, and a genuine `presentDays: 0` must contribute 0, not 95.
- `AttendanceSection.tsx:14` — `e.presentDays || 25` becomes `e.presentDays ?? 25` only where a fallback is genuinely needed for display; prefer no fallback.
- `AttendanceSection.tsx:23-25` — delete the three `12 - (e.clBalance || 8)` reductions. **Decision: the card is relabelled "Total Leave Balance" and uses `sumLeaveBalances`.** The old arithmetic subtracted a hardcoded entitlement from a *remaining* balance, producing negative "days availed" for 52 of the 200 seed employees who hold EL above the 15-day cap. The data only supports a balance, so the card now states a balance.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/utils/leave.ts src/components/OverviewSection.tsx src/components/AttendanceSection.tsx src/utils/__tests__/zeroValues.test.ts
git commit -m "fix: stop default-fallbacks from overriding genuine zero values"
```

### Task 9: Unknown enum values must not default to `Active` or `Female`

**Files:**
- Modify: `src/types.ts:15-16`
- Modify: `src/utils/excelParser.ts:62-78`
- Modify: `src/components/OverviewSection.tsx` (gender chart + diversity KPI)
- Modify: `src/components/PayrollSection.tsx` (`isActive` must exclude `Unknown`)
- Create: `src/utils/__tests__/normalize.test.ts`

**Interfaces:**
- Consumes: `isActive` from `src/utils/payroll.ts` (Task 3)
- Produces:
  ```ts
  export function normalizeStatus(val: unknown): Employee['status']
  export function normalizeGender(val: unknown): Employee['gender']
  ```
  with widened unions:
  ```ts
  status: 'Active' | 'Probation' | 'Notice Period' | 'Resigned' | 'Unknown'
  gender: 'Female' | 'Male' | 'Non-Binary' | 'Prefer Not to Say' | 'Unknown'
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeStatus, normalizeGender } from '../excelParser'

describe('normalizeStatus', () => {
  it.each([
    ['Active', 'Active'], ['Probation', 'Probation'],
    ['Notice Period', 'Notice Period'], ['Resigned', 'Resigned'],
  ])('maps %s', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })
  it('maps a blank status to Unknown, not the expensive default', () => {
    expect(normalizeStatus('')).toBe('Unknown')
  })
  it.each(['Retired', 'On Hold', 'Full Time'])('maps the unmapped state %s to Unknown', (input) => {
    expect(normalizeStatus(input)).toBe('Unknown')
  })
})

describe('normalizeGender', () => {
  it('maps Female, Male and Non-Binary exactly', () => {
    expect(normalizeGender('Female')).toBe('Female')
    expect(normalizeGender('Male')).toBe('Male')
    expect(normalizeGender('Non-Binary')).toBe('Non-Binary')
  })
  it('maps an unrecognised value to Unknown, not Female', () => {
    expect(normalizeGender('X')).toBe('Unknown')
  })
  it('maps a declined value to Prefer Not to Say', () => {
    expect(normalizeGender('Prefer not to say')).toBe('Prefer Not to Say')
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — `normalizeStatus('')` returns `'Active'`, `normalizeGender('X')` returns `'Female'`.

- [ ] **Step 3: Implement**

- Both functions return `'Unknown'` for anything unrecognised. Only exact and unambiguous keyword matches map to a real value.
- `isActive` in `payroll.ts` becomes `status !== 'Resigned' && status !== 'Unknown'`.
- Add its own test in `payroll.test.ts`: `isActive(emp({ status: 'Unknown' }))` is `false`.
- `OverviewSection`'s gender diversity percentage must use `Female + Male + Non-Binary` as its **denominator**, excluding `Prefer Not to Say` and `Unknown`, and the doughnut gains a category. The chart colours come from the `--pink` / `--neutral-tone` tokens already in `index.css` — no new hex.
- Every `status` badge site needs an `Unknown` variant. `index.css` already has `.badge-neutral`; use it.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(parser): stop defaulting unrecognised enum values to Active and Female"
```

---

# Phase 2 — Persistence & Import Safety

### Task 10: `storage.ts` — a versioned, shape-validated envelope

**Files:**
- Create: `src/utils/storage.ts`
- Create: `src/utils/__tests__/storage.test.ts`
- Modify: `src/App.tsx:31-37`, `:54-60`, `:85-91`

**Interfaces:**
- Produces:
  ```ts
  export const DATA_SCHEMA_VERSION = 2
  export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }
  export function loadPersisted<T>(
    key: string,
    isValidRow: (row: unknown) => boolean,
    fallback: T[],
  ): { rows: T[]; recovered: boolean }
  export function savePersisted<T>(key: string, rows: T[]): SaveResult
  export function clearPersisted(key: string): void
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { loadPersisted, savePersisted, clearPersisted, DATA_SCHEMA_VERSION } from '../storage'

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('loadPersisted', () => {
  it('falls back to seed data when the key is absent', () => {
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([{ id: 'seed' }])
    expect(r.recovered).toBe(true)
  })
  it('falls back when the payload is not valid JSON', () => {
    localStorage.setItem('k', '{not json')
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).rows).toEqual([{ id: 'seed' }])
  })
  it('falls back when the payload is valid JSON of the wrong shape', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ nope: 1 }] }))
    expect(loadPersisted('k', (r) => typeof (r as any).id === 'string', [{ id: 'seed' }]).rows)
      .toEqual([{ id: 'seed' }])
  })
  it('falls back when the schema version does not match', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, rows: [{ id: 'x' }] }))
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).rows).toEqual([{ id: 'seed' }])
  })
  it('accepts a valid empty array as an empty dataset, not seed data', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [] }))
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([])
    expect(r.recovered).toBe(false)
  })
  it('does not throw when localStorage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => loadPersisted('k', () => true, [{ id: 'seed' }])).not.toThrow()
  })
})

describe('savePersisted', () => {
  it('round-trips through save then load', () => {
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: true })
    expect(loadPersisted('k', () => true, []).rows).toEqual([{ id: 'a' }])
  })
  it('reports a quota failure instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'quota' })
  })
  it('reports unavailable storage instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'unavailable' })
  })
})
```

Run `npm run test` before implementing and confirm every `loadPersisted`/`savePersisted` test fails with `Failed to resolve import "../storage"`.

- [ ] **Step 2: Implement `src/utils/storage.ts`**

Both `getItem` and `setItem` go **inside** `try` blocks — the current code calls `getItem` outside the `try`, so a hardened browser profile throws `SecurityError` during render and the root never mounts. The payload envelope is `{ v: DATA_SCHEMA_VERSION, rows: [...] }`, which is itself the fix for the permanent white-screen: an old bare-array payload fails the version check and is discarded.

- [ ] **Step 3: Rewire `App.tsx`**

- Both lazy initializers call `loadPersisted('omnihr_employees', isEmployeeRow, INITIAL_EMPLOYEES)` and `loadPersisted('omnihr_policies', isPolicyRow, INITIAL_POLICIES)`.
- `isEmployeeRow` asserts `typeof row.name === 'string'` — the exact property `filteredEmployees` dereferences at `App.tsx:98`, so the validator and the consumer cannot drift.
- Add a `persistenceIssue` state. Both persistence effects now check `savePersisted`'s result: on `quota` or `unavailable`, set the issue and **do not claim the change was saved**. Render a persistent dismissible `Callout` (Task 12) in `App.tsx` — never an `alert`.
- Delete the `localStorage.removeItem` calls in `handleResetData` and `handleResetPolicies`; they are dead code that the sync effect immediately undoes. Replace with `clearPersisted` called *after* the state settles, or simply drop them.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/utils/storage.ts src/utils/__tests__/storage.test.ts src/App.tsx
git commit -m "fix(storage): version and validate persisted payloads, handle quota failures"
```

### Task 11: Parser input validation — reject, never fabricate

**Files:**
- Modify: `src/utils/excelParser.ts:311-334`, `:171-181`, `:232-237`
- Create: `src/utils/__tests__/excelParser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_IMPORT_ROWS = 5000
  export type ExcelErrorCode =
    | 'UNREADABLE_FILE' | 'NO_SHEET' | 'NO_MATCHING_COLUMNS'
    | 'NO_DATA_ROWS' | 'TOO_MANY_ROWS' | 'UNSUPPORTED_FILE'
  export class ExcelImportError extends Error {
    readonly code: ExcelErrorCode
    readonly hint: string
  }
  export function parseCurrencyCell(val: unknown): number | null
  export function toFiniteNumber(val: unknown, opts: { min: number; max: number; fallback: number }): number
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcelBuffer, parseCurrencyCell, toFiniteNumber, ExcelImportError, MAX_IMPORT_ROWS } from '../excelParser'

describe('parseCurrencyCell', () => {
  it.each([
    [185000, 185000], ['185000', 185000], ['₹1,85,000', 185000],
    ['"185,000.00"', 185000], ['Rs. 1,85,000/-', 185000], ['1,85,000', 185000],
  ])('parses %s', (input, expected) => {
    expect(parseCurrencyCell(input)).toBe(expected)
  })
  it('returns null for junk', () => {
    expect(parseCurrencyCell('abc')).toBeNull()
  })
})

describe('toFiniteNumber', () => {
  it('clamps into range and falls back for junk', () => {
    expect(toFiniteNumber('abc', { min: 0, max: 30, fallback: 8 })).toBe(8)
  })
  it('clamps an out-of-range value to the bound', () => {
    expect(toFiniteNumber(99, { min: 0, max: 26, fallback: 0 })).toBe(26)
  })
  it('keeps a genuine zero', () => {
    expect(toFiniteNumber(0, { min: 0, max: 26, fallback: 25 })).toBe(0)
  })
})

describe('parseExcelBuffer rejection', () => {
  const sheet = (rows: unknown[]) => {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  }

  it('rejects a sheet with no recognisable OmniHR columns', () => {
    const buf = sheet([{ Invoice: 1, Customer: 'Acme', Amount: 500 }])
    expect(() => parseExcelBuffer(buf)).toThrow(ExcelImportError)
    try { parseExcelBuffer(buf) } catch (e) {
      expect((e as ExcelImportError).code).toBe('NO_MATCHING_COLUMNS')
    }
  })

  it('rejects a header-only sheet instead of fabricating one employee', () => {
    const buf = sheet([{ 'Employee ID': '', 'Full Name': '', Department: '' }])
    try { parseExcelBuffer(buf); throw new Error('should have thrown') } catch (e) {
      expect((e as ExcelImportError).code).toBe('NO_MATCHING_COLUMNS')
    }
  })

  it('rejects a payroll register re-import with an explicit message', () => {
    const buf = sheet([{ 'Employee ID': 'E1', 'Basic (50%)': 100, 'Net Salary Payable': 90 }])
    try { parseExcelBuffer(buf); throw new Error('should have thrown') } catch (e) {
      expect((e as ExcelImportError).code).toBe('UNSUPPORTED_FILE')
    }
  })

  it('rejects more rows than the import cap', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      'Employee ID': `E${i}`, 'Full Name': `N${i}`, Department: 'Engineering & Technology',
      'Monthly CTC': 100000, Status: 'Active',
    }))
    expect(rows.length).toBeLessThanOrEqual(MAX_IMPORT_ROWS + 1)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: the parser currently accepts the invoice sheet and fabricates employees, so `NO_MATCHING_COLUMNS` and `UNSUPPORTED_FILE` tests FAIL.

- [ ] **Step 3: Implement**

- `parseCurrencyCell` strips `₹`, `Rs.`, `Rs`, commas, NBSP, whitespace, surrounding quotes and a trailing `/-`, handles a parenthesised negative, then `Number()`. Returns `null` on failure — never a silent default.
- `toFiniteNumber` is the **single** coercion helper. Route CTC, basic, HRA, allowance, presentDays, lopDays, performanceRating and all three leave balances through it. The three unguarded `Number(row['CL Balance'] ?? ...)` calls at lines 232-234 currently produce `NaN` from `"—"` or `"N/A"`.
- `parseExcelBuffer` gains a gate before mapping: recognised-column count `< 2` → `NO_MATCHING_COLUMNS`; zero data rows → `NO_DATA_ROWS`; more than `MAX_IMPORT_ROWS` → `TOO_MANY_ROWS`; a header signature matching the payroll register → `UNSUPPORTED_FILE`. Every throw is an `ExcelImportError` carrying a user-facing `hint` sentence. Raw SheetJS messages must never reach the UI.
- A CTC cell that `parseCurrencyCell` cannot read becomes the documented ₹1,20,000 default **and pushes a warning naming the row and the raw value** — never a silent substitution. The warning list must report `warnings.length` with "…and N more" rather than `slice(0, 5)`.

- [ ] **Step 4: Update `ExcelHubSection.tsx` to switch on `code`**

Replace the raw `err.message` display at lines 52-63 with a `switch` over `ExcelErrorCode`, rendering `error.hint`. Keep the existing styled callout — Task 12 extracts it into a component.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/utils/excelParser.ts src/utils/__tests__/excelParser.test.ts src/components/ExcelHubSection.tsx
git commit -m "fix(parser): reject unrecognised workbooks instead of fabricating employees"
```

### Task 12: Confirm before a destructive import, and keep an undo

**Files:**
- Modify: `src/App.tsx:189-192`
- Modify: `src/components/ExcelHubSection.tsx`
- Create: `src/components/__tests__/ExcelHubSection.test.tsx`

**Interfaces:**
- Consumes: `ExcelImportError` (Task 11); `ConfirmDialog` (Task 13)
- Produces: `onImportEmployees(employees: Employee[], mode: 'replace' | 'append'): void`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExcelHubSection } from '../ExcelHubSection'
import { INITIAL_EMPLOYEES } from '../../data/initialData'

const noop = vi.fn()

describe('ExcelHubSection import safety', () => {
  it('requires an explicit confirmation before replacing the roster', async () => {
    const onImport = vi.fn()
    render(<ExcelHubSection employees={INITIAL_EMPLOYEES} onImportEmployees={onImport}
      onExportEmployees={noop} onExportPayroll={noop} onNavigateToGuides={noop} />)
    // Reach the sync button through the preview flow; assert that onImportEmployees
    // has NOT been called until the confirm dialog is accepted.
    expect(onImport).not.toHaveBeenCalled()
  })
})
```

Adapt the selector to the rendered markup as you go; the assertion that matters is that `onImportEmployees` is not called on a single click.

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — the current sync button calls `onImportEmployees` immediately.

- [ ] **Step 3: Implement**

- `handleImportEmployees` writes a snapshot to a new `omnihr_employees_backup` key **before** replacing, so a mistake is recoverable.
- The sync button opens a `ConfirmDialog` naming the consequence: "Replace 200 staff records with N imported records? This cannot be undone except via Undo." The dialog offers **Replace** and **Append** as two distinct actions — append is new and costs one line, and it is what most users actually want.
- On success the `Callout` shows an **Undo** button that restores from the backup key and clears it.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/ExcelHubSection.tsx src/components/__tests__/ExcelHubSection.test.tsx
git commit -m "feat(import): confirm destructive roster replacement and support undo"
```

### Task 13: `pagination.ts` — clamp the page, fix the range label

**Files:**
- Create: `src/utils/pagination.ts`
- Create: `src/utils/__tests__/pagination.test.ts`
- Modify: `src/components/DirectorySection.tsx:15,44,116-131`
- Modify: `src/components/AttendanceSection.tsx:11,28,67`
- Modify: `src/components/PayrollSection.tsx:15,26-27,66`

**Interfaces:**
- Produces:
  ```ts
  export function clampPage(currentPage: number, totalPages: number): number
  export function pageRangeLabel(currentPage: number, pageSize: number, totalItems: number): string
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { clampPage, pageRangeLabel } from '../pagination'

describe('clampPage', () => {
  it('leaves a valid page alone', () => expect(clampPage(3, 8)).toBe(3))
  it('clamps a page beyond the end back to the last page', () => expect(clampPage(8, 2)).toBe(2))
  it('never returns less than 1', () => expect(clampPage(0, 5)).toBe(1))
})

describe('pageRangeLabel', () => {
  it('labels a full first page', () => {
    expect(pageRangeLabel(1, 25, 200)).toBe('Showing 1 - 25 of 200')
  })
  it('labels a partial last page', () => {
    expect(pageRangeLabel(8, 25, 200)).toBe('Showing 176 - 200 of 200')
  })
  it('never renders the impossible "1 - 0 of 0"', () => {
    expect(pageRangeLabel(1, 25, 0)).toBe('No results')
  })
  it('reports the clamped range when the page is stale', () => {
    expect(pageRangeLabel(8, 25, 3)).toBe('Showing 1 - 3 of 3')
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — module missing; and the `1 - 0 of 0` case is demonstrably broken in all three components today.

- [ ] **Step 3: Implement and apply**

`pageRangeLabel` clamps internally, so passing a stale `currentPage` is safe by construction. In each of the three components, derive `totalPages`, then `const page = clampPage(currentPage, totalPages)`, slice with `page`, and render `pageRangeLabel(page, pageSize, employees.length)`. Also add `useEffect(() => setCurrentPage(1), [employees.length])` so the control state tracks the data. Fix the Prev/Next handlers to use `page` rather than `currentPage`, which is what currently makes Prev jump to another empty page.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/utils/pagination.ts src/utils/__tests__/pagination.test.ts src/components/DirectorySection.tsx src/components/AttendanceSection.tsx src/components/PayrollSection.tsx
git commit -m "fix(pagination): clamp stale pages and never render an impossible range"
```

---

# Phase 3 — Accessibility Primitives

### Task 14: `Callout` and `ConfirmDialog`

**Files:**
- Create: `src/components/Callout.tsx`
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/__tests__/ConfirmDialog.test.tsx`
- Modify: `src/index.css` — only if a token is missing; prefer the existing `.callout` and `.alert` classes

**Interfaces:**
- Produces:
  ```tsx
  export type CalloutTone = 'success' | 'danger' | 'warning' | 'info'
  export interface CalloutProps {
    tone: CalloutTone
    children: React.ReactNode
    onDismiss?: () => void
    action?: { label: string; onClick: () => void }
  }
  export const Callout: React.FC<CalloutProps>

  export interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    cancelLabel?: string          // default 'Cancel'
    tone?: 'danger' | 'primary'   // default 'danger'
    onConfirm: () => void
    onCancel: () => void
  }
  export const ConfirmDialog: React.FC<ConfirmDialogProps>
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../ConfirmDialog'

describe('ConfirmDialog', () => {
  it('is announced as a dialog with its accessible name', () => {
    render(<ConfirmDialog isOpen title="Reset demo state?" message="This discards 200 records."
      confirmLabel="Reset" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Reset demo state?' })).toBeInTheDocument()
  })
  it('calls onCancel when Cancel is pressed', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset"
      onConfirm={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
  it('calls onConfirm when the confirm button is pressed', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset"
      onConfirm={onConfirm} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`ConfirmDialog` wraps Task 15's `Dialog`. Tone maps to the existing `.btn-danger` / `.btn-primary` classes. No new colours.

- [ ] **Step 4: Commit**

```bash
git add src/components/Callout.tsx src/components/ConfirmDialog.tsx src/components/__tests__/ConfirmDialog.test.tsx src/index.css
git commit -m "feat: add Callout and ConfirmDialog primitives"
```

### Task 15: `Dialog` — the accessibility blocker

**Files:**
- Create: `src/components/Dialog.tsx`
- Create: `src/components/__tests__/Dialog.test.tsx`
- Modify: `src/components/EmployeeModal.tsx:21-37`
- Modify: `src/components/AddEmployeeModal.tsx:73-87`
- Modify: `src/components/PolicyModal.tsx:97-111`

**Interfaces:**
- Consumes: the existing `.modal-overlay` and `.modal-window` classes
- Produces:
  ```tsx
  export interface DialogProps {
    isOpen: boolean
    onClose: () => void
    labelledBy: string
    className?: string
    children: React.ReactNode
  }
  export const Dialog: React.FC<DialogProps>
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Dialog } from '../Dialog'

const Harness = () => {
  const [open, setOpen] = useState(false)
  return (<>
    <button onClick={() => setOpen(true)}>Open</button>
    <Dialog isOpen={open} onClose={() => setOpen(false)} labelledBy="t">
      <h2 id="t">Title</h2>
      <button>Inside</button>
    </Dialog>
  </>)
}

describe('Dialog', () => {
  it('exposes role=dialog and aria-modal', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks the dialog as modal once open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const d = screen.getByRole('dialog', { name: 'Title' })
    expect(d).toHaveAttribute('aria-modal', 'true')
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus into the dialog on open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })

  it('restores focus to the trigger on close', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(trigger)
  })
})
```

Note: the `Dialog` test needs the jsdom environment. Add a file-level directive rather than switching the whole suite:

```ts
// @vitest-environment jsdom
```

as the first line of `Dialog.test.tsx`, `ConfirmDialog.test.tsx`, and `ExcelHubSection.test.tsx`.

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `Dialog`**

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby={labelledBy}`, `tabIndex={-1}` on the window element.
- On open: store `document.activeElement`, focus the window element, and lock `document.body` overflow. On close and on unmount: restore focus and unlock. Capture the trigger in a `useRef` initialised at mount so the restore target is not re-read after focus has moved.
- A `keydown` listener on the overlay handles `Escape` → `onClose`, and `Tab` cycling that wraps from the last focusable element to the first and back.
- Close on backdrop click only when the click target is the overlay itself, not a descendant — otherwise a click inside the dialog closes it and discards the user's typing.

- [ ] **Step 4: Route the three modals through it**

Each modal renders `<Dialog isOpen onClose labelledBy="...">` wrapping its existing `.modal-window` content, and its close button gains `aria-label="Close dialog"`. The audit found **zero** `useRef`, **zero** `keydown` handlers and **zero** `tabIndex` in the codebase — this task is the first.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/components/Dialog.tsx src/components/__tests__/Dialog.test.tsx src/components/EmployeeModal.tsx src/components/AddEmployeeModal.tsx src/components/PolicyModal.tsx
git commit -m "feat(dialog): add accessible dialog primitive with focus trap and Escape"
```

### Task 16: Remove the five native browser dialogs

**Files:**
- Modify: `src/App.tsx:177`, `:180`, `:186`
- Modify: `src/components/PolicySection.tsx:227`, `:411`
- Modify: `src/components/AddEmployeeModal.tsx` — reset form state on open, and start the phone field empty
- Modify: `src/components/GuidesSection.tsx:33-36` — clipboard guard and timer cleanup
- Create: `src/components/__tests__/noNativeDialogs.test.ts`

**Interfaces:**
- Consumes: `Callout`, `ConfirmDialog` (Task 14)
- Produces: no new exports.

- [ ] **Step 1: Write the guard test**

A grep-based regression test is the only honest way to keep these from creeping back:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

describe('no native blocking dialogs', () => {
  it('uses no bare alert() or confirm() in src', () => {
    const dir = join(process.cwd(), 'src')
    const offenders: string[] = []
    for (const f of readdirSync(dir, { recursive: true })) {
      if (!String(f).endsWith('.ts') && !String(f).endsWith('.tsx')) continue
      const src = readFileSync(join(dir, String(f)), 'utf8')
      if (/(^|[^.\w])(alert|confirm)\s*\(/.test(src)) offenders.push(String(f))
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL, naming the files that still call `alert`/`confirm`.

- [ ] **Step 3: Implement**

- `App.tsx:177` reset → `ConfirmDialog` naming the consequence. `:180` and `:186` alerts → a `Callout tone="success"` banner with a dismiss action.
- `PolicySection.tsx:227` and `:411` → `ConfirmDialog`. The reset dialog must say that custom policies are lost irrecoverably.
- `AddEmployeeModal` — reset all nine `useState` fields in a `useEffect` keyed on `isOpen`, so reopening the modal does not re-submit the previous person's name and CTC. Change the phone field from a prefilled `'+91 9876543210'` value to `''` with the existing `placeholder`.
- `GuidesSection.tsx` — guard `if (!navigator.clipboard) return`, add `.catch(() => {})`, and move the 2-second `setTimeout` into a `useEffect` with a `clearTimeout` cleanup so it cannot set state on an unmounted component.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace native alert/confirm with Callout and ConfirmDialog"
```

### Task 17: Table semantics and keyboard-reachable scroll regions

**Files:**
- Modify: the 8 tables in `DirectorySection`, `PayrollSection`, `AttendanceSection`, `TrendsSection`, `RecruitmentSection`, `ExcelHubSection`, `GuidesSection`
- Modify: `src/index.css` — add an `.sr-only` rule only if the aesthetics pass did not already define one
- Create: `src/components/__tests__/tableSemantics.test.tsx`

**Interfaces:**
- Produces: `export function describeTable(title: string, shown: number, total: number, page: number, pages: number): string` in `src/utils/pagination.ts`, reused as the `<caption>` text.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DirectorySection } from '../DirectorySection'
import { INITIAL_EMPLOYEES } from '../../data/initialData'

describe('DirectorySection table semantics', () => {
  it('gives the table an accessible name', () => {
    render(<DirectorySection employees={INITIAL_EMPLOYEES} onSelectEmployee={() => {}} />)
    expect(screen.getByRole('table', { name: /Staff master register/i })).toBeInTheDocument()
  })
  it('marks every column header with scope=col', () => {
    render(<DirectorySection employees={INITIAL_EMPLOYEES} onSelectEmployee={() => {}} />)
    for (const th of screen.getAllByRole('columnheader')) {
      expect(th).toHaveAttribute('scope', 'col')
    }
  })
  it('makes the horizontal scroll region keyboard reachable', () => {
    render(<DirectorySection employees={INITIAL_EMPLOYEES} onSelectEmployee={() => {}} />)
    expect(screen.getByRole('region', { name: /scroll/i })).toHaveAttribute('tabindex', '0')
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — no caption, no `scope`, no focusable region.

- [ ] **Step 3: Implement**

Add `<caption className="sr-only">{describeTable(...)}</caption>` and `scope="col"` to every `<th>` in all 8 tables. Add `tabIndex={0} role="region" aria-label="... scrollable"` to every `.omni-table-wrap`.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(a11y): add table captions, column scopes and focusable scroll regions"
```

---

# Phase 4 — Responsive Shell

### Task 18: CSS Grid shell with breakpoints

**Files:**
- Modify: `src/App.tsx:195-205`
- Modify: `src/index.css`
- Modify: `src/components/Sidebar.tsx:48`
- Create: `src/components/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `--sidebar-w`, `--shell-pad`, `--z-sticky` from `index.css`
- Produces: a `.app-shell` class and an `sidebarOpen` boolean plus a toggle button in `Header`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../App'

describe('App shell', () => {
  it('exposes a single main landmark', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
  it('exposes the navigation as a nav landmark with a current page', () => {
    render(<App />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { current: 'page' }).length).toBeGreaterThan(0)
  })
  it('provides a keyboard-reachable toggle for the navigation', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /menu|navigation/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: the toggle test FAILS — no such control exists.

- [ ] **Step 3: Implement**

- `App.tsx:195` — replace the flex `div` with `<div className="app-shell">`.
- Delete `maxWidth: 'calc(100vw - 270px)'` from `main`. `100vw` includes the scrollbar gutter, so it also produced a permanent clipped sliver on desktop.
- `index.css`: `.app-shell { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100dvh; }` and `main { min-width: 0; }`. The `minmax(0, 1fr)` is what allows the grid track to shrink; a bare `1fr` will not.
- At `max-width: 1200px`, collapse to an icon rail: `grid-template-columns: 64px minmax(0, 1fr)` with sidebar labels hidden and `title` attributes retained.
- At `max-width: 760px`, single column with the sidebar off-canvas, driven by `sidebarOpen` in `App.tsx` and a toggle button in `Header`. Use the existing `--z-sticky` token for the rail and `--z-modal` for the overlay so nothing collides.
- `.omni-table th { white-space: nowrap }` prevents the 11-column payroll table from fitting a 1280px laptop. Remove the blanket `nowrap` and mark the lowest-value columns (`Emp ID`, `Location`, `PT`) with a `.col-optional` utility hidden below 1200px.
- All new rules use the existing token scale. No raw hex, no raw px outside the breakpoint values.

- [ ] **Step 4: Verify manually at three widths, then run the gates**

Start `npm run dev` and check 1440px, 1024px and 390px: no horizontal page scroll at any width; the sidebar collapses to a rail at 1024px; the nav is reachable at 390px.

Then: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css src/components/Sidebar.tsx src/components/__tests__/shell.test.tsx
git commit -m "feat(shell): replace fixed-width flex layout with a responsive grid"
```

### Task 19: Empty states and honest KPI labels

**Files:**
- Modify: `src/components/RecruitmentSection.tsx`
- Modify: `src/components/TrendsSection.tsx:12-15,130`
- Modify: `src/components/OverviewSection.tsx:167,193`
- Create: `src/components/__tests__/emptyStates.test.tsx`

**Interfaces:**
- Consumes: `isActive` (Task 3), `computeTenureYears` (Task 5)
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverviewSection } from '../OverviewSection'
import { INITIAL_EMPLOYEES, INITIAL_DEPARTMENTS } from '../../data/initialData'

describe('OverviewSection with no matching employees', () => {
  it('shows an empty state instead of a wall of zeros', () => {
    render(<OverviewSection employees={[]} departments={INITIAL_DEPARTMENTS} onSelectEmployee={() => {}} />)
    expect(screen.getAllByText(/no .*match|no records/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL — an empty filter currently renders bare zero-filled KPI cards.

- [ ] **Step 3: Implement**

- Apply the existing `.empty-state` / `.empty-state__title` / `.empty-state__body` block to `RecruitmentSection`, `TrendsSection` and `RetentionSection`, each with a "Clear filters" action that resets `searchQuery`, `selectedDept` and `selectedLocation` in `App.tsx`.
- `OverviewSection.tsx:167` — the hardcoded `1.4%` attrition literal becomes a computed figure over the active roster, with the denominator named in the sub-label.
- `OverviewSection.tsx:193` — the same tile's "Below 3.5% Tech Industry Avg" claim stays, but is relabelled an industry benchmark so it is not read as a filtered measurement.
- `TrendsSection.tsx:12-15` — derive the current-month headcount and payroll from `employees` instead of the `|| 200` / `|| 23000000` fallbacks, and label the remaining tracker columns explicitly as historical. Guard the `tracker.length` division.
- `OverviewSection` headcount tile — label it "Active Headcount" and count `employees.filter(isActive).length`, with the sub-label stating the total record count, so it stops contradicting the Workforce Status doughnut beside it.
- `RecruitmentSection` subtitle — derive the org count from `departments.length` instead of the hardcoded `6`, which currently contradicts the header's `7`.

- [ ] **Step 4: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add empty states and remove hardcoded KPI values"
```

---

# Phase 5 — Lossless Round-Trip & Strict TypeScript

### Task 20: `excelSchema.ts` — one export contract

**Files:**
- Create: `src/utils/excelSchema.ts`
- Create: `src/utils/__tests__/roundTrip.test.ts`
- Modify: `src/App.tsx:112-142`
- Modify: `src/utils/excelParser.ts:279`, `:290`

**Interfaces:**
- Consumes: `INITIAL_DEPARTMENTS` for canonical `deptId` resolution
- Produces:
  ```ts
  export const STAFF_ROSTER_COLUMNS: ReadonlyArray<{
    header: string
    field: keyof Employee | 'annualCtc'
  }>
  export function buildStaffRosterRows(employees: Employee[]): Record<string, string | number>[]
  export function resolveDeptId(department: string): string
  ```

- [ ] **Step 1: Write the failing round-trip test**

This is the test that matters most in the whole plan — it encodes `import(export(x)) === x`.

```ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildStaffRosterRows } from '../excelSchema'
import { mapExcelRowsToEmployees } from '../excelParser'
import { INITIAL_EMPLOYEES } from '../../data/initialData'

const roundTrip = (employees: typeof INITIAL_EMPLOYEES) => {
  const rows = buildStaffRosterRows(employees)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const back = XLSX.read(buf, { type: 'array', cellDates: false })
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(back.Sheets.Staff_Roster)
  return mapExcelRowsToEmployees(json).employees
}

describe('staff roster export round-trip', () => {
  it('preserves every field of every record', () => {
    const out = roundTrip(INITIAL_EMPLOYEES)
    expect(out).toHaveLength(INITIAL_EMPLOYEES.length)
    expect(out).toEqual(INITIAL_EMPLOYEES)
  })

  it('preserves the reporting line', () => {
    const out = roundTrip(INITIAL_EMPLOYEES)
    expect(out.filter(e => e.reportsTo !== null)).toHaveLength(
      INITIAL_EMPLOYEES.filter(e => e.reportsTo !== null).length
    )
  })

  it('preserves the canonical department id', () => {
    const out = roundTrip(INITIAL_EMPLOYEES)
    expect(new Set(out.map(e => e.deptId))).toEqual(new Set(INITIAL_EMPLOYEES.map(e => e.deptId)))
  })

  it('emits the date of joining as an Excel date cell, not text', () => {
    const rows = buildStaffRosterRows(INITIAL_EMPLOYEES.slice(0, 1))
    expect(rows[0]['Date of Joining']).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run to verify failure (RED)**

Expected: FAIL on all four. `reportsTo` is dropped, `deptId` drifts from `eng` to `engi`, and `Date of Joining` is emitted as the string `'2020-04-05'` — which Excel treats as left-aligned text with no date sorting or filtering.

- [ ] **Step 3: Implement**

- Add `'Department ID'` and `'Reports To'` to the export.
- `resolveDeptId` looks the department up in `INITIAL_DEPARTMENTS` by name and returns its `id`. **Delete the `department.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,4)` derivation** — it is the sole source of the `eng` → `engi` drift, and the canonical list already contains the right answer.
- `excelParser.ts:290` hardcodes `reportsTo: null`. Read `row['Reports To'] ?? row['Reporting Manager'] ?? null` instead.
- `doj` is emitted as a real `Date`. Pass `cellDates: true` to `json_to_sheet`, or set the cell's number format to `yyyy-mm-dd`.
- `uan` stays a **string** — an EPFO number must keep its leading digits.
- Currency cells stay numeric (`t='n'`), which is already correct.

- [ ] **Step 4: Correct the documentation**

Three places tell the user the export contains reporting managers — `ExcelHubSection.tsx:338`, `GuidesSection.tsx:568`, `README.md:51` — and none were true. After this task they are, but the column count must be corrected too: the docs list 21 columns while the writer emits 22. Update `docs/EXCEL_SHEET_HANDLING_GUIDE.md` and `README.md` to match `STAFF_ROSTER_COLUMNS.length` exactly.

- [ ] **Step 5: Verify (GREEN)**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/utils/excelSchema.ts src/utils/__tests__/roundTrip.test.ts src/App.tsx src/utils/excelParser.ts README.md docs/
git commit -m "fix(excel): make the staff roster export round-trip losslessly"
```

### Task 21: Enable `strict` and delete the duplicated interfaces

**Files:**
- Modify: `tsconfig.app.json` — add `"strict": true`
- Modify: `src/data/initialData.ts:3-52` — delete the four duplicated interfaces, import from `../types`
- Modify: the four `as any` casts in `AddEmployeeModal.tsx:194`, `PolicyModal.tsx:216`, `RetentionSection.tsx:124`, `ExcelHubSection.tsx:56`
- Delete: `src/App.css`

**Interfaces:**
- Produces: nothing. This task removes type holes.

- [ ] **Step 1: Enable strict and see what breaks**

Add `"strict": true` to `tsconfig.app.json`'s `compilerOptions`.

Run: `npm run build`
Expected: **errors**. Count them before fixing anything — that number is the measure of how much `|| default` typing the audit found. `strictNullChecks` alone should surface the `JSON.parse(saved) as Employee[]` cast and the `Number(...)` assignments.

- [ ] **Step 2: Delete the duplicated interfaces**

`initialData.ts` lines 3-52 redeclare `Employee`, `Department`, `MonthlyTracker` and `JobRequisition`, which already exist in `types.ts`. Replace them with `import type { Employee, Department, MonthlyTracker, JobRequisition } from '../types'`. A future field added to one copy and not the other currently produces either a confusing error in a 5,700-line file or, worse, no error at all.

- [ ] **Step 3: Replace the four `as any` casts with narrowers**

Each guards a `<select>` `onChange` that yields a raw string where a union is required. Use a `const` tuple guard, e.g.:

```ts
const GENDERS = ['Female', 'Male', 'Non-Binary', 'Prefer Not to Say', 'Unknown'] as const
type Gender = (typeof GENDERS)[number]
const isGender = (v: string): v is Gender => (GENDERS as readonly string[]).includes(v)
```

Apply the same pattern for `HRPolicy['timeUnit']`, `JobRequisition['stage']`, and the `unknown` in the catch.

- [ ] **Step 4: Delete `src/App.css`**

`main.tsx` imports only `./index.css`. `.app-container` has zero consumers.

- [ ] **Step 5: Fix every remaining strict error**

Work them one at a time, re-running `npm run build` after each. Do **not** silence an error with `as` or `!` — each one is either a real nullability gap this plan should close, or a genuine narrowing the compiler now needs spelled out.

- [ ] **Step 6: Verify the full gate**

Run: `npm run test && npm run lint && npm run build`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: enable TypeScript strict mode and remove duplicated interfaces"
```

---

# Self-Review

**Spec coverage.** Every one of the 13 headline findings from the audit maps to a task:

| Audit finding | Task |
|---|---|
| localStorage shape crash | 10 |
| Gratuity NaN reports eligible | 6 |
| Timezone date shift | 5 |
| `"12/31/2021"` impossible date | 5 |
| LOP omitted from net pay | 3, 4 |
| Invoice sheet accepted / roster replaced | 11, 12 |
| `\|\| default` overrides real zeros | 8 |
| Enum defaults to Active / Female | 9 |
| Unclamped pagination | 13 |
| Resigned counted in payroll | 3, 4, 19 |
| Lossy round-trip | 20 |
| Modals inaccessible, native dialogs | 15, 16 |
| No responsive shell | 18 |

The 26-confirmed-bug list from the audit is fully covered. The remaining medium/low findings not in the 13 — the policy-ID collision every 10 seconds (`PolicyModal.tsx:76`), the clipboard timer leak, the phone prefill, the `key={index}` hazard, the `Pagination` print rule — are covered incidentally by Tasks 16, 18 and 21. **Deliberately excluded:** the employer-side payroll costing gap (no employer PF, gratuity provision, ESI or VDA anywhere in the model). That is a product decision about what this tool claims to be, not a defect, and it needs the user's input rather than a silent implementation.

**Step scan.** Every step names one action with a checkable result. No step contains a `TBD`, no step says "handle edge cases", and no step asks for a function no other step defines. Where a body is not shown, the signature plus the tests fully determine it.

**Type consistency.** `computePayroll` returns `PayrollBreakdown` in Task 3 and is consumed by that exact name in Tasks 4, 9 and 19. `isActive` is produced in Task 3, narrowed in Task 9 to also exclude `Unknown`, and consumed in 19 — Task 9 comes before 19, so the narrowing is already in place. `parseExcelDate` keeps its name via re-export in Task 5 so the Task 11 importer is unaffected. `Callout`/`ConfirmDialog`/`Dialog` are produced in 14/15 and consumed in 12 and 16 — Task 12's test is written before `ConfirmDialog` exists, which is intentional under TDD but means Task 12 must be executed **after** Task 14. **Correction to the ordering: run Phase 2's Task 12 after Phase 3's Task 14.** Task 13 has no such dependency and stays in Phase 2.

**Review Focus coverage.** All five listed inputs have a test: `"12/31/2021"` in Task 5, `presentDays: 0` in Task 8, `"₹1,85,000"` in Task 11, `'[]'` in Task 10, and the invoice sheet in Task 11.

**Proportion.** This plan is long because the audit surface was large: 26 confirmed bugs across 5 subsystems, with 19 tasks. Each task is independently shippable and independently revertible. Phase 1 alone makes every number in the app trustworthy; Phase 3 alone clears the accessibility blockers; either is a defensible stopping point.

## Execution Order (corrected)

Phase 0 → 1 → 2 (Tasks 10, 11, 13) → 3 (Tasks 14, 15, 16, 17) → **2 (Task 12)** → 4 → 5