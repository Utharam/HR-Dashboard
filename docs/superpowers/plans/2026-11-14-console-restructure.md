# Console Restructure, Planner Events & Login Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Slim the universal header into page-owned toolbars, move workspace actions into Admin & Settings, group Workforce Planning, generalize the Leave Planner into a Planner with events, and apply Grok 4.7's login visual upgrade.

**Architecture:** `Header` becomes title + theme only; `PageToolbar` carries search/filters/Add Staff for roster pages. `PlannerEvent` is a new dataset in IndexedDB v3 and snapshot v3. `PlannerSection` renders leave plans and events together. Admin & Settings owns Export/Reset/Sign out and the Excel Hub.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library, IndexedDB, existing tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-console-restructure-design.md`

## Global Constraints

- No new runtime dependency.
- Business data through `DataStore`; theme/session stay localStorage.
- Snapshot v3 adds `plannerEvents`; v1/v2 accepted with empty arrays.
- No push. Keep `pre-console-restructure` tag.
- Existing 1,044-test suite stays green; every task ends on `npm run test`, `npm run lint`, `npm run build`.
- Tokens only; new CSS in `src/index.css`.
- One commit per task with the opencode identity.

## Review Focus

1. Header is genuinely slim; no page sees duplicate filter bars.
2. Admin & Settings owns the three workspace actions; sign-out is not orphaned.
3. Planner events and leave coexist without one filter hiding the other.
4. Snapshot v3/IndexedDB v3 upgrades preserve existing data.
5. Login remains accessible and responsive after the visual upgrade.

---

### Task 1: Login visual upgrade (parallel with Task 2)

**Files:** `src/views/LoginPage.tsx`, `src/components/ThemeToggle.tsx` (only if needed), `src/index.css`, `src/views/__tests__/LoginPage.test.tsx`, `src/components/__tests__/ThemeToggle.test.tsx`.

Implement Grok 4.7's review:
- Auth-only dark control borders (`--border-control: #747E90`, strong `#9CA3AF`) under `.auth-shell`; restore light `#7C8698`/`#5B6472` under the light auth shell; dark inputs on `--bg-well`.
- `.auth-card` dark border 18% white, no shadow; light `--border-strong` + `--shadow-lg`.
- Remove auth primary button glow and hover lift.
- `.auth-head` 44px grid: brand center, theme toggle right, static; auth toggle 44×44; console toggle stays 32px.
- SSO-by-domain quiet disclosure with chevron + `aria-expanded`; keep a clear accessible name.
- `safe center` + scroll; ≤480px padding; back link 44px; footer 13px; divider `--border-control`; title `--lh-tight`.
- Update tests for any label/class changes; run gate.
- Commit: `feat(login): apply enterprise visual upgrade`.

### Task 2: Planner event data, store and snapshot v3 (parallel with Task 1)

**Files:** `src/types.ts`, `src/utils/rowValidators.ts`, `src/utils/plannerEvents.ts` (new), `src/data/initialPlannerEvents.ts` (new), `src/data/DataStore.ts`, `IndexedDbStore.ts`, `LocalStorageStore.ts`, `MemoryStore.ts`, `DataGate.tsx`, `snapshot.ts`, their tests.

- Add `PlannerEventType`/`PlannerEvent`; `isPlannerEventRow` (title, valid dates, start <= end, type, optional strings, timestamps).
- `DataSnapshot` v3 adds `plannerEvents`; `SNAPSHOT_VERSION = 3`; v1/v2 normalize to `[]`.
- `DataStore.savePlannerEvents`; IndexedDB schema v3 store `plannerEvents` keyed by id; v2→v3 upgrade; LocalStorage key `omnihr_planner_events`; MemoryStore.
- Seed demo events only for the exact demo roster when the key is absent: a quarterly business review and a manager training day in the coming weeks.
- Snapshot import/export/clear includes events; Admin counts are wired in Task 4.
- Tests: v1/v2 snapshot import, v2→v3 DB upgrade, seed/custom roster, save/load, duplicate ids, round-trip.
- Commit: `feat(planner): add event data, store and snapshot v3`.

### Task 3: Slim header, PageToolbar, Admin & Settings and Workforce Planning

**Files:** `src/App.tsx`, `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/components/AdminSection.tsx`, `src/components/PageToolbar.tsx` (new), `src/index.css`, `src/__tests__/headerFilters.test.tsx` / shell tests, new navigation tests.

- `Header`: only menu toggle, page title/sub and theme toggle. Remove search/department/location/Add Staff/Admin/Guides.
- `PageToolbar`: search, department, location, Add Staff; render on Overview, Directory, Payroll, Performance, Recruitment, Retention, Trends. No toolbar on Attendance, Planner, Admin, Policies, Guides.
- Admin & Settings: rename tab/title; add **Workspace actions** card with Export Roster, Reset Demo State, Sign out; remove those from the Sidebar footer.
- Workforce Planning group in Sidebar: parent with Recruitment Pipeline, ESOB & Gratuity, 3-Year Headcount Trends children; expand/collapse; active child highlight.
- Update tests: header slim on every tab, toolbar presence/absence, Admin actions, group navigation, sign-out.
- Commit: `feat(console): slim header, admin settings and workforce planning group`.

### Task 4: Planner UI and App integration

**Files:** `src/components/LeavePlannerSection.tsx` → `PlannerSection.tsx` (or add events in place), `PlannerEventModal.tsx` (new), `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/Header.tsx`, `src/components/AdminSection.tsx`, `src/index.css`, tests.

- Rename the tab/component to Planner; Header title “Planner — Leave, Events & Coverage”.
- Props add `plannerEvents`, `onSaveEvent`, `onDeleteEvent`.
- Calendar renders event chips alongside leave; day panel lists both; event type filter; Add event button/modal with title/dates/type/department/location/notes and validation.
- App state/save effect for planner events; snapshot import reload; Admin snapshot counts add Events.
- Existing leave planning, coverage and settings remain.
- Tests: event modal, calendar chips, day panel, filter, persistence, snapshot round-trip, leave still works.
- Commit: `feat(planner): add events to the planner calendar`.

### Task 5: Docs, visual pass and final review

- Update README/GENERAL/EXCEL guides for the slim header, Admin & Settings, Workforce Planning, Planner events and login.
- Visual pass 1440/1024/390 light/dark: header/toolbar, Admin & Settings, Workforce Planning group, Planner with leave + events, login.
- Full gate and whole-branch review; fix Critical/Important findings.
- Commit: `docs: document console restructure and planner events`.

## Execution Order

1. Task 1 + Task 2 in parallel.
2. Task 3.
3. Task 4.
4. Task 5 + final review.
