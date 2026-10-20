# OmniHR — Landing, Login, Theme & Auth Seams: Design

**Status:** APPROVED — implemented by `docs/superpowers/plans/2026-10-18-omnihr-front-door-and-theme.md` (2026-10-18).

**Date:** 2026-10-18
**Supersedes/expands:** `docs/superpowers/specs/2026-10-18-landing-and-auth-design-brief.md` (the six OPEN questions there are now answered; see §3).
**Inherited constraints:** `docs/superpowers/plans/2026-10-17-omnihr-correctness-and-ux.md` — Global Constraints still bind.

---

## 1. Intent and why

Give OmniHR a **front door** — a landing page and a login — so a CEO or HR executive can arrive at the product, see what it is, understand that it is serious, and sign in. Today the app opens directly onto the console; there is no way in and no way out.

While the door is being built, make the *whole* product **themable**, because the human partner asked for it (§3). This turns out to be the larger half of the work: the console is a committed dark theme, and a light theme is a second full token set that has to reach every surface, including the charts.

Finally, leave **seams** for a future backend so the swap is an implementation, not a rewrite. No backend is built.

---

## 2. Goals, non-goals, anti-goals

### 2.1 Goals

- A landing page that establishes credibility and routes an executive to sign in — with no marketing register.
- A login page that reads as enterprise-grade and advertises SSO.
- A **three-state theme control** (dark / light / system) that applies across landing, login and the entire console, remembered across sessions.
- A hand-rolled **route layer** for landing → login → console, with a guard.
- **Auth seams**: a `Session` type, an `AuthProvider`, a single `AuthClient` interface with a working `LocalAuthClient` stub, a route guard, and one place for environment configuration.
- Everything the repo already enforces: tokens only, no Tailwind, no new runtime dependency, tests for new behaviour.

### 2.2 Non-goals (this project)

- No backend, no server, no database, no real user store, no password hashing, no RBAC, no multi-tenancy, no audit log.
- **No `DataProvider` / `ApiClient` data seam.** The brief (§6.4) flags it as the larger seam and "worth deciding deliberately". The requested scope names the **auth seams** only; the data seam is deferred (§11) so this project stays about the front door and the theme.
- No white-label / tenant branding (§3, locked to one identity). A documented seam is left.
- No deep-linking or URL state (hand-rolled routing, §3).
- No redesign of the console's information architecture. The console gains a theme and a sign-out control; its layout and content do not change.

### 2.3 Anti-goals (explicit failures even if they work)

From the brief, restated because they are review criteria:

- No pricing, tiers, "upgrade", testimonials, customer-logo ribbons, social proof, lead capture, waitlist, newsletter, countdown, scarcity or chat-popups.
- No growth-hack copy ("revolutionise", "supercharge", "10x").
- No Awwwards showpiece: no WebGL particle field, video scrub, liquid-metal hero, cursor-follow blob.
- A **light theme that merely inverts** the dark one — washed-out text, invisible borders, unreadable status badges, blown-out shadows — is a failure. Light must be designed, not derived.

---

## 3. Locked decisions

| # | Decision | Source |
|---|---|---|
| L1 | First viewers are a CEO / HR executive. The front page is **not** a marketing tool. | Brief §2.1–2.3 |
| L2 | Tone: neat, classy, professional. Reference register: Linear, Stripe, Vercel, Ramp. | Brief §2.3 |
| L3 | The UI Library (`D:\Projects\UI Library`) is **marketing-prompt** material only, for landing/login. It does not inform the console. | Brief §4 |
| L4 | Theme reach: the toggle applies to the **entire app** (landing, login, console), not just the front door. | Session |
| L5 | The theme control is a **small top-right icon**, not a labelled switch. | Session |
| L6 | The control is a **three-state cycle** — dark → light → system. | Session |
| L7 | **Default is dark** when nothing is stored (preserves the locked dark-first identity for a first-time executive). | Session (my call, uncontested) |
| L8 | Landing content is a **gateway plus a short, factual credibility section** (substance, not marketing). | Session |
| L9 | **One OmniHR identity.** No customer logo/colour on landing or login; a documented seam is left for later. | Session |
| L10 | The login **advertises enterprise auth**: email/password plus Microsoft / Okta / SSO-by-domain, wired to the auth seam. | Session |
| L11 | **Hand-rolled view state.** No `react-router-dom`; no new runtime dependency. | Session |
| L12 | **Same bundle.** Landing and login ship in the one Vite build, sharing tokens and primitives. | Session |

---

## 4. The theme system

### 4.1 Shape

- A `ThemeMode` is `'dark' | 'light' | 'system'`; a `ResolvedTheme` is `'dark' | 'light'`.
- The resolved theme is written to **`document.documentElement`** as `data-theme="dark" | "light"`. `'system'` is **never** written to the DOM — it is resolved first (via `window.matchMedia('(prefers-color-scheme: dark)')`), so CSS only ever knows two states.
- Dark stays the `:root` default (the existing token block is unchanged in meaning and value). Light is added as `:root[data-theme="light"] { … }` overrides. This keeps every existing component working with no visual change in dark.
- A `ThemeProvider` (React context) owns the mode, exposes `{ mode, resolved, setMode, cycle }`, and a `useTheme()` hook.

### 4.2 The cycle and the icon

- `cycle()` advances dark → light → system → dark.
- The control is a single icon button (`<ThemeToggle/>`, `lucide-react` `Moon` / `Sun` / `Monitor`), **one instance per surface, always top-right**: the far right of the console `Header` action row; the right end of the landing's `landing-nav`; and floating (absolutely positioned) top-right on the login, which has no nav. Never two on one page.
- Accessibility: `aria-label` names the *current* mode and the *next* action ("Theme: dark (switch to light)"), and a live region announces the change. It is a real `<button>`, keyboard reachable, and the icon is `aria-hidden`. This is a tri-state control, not a checkbox, so it does not fake `role="switch"`.

### 4.3 Persistence

- The mode persists **per device** through the existing `utils/storage.ts` envelope — `savePersisted(THEME_KEY, [{ mode }])` / `loadPersisted(THEME_KEY, isThemeModeRow, [])`. No raw `localStorage`. No new storage API.
- Validator: a row is a non-null object whose `mode` is one of the three literals. Anything else is discarded and the default (dark) applies.
- **No flash of wrong theme (FOUC?).** The attribute is applied in `main.tsx` *before* `createRoot` runs: a `bootstrapTheme()` (in the theme module) reads storage through `storage.ts`, resolves `'system'`, and sets `data-theme`. Because `index.css` is imported above it in the same module, the attribute is set before first paint for the overwhelmingly common cases (no `localStorage` round-trip flush is needed to set an attribute). This keeps all storage access inside `storage.ts`; no duplicated envelope format in `index.html`.
- **`system` tracks the OS live.** While `mode === 'system'`, `ThemeProvider` subscribes to `window.matchMedia('(prefers-color-scheme: dark)')`'s `change` event and re-resolves the attribute — and therefore the charts — without a reload. The subscription is torn down when the mode leaves `system` or the provider unmounts, so the resolved theme is one source of truth and cannot go stale.

### 4.4 The light token set — designed, not inverted

Light overrides are defined for **every** dark token, in `index.css`, under `:root[data-theme="light"]`. The families:

- **Surfaces:** `--bg-main`, `--bg-card`, `--bg-card-hover`, `--bg-card-subtle`, `--bg-table-head`, `--bg-well`, `--scrim`.
- **Borders:** `--border`, `--border-strong`, `--border-focus`, `--hairline` (light needs *darker* hairlines, not lighter).
- **Brand:** `--primary`, `--primary-hover`, `--primary-glow`, `--primary-ring`.
- **Status (each: base + `-glow` + `-edge` + `-soft`):** success, warning, danger, info, purple, pink; plus `--neutral-tone`, `--neutral-edge`.
- **Text:** `--text-bright`, `--text-main`, `--text-muted`, `--text-dim` (picked for ≥4.5:1 on `--bg-card`, the same bar the dark `--text-dim` meets).
- **Charts:** `--grid-line`, and the `-soft` family.
- **Elevation:** `--shadow-*` and `--shadow-primary` (dark shadows are near-invisible on a light surface and read as dirt; the light set is softer and lower-alpha).
- `color-scheme` becomes theme-driven (`:root { color-scheme: dark }` / `:root[data-theme="light"] { color-scheme: light }`).

**The concrete light palette.** Taken from the approved mockup (`frontdoor-theme-app.html`), refined to clear AA (≥4.5:1 body text, ≥3:1 UI borders/icons) and marked as the value to hit — the plan may tune a value only if it fails a contrast check, and any change is recorded. **Brand and status hues are re-tuned (darkened) for light, not reused unchanged**, because the dark `-soft` values (`#34D399`, `#FBBF24`, `#F87171`, `#60A5FA`) are unreadable on white.

| Token | Light value | Token | Light value |
|---|---|---|---|
| `--bg-main` | `#F6F7F9` | `--primary` | `#4F46E5` |
| `--bg-card` | `#FFFFFF` | `--primary-hover` | `#4338CA` |
| `--bg-card-hover` | `#F1F3F7` | `--primary-glow` | `rgba(79,70,229,0.10)` |
| `--bg-card-subtle` | `#F3F4F7` | `--primary-ring` | `rgba(79,70,229,0.28)` |
| `--bg-table-head` | `#F3F4F7` | `--border` | `#E4E7EC` |
| `--bg-well` | `#FAFBFC` | `--border-strong` | `#D0D5DD` |
| `--scrim` | `rgba(15,23,42,0.45)` | `--border-focus` | `rgba(79,70,229,0.45)` |
| `--text-bright` | `#0B0F19` | `--hairline` | `#EDF0F3` |
| `--text-main` | `#1F2937` | `--grid-line` | `#E9EBEF` |
| `--text-muted` | `#5B6472` | `--neutral-tone` | `#6B7280` |
| `--text-dim` | `#6B7280` | `--neutral-edge` | `rgba(107,114,128,0.35)` |
| `--success` / `-soft` | `#059669` / `#047857` | `--danger` / `-soft` | `#DC2626` / `#B91C1C` |
| `--warning` / `-soft` | `#D97706` / `#B45309` | `--info` / `-soft` | `#2563EB` / `#1D4ED8` |
| `--success-glow` / `-edge` | `rgba(5,150,105,.12)` / `rgba(5,150,105,.30)` | `--danger-glow` / `-edge` | `rgba(220,38,38,.10)` / `rgba(220,38,38,.28)` |
| `--warning-glow` / `-edge` | `rgba(217,119,6,.12)` / `rgba(217,119,6,.30)` | `--info-glow` / `-edge` | `rgba(37,99,235,.10)` / `rgba(37,99,235,.28)` |
| `--purple` / `-soft` | `#7C3AED` / `#6D28D9` | `--pink` / `-soft` | `#DB2777` / `#BE185D` |
| `--purple-glow` / `-edge` | `rgba(124,58,237,.10)` / `rgba(124,58,237,.28)` | `--pink-glow` / `-edge` | `rgba(219,39,119,.10)` / `rgba(219,39,119,.25)` |

Shadows (light) — soft and low-alpha, so they read as lift rather than dirt: `--shadow-xs … --shadow-xl` become `0 … rgba(15,23,42,0.06–0.20)` pairs, and `--shadow-primary` becomes `0 4px 14px -4px rgba(79,70,229,0.30)`.


**Fragile spots that must be tokenized as part of this**, because they are hardcoded white/colour assumptions that break on light:

1. `.badge-resigned` — `background: rgba(107,114,128,0.2)` inline.
2. `.omni-table tr:hover td` — `background: rgba(255,255,255,0.025)`.
3. `.toggle-chip--on:hover` — `background: rgba(16,185,129,0.24)`.
4. Date/datetime picker indicator `filter: invert(0.7)` — must not invert in light.
5. `--tone-*` aliases resolve from the tokens above and need no separate light values, but every `.tone-*` consumer must be re-checked on light.

Each becomes a token (new tokens defined in **both** themes) or a theme-scoped rule.

### 4.5 Charts must become reactive (the main hidden cost)

Today `OverviewSection`, `PerformanceSection` and `TrendsSection` each compute a module-level `CHART` palette via `getComputedStyle(document.documentElement)` **once at import**. A theme switch will not reach them, because the value is captured before the theme exists and never recomputed.

- Extract a shared `src/theme/chartTokens.ts` exporting:
  - `readChartTokens(readVar: (name: string) => string): ChartTokens` — **pure**, injectable style source, unit-testable without the DOM.
  - `useChartTokens(): ChartTokens` — reads the resolved theme from `useTheme()` (to subscribe to changes) and calls `readChartTokens` against `getComputedStyle`, memoised on the resolved theme.
- The three sections build their `options`/`data` inside the component with `useMemo` keyed on the tokens, instead of module-level constants. This is the change that makes charts follow the theme.

### 4.6 Print

Print rules already force a light surface with `!important`. They stay, but must be re-checked: the new light tokens must not fight them, and the theme toggle must remain `.no-print`.

---

## 5. Design-language additions

New CSS lives in `src/index.css`. Every value resolves through a token. **No new raw hex/rem/px in a component.** No new colour families — new surfaces reuse the existing token names.

Reuse rather than reinvent where possible: `.btn*`, `.omni-card`, `.omni-field` / `.omni-input`, `.badge-*`, `.callout`, `.alert`, `.page-header`, `.brand-mark` / `.brand-name` / `.brand-tagline`, `.sr-only`.

New classes (names indicative; final names settled in the plan):

- **Landing:** `.landing-shell`, `.landing-nav`, `.landing-brand`, `.landing-hero`, `.landing-lede`, `.landing-actions`, `.cred-strip`, `.cred-item`, `.product-preview` (+ its parts), `.site-footer`.
- **Login:** `.auth-shell`, `.auth-card`, `.auth-brand`, `.auth-form`, `.auth-divider`, `.auth-sso`, `.auth-foot`.
- **Shared:** `.theme-toggle` (the icon button), and a `.app-shell__brand-inline` variant if the header lockup needs one.

Any genuinely new token (e.g. a light-mode hover tint for tables) is defined in **both** the `:root` and the light block.

---

## 6. Landing page

**Route:** the default unauthenticated view. **Component:** `src/views/LandingPage.tsx`.

Structure, top to bottom:

1. **`landing-nav`** — brand lockup (`.brand-mark` + `.brand-name`) left; right side = the `.theme-toggle` icon and a secondary "Sign in" button. No nav links to nowhere.
2. **`landing-hero`** — headline, one line of what it is, who it serves, and a single primary CTA **"Sign in to OmniHR"** that routes to login. Working copy (from the approved mockup):
   - Headline: *"The operating console for your workforce."*
   - Lede: *"Staff records, statutory payroll and compliance in one place — audit-ready."*
3. **`product-preview`** — a **static, tokenized illustration** of the console (brand rail, KPI tiles, a chart bar block). Deliberately *not* a live render and *not* a screenshot: no console data, no chart library, no `INITIAL_EMPLOYEES` on the front door. It exists to show the product, which is the credibility. Marked `aria-hidden` (it is decoration; the text carries the meaning).
4. **`cred-strip`** — the short credibility section. Four factual items, each a `cred-item`: **Statutory payroll · EPF & Professional Tax · Audit-ready registers · Excel import/export.** Each links toward the in-app Guides section in spirit; on the front door they are plain statements, not claims.
5. **`site-footer`** — minimal: product name and a version string. Nothing to sign up for.

**The whole page is `tokens`-styled and fully theme-aware.** The copy contains no marketing register; a test asserts none of the banned words/phrases appear.

---

## 7. Login page

**Route:** reached only from the landing CTA. **Component:** `src/views/LoginPage.tsx`.

1. `.theme-toggle` floating top-right.
2. **`auth-card`** — brand lockup, `Sign in`, sub-line *"Use the account your organisation provisioned."*
3. **Email + password** fields (`.omni-field` / `.omni-label` / `.omni-input`), with `<label>`s, `autocomplete` hints, and a submit-on-Enter form.
4. **Primary action** `Sign in`, disabled while submitting.
5. **Error state:** an invalid credential renders a `Callout tone="danger"` (reusing the existing primitive) — never an `alert`. Empty fields are validated before the client is called.
6. **`auth-divider`** — "or continue with".
7. **SSO stubs** — `Microsoft`, `Okta`, `Sign in with SSO by domain`, each a `.btn btn-secondary`. Microsoft and Okta call `authClient.signInWithProvider('microsoft' | 'okta')` directly. **SSO by domain** reveals an inline `Work domain` `omni-field` *within the SSO group* (progressive disclosure, not a separate step), validates a domain-like value, and calls `signInWithProvider('domain', value)`. In the shipped stub all three resolve to a session so the flow is demonstrable; the interface is the seam. A test asserts the domain field appears only after the domain button is pressed.
8. **`auth-foot`** — *"Access is provisioned by your organisation's administrator."*
9. A quiet "← Back" to the landing.

---

## 8. Route layer

A tiny hand-rolled coordinator, `src/Root.tsx`, replaces `App` as what `main.tsx` renders:

```
ThemeProvider
  AuthProvider
    if status === 'loading'  -> a minimal, token-styled boot placeholder
    if status === 'authenticated' -> <App/>            (the existing console, unchanged)
    else if view === 'login' -> <LoginPage .../>
    else                     -> <LandingPage .../>
```

- `view` is `useState<'landing' | 'login'>('landing')`, owned by `Root`.
- `RequireAuth` (`src/auth/RequireAuth.tsx`) is built and tested as the reusable guard primitive, even though `Root`'s branch also expresses the same rule — it is the documented seam a future router would use.
- **Sign out** clears the session (through `AuthClient.signOut` → storage) and returns to the landing. The control lives in the sidebar footer (`.app-sidebar__footer`), beside Export and Reset. The console is otherwise untouched.
- `App.tsx` gains only what it needs: it stays the console, and reads the session for the sign-out control (or receives `onSignOut` from `Root`).

---

## 9. Auth seams

`src/types.ts` additions:

```ts
export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'
export interface SessionUser { id: string; name: string; email: string; org?: string }
export interface Session { user: SessionUser; issuedAt: string; expiresAt?: string }
export interface Credentials { email: string; password: string }
export type SsoProvider = 'microsoft' | 'okta' | 'domain'
```

`src/auth/AuthClient.ts` — the contract a real backend implements:

```ts
export interface AuthClient {
  getSession(): Promise<Session | null>
  signIn(credentials: Credentials): Promise<Session>
  signInWithProvider(provider: SsoProvider, payload?: string): Promise<Session>
  refreshSession(): Promise<Session | null>
  signOut(): Promise<void>
}
```

`src/auth/LocalAuthClient.ts` — the shipped stub:

- `signIn` validates a documented test rule (any non-empty email + a non-empty password), returns a `Session`, and persists it via `savePersisted(SESSION_KEY, [session])`.
- `signInWithProvider` returns a stub provider session after a short delay.
- `getSession` reads and validates the persisted session; an expired `expiresAt` yields `null`.
- `signOut` clears the key via `clearPersisted`.
- All persistence uses `storage.ts`'s `{ v, rows }` envelope with a one-row array; the session validator is a named, tested guard.

`src/auth/AuthContext.tsx` — `AuthProvider` + `useAuth()` exposing `{ session, status, signIn, signInWithProvider, signOut }`. On mount it calls `getSession()` and resolves `status`.

`src/config/env.ts` — the single place for configuration: `API_BASE_URL` from `import.meta.env.VITE_API_BASE_URL` (default `''`) and `AUTH_MODE` (`'local'` default). A `createAuthClient()` factory returns `LocalAuthClient` now and is where an `HttpAuthClient` would be selected later. **No URLs scattered anywhere else.**

---

## 10. File structure

**Created:**
| File | Responsibility |
|---|---|
| `src/Root.tsx` | Route layer: view state, provider composition, auth branching |
| `src/views/LandingPage.tsx` | The landing page |
| `src/views/LoginPage.tsx` | The login page |
| `src/components/ThemeToggle.tsx` | The top-right icon control |
| `src/theme/ThemeContext.tsx` | Provider, `useTheme`, DOM attribute application |
| `src/theme/theme.ts` | Pure logic: `resolveTheme`, `nextMode`, validators |
| `src/theme/chartTokens.ts` | Pure `readChartTokens` + `useChartTokens` |
| `src/auth/AuthContext.tsx` | `AuthProvider`, `useAuth` |
| `src/auth/AuthClient.ts` | The interface |
| `src/auth/LocalAuthClient.ts` | The stub implementation |
| `src/auth/RequireAuth.tsx` | The guard primitive |
| `src/config/env.ts` | Environment configuration seam |
| `src/utils/themeStorage.ts` or additions to `rowValidators.ts` | The `isThemeModeRow` / `isSessionRow` validators (colocated with the existing validators) |

**Modified:**
`src/main.tsx` (bootstrap + render `Root`), `src/App.tsx` (sign-out control seam), `src/components/Header.tsx` (theme toggle), `src/components/Sidebar.tsx` (sign-out), `src/index.css` (light token set, new classes, fragile-spot fixes), `src/types.ts`, and the three chart sections (`OverviewSection`, `PerformanceSection`, `TrendsSection`) for reactive tokens.

**Not modified:** `utils/payroll.ts`, `dates.ts`, `leave.ts`, `pagination.ts`, `excelSchema.ts`, `storage.ts` (used as-is), `rowValidators.ts` (added to, not changed), and all data.

---

## 11. Deferred / out of scope (explicit)

- **`DataProvider` / `ApiClient` data seam.** Deliberately deferred; the auth seam is the one this project names. Recorded here so it is a decision, not an oversight.
- Real backend, sessions on a server, hashing, RBAC, tenancy, audit.
- White-label tenant branding (seam noted: a `TenantConfig` would sit beside `env.ts`).
- Deep-linking / URL routing.
- A live/responsive product preview on the landing (static illustration only).

---

## 12. Testing strategy

Follows the repo's rules exactly: Vitest, split by extension (`*.test.ts` → node, `*.test.tsx` → jsdom), explicit imports, colocated under `__tests__/`, **never** the literal environment docblock string, never `"node"` in `tsconfig.app.json` types.

- **Pure (`node`):** `theme.ts` resolve/cycle/validation; `chartTokens.readChartTokens` with a fake style source for both themes; the banned-copy guard for landing; the token-discipline guard (no raw hex in components).
- **DOM (`jsdom`):** `ThemeProvider` (cycle order, default dark, persistence via a stubbed `localStorage`, attribute set), `ThemeToggle` (accessible name + cycle), `LandingPage` (hero copy, CTA routes to login, theme icon present), `LoginPage` (validation, error `Callout`, SSO buttons present, submit → session), `RequireAuth`, and a `Root` flow test (landing → login → console, and sign-out → landing).
- **Parity:** assert chart colours are re-read on theme change by stubbing `getComputedStyle` and flipping the resolved theme.
- Every task in the plan ends green on `npm run test`, `npm run lint`, `npm run build`.

---

## 13. Constraints honoured

- No Tailwind; no new runtime dependency (theme is CSS custom properties + context; routing is `useState`).
- No raw hex/rem/px in components — new CSS lives in `index.css` on tokens.
- Reuse existing primitives (`Callout`, `Dialog`, `ConfirmDialog`, existing classes).
- Session and theme persisted through `storage.ts`'s versioned, validated `{ v, rows }` envelope — never raw `localStorage`.
- Commits use per-invocation identity.
- The console's feature set, layout and information architecture do not change; only its theme support and a sign-out control are added.

---

## 14. Calls I made (check these while reading)

1. **Default theme = dark** (not `system`), to preserve the locked dark-first identity for a first-time executive.
2. **Cycle order dark → light → system**, icon `Moon` → `Sun` → `Monitor`.
3. **Session & theme stored as one-row arrays** in the existing envelope (no new storage API).
4. **`bootstrapTheme()` in `main.tsx`** to avoid a flash — no inline script in `index.html`.
5. **Landing product preview is a static, `aria-hidden` illustration** — no console data or chart library on the front door.
6. **Data seam (`ApiClient`) deferred**, since the requested scope names the auth seams.
7. **Sign-out lives in the sidebar footer.**
8. **Theme preference is per-device** (there is no backend to sync it to).
9. **Light re-tunes brand/status hues** (darkened) instead of reusing the dark `-soft` values; the palette table in §4.4 is the target, tunable only to pass a contrast check.
10. **One theme toggle per surface** — inside `landing-nav` on the landing, floating on the login.
11. **`system` follows the OS live** (media-query subscription), not just at boot.
12. **SSO-by-domain** reveals an inline domain field rather than routing to a new step.

## 15. Open questions

None known. The builder check raised four; all are resolved above (§4.2, §4.3, §4.4, §7) and captured in §14.
