# OmniHR — Console Restructure, Planner Events & Login Upgrade

**Status:** Approved for implementation (2026-11-14)
**Scope:** Phase A of the 2026-11-14 request list. Finance report and Payslip Designer are Phase B.

## 1. Intent

Make the console feel like a set of focused workspaces rather than one universal page: a slim page header, page-owned toolbars, an Admin & Settings page that owns workspace actions, a grouped Workforce Planning module, a Planner that handles both leave and general events, and a login page upgraded to the same enterprise register.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | The header keeps only the menu toggle, page title/subtitle and the light/dark theme control. It no longer owns search, filters, Add Staff, Admin or Guides. |
| D2 | A `PageToolbar` component renders search, department, location and Add Staff on pages that use the filtered roster: Overview, Directory, Payroll, Performance, Recruitment, Retention, Trends. Attendance and Planner keep their own filters; Admin, Policies and Guides have none. |
| D3 | The sidebar footer actions (Export Roster, Reset Demo State, Sign out) move to **Admin & Settings**. |
| D4 | `Admin` is renamed **Admin & Settings** everywhere. |
| D5 | A new **Workforce Planning** sidebar group contains Recruitment Pipeline, ESOB & Gratuity and 3-Year Headcount Trends as submodules. |
| D6 | **Leave Planner** is renamed **Planner** and supports general events alongside leave. |
| D7 | `PlannerEvent` is a separate dataset: title, start/end date, type, optional department/location, notes. It is included in snapshots (v3) and IndexedDB (v3). |
| D8 | The login page implements Grok 4.7's visual review: auth-only control borders, recessed inputs, card edge/shadow, no primary glow, 44px theme toggle in a header grid, quiet SSO-by-domain disclosure, safe centering, larger back/footer targets. |
| D9 | No new runtime dependency. |
| D10 | Existing data and tests remain green; snapshot v1/v2 import with empty planner events. |

## 3. Planner event model

```ts
export type PlannerEventType = 'Event' | 'Training' | 'Meeting' | 'Holiday' | 'Other'
export interface PlannerEvent {
  id: string
  title: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // inclusive
  type: PlannerEventType
  department?: string
  location?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

- Unique by id; start <= end; title non-empty; dates valid.
- `DataSnapshot` v3 adds `plannerEvents: PlannerEvent[]`; `SNAPSHOT_VERSION = 3`. v1/v2 accepted with `[]`.
- IndexedDB schema v3 adds `plannerEvents` keyed by `id`; LocalStorage key `omnihr_planner_events`; MemoryStore mirrors it.
- Demo events seed only when the roster is the exact demo set and the key is absent: e.g. a quarterly business review and a manager training day in the coming weeks.

## 4. Planner UI

- Tab label **Planner**; Header title “Planner — Leave, Events & Coverage”.
- Calendar shows leave plans (existing chips/counts) and event chips with a distinct tone.
- Toolbar: month nav, filters (department/location/search, leave type/status, event type), **Add leave**, **Add event**.
- Day panel lists both leave entries and events; events can be edited/deleted.
- `PlannerEventModal`: title, start/end date, type, department/location (optional), notes. Validation: title, valid dates, start <= end.
- Leave coverage/peak settings remain.
- Event filters should not hide leave; leave filters should not hide events unless the user chooses. Keep two filter groups or a combined “Type” filter.

## 5. Navigation and Admin

- Sidebar: Overview, Directory, Attendance, Planner, Payroll, Performance, **Workforce Planning** group (Recruitment, ESOB & Gratuity, Headcount Trends), **Admin & Settings**, HR Policy Hub, User Guides.
- The Workforce Planning group expands/collapses; the active child is highlighted.
- Admin & Settings page: Data snapshot card, **Workspace actions** card (Export Roster, Reset Demo State, Sign out), Excel Hub.
- The header’s Admin/Guides/Add Staff buttons and global search/filters are removed; `PageToolbar` supplies the page-level equivalents.
- Sign out is now reached through Admin & Settings. No role enforcement in this phase.

## 6. Login upgrade

Implement Grok 4.7's review:
- Auth-only `--border-control` / `--border-control-strong` on `.auth-shell`; dark inputs recessed on `--bg-well`; keep light values.
- Dark card 18% white edge, no shadow; light card `--border-strong` + `--shadow-lg`.
- No glow/lift on the auth primary button.
- Theme toggle in a 44px `.auth-head` grid with the brand; 44×44 in auth only.
- SSO-by-domain becomes a quiet disclosure with chevron and `aria-expanded`; Microsoft/Okta remain filled.
- `safe center` + scroll; mobile card padding at <=480px.
- Back link 44px target; footer 13px; divider `--border-control`; title `--lh-tight`.

## 7. Testing

- Login: existing flows + domain disclosure/aria, responsive class behavior where testable.
- Planner: event modal validation, calendar event chips, day panel, event filters, persistence, snapshot round-trip.
- Store: IndexedDB v2→v3 upgrade, v1/v2 snapshot compatibility, demo event seed/custom roster, duplicate ids.
- Navigation: header slim, PageToolbar presence by tab, Admin & Settings rename, workspace actions, Workforce Planning group, sign-out only in Admin.
- Full gate green after every task.

## 8. Deferred

- Finance report and Payslip Designer (Phase B).
- Role-based access/read-only executive mode.
- Cloud storage, direct Drive integration, biometric integration.
