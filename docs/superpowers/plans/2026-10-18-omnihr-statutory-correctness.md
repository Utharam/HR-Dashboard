# OmniHR Statutory Correctness Plan (EPF ceiling, Professional Tax, pre-lock validation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop OmniHR printing statutorily wrong deductions. Two live bugs (a stale EPF wage ceiling and a flat ₹200 Professional Tax charged in states that levy none) plus the validation that would have caught both.

**Architecture:** Statutory constants become **effective-dated schedules** resolved against a date, so a rate can never silently go stale again. Professional Tax becomes a pure, state-keyed engine returning `number | null`, where `null` means "not verified for this state" and is *surfaced* rather than defaulted. A pre-lock validator reuses the existing pre-sync inspection pattern from the Excel hub.

**Tech Stack:** React 19, TypeScript 6 (`strict: true`), Vite 8, Vitest 5, SheetJS. No new dependency. No Tailwind — `tailwindcss` is not installed.

**Spec:** `Research data/BLUEPRINT-ADAPTATION-ANALYSIS.md` (the analysis of the South India HRMS blueprint) and the audit findings it corrects.

## Global Constraints

- **No new dependency. No Tailwind.** Design system is `src/index.css` — never write a raw hex, rem or px value in a component.
- **Tests:** colocated under `src/**/__tests__/`. `vitest.config.ts` routes `.ts` → node, `.tsx` → jsdom. Explicit imports from `'vitest'`, never globals. **Never write the literal string `@vitest-environment` in a file** — the scanner matches it inside string literals and kills the worker.
- **tsconfig:** `tsconfig.app.json` excludes test paths; `tsconfig.test.json` includes them plus `src/test-setup.ts`. Never add `"node"` to `tsconfig.app.json`'s `types`.
- **No silent fallbacks.** A value that cannot be determined must be surfaced, not defaulted. This is the plan's central principle and the reason Task 2 returns `null`.
- **Current verified state:** 459 tests / 33 files green, lint 0/0, `tsc -p` both projects clean, `npm run build` exit 0, `strict: true` active, on `main` at `54f2306`.
- Every task ends with `npm run test`, `npm run lint`, `npm run build` and both `tsc -p` projects green.

## Review Focus

The five inputs most likely to bite, each pinned by a test in the owning task.

1. **Basic salary of exactly ₹25,000 on 2026-09-16 vs 2026-09-17** — the ceiling boundary must move the EPF from ₹1,800 to ₹3,000. Off-by-one on `from` being inclusive would be invisible on any other date. → Task 1
2. **An employee whose `workState` is `Delhi`** — Delhi levies no Professional Tax, so the deduction is exactly `0`, not ₹200. Charging ₹200 here is the current bug. → Task 2
3. **An employee whose `workState` is `'Unknown'`** (every `Remote / Distributed` seed row) — must produce `null`, surface an issue, and deduct **nothing**, never ₹200. → Tasks 2, 3
4. **A gross monthly wage of exactly ₹0** — already reaches `computePayroll` today from an explicit zero CTC cell and yields a negative net. Must become a blocker, not a floor applied in silence. → Task 3
5. **A round-tripped roster** — `import(export(x))` must still deep-equal `x` once `workState` exists. Forgetting the export column breaks the lossless-round-trip guarantee the previous body of work established. → Task 4

---

# Task 1: Effective-dated statutory rates and the correct EPF ceiling

**Files:**
- Create: `src/utils/statutoryRates.ts`
- Create: `src/utils/__tests__/statutoryRates.test.ts`
- Modify: `src/utils/payroll.ts` — ceiling becomes date-resolved; `EPF_WAGE_CEILING` becomes a schedule
- Modify: `src/utils/__tests__/payroll.test.ts`, `src/utils/__tests__/payrollParity.test.ts`
- Modify callers of `computeEPF` / `computePayroll` if any pass positionally

**Interfaces:**
- Produces:
  ```ts
  export interface EffectiveRate<T> { readonly from: string; readonly value: T }   // from = 'YYYY-MM-DD', inclusive
  export function rateAsOf<T>(schedule: readonly EffectiveRate<T>[], asOf: string): T
  export const EPF_WAGE_CEILING_SCHEDULE: readonly EffectiveRate<number>[]
  export function epfWageCeiling(asOf: string): number
  export function epfWageCeilingToday(): number
  ```
- Modified in `payroll.ts`:
  ```ts
  export function computeEPF(basicSalary: number, asOf?: string): number
  export function computePayroll(employee: Employee, asOf?: string): PayrollBreakdown
  ```
  `EPF_WAGE_CEILING` is **removed** as a scalar export; `EPF_RATE` stays.

**Verified statutory source (do not re-derive, do not "simplify"):**
- Ceiling ₹15,000 from 2014-09-01, and **₹25,000 from 2026-09-17** — Gazette of India **S.O. 5109(E)**, Ministry of Labour and Employment, 17 September 2026, under clause (89) of section 2 of the Code on Social Security 2020, superseding S.O. 2702(E) of 29 May 2026. Corroborated by PIB and PMO releases of 16 September 2026.
- Record the citation as a comment beside the schedule entry. That comment is the reason the next person can re-verify instead of guessing.

- [ ] **Step 1: Write the failing tests**

`src/utils/__tests__/statutoryRates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rateAsOf, epfWageCeiling, EPF_WAGE_CEILING_SCHEDULE, type EffectiveRate } from '../statutoryRates'

const sched: readonly EffectiveRate<string>[] = [
  { from: '2020-01-01', value: 'old' },
  { from: '2024-06-15', value: 'new' },
]

describe('rateAsOf', () => {
  it('returns the entry in force on the given date', () => {
    expect(rateAsOf(sched, '2024-06-15')).toBe('new')
  })
  it('treats from as inclusive and does not apply it a day early', () => {
    expect(rateAsOf(sched, '2024-06-14')).toBe('old')
  })
  it('returns the latest entry for a date past the end of the schedule', () => {
    expect(rateAsOf(sched, '2099-01-01')).toBe('new')
  })
  it('falls back to the earliest entry for a date before the schedule begins', () => {
    expect(rateAsOf(sched, '1990-01-01')).toBe('old')
  })
  it('does not depend on the order entries are declared in', () => {
    expect(rateAsOf([...sched].reverse(), '2024-06-15')).toBe('new')
  })
})

describe('epfWageCeiling', () => {
  it('is 15000 under the pre-2026 regime', () => {
    expect(epfWageCeiling('2026-09-16')).toBe(15000)
  })
  it('is 25000 from 17 September 2026', () => {
    expect(epfWageCeiling('2026-09-17')).toBe(25000)
  })
  it('carries the 25000 ceiling into the following year', () => {
    expect(epfWageCeiling('2027-04-01')).toBe(25000)
  })
  it('schedules the 2026 change with its gazette date', () => {
    expect(EPF_WAGE_CEILING_SCHEDULE.some(r => r.from === '2026-09-17' && r.value === 25000)).toBe(true)
  })
})
```

Add to `src/utils/__tests__/payroll.test.ts`:

```ts
describe('computeEPF against the wage ceiling schedule', () => {
  it('caps at 15000 before 17 September 2026', () => {
    expect(computeEPF(50000, '2026-09-16')).toBe(1800)
  })
  it('caps at 25000 from 17 September 2026', () => {
    expect(computeEPF(50000, '2026-09-17')).toBe(3000)
  })
  it('applies 12% below the ceiling on both sides of the change', () => {
    expect(computeEPF(10000, '2026-09-16')).toBe(1200)
    expect(computeEPF(20000, '2026-09-17')).toBe(2400)
  })
  it('still returns 0 for a non-finite basic salary', () => {
    expect(computeEPF(NaN, '2026-09-17')).toBe(0)
  })
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm run test`
Expected: `computeEPF` does not accept a second argument, so the new cases fail to type-check or return a single-argument result. The `statutoryRates` import fails to resolve. Confirm the failure is the missing feature, not a typo.

- [ ] **Step 3: Implement `statutoryRates.ts`**

`rateAsOf` selects the entry with the greatest `from` ≤ `asOf`; if `asOf` precedes every entry it returns the earliest entry's value (documented as "assume the earliest known regime" — pre-2014 payroll is out of scope). Compare as `YYYY-MM-DD` strings; do not construct `Date` objects, to stay timezone-independent.

- [ ] **Step 4: Rewire `payroll.ts`**

`computeEPF(basicSalary, asOf = toISODate(new Date()))` uses `Math.min(safe(basic), epfWageCeiling(asOf)) * EPF_RATE`, keeping the existing `Number.isFinite` guard **before** the clamp. Delete the `EPF_WAGE_CEILING` scalar export and every import of it.

**The default must be `toISODate(new Date())` from `src/utils/dates.ts`, never `new Date().toISOString()`** — the latter is the timezone bug fixed earlier in this codebase and would reintroduce it.

- [ ] **Step 5: Fix the fallout**

`payrollParity.test.ts` imports `EPF_WAGE_CEILING`. Replace it with `epfWageCeilingToday()` so the parity assertions track whatever is in force now rather than a frozen literal. Do not weaken any assertion — the parity property (aggregate equals sum of per-row) must still hold.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm run test && npm run lint && npm run build` and both `tsc -p` projects. All green.
Then report the recomputed figures: Σ EPF and the payroll card before and after, on the 200-row seed, and the delta per employee.

---

# Task 2: `workState` and a state-keyed Professional Tax engine

**Files:**
- Modify: `src/types.ts` — add `IndianState`, add `workState` to `Employee`
- Create: `src/utils/professionalTax.ts`
- Create: `src/utils/__tests__/professionalTax.test.ts`
- Create: `src/utils/__tests__/fixtures/employee.ts` — shared fixture factory (see Task 4's note)
- Modify: `src/data/initialData.ts` — derive `workState` for all 200 rows
- Modify: `src/utils/payroll.ts` — `computePayroll` uses the PT engine
- Modify: `src/utils/excelParser.ts` — read a `Work State` column

**Interfaces:**
- Produces:
  ```ts
  export type IndianState =
    | 'Andhra Pradesh' | 'Arunachal Pradesh' | 'Assam' | 'Bihar' | 'Chhattisgarh'
    | 'Delhi' | 'Goa' | 'Gujarat' | 'Haryana' | 'Himachal Pradesh' | 'Jammu and Kashmir'
    | 'Jharkhand' | 'Karnataka' | 'Kerala' | 'Madhya Pradesh' | 'Maharashtra' | 'Manipur'
    | 'Meghalaya' | 'Mizoram' | 'Nagaland' | 'Odisha' | 'Puducherry' | 'Punjab'
    | 'Rajasthan' | 'Sikkim' | 'Tamil Nadu' | 'Telangana' | 'Tripura' | 'Uttar Pradesh'
    | 'Uttarakhand' | 'West Bengal' | 'Chandigarh' | 'Dadra and Nagar Haveli and Daman and Diu'
    | 'Ladakh' | 'Lakshadweep' | 'Andaman and Nicobar Islands'
  export type WorkState = IndianState | 'Unknown'

  export interface PtSlab { readonly upTo: number | null; readonly amount: number }  // upTo null = and above
  export type PtRule =
    | { readonly kind: 'none' }
    | { readonly kind: 'monthly'; readonly slabs: readonly PtSlab[] }
    | { readonly kind: 'half-yearly'; readonly slabs: readonly PtSlab[]; readonly remittanceMonths: readonly number[] }

  export function professionalTax(workState: WorkState, monthlyGross: number, month: number): number | null
  export const PT_RULES: Readonly<Partial<Record<IndianState, PtRule>>>
  ```
  `professionalTax` returns `null` when the state has **no verified rule**, and `0` only when a rule says the levy is nil.

**Rule population — this is the task's real work, and it must not be guessed:**
- `Delhi: { kind: 'none' }` — Delhi does not levy Professional Tax. This is a statutory fact and it is the immediate bug fix for the 40 `Delhi-NCR Office` rows.
- Populate `Karnataka`, `Maharashtra` and `Telangana` **only after verifying each against the state's own schedule**, and put the citation in a comment beside the rule, exactly as Task 1 does for the EPF ceiling. Verify specifically whether each state's amount varies in a particular month (the blueprint called this the "half-yearly incentive trap").
- **Every other state is absent from `PT_RULES`** and therefore returns `null`. That is the intended state of the world: the app knows what it has verified. Do not fill the table with plausible-looking numbers — an unverified rate is the same class of defect as the stale ₹15,000.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { professionalTax } from '../professionalTax'

describe('professionalTax: states where the levy is nil', () => {
  it('charges nothing in Delhi', () => {
    expect(professionalTax('Delhi', 150000, 3)).toBe(0)
  })
})

describe('professionalTax: unverified states', () => {
  it('returns null for a state with no verified rule', () => {
    expect(professionalTax('Sikkim', 50000, 3)).toBeNull()
  })
  it('returns null for an unknown work state', () => {
    expect(professionalTax('Unknown', 50000, 3)).toBeNull()
  })
  it('does not fall back to a flat amount for an unverified state', () => {
    expect(professionalTax('Sikkim', 50000, 3)).not.toBe(200)
  })
})

describe('professionalTax: verified rules (populated in step 3)', () => {
  it.each([
    // Fill from the verified schedules. One case per band per state, plus the
    // month that differs if the state varies its amount.
    ['Karnataka', 30000, 3, 200],
  ] as const)('%s at gross %i in month %i is %i', (state, gross, month, expected) => {
    expect(professionalTax(state, gross, month)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run and confirm RED** — module missing.

- [ ] **Step 3: Implement, verifying each populated rule against its statute**

Slab selection: the first slab whose `upTo` is `null` or `>= monthlyGross` wins. A `half-yearly` rule returns the slab amount only in its `remittanceMonths` and `0` otherwise — that is how a state that collects half-yearly behaves monthly.

- [ ] **Step 4: Add `workState` to `Employee` and to the seed**

Add `workState: WorkState` to `src/types.ts`. In `src/data/initialData.ts`, derive it from `location` with an explicit, reviewable map and add it to all 200 rows:
```
'Bengaluru HQ'        → 'Karnataka'
'Mumbai Hub'          → 'Maharashtra'
'Delhi-NCR Office'    → 'Delhi'
'Hyderabad Center'    → 'Telangana'
'Remote / Distributed'→ 'Unknown'   // genuinely undeterminable; must not be guessed
```
`'Unknown'` for remote staff is the correct answer, not a gap to paper over.

- [ ] **Step 5: `computePayroll` uses the engine**

Replace the flat `PROFESSIONAL_TAX` with `professionalTax(employee.workState, gross, month)`. `PayrollBreakdown.professionalTax` becomes `number | null`, and `totalDeductions`/`netPayable` must handle `null` by **excluding PT and marking the row as indeterminate** rather than adding zero. Add a `ptDetermined: boolean` to `PayrollBreakdown`. `PROFESSIONAL_TAX` is removed as a scalar export.

- [ ] **Step 6: Verify GREEN and commit**

Report: Σ PT and Σ net before and after on the seed; how many of the 200 rows have indeterminate PT; and the per-state breakdown of the delta.

---

# Task 3: Pre-lock payroll validator

**Files:**
- Create: `src/utils/payrollValidation.ts`
- Create: `src/utils/__tests__/payrollValidation.test.ts`
- Modify: `src/components/PayrollSection.tsx` — render issues above the table
- Modify: `src/components/__tests__/` — a rendered assertion that a blocker is visible

**Interfaces:**
- Produces:
  ```ts
  export type PayrollIssueCode =
    | 'NEGATIVE_NET_PAY' | 'ZERO_GROSS' | 'DUPLICATE_EMPLOYEE_ID'
    | 'WORK_STATE_UNKNOWN' | 'PT_NOT_VERIFIED' | 'DEDUCTIONS_EXCEED_GROSS'
  export interface PayrollIssue {
    readonly code: PayrollIssueCode
    readonly severity: 'blocker' | 'warning'
    readonly employeeIds: readonly string[]
    readonly message: string
  }
  export function validatePayrollRun(employees: Employee[], asOf?: string): PayrollIssue[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('validatePayrollRun', () => {
  it('blocks a run containing a zero-gross employee', () => {
    const issues = validatePayrollRun([makeEmployee({ monthlyCTC: 0, basicSalary: 0 })])
    expect(issues.some(i => i.code === 'ZERO_GROSS' && i.severity === 'blocker')).toBe(true)
  })
  it('blocks duplicate employee ids rather than silently overwriting', () => {
    const issues = validatePayrollRun([
      makeEmployee({ id: 'EMP-1' }), makeEmployee({ id: 'EMP-1' }),
    ])
    expect(issues.some(i => i.code === 'DUPLICATE_EMPLOYEE_ID')).toBe(true)
  })
  it('warns once per state it cannot verify PT for, naming the states', () => {
    const issues = validatePayrollRun([makeEmployee({ workState: 'Sikkim' })])
    const issue = issues.find(i => i.code === 'PT_NOT_VERIFIED')
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('Sikkim')
  })
  it('reports a clean run as having no blockers', () => {
    expect(validatePayrollRun([makeEmployee({ workState: 'Delhi' })]).filter(i => i.severity === 'blocker')).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm RED.**

- [ ] **Step 3: Implement**

Group issues by code with the affected `employeeIds` so a 200-row run reports one issue per problem, not 200. Severity: `'blocker'` for anything that makes a payable figure wrong or undefined (zero gross, duplicate id, deductions exceeding gross); `'warning'` for anything that makes a figure indeterminate (unverified PT, unknown work state).

- [ ] **Step 4: Surface in `PayrollSection`**

Render above the table using the existing `.alert tone-*` classes and the existing `Callout` component — no new colours, no raw values. Blockers must be visible without scrolling past the table. Add the rendered test.

- [ ] **Step 5: Verify GREEN and commit**

Report: the seed's issue list as actually produced (codes, counts, severities).

---

# Task 4: Export/import `workState`, keep the round trip lossless, correct the docs

**Files:**
- Modify: `src/utils/excelSchema.ts` — add the `Work State` column
- Modify: `src/utils/excelParser.ts` — alias list for the new column
- Modify: `src/utils/__tests__/roundTrip.test.ts` — assert `workState` survives
- Modify: `src/test-setup.ts` or tsconfig — see the fixture note below
- Modify: `README.md`, `docs/EXCEL_SHEET_HANDLING_GUIDE.md`, `src/components/GuidesSection.tsx`

**Interfaces:**
- Consumes: `WorkState` and the location→state map from Task 2.
- Produces: `resolveWorkState(value: unknown, location: unknown): WorkState` in `professionalTax.ts` or `excelSchema.ts` — one owner for the coercion, used by both the seed and the importer.

- [ ] **Step 1: Extend the round-trip test first**

The existing test asserts `import(export(x))` deep-equals `INITIAL_EMPLOYEES`. Adding `workState` to `Employee` breaks it until the export column exists — that is the guard working. **Do not fix this by weakening the test or by making `workState` optional.** Add `Work State` to the export and read it back.

Add a case asserting an unrecognised state string round-trips to `'Unknown'` rather than to a nearest neighbour.

- [ ] **Step 2: Implement the column and the alias**

Add to `STAFF_ROSTER_COLUMNS` and to the parser's alias list (`Work State`, `State`, `Work Location State`). Route through the single coercion helper from Task 2.

- [ ] **Step 3: Correct the documentation**

Three things are now factually wrong in the docs and the in-app guide:
- The EPF ceiling is no longer ₹15,000 — state ₹25,000 with effect from 17 September 2026, and cite S.O. 5109(E).
- Professional Tax is no longer a flat ₹200 — describe it as state-wise and say which states are verified.
- The roster is one column longer. Correct every stated column count.

Search `README.md`, `docs/`, and `GuidesSection.tsx` for each claim. Keep the edits targeted — `GuidesSection.tsx` is ~39KB of documentation content and must not be restructured.

- [ ] **Step 4: Verify GREEN and commit**

Run all gates. Report the round-trip diff proving `workState` survives.

---

## Self-Review

**Spec coverage.** The blueprint analysis produced five ADAPT candidates. This plan implements three: the effective-dated EPF ceiling (Task 1), the state PT engine with `workState` (Task 2), and the pre-lock validator plus duplicate-id and negative-net handling (Task 3). It also closes the round-trip and documentation obligations those create (Task 4).

**Deliberately excluded, and why:**
- **Employer-side EPF/EPS/EDLI and ESIC.** Real and valuable, but they change what the payroll model *is* — from "what the employee receives" to "what the employer spends" — and that is a product decision, not a correctness fix. It deserves its own plan.
- **TDS / income-tax estimator.** The blueprint's Tax Year 2026-27 figures are the most likely to be wrong in detail and the most costly to get wrong. Do it separately, with primary sources, after the rest of the model is sound.
- **Effective-dated compensation components, revisions, arrears.** A large data-model change. Nothing in this plan depends on it.
- **Supabase/Postgres, auth, biometrics, portal return filing.** Requires a backend this app does not have and is out of scope by design.
- **Festival commission, ornament incentives, showroom metrics.** Jewellery-retail vertical, does not generalise.

**Type consistency.** `EffectiveRate<T>` from Task 1 is reused for the PT slab tables in Task 2. `WorkState` produced in Task 2 is consumed by Tasks 3 and 4. `ptDetermined` is added to `PayrollBreakdown` in Task 2 and is what Task 3's `PT_NOT_VERIFIED` warning describes. `makeEmployee` is introduced in Task 2 and used by Task 3's tests, so Task 2 must land first.

**The fixture-churn note.** Adding a required field to `Employee` breaks every object literal across the suite, exactly as removing `attendancePct` did in the previous body of work. Introduce `src/utils/__tests__/fixtures/employee.ts` exporting `makeEmployee(overrides: Partial<Employee> = {}): Employee` in Task 2, and route new fixtures through it. `tsconfig.app.json` must exclude `src/**/__tests__/**` and `tsconfig.test.json` must include it — glob on the directory, not on `.test.ts`, or a non-test helper under `__tests__` lands in the app project and pulls in vitest types.

**Ordering.** Tasks are strictly sequential: Task 2 imports `rateAsOf`'s sibling module shape, Task 3's warnings describe Task 2's `null`, and Task 4's round trip depends on both. Do not reorder.

**Proportion.** Four tasks. Each is independently shippable and independently revertible. Task 1 alone (one schedule entry and a date-resolved ceiling) fixes the largest live wrong number in the app.
