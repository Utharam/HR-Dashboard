# OmniHR — Landing, Login & Auth Provisions: Design Brief (DRAFT, brainstorm in progress)

**Status:** Brainstorm in progress. Decisions marked LOCKED are settled. Decisions marked OPEN need the human partner's answer before any design doc is final or any code is written.

**Why this file exists:** the first session that explored the UI Library ran low on context. This captures its findings and the decisions made so a fresh session resumes with full context instead of re-deriving them.

**Date:** 2026-10-18

---

## 1. What is being built

A front door for OmniHR, in this flow:

```
Landing page  →  Login  →  Dashboard (the existing app)
```

Plus **provisions** for a future backend. No backend is to be built now.

---

## 2. LOCKED decisions

### 2.1 Audience — LOCKED

The first people to see the front page are **a CEO or HR executives** — senior leadership of the organisation using OmniHR, and enterprise decision-makers evaluating it.

### 2.2 It is not a marketing tool — LOCKED

Direct quote of intent: *"I don't want my front page as a marketing tool."*

**Anti-goals — explicit failures even if they technically work:**

- No pricing table, no tier cards, no "upgrade" or "buy now"
- No testimonials, logos-of-customers ribbon, or "trusted by 500+ companies" social proof
- No lead capture, waitlist, newsletter signup, demo-request forms
- No growth-hack patterns: countdown, scarcity, chat-widget popups
- No marketing register in the copy — no "revolutionise", "supercharge", "10x your workforce"
- No Awwwards showpiece: no WebGL particle field, no video scrub, no liquid-metal hero, no cursor-following blob

The front page's job is to **establish credibility and get an executive signed in**, not to persuade a stranger to buy.

### 2.3 Tone — LOCKED

**Neat, classy, professional.** Restrained. Confident through restraint rather than spectacle. The target feel is the poised enterprise-product end of the reference space — think Linear, Stripe, Vercel, Ramp, Retool — not a creative agency site.

---

## 3. OPEN decisions — need answers before design is final

These change what gets built, so they are the human partner's to answer.

1. **Dark or light front door?** The dashboard is a committed dark theme (`--bg-main #0B0F19`). Should the landing and login be **dark, continuous with the dashboard** (one unbroken world, feels like walking into the product), or **light, a calmer distinct entrance** (feels like a serious corporate foyer, then you step into the dark console)? Both are defensible; they read very differently.
2. **What does the landing actually say?** Given it is not marketing, is it a near-neutral gateway — product name, one line of what it is, who it serves, and a sign-in entry — or does it carry a short credibility section (e.g. the compliance surface: statutory payroll, EPF/Professional Tax, audit-ready registers)? The second is arguably *not* marketing but *substance*, and it may be exactly what an HR executive wants to see.
3. **White-label / tenant branding?** Enterprise HRMS is often deployed per-customer with the customer's logo and colours. Will a company logo appear on the landing or login? This materially changes the design and the data model.
4. **Does the login advertise enterprise auth?** Even as stubs, buttons reading *"Sign in with Microsoft"* / *"Sign in with Okta"* / SSO-by-domain change the page's character and its perceived seriousness. Include, exclude, or plan for later?
5. **Routing approach.** The app currently has **no router** — it is a single page driven by an `activeTab` string in `useState`. A three-view flow (landing → login → dashboard) needs either a real router (new runtime dependency: `react-router-dom`) or a hand-rolled view state. See §5.3. This is a dependency decision, and the previous body of work held a "no new runtime dependency" constraint.
6. **Is the landing a separate build target or the same bundle?** Same bundle is simpler; a separate static page would keep the console bundle clean and load faster for executives who never sign in.

---

## 4. The UI Library — findings (do not re-derive)

**Location:** `D:\Projects\UI Library`

**What it is:** the **MotionSites AI Prompt Library** v1.1.0 — 825 AI web-design prompts with live previews, an SQLite database with FTS5 full-text search, a `prompts.json` dump (~6.1 MB), a browser UI (`index.html`), and a Python CLI. It is a **prompt archive, not a component library.**

**Tooling:**
```bash
python server.py                     # web UI on http://localhost:5173
python prompt_lib.py search "bento grid"
python prompt_lib.py search "shader" --category "HorizonX Library"
python prompt_lib.py get <slug> --copy
python prompt_lib.py categories
python prompt_lib.py tags
```

**Categories:** Landing Pages 358 · Superdesign Canvas 144 · HorizonX Library 93 · 21st.dev Registry 93 · SaaS 24 · Agency 19 · Features 16 · Pricing 10 · Footers 10 · CTA 9 · Hero Sections 7 · Social Proof 6 · AI 4 · Portfolio 3 · Healthcare 3 · Technology 2 · Mobile App 2

**Top tags by frequency:** React 145 · Tailwind 145 · Superdesign 137 · shadcn 94 · HorizonX 93 · Vibecoding 93 · 21st.dev 93 · Framer Motion 52 · **auth 9** · **onboarding 11** · **waitlist 11** · **minimal 10** · **editorial 21** · **serif 10** · **cream 13**

### 4.1 The decisive finding

```
search "dashboard analytics enterprise dark"  →  0 results
```

The archive is a **marketing-page** archive. It has **nothing** for a dense enterprise data console.

**Therefore:** use it as raw material for the **landing page and login**, which genuinely are marketing-adjacent pages. Do **not** use it to re-decide the **dashboard's** design language — the dashboard already has a purpose-built dark token system, and nothing in the library is a better fit.

### 4.2 The constraint that governs everything

Almost every prompt assumes **React + Tailwind CSS + Framer Motion + `lucide-react`**, with some also assuming `hls.js` (video) or Three.js (WebGL). Quoting a prompt verbatim therefore means either:

- **(a)** adding Tailwind + Framer Motion to this repo — meaning **two styling systems** in one codebase, contradicting an established constraint; or
- **(b)** translating the chosen prompt's *design* into the existing CSS custom-property token system — more work, one system, and strictly more coherent with the dashboard.

**Recommendation: (b).** The instructions in the prompts are the value; the Tailwind classes are just their encoding. Take the layout, hierarchy, rhythm, and restraint from a prompt, and express them in `src/index.css` tokens. Framer Motion's work (entrances, reveals, staggered children) is largely reproducible with the existing `--dur-*` / `--ease-*` tokens and CSS animations, and the project already has a `prefers-reduced-motion` guard.

### 4.3 Where to look for inspiration

Favour the **restrained** end of the archive. Concretely, search these:

```bash
python prompt_lib.py search "minimal" --category "SaaS"
python prompt_lib.py search "editorial" --category "Landing Pages"
python prompt_lib.py search "auth" --category "Landing Pages"
python prompt_lib.py search "linear"
python prompt_lib.py search "hero" --category "Hero Sections"
```

The `SaaS` (24), `Agency` (19) and `Hero Sections` (7) categories are the most likely homes for a "Linear-style dark enterprise" treatment. `auth` (9 prompts) is directly relevant to the login screen. **Avoid** `HorizonX Library` entirely (93 prompts of 3D WebGL particles and liquid identity heroes — the opposite of what was asked for) and be sceptical of anything tagged `waitlist`, `onboarding` or `cream` unless it happens to fit the executive register.

---

## 5. Constraints inherited from the completed remediation

The repository just finished a 21-task correctness and UX remediation. Its constraints are real and enforced, not aspirational.

### 5.1 Current verified state

```
branch main @ e458d98 (after a --no-ff merge of the remediation branch)
472 tests / 34 files passing
npm run lint             0 warnings / 0 errors
npm run build            exit 0
tsc -p tsconfig.app.json && tsc -p tsconfig.test.json   both clean
strict: true             enabled in tsconfig.app.json
```

### 5.2 Styling — the hard one

- **No Tailwind.** `tailwindcss` is deliberately **not installed**, despite `clsx` and `tailwind-merge` being present in `package.json`.
- `src/index.css` is a hand-written **CSS custom-property design system**, ~126 classes. Tokens exist for: surface (`--bg-main`, `--bg-card`, `--bg-card-subtle`, `--bg-table-head`, `--bg-well`), border, brand (`--primary`), a 7-role status family each with `-soft`/`-glow`/`-edge` variants, text (`--text-bright/main/muted/dim`), type (`--fs-*`, `--fw-*`, `--lh-*`, `--tracking-*`), spacing (`--space-*`, `--gap-*`), shape (`--r-*`), elevation (`--shadow-*`), motion (`--dur-*`, `--ease-*`), and z-index (`--z-sticky`, `--z-modal`).
- **Never write a raw hex, rem or px value in a component.** This was enforced across the codebase; introducing one is a review failure.
- Existing classes to reuse rather than reinvent: `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-sm` / `.btn-active`, `.omni-card` (+ `--flush`, header/footer), `.omni-field` / `.omni-label` / `.omni-input`, `.badge-*`, `.callout` / `.alert` / `.tone-*`, `.kpi-card`, `.grid` + variants, `.section-stack`, `.empty-state*`, `.sr-only`, `.nav-item`, `.brand-mark` / `.brand-name` / `.brand-tagline`, `.page-header` / `.page-title` / `.page-sub`.
- The dashboard's identity is a **dark enterprise analytics console** — the front door should read as the same product.

### 5.3 Routing — there is none

`src/App.tsx` is a **single page**: `const [activeTab, setActiveTab] = useState<ActiveTab>('overview')` plus a `Sidebar` that sets it, with 11 tab sections conditionally rendered. There is **no router, no URL state, and no deep linking.** A landing → login → dashboard flow needs a view/route layer that does not exist yet. See OPEN question 5.

### 5.4 Component primitives that already exist and must be reused

- `src/components/Dialog.tsx` — accessible modal: `role="dialog"`, `aria-modal`, focus trap both directions, Escape, focus restore, backdrop-identity check. Login-as-a-modal would build on this.
- `src/components/Callout.tsx` — `tone` + `role` status banner.
- `src/components/ConfirmDialog.tsx` — built on `Dialog`.

### 5.5 Storage and data patterns

- `src/utils/storage.ts` — versioned, shape-validated `localStorage` envelope: `{ v: DATA_SCHEMA_VERSION, rows }`, with `loadPersisted` returning a three-state `status: 'loaded' | 'empty' | 'recovered'` and `savePersisted` returning a `SaveResult` that distinguishes `'quota'` from `'unavailable'`. **A session token should go through this pattern, not raw `localStorage`.**
- `src/utils/payroll.ts`, `dates.ts`, `leave.ts`, `pagination.ts`, `excelSchema.ts`, `professionalTax` (planned), `statutoryRates.ts` — pure, tested domain modules.
- `Employee` lives in `src/types.ts` and includes `status`, `gender`, and (planned) `workState`.
- 472 tests, strongly TDD, several mutation-proofed. New behaviour is expected to arrive with tests.

### 5.6 Testing

- Vitest 5. `vitest.config.ts` splits projects **by file extension**: `src/**/*.test.ts` → node environment, `src/**/*.test.tsx` → jsdom.
- Use explicit imports — `import { describe, it, expect } from 'vitest'` — **never** vitest globals.
- **Never write the literal string `@vitest-environment` anywhere in a file.** Vitest's docblock scanner matches it inside string literals too and kills the worker.
- `tsconfig.app.json` excludes test paths; `tsconfig.test.json` includes them plus `src/test-setup.ts`. **Never add `"node"` to `tsconfig.app.json`'s `types`** — that would let application code reach `process` / `node:fs`.
- `src/test-setup.ts` registers `afterEach(cleanup)` explicitly, because RTL's auto-cleanup is gated on a global `afterEach` which Vitest does not provide.
- Commits need identity passed per-invocation (no global git identity is configured):
  `git -c user.name="opencode" -c user.email="opencode@local" commit -m "..."`

---

## 6. Backend provisions — what "provisions, not a backend" means

No server is to be built. But the seams a real backend will plug into should exist now, tested, so the later swap is a single implementation rather than a rewrite.

**Recommended shape (to be confirmed):**

1. **A `Session` type and an `AuthProvider` context** — `{ session, status: 'loading' | 'anonymous' | 'authenticated', signIn, signOut }`, with the session persisted through `src/utils/storage.ts`'s envelope so a refresh keeps you signed in.
2. **A single `AuthClient` interface** with exactly the methods a real backend would implement — `signIn(credentials)`, `signOut()`, `getSession()`, `refreshSession()`. Ship a `LocalAuthClient` stub that fakes success (and can be pointed at any well-known test account), and leave the interface as the contract. Swapping to a real API means writing one class, not touching the UI.
3. **A route guard** — an `<RequireAuth>` wrapper (or equivalent) that sends an unauthenticated visitor to the landing/login. This is the piece that makes the flow real.
4. **An `ApiClient` seam for data** — the app currently reads `INITIAL_EMPLOYEES` and `localStorage`. A thin `DataProvider` (or repository interface) with a `LocalDataClient` implementation means the future backend replaces one module rather than all eleven sections. This is the larger of the two seams and worth deciding deliberately.
5. **Environment configuration** — a single place for an API base URL and similar, defaulting to the local stub. Do not scatter URLs.

**Explicitly not now:** real user accounts, password hashing, server sessions, SSO, RBAC, multi-tenancy, audit logs, API design, database.

---

## 7. How to resume

1. Read this file.
2. Ask the OPEN questions in §3 — most importantly **dark or light front door**, **what the landing says**, and **white-label or not**. Those three shape everything else.
3. If a visual conversation would help (it probably would — a landing page is something you look at), offer mockups before designing in the abstract.
4. Optionally run the CLI searches in §4.3 and pick 2–3 candidate prompts to draw from.
5. Write the design doc to `docs/superpowers/specs/2026-XX-XX-landing-and-auth-design.md`, dispatch the builder check, resolve its questions, and only then plan.

**Sizing:** this is a **project** — design language decision, landing page, login, route layer, auth provisions. It runs design doc → plan → build, not a single task.

---

## 8. Related documents

- `docs/superpowers/plans/2026-10-17-omnihr-correctness-and-ux.md` — the completed 21-task remediation (product-wide constraints live here).
- `docs/superpowers/plans/2026-10-18-omnihr-statutory-correctness.md` — the in-flight statutory plan: Task 1 (EPF ceiling) done; Tasks 2–4 (workState + state Professional Tax, pre-lock validator, export round-trip and docs) not started.
- `Research data/BLUEPRINT-ADAPTATION-ANALYSIS.md` — the adaptation analysis of the South India HRMS blueprint.
- `.superpowers/sdd/2026-10-18-omnihr-statutory-correctness/progress.md` — ledger with every ruling made during the statutory work.
