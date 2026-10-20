# OmniHR Front Door & Whole-App Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a landing page, a login, a hand-rolled route layer and auth seams, and a three-state (dark / light / system) theme that reaches the entire console — without a new runtime dependency and without changing the console's feature set.

**Architecture:** Dark stays the `:root` token default; light is a second token set under `:root[data-theme="light"]`. A `ThemeProvider` resolves `dark | light | system` to a concrete theme, writes `data-theme` on `<html>`, and persists the mode through the existing versioned storage envelope. The three chart sections stop reading a module-level palette and read tokens through a theme-subscribed hook. Landing and login are new views rendered by a `Root` coordinator that branches on an `AuthProvider` status; the existing `App` stays the authenticated console, gaining only an optional `onSignOut`. Auth is an interface plus a local stub.

**Tech Stack:** React 19, TypeScript 6.0 (strict), Vite 8, Vitest 5, Testing Library, jsdom, `lucide-react`, Chart.js 4. Hand-written CSS custom properties in `src/index.css`. **No Tailwind. No new runtime dependency.**

**Spec:** `docs/superpowers/specs/2026-10-18-landing-and-auth-design.md`

## Global Constraints

- **No Tailwind.** `tailwindcss` is not installed and must not be added.
- **No new runtime dependency.** Theme and routing are context + `useState`.
- **`src/index.css` is the design system.** Never write a raw hex, rem or px value in a component; use a token. New CSS goes in `index.css`.
- **Reuse existing primitives**: `Callout`, `Dialog`, `ConfirmDialog`, and the existing classes (`.btn*`, `.omni-card`, `.omni-field`, `.omni-input`, `.badge-*`, `.callout`, `.alert`, `.sr-only`, `.nav-item`, `.page-header`).
- **Persistence goes through `src/utils/storage.ts`** — the versioned, validated `{ v, rows }` envelope. Never raw `localStorage`. Single values are stored as a one-row array of objects.
- **Tests:** Vitest 5; `.test.ts` runs in `node`, `.test.tsx` in `jsdom`. Explicit imports from `'vitest'` — never globals. **Never write the literal string `@vitest-environment` anywhere in a file.** **Never add `"node"` to `tsconfig.app.json`'s `types`.**
- **Every task ends green on** `npm run test`, `npm run lint`, `npm run build`.
- **Do not change the console's feature set or information architecture.** It gains theme support and a sign-out control only.
- **Commits need per-invocation identity:**
  `git -c user.name="opencode" -c user.email="opencode@local" commit -m "..."`
- **Node 24 is available; `npm run test` is a single pass (`vitest run`).**

## Review Focus

Five inputs/conditions most likely to bite a real user of this software, each pinned by a test in the task that owns the code.

1. **A theme switch while a chart is mounted** — the chart must repaint with the new gridlines, ticks and tooltip, not keep the palette captured at import. → Task 5.
2. **Reload with a stored theme preference** — the page must paint in the stored theme, not flash dark first. → Task 3 (`bootstrapTheme`) + Task 11 (wiring).
3. **A corrupt, legacy or expired session on load** — the app must show the landing, never the console. → Tasks 6, 7, 11.
4. **`system` mode while the OS flips** — the resolved theme must follow live, and the charts with it. → Task 3.
5. **Light-theme status badges and muted text** — a light theme that inverts into washed-out text, invisible borders or vivid-on-white status colours is a failure. The light token set and every white-based hover must be replaced by theme-scoped tokens. → Task 2 (+ the manual visual check in Task 13).

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/theme/theme.ts` | Pure logic: `resolveTheme`, `nextMode`, validators, keys, default |
| `src/theme/ThemeContext.tsx` | Provider, `useTheme`, storage read/write, DOM attribute, `bootstrapTheme` |
| `src/theme/chartTokens.ts` | Pure `readChartTokens` + theme-subscribed `useChartTokens` |
| `src/components/ThemeToggle.tsx` | The top-right icon control |
| `src/auth/AuthClient.ts` | The backend contract + `AuthError` |
| `src/auth/LocalAuthClient.ts` | The shipped stub implementation |
| `src/auth/AuthContext.tsx` | `AuthProvider` + `useAuth` |
| `src/auth/RequireAuth.tsx` | Guard primitive |
| `src/auth/session.ts` | `SESSION_KEY`, `isSessionRow` |
| `src/config/env.ts` | One place for API/auth configuration |
| `src/views/LandingPage.tsx` | The landing page |
| `src/views/LoginPage.tsx` | The login page |
| `src/Root.tsx` | Route layer and provider composition |

**Modified:** `src/types.ts`, `src/main.tsx`, `src/App.tsx`, `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/index.css`, and the three chart sections.

**Untouched:** `src/utils/payroll.ts`, `dates.ts`, `leave.ts`, `pagination.ts`, `excelSchema.ts`, `storage.ts`, `rowValidators.ts`, all data, and every other console component.

---

### Task 1: Theme vocabulary and pure logic

**Files:**
- Modify: `src/types.ts`
- Create: `src/theme/theme.ts`
- Test: `src/theme/__tests__/theme.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ThemeMode = 'dark' | 'light' | 'system'
  export type ResolvedTheme = 'dark' | 'light'
  export const THEME_KEY = 'omnihr_theme'
  export const DEFAULT_MODE: ThemeMode = 'dark'
  export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme
  export function nextMode(mode: ThemeMode): ThemeMode
  export function isThemeMode(value: unknown): value is ThemeMode
  export function isThemeModeRow(row: unknown): row is { mode: ThemeMode }
  ```

- [ ] **Step 1: Write the failing test**

`src/theme/__tests__/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_MODE, isThemeMode, isThemeModeRow, nextMode, resolveTheme } from '../theme'

describe('resolveTheme', () => {
  it('returns dark for an explicit dark mode regardless of the OS', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })
  it('returns light for an explicit light mode regardless of the OS', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })
  it('follows the OS only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('nextMode', () => {
  it('cycles dark to light to system and back to dark', () => {
    expect(nextMode('dark')).toBe('light')
    expect(nextMode('light')).toBe('system')
    expect(nextMode('system')).toBe('dark')
  })
})

describe('isThemeMode', () => {
  it('accepts the three literals', () => {
    expect(isThemeMode('dark')).toBe(true)
    expect(isThemeMode('light')).toBe(true)
    expect(isThemeMode('system')).toBe(true)
  })
  it('rejects anything else, including null and objects', () => {
    expect(isThemeMode('blue')).toBe(false)
    expect(isThemeMode(null)).toBe(false)
    expect(isThemeMode({ mode: 'dark' })).toBe(false)
  })
})

describe('isThemeModeRow', () => {
  it('accepts a row carrying a valid mode', () => {
    expect(isThemeModeRow({ mode: 'light' })).toBe(true)
  })
  it('rejects a bare string, null and an invalid mode', () => {
    expect(isThemeModeRow('light')).toBe(false)
    expect(isThemeModeRow(null)).toBe(false)
    expect(isThemeModeRow({ mode: 'blue' })).toBe(false)
  })
})

describe('DEFAULT_MODE', () => {
  it('is dark, preserving the console identity for a first visit', () => {
    expect(DEFAULT_MODE).toBe('dark')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails for the missing module**

Run: `npm run test -- src/theme/__tests__/theme.test.ts`
Expected: FAIL — cannot resolve `../theme`.

- [ ] **Step 3: Add the types and implement the pure module**

In `src/types.ts`, add the two unions. In `src/theme/theme.ts`, implement the six exports. `resolveTheme` returns the explicit mode for `dark`/`light`, and `prefersDark ? 'dark' : 'light'` for `system`. `nextMode` is an exhaustive switch. `isThemeModeRow` first checks `row !== null && typeof row === 'object'` (the same guard the storage loader applies) before reading `mode`.

- [ ] **Step 4: Run the test**

Run: `npm run test -- src/theme/__tests__/theme.test.ts`
Expected: PASS (all 13).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/theme/theme.ts src/theme/__tests__/theme.test.ts
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): add pure theme resolution and validators"
```

---

### Task 2: The light token set and the fragile spots

**Files:**
- Modify: `src/index.css`
- Test: `src/utils/__tests__/themeTokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `:root[data-theme="light"]` defining every theme-varying token; three new theme-varying tokens `--row-hover`, `--badge-resigned-bg`, `--toggle-chip-hover` defined in both themes.

- [ ] **Step 1: Write the failing parity test**

`src/utils/__tests__/themeTokens.test.ts` (node; reads `index.css` from disk):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')
const lightBlock = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const darkBlock = [...css.matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((m) => m[1]).join('\n')

const THEME_VARYING = [
  '--bg-main', '--bg-card', '--bg-card-hover', '--bg-card-subtle', '--bg-table-head',
  '--bg-well', '--scrim', '--border', '--border-strong', '--border-focus', '--hairline',
  '--primary', '--primary-hover', '--primary-glow', '--primary-ring',
  '--success', '--success-glow', '--success-edge', '--success-soft',
  '--warning', '--warning-glow', '--warning-edge', '--warning-soft',
  '--danger', '--danger-glow', '--danger-edge', '--danger-soft',
  '--info', '--info-glow', '--info-edge', '--info-soft',
  '--purple', '--purple-glow', '--purple-edge', '--purple-soft',
  '--pink', '--pink-glow', '--pink-edge', '--pink-soft',
  '--neutral-tone', '--neutral-edge', '--text-bright', '--text-main', '--text-muted',
  '--text-dim', '--grid-line', '--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg',
  '--shadow-xl', '--shadow-primary', '--row-hover', '--badge-resigned-bg', '--toggle-chip-hover',
] as const

describe('light token parity', () => {
  it('defines a light block', () => {
    expect(lightBlock.length).toBeGreaterThan(0)
  })
  it('defines every theme-varying token in both blocks', () => {
    for (const name of THEME_VARYING) {
      expect(darkBlock, `dark is missing ${name}`).toContain(`${name}:`)
      expect(lightBlock, `light is missing ${name}`).toContain(`${name}:`)
    }
  })
  it('makes color-scheme follow the theme', () => {
    expect(css).toMatch(/color-scheme:\s*dark/)
    expect(lightBlock).toMatch(/color-scheme:\s*light/)
  })
  it('routes the three former hardcoded colours through tokens', () => {
    expect(css).toMatch(/\.badge-resigned[^}]*var\(--badge-resigned-bg\)/)
    expect(css).toMatch(/\.omni-table tr:hover td[^}]*var\(--row-hover\)/)
    expect(css).toMatch(/\.toggle-chip--on:hover[^}]*var\(--toggle-chip-hover\)/)
  })
  it('stops inverting the date-picker indicator in light', () => {
    expect(css).toMatch(/:root\[data-theme="light"\][^{]*\{[^}]*filter:\s*none/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/utils/__tests__/themeTokens.test.ts`
Expected: FAIL — no light block, missing tokens.

- [ ] **Step 3: Add the light block and replace the fragile values**

In `src/index.css`:

1. Add `color-scheme: dark` to the `:root` block and remove the standalone `html { color-scheme: dark }` rule.
2. Add a `:root[data-theme="light"] { … }` block immediately after the dark token blocks, containing **every value in the spec's §4.4 table verbatim**, plus:
   - `--row-hover: rgba(15, 23, 42, 0.03);`
   - `--badge-resigned-bg: rgba(107, 114, 128, 0.12);`
   - `--toggle-chip-hover: rgba(5, 150, 105, 0.18);`
   - `color-scheme: light;`
   - The six shadow tokens, exactly:
     `--shadow-xs: 0 1px 2px rgba(15,23,42,0.06);`
     `--shadow-sm: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.05);`
     `--shadow-md: 0 4px 14px -4px rgba(15,23,42,0.12), 0 2px 5px -2px rgba(15,23,42,0.08);`
     `--shadow-lg: 0 14px 30px -8px rgba(15,23,42,0.16), 0 4px 10px -4px rgba(15,23,42,0.10);`
     `--shadow-xl: 0 28px 56px -12px rgba(15,23,42,0.20), 0 8px 18px -10px rgba(15,23,42,0.12);`
     `--shadow-primary: 0 4px 14px -4px rgba(79,70,229,0.30);`
3. In the dark `:root` block add `--row-hover: rgba(255, 255, 255, 0.025);`, `--badge-resigned-bg: rgba(107, 114, 128, 0.2);`, `--toggle-chip-hover: rgba(16, 185, 129, 0.24);`.
4. Replace the three hardcoded uses: `.badge-resigned` background → `var(--badge-resigned-bg)`; `.omni-table tr:hover td` background → `var(--row-hover)`; `.toggle-chip--on:hover` background → `var(--toggle-chip-hover)`.
5. Add:
   ```css
   :root[data-theme="light"] input[type='date']::-webkit-calendar-picker-indicator,
   :root[data-theme="light"] input[type='datetime-local']::-webkit-calendar-picker-indicator {
     filter: none;
   }
   ```

Do not change any dark value other than the two new tokens and the `color-scheme` relocation.

- [ ] **Step 4: Run the test and the full gate**

Run: `npm run test -- src/utils/__tests__/themeTokens.test.ts`
Expected: PASS.
Run: `npm run test && npm run lint && npm run build`
Expected: all green; dark-mode rendering is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/utils/__tests__/themeTokens.test.ts
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): add light token set and tokenise theme-fragile colours"
```

---

### Task 3: ThemeProvider, persistence and bootstrap

**Files:**
- Create: `src/theme/ThemeContext.tsx`
- Test: `src/theme/__tests__/ThemeContext.test.tsx`

**Interfaces:**
- Consumes: `theme.ts` (Task 1), `loadPersisted` / `savePersisted` from `../utils/storage`.
- Produces:
  ```ts
  export interface ThemeValue {
    mode: ThemeMode
    resolved: ResolvedTheme
    setMode: (mode: ThemeMode) => void
    cycle: () => void
  }
  export function ThemeProvider(props: { children: React.ReactNode }): React.ReactElement
  export function useTheme(): ThemeValue
  export function readStoredMode(): ThemeMode
  export function writeStoredMode(mode: ThemeMode): void
  export function applyResolvedTheme(resolved: ResolvedTheme): void
  export function bootstrapTheme(): void
  ```

- [ ] **Step 1: Write the failing test**

`src/theme/__tests__/ThemeContext.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, bootstrapTheme, useTheme } from '../ThemeContext'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'

const Harness = () => {
  const { mode, resolved, cycle } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={cycle}>cycle</button>
    </div>
  )
}

const mockMatchMedia = (matches: boolean) => {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  const mql = {
    matches,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => mql)
  return { mql, listeners }
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  mockMatchMedia(true)
})

describe('ThemeProvider', () => {
  it('defaults to dark when nothing is stored', () => {
    render(<ThemeProvider><Harness /></ThemeProvider>)
    expect(screen.getByTestId('mode').textContent).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('cycles dark -> light -> system and writes each mode through the envelope', async () => {
    render(<ThemeProvider><Harness /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'cycle' }))
    expect(screen.getByTestId('mode').textContent).toBe('light')
    const stored = JSON.parse(localStorage.getItem('omnihr_theme') ?? '{}')
    expect(stored).toEqual({ v: DATA_SCHEMA_VERSION, rows: [{ mode: 'light' }] })
  })

  it('loads a stored mode', () => {
    localStorage.setItem('omnihr_theme', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ mode: 'light' }] }))
    render(<ThemeProvider><Harness /></ThemeProvider>)
    expect(screen.getByTestId('mode').textContent).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('ignores a corrupt stored payload and falls back to dark', () => {
    localStorage.setItem('omnihr_theme', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ mode: 'blue' }] }))
    render(<ThemeProvider><Harness /></ThemeProvider>)
    expect(screen.getByTestId('mode').textContent).toBe('dark')
  })

  it('follows the OS while in system mode', async () => {
    const { listeners } = mockMatchMedia(false)
    render(<ThemeProvider><Harness /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'cycle' }))
    await userEvent.click(screen.getByRole('button', { name: 'cycle' }))
    expect(screen.getByTestId('mode').textContent).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    listeners.forEach((fn) => fn({ matches: true }))
    expect(await screen.findByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('bootstrapTheme', () => {
  it('applies the stored mode before React renders', () => {
    localStorage.setItem('omnihr_theme', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ mode: 'light' }] }))
    bootstrapTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/theme/__tests__/ThemeContext.test.tsx`
Expected: FAIL — cannot resolve `../ThemeContext`.

- [ ] **Step 3: Implement the provider**

Implementation decisions the tests pin:

- `readStoredMode()` = `loadPersisted(THEME_KEY, isThemeModeRow, [])`; return `rows[0]?.mode ?? DEFAULT_MODE`.
- `writeStoredMode(mode)` = `savePersisted(THEME_KEY, [{ mode }])`. Ignore the `SaveResult` (a theme preference that cannot be written is not worth a banner).
- `applyResolvedTheme(resolved)` sets `document.documentElement.dataset.theme = resolved`.
- A `systemPrefersDark()` helper guards `typeof window.matchMedia === 'function'`, falling back to `true` (dark). **jsdom has no `matchMedia`; the guard is why the default test passes without stubbing.**
- Provider state: `mode` from `readStoredMode()`, `systemDark` from `systemPrefersDark()`. `resolved = resolveTheme(mode, systemDark)`.
- `setMode` updates state **and** writes storage (write on user action, not in an effect).
- `cycle` = `setMode(nextMode(mode))`.
- An effect applies the attribute whenever `resolved` changes.
- A second effect subscribes to the media query **only while `mode === 'system'`**, calls `setSystemDark(mql.matches)` on subscribe and on every `change`, and removes the listener on cleanup.
- `bootstrapTheme()` = `applyResolvedTheme(resolveTheme(readStoredMode(), systemPrefersDark()))`. It must not throw when storage is denied (the storage helpers already guard).

- [ ] **Step 4: Run the test**

Run: `npm run test -- src/theme/__tests__/ThemeContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/theme/ThemeContext.tsx src/theme/__tests__/ThemeContext.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): add provider, persistence and pre-render bootstrap"
```

---

### Task 4: The ThemeToggle icon

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Test: `src/components/__tests__/ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` (Task 3).
- Produces: `export const ThemeToggle: React.FC<{ className?: string }>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '../ThemeToggle'
import { ThemeProvider } from '../../theme/ThemeContext'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

const renderToggle = () => render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

describe('ThemeToggle', () => {
  it('is a labelled button naming the current mode and the next action', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: /theme: dark .*light/i })).toBeInTheDocument()
  })
  it('cycles on click and updates its own label', async () => {
    renderToggle()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: /theme: light .*system/i })).toBeInTheDocument()
  })
  it('shows a monitor face in system mode', async () => {
    renderToggle()
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: /theme: system .*dark/i })).toBeInTheDocument()
    expect(document.querySelector('svg.lucide-monitor')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/components/__tests__/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `../ThemeToggle`.

- [ ] **Step 3: Implement the component**

Render one `<button type="button" className={"theme-toggle" + (className ? ` ${className}` : "")}>` using `useTheme()`. Icon: `Moon` for dark, `Sun` for light, `Monitor` for system, each `aria-hidden`, size 16. `aria-label` = `` `Theme: ${mode} (switch to ${nextMode(mode)})` ``; `title` = the same. `onClick={cycle}`. No `role="switch"` — this is a tri-state action, not a toggle with a boolean state.

- [ ] **Step 4: Run the test**

Run: `npm run test -- src/components/__tests__/ThemeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the `.theme-toggle` class to `index.css`**

A 32px square icon button using `--bg-card`, `--border`, `--text-muted`, `--r-md`; hover moves to `--primary` and `--border-strong`; focus-visible uses the global rule. No raw hex/px outside the token scale. Commit only after `npm run test && npm run lint && npm run build` is green.

```bash
git add src/components/ThemeToggle.tsx src/components/__tests__/ThemeToggle.test.tsx src/index.css
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): add top-right three-state icon control"
```

---

### Task 5: Make the charts follow the theme

**Files:**
- Create: `src/theme/chartTokens.ts`
- Test: `src/theme/__tests__/chartTokens.test.ts` (pure), `src/theme/__tests__/chartTokensHook.test.tsx` (jsdom)
- Modify: `src/components/OverviewSection.tsx:30-64`, `src/components/PerformanceSection.tsx:10-30`, `src/components/TrendsSection.tsx:14-31`

**Interfaces:**
- Consumes: `useTheme()` (Task 3).
- Produces:
  ```ts
  export interface ChartTokens {
    primary: string; success: string; warning: string; danger: string; info: string;
    purple: string; pink: string; neutral: string; surface: string; tick: string;
    dim: string; grid: string; font: string; well: string; bright: string; border: string
  }
  export function readChartTokens(readVar: (name: string) => string): ChartTokens
  export function useChartTokens(): ChartTokens
  ```

- [ ] **Step 1: Write the failing pure test**

```ts
import { describe, it, expect } from 'vitest'
import { readChartTokens } from '../chartTokens'

describe('readChartTokens', () => {
  it('maps every chart token from the injected style source', () => {
    const read = (name: string) => `value-of-${name}`
    const t = readChartTokens(read)
    expect(t.primary).toBe('value-of---primary')
    expect(t.surface).toBe('value-of---bg-card')
    expect(t.grid).toBe('value-of---grid-line')
    expect(t.font).toBe('value-of---font-sans')
    expect(t.well).toBe('value-of---bg-well')
    expect(t.border).toBe('value-of---border')
  })
  it('trims whitespace returned by the source', () => {
    expect(readChartTokens(() => '  #fff  ').primary).toBe('#fff')
  })
})
```

- [ ] **Step 2: Write the failing hook test**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useChartTokens } from '../chartTokens'
import { ThemeProvider, useTheme } from '../ThemeContext'

const Probe = () => {
  const t = useChartTokens()
  const { cycle } = useTheme()
  return (<><output data-testid="primary">{t.primary}</output><button onClick={cycle}>cycle</button></>)
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) =>
      document.documentElement.dataset.theme === 'light' ? `light${name}` : `dark${name}`,
  }))
})

describe('useChartTokens', () => {
  it('re-reads the palette when the theme changes', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('primary').textContent).toBe('dark--primary')
    await userEvent.click(screen.getByRole('button', { name: 'cycle' }))
    expect(screen.getByTestId('primary').textContent).toBe('light--primary')
  })
})
```

- [ ] **Step 3: Run both and confirm they fail**

Run: `npm run test -- src/theme/__tests__/chartTokens.test.ts src/theme/__tests__/chartTokensHook.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement and rewire the three sections**

`readChartTokens` calls the injected source once per token and trims the result. `useChartTokens` reads `const { resolved } = useTheme()` (subscribing to changes), then `useMemo(() => readChartTokens((n) => getComputedStyle(document.documentElement).getPropertyValue(n)), [resolved])`.

In each of `OverviewSection`, `PerformanceSection`, `TrendsSection`:

- Delete the module-level `token`, `CHART`, `tooltipTheme` and `axisTickFont` constants.
- Inside the component call `const chartTokens = useChartTokens()`.
- Rebuild `tooltipTheme`, `axisTickFont`, `chartOptions` and `doughnutOptions` with `useMemo`, keyed on `chartTokens`.
- Replace every `CHART.x` with `chartTokens.x`. Chart `data` objects that carry colours (`backgroundColor`, `borderColor`, `pointBackgroundColor`) must also be memoised on `chartTokens`.

- [ ] **Step 5: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green. Existing chart tests must still pass.

- [ ] **Step 6: Commit**

```bash
git add src/theme/chartTokens.ts src/theme/__tests__/chartTokens.test.ts src/theme/__tests__/chartTokensHook.test.tsx src/components/OverviewSection.tsx src/components/PerformanceSection.tsx src/components/TrendsSection.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): make chart palette reactive to the active theme"
```

---

### Task 6: Auth contract, session storage and the local stub

**Files:**
- Modify: `src/types.ts`
- Create: `src/auth/AuthClient.ts`, `src/auth/LocalAuthClient.ts`, `src/auth/session.ts`
- Test: `src/auth/__tests__/session.test.ts` (node, validator only), `src/auth/__tests__/LocalAuthClient.test.tsx` (jsdom, storage available)

**Interfaces:**
- Produces:
  ```ts
  export interface SessionUser { id: string; name: string; email: string; org?: string }
  export interface Session { user: SessionUser; issuedAt: string; expiresAt?: string }
  export interface Credentials { email: string; password: string }
  export type SsoProvider = 'microsoft' | 'okta' | 'domain'
  export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

  export class AuthError extends Error {
    readonly code: 'invalid_credentials' | 'not_configured'
    constructor(code: AuthError['code'], message?: string)
  }
  export interface AuthClient {
    getSession(): Promise<Session | null>
    signIn(credentials: Credentials): Promise<Session>
    signInWithProvider(provider: SsoProvider, payload?: string): Promise<Session>
    refreshSession(): Promise<Session | null>
    signOut(): Promise<void>
  }

  export const SESSION_KEY = 'omnihr_session'
  export function isSessionRow(row: unknown): row is Session

  export class LocalAuthClient implements AuthClient {
    constructor(options?: { now?: () => Date })
  }
  ```

- [ ] **Step 1: Write the failing validator and client tests**

`src/auth/__tests__/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSessionRow } from '../session'

const valid = {
  user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' },
  issuedAt: '2026-10-18T08:00:00.000Z',
}
describe('isSessionRow', () => {
  it('accepts a complete session', () => expect(isSessionRow(valid)).toBe(true))
  it('accepts one with an expiry and an org', () => {
    expect(isSessionRow({ ...valid, expiresAt: '2026-10-18T16:00:00.000Z', user: { ...valid.user, org: 'Acme' } })).toBe(true)
  })
  it('rejects a row without a user', () => expect(isSessionRow({ issuedAt: valid.issuedAt })).toBe(false))
  it('rejects a user without an email', () => expect(isSessionRow({ ...valid, user: { id: 'u1', name: 'A' } })).toBe(false))
  it('rejects null and strings', () => {
    expect(isSessionRow(null)).toBe(false)
    expect(isSessionRow('session')).toBe(false)
  })
})
```

`src/auth/__tests__/LocalAuthClient.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalAuthClient } from '../LocalAuthClient'
import { AuthError } from '../AuthClient'
import { SESSION_KEY } from '../session'

let now = new Date('2026-10-18T08:00:00.000Z')
const client = () => new LocalAuthClient({ now: () => now })

beforeEach(() => {
  localStorage.clear()
  now = new Date('2026-10-18T08:00:00.000Z')
})

describe('LocalAuthClient', () => {
  it('rejects an empty email or password with invalid_credentials', async () => {
    await expect(client().signIn({ email: '', password: 'x' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(client().signIn({ email: 'a@b.com', password: '' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(client().signIn({ email: '', password: '' })).rejects.toBeInstanceOf(AuthError)
  })
  it('signs in a documented test account and persists the session', async () => {
    const s = await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    expect(s.user.email).toBe('ceo@acme.com')
    expect(s.expiresAt).toBeDefined()
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}').rows[0].user.email).toBe('ceo@acme.com')
  })
  it('returns the persisted session from getSession', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    expect((await client().getSession())?.user.email).toBe('ceo@acme.com')
  })
  it('drops an expired session', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    const later = new LocalAuthClient({ now: () => new Date('2030-01-01T00:00:00.000Z') })
    expect(await later.getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('refreshes the expiry without changing the user', async () => {
    const s = await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    now = new Date('2026-10-18T09:00:00.000Z')
    const r = await client().refreshSession()
    expect(r?.user.email).toBe(s.user.email)
    expect(r?.expiresAt).not.toBe(s.expiresAt)
  })
  it('signs out by clearing the session', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    await client().signOut()
    expect(await client().getSession()).toBeNull()
  })
  it('rejects SSO-by-domain without a domain and accepts with one', async () => {
    await expect(client().signInWithProvider('domain')).rejects.toMatchObject({ code: 'invalid_credentials' })
    const s = await client().signInWithProvider('domain', 'acme.com')
    expect(s.user.email).toContain('@acme.com')
  })
  it('resolves the Microsoft and Okta stubs', async () => {
    expect((await client().signInWithProvider('microsoft')).user.name.length).toBeGreaterThan(0)
    expect((await client().signInWithProvider('okta')).user.name.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run both and confirm they fail**

Run: `npm run test -- src/auth/__tests__/session.test.ts src/auth/__tests__/LocalAuthClient.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

- `session.ts`: `SESSION_KEY`; `isSessionRow` checks object, then `user` object with string `id`, `name`, `email`, then string `issuedAt`, optional string `expiresAt` and optional string `org`.
- `LocalAuthClient`: constructor takes `{ now?: () => Date }` defaulting to `() => new Date()`. Session expiry is **8 hours** after `now()`. Every read/write goes through `loadPersisted(SESSION_KEY, isSessionRow, [])` / `savePersisted(SESSION_KEY, [session])` / `clearPersisted`. `signIn` trims the email and requires a non-empty password. `signInWithProvider` for `'domain'` requires a non-empty payload and builds `user@<domain>`; `microsoft`/`okta` use `<provider>@local.omnihr`. `getSession` clears an expired session and returns `null`.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/auth/AuthClient.ts src/auth/LocalAuthClient.ts src/auth/session.ts src/auth/__tests__/session.test.ts src/auth/__tests__/LocalAuthClient.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(auth): add auth contract, session storage and local stub client"
```

---

### Task 7: AuthProvider, `useAuth` and environment config

**Files:**
- Create: `src/auth/AuthContext.tsx`, `src/config/env.ts`
- Test: `src/auth/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `AuthClient`, `LocalAuthClient`, `Session`.
- Produces:
  ```ts
  export interface AuthValue {
    session: Session | null
    status: AuthStatus
    signIn: (credentials: Credentials) => Promise<Session>
    signInWithProvider: (provider: SsoProvider, payload?: string) => Promise<Session>
    signOut: () => Promise<void>
  }
  export function AuthProvider(props: { client?: AuthClient; children: React.ReactNode }): React.ReactElement
  export function useAuth(): AuthValue

  // src/config/env.ts
  export const API_BASE_URL: string
  export const AUTH_MODE: 'local' | 'http'
  export function createAuthClient(): AuthClient
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../AuthContext'
import type { AuthClient } from '../AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }

const makeClient = (over: Partial<AuthClient> = {}): AuthClient => ({
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => session),
  signInWithProvider: vi.fn(async () => session),
  refreshSession: vi.fn(async () => session),
  signOut: vi.fn(async () => {}),
  ...over,
})

const Probe = () => {
  const { status, session, signIn, signOut } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{session?.user.email ?? 'none'}</span>
      <button onClick={() => void signIn({ email: 'asha@acme.com', password: 'demo' })}>in</button>
      <button onClick={() => void signOut()}>out</button>
    </div>
  )
}

describe('AuthProvider', () => {
  it('resolves to anonymous when there is no session', async () => {
    render(<AuthProvider client={makeClient()}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })
  it('resolves to authenticated when a session exists', async () => {
    render(<AuthProvider client={makeClient({ getSession: async () => session })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('email')).toHaveTextContent('asha@acme.com')
  })
  it('signs in and out', async () => {
    render(<AuthProvider client={makeClient()}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    await userEvent.click(screen.getByRole('button', { name: 'in' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await userEvent.click(screen.getByRole('button', { name: 'out' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/auth/__tests__/AuthContext.test.tsx`
Expected: FAIL — cannot resolve `../AuthContext`.

- [ ] **Step 3: Implement**

- `AuthProvider` holds `session` and `status`; `useEffect` on mount calls `client.getSession()` and sets `authenticated`/`anonymous`; on a thrown error sets `anonymous` (never a white screen).
- `signIn` / `signInWithProvider` await the client, set the session + `authenticated`, and **rethrow** on failure so the form can render the error. They do **not** flip to `anonymous` on a failed attempt inside an authenticated session.
- `signOut` awaits the client, clears the session and sets `anonymous`.
- `client` defaults to `createAuthClient()` but is resolved **once**: `const [resolvedClient] = useState(() => client ?? createAuthClient())`. A default parameter expression would construct a fresh client on every render, and the mount effect must depend on a stable object.
- `env.ts` reads `import.meta.env.VITE_API_BASE_URL ?? ''` and `AUTH_MODE` (`'http'` only when `VITE_AUTH_MODE === 'http'`, else `'local'`). `createAuthClient()` returns `new LocalAuthClient()`; a comment names it as the single place an `HttpAuthClient` would be selected.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthContext.tsx src/config/env.ts src/auth/__tests__/AuthContext.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(auth): add provider, useAuth hook and environment seam"
```

---

### Task 8: RequireAuth guard

**Files:**
- Create: `src/auth/RequireAuth.tsx`
- Test: `src/auth/__tests__/RequireAuth.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`.
- Produces: `export function RequireAuth(props: { children: React.ReactNode; fallback: React.ReactNode }): React.ReactElement | null`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RequireAuth } from '../RequireAuth'
import { AuthProvider } from '../AuthContext'
import type { AuthClient } from '../AuthClient'

const client = (session: Awaited<ReturnType<AuthClient['getSession']>>): AuthClient => ({
  getSession: vi.fn(async () => session),
  signIn: vi.fn(), signInWithProvider: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(),
} as unknown as AuthClient)

const session = { user: { id: 'u1', name: 'A', email: 'a@b.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }

describe('RequireAuth', () => {
  it('renders the fallback while the session is unresolved', () => {
    render(<AuthProvider client={client(null)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    expect(screen.getByText('door')).toBeInTheDocument()
  })
  it('renders children for an authenticated session', async () => {
    render(<AuthProvider client={client(session)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    await waitFor(() => expect(screen.getByText('console')).toBeInTheDocument())
  })
  it('renders the fallback for an anonymous visitor', async () => {
    render(<AuthProvider client={client(null)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    await waitFor(() => expect(screen.getByText('door')).toBeInTheDocument())
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/auth/__tests__/RequireAuth.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`const { status } = useAuth(); return status === 'authenticated' ? <>{children}</> : <>{fallback}</>`. (Loading and anonymous both show the fallback; the landing is a safe place to be while a session is being read.)

- [ ] **Step 4: Run the test and commit**

Run: `npm run test -- src/auth/__tests__/RequireAuth.test.tsx`
Expected: PASS.

```bash
git add src/auth/RequireAuth.tsx src/auth/__tests__/RequireAuth.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(auth): add route guard primitive"
```

---

### Task 9: Landing page

**Files:**
- Create: `src/views/LandingPage.tsx`
- Modify: `src/index.css` (landing classes)
- Test: `src/views/__tests__/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 4).
- Produces: `export const LandingPage: React.FC<{ onSignIn: () => void }>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingPage } from '../LandingPage'
import { ThemeProvider } from '../../theme/ThemeContext'

beforeEach(() => localStorage.clear())

describe('LandingPage', () => {
  it('states what the product is without a marketing register', () => {
    render(<ThemeProvider><LandingPage onSignIn={vi.fn()} /></ThemeProvider>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/operating console for your workforce/i)
    expect(screen.getByText(/staff records, statutory payroll and compliance/i)).toBeInTheDocument()
  })
  it('offers exactly one primary route in', async () => {
    const onSignIn = vi.fn()
    render(<ThemeProvider><LandingPage onSignIn={onSignIn} /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: /sign in to omnihr/i }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
  it('carries the short credibility strip', () => {
    render(<ThemeProvider><LandingPage onSignIn={vi.fn()} /></ThemeProvider>)
    for (const text of ['Statutory payroll', 'EPF & Professional Tax', 'Audit-ready registers', 'Excel import/export']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })
  it('shows the theme control', () => {
    render(<ThemeProvider><LandingPage onSignIn={vi.fn()} /></ThemeProvider>)
    expect(screen.getByRole('button', { name: /theme:/i })).toBeInTheDocument()
  })
  it('uses none of the banned marketing phrases', () => {
    const { container } = render(<ThemeProvider><LandingPage onSignIn={vi.fn()} /></ThemeProvider>)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/pricing|testimonial|waitlist|free trial|book a demo|trusted by|supercharge|revolutioni[sz]e|\b10x\b/i)
  })
  it('marks the product preview as decoration', () => {
    const { container } = render(<ThemeProvider><LandingPage onSignIn={vi.fn()} /></ThemeProvider>)
    expect(container.querySelector('.product-preview')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/views/__tests__/LandingPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the page and its classes**

Build the structure in spec §6: `.landing-shell` → `.landing-nav` (brand left; `.theme-toggle` + secondary "Sign in" right) → `.landing-hero` (h1, lede, primary CTA "Sign in to OmniHR") → `.product-preview` (`aria-hidden`, a static CSS-only console illustration: rail, four KPI tiles, bar block — **no chart library, no console data**) → `.cred-strip` (four `cred-item`s) → `.site-footer`. Add the matching classes to `index.css`, all on tokens, and make them theme-aware. Reuse `.brand-mark` / `.brand-name` / `.btn` where possible. The whole page must be a single `<main>` with the h1 first.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/views/LandingPage.tsx src/views/__tests__/LandingPage.test.tsx src/index.css
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(landing): add executive gateway with credibility strip"
```

---

### Task 10: Login page

**Files:**
- Create: `src/views/LoginPage.tsx`
- Modify: `src/index.css` (auth classes)
- Test: `src/views/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 7), `ThemeToggle`, `Callout`.
- Produces: `export const LoginPage: React.FC<{ onBack: () => void }>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../LoginPage'
import { AuthProvider } from '../../auth/AuthContext'
import { ThemeProvider } from '../../theme/ThemeContext'
import type { AuthClient } from '../../auth/AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }
const makeClient = (over: Partial<AuthClient> = {}): AuthClient => ({
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => session),
  signInWithProvider: vi.fn(async () => session),
  refreshSession: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
  ...over,
})

const renderPage = (client = makeClient(), onBack = vi.fn()) =>
  render(<ThemeProvider><AuthProvider client={client}><LoginPage onBack={onBack} /></AuthProvider></ThemeProvider>)

beforeEach(() => localStorage.clear())

describe('LoginPage', () => {
  it('validates empty fields before calling the client', async () => {
    const client = makeClient()
    renderPage(client)
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(client.signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your work email/i)
  })
  it('renders an invalid-credentials failure as a Callout, not an alert dialog', async () => {
    const client = makeClient({ signIn: vi.fn(async () => { throw Object.assign(new Error('no'), { code: 'invalid_credentials' }) }) })
    renderPage(client)
    await userEvent.type(screen.getByLabelText(/work email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'demo')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not sign you in/i))
  })
  it('advertises enterprise auth as three stubs', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /okta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sso by domain/i })).toBeInTheDocument()
  })
  it('reveals the domain field only after SSO-by-domain is chosen', async () => {
    renderPage()
    expect(screen.queryByLabelText(/work domain/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sso by domain/i }))
    expect(screen.getByLabelText(/work domain/i)).toBeInTheDocument()
  })
  it('shows the provisioning footer and a way back', async () => {
    const onBack = vi.fn()
    renderPage(makeClient(), onBack)
    expect(screen.getByText(/provisioned by your organisation's administrator/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/views/__tests__/LoginPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the page and its classes**

Structure per spec §7: floating `.theme-toggle`; `.auth-card` with brand lockup, `Sign in`, sub-line, email + password fields with labels and `autoComplete`; submit button disabled while pending; error `Callout tone="danger"` with `role="alert"` copy *"We could not sign you in with those details."*; divider; three SSO buttons; the inline `Work domain` field revealed by the domain button; footer; a back button. On success do nothing further — the auth status change unmounts this view.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/views/LoginPage.tsx src/views/__tests__/LoginPage.test.tsx src/index.css
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(login): add provisioned-account sign-in with SSO stubs"
```

---

### Task 11: Route layer, bootstrap and sign-out

**Files:**
- Create: `src/Root.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/components/Sidebar.tsx`
- Test: `src/__tests__/Root.test.tsx`

**Interfaces:**
- Consumes: `ThemeProvider`, `AuthProvider`, `useAuth`, `LandingPage`, `LoginPage`, `App`.
- Produces: `export const Root: React.FC`; `App` gains `onSignOut?: () => void`; `Sidebar` gains `onSignOut?: () => void`.

- [ ] **Step 1: Write the failing integration test**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Root } from '../Root'

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub }
})

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('Root flow', () => {
  it('shows the landing to an anonymous visitor, not the console', async () => {
    render(<Root />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/operating console/i))
    expect(screen.queryByText(/executive workforce overview/i)).not.toBeInTheDocument()
  })

  it('walks landing -> login -> console and back out', async () => {
    render(<Root />)
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in to omnihr/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /sign in to omnihr/i }))
    await userEvent.type(screen.getByLabelText(/work email/i), 'ceo@acme.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'demo')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in to omnihr/i })).toBeInTheDocument())
  })

  it('sends a stored session straight to the console', async () => {
    const { LocalAuthClient } = await import('../auth/LocalAuthClient')
    await new LocalAuthClient().signIn({ email: 'ceo@acme.com', password: 'demo' })
    render(<Root />)
    await waitFor(() => expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/__tests__/Root.test.tsx`
Expected: FAIL — cannot resolve `../Root`.

- [ ] **Step 3: Implement**

- `Root`: `<ThemeProvider><AuthProvider><RootView /></AuthProvider></ThemeProvider>`. `RootView` uses `useAuth()`, owns `const [view, setView] = useState<'landing' | 'login'>('landing')`, and renders: `status === 'loading'` → a minimal token-styled boot placeholder with `role="status"`; `authenticated` → `<App onSignOut={handleSignOut} />`; `view === 'login'` → `<LoginPage onBack={() => setView('landing')} />`; else `<LandingPage onSignIn={() => setView('login')} />`. **`handleSignOut` awaits `signOut()` and then sets `view` to `'landing'`** — without that reset, signing out from a session that began on the login screen would land on the login screen, not the front door.
- `main.tsx`: import `bootstrapTheme` and call it **before** `createRoot(...)`, then render `<Root />` instead of `<App />`.
- `App.tsx`: add `export const App: React.FC<{ onSignOut?: () => void }>`; pass `onSignOut` to `Sidebar`.
- `Sidebar.tsx`: add optional `onSignOut`; when present render a footer button "Sign out" with `LogOut` icon, `className="btn btn-secondary btn-block btn-sm"`.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green. Existing `App.test.tsx` must still pass (the new prop is optional).

- [ ] **Step 5: Commit**

```bash
git add src/Root.tsx src/main.tsx src/App.tsx src/components/Sidebar.tsx src/__tests__/Root.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(routing): add landing-login-console flow and sign-out"
```

---

### Task 12: Console header integration

**Files:**
- Modify: `src/components/Header.tsx`
- Test: `src/components/__tests__/themeIntegration.test.tsx`

**Interfaces:**
- Consumes: `ThemeToggle`.
- Produces: no new exports; the header action row gains one control.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from '../Header'
import { Sidebar } from '../Sidebar'
import { ThemeProvider } from '../../theme/ThemeContext'
import { INITIAL_DEPARTMENTS } from '../../data/initialData'

beforeEach(() => localStorage.clear())
const noop = () => {}

describe('console theme integration', () => {
  it('puts the theme control in the header action row', () => {
    render(<ThemeProvider><Header activeTab="overview" searchQuery="" setSearchQuery={noop} selectedDept="ALL"
      setSelectedDept={noop} selectedLocation="ALL" setSelectedLocation={noop}
      departments={INITIAL_DEPARTMENTS} locations={['Bengaluru HQ']} onOpenAddModal={noop}
      onNavigateToExcel={noop} onToggleNav={noop} navOpen={false} /></ThemeProvider>)
    expect(screen.getByRole('button', { name: /theme:/i })).toBeInTheDocument()
  })

  it('offers sign out only when the console is hosted by a session', async () => {
    const onSignOut = vi.fn()
    const { rerender } = render(<Sidebar activeTab="overview" setActiveTab={noop} onExportExcel={noop} onResetData={noop} />)
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
    rerender(<Sidebar activeTab="overview" setActiveTab={noop} onExportExcel={noop} onResetData={noop} onSignOut={onSignOut} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- src/components/__tests__/themeIntegration.test.tsx`
Expected: FAIL — no theme button in the header.

- [ ] **Step 3: Implement**

Import `ThemeToggle` and render it as the **last** child of `.page-actions` in `Header.tsx` (after Guides). No layout change beyond the control; `.page-actions` already wraps.

- [ ] **Step 4: Run the gate**

Run: `npm run test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.tsx src/components/__tests__/themeIntegration.test.tsx
git -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(theme): surface theme control in the console header"
```

---

### Task 13: Final verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-10-18-landing-and-auth-design.md` (status only)

- [ ] **Step 1: Mark the design approved and implemented**

Change the status line to: `**Status:** APPROVED — implemented by docs/superpowers/plans/2026-10-18-omnihr-front-door-and-theme.md`.

- [ ] **Step 2: Run the full gate**

Run: `npm run test && npm run lint && npm run build`
Expected: 34+ test files, all passing; lint 0 warnings / 0 errors; build exit 0.

- [ ] **Step 3: Manual visual pass (both themes, three widths)**

Run `npm run dev` and check at **1440px, 1024px, 390px**, in **dark and light**, and in **system** with the OS both ways:

- Landing: no horizontal scroll; the hero, preview and credibility strip read in both themes; one theme icon.
- Login: card centred; error state readable; domain field reveals; SSO buttons legible in light.
- Console: every tab's first screen; the sidebar, KPI cards, tables, badges, callouts and **all four charts** re-colour on a theme switch without a reload.
- No flash of dark on a reload while light is stored.
- Print preview still forces a light surface.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-18-landing-and-auth-design.md
git -c user.name="opencode" -c user.email="opencode@local" commit -m "docs: mark landing, theme and auth design implemented"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task:

| Spec | Task |
|---|---|
| §4.1 theme shape | 1, 3 |
| §4.2 cycle + icon placement | 3, 4, 9, 10, 12 |
| §4.3 persistence, bootstrap, live system | 3, 11 |
| §4.4 light token set + fragile spots | 2 |
| §4.5 reactive charts | 5 |
| §5 design-language additions | 2, 4, 9, 10 |
| §6 landing | 9 |
| §7 login | 10 |
| §8 route layer | 11 |
| §9 auth seams + env | 6, 7, 8 |
| §10 file structure | all |
| §12 testing | every task |

**Review Focus coverage.** (1) chart repaint → Task 5 hook test; (2) no flash → Task 3 `bootstrapTheme` test + Task 11 wiring; (3) expired/corrupt session → Tasks 6, 7, 11; (4) live system → Task 3; (5) light badges/contrast → Task 2 parity test + Task 13 visual pass.

**Type consistency.** `ThemeMode`/`ResolvedTheme` are defined once in Task 1 and imported by Tasks 3–5, 9–10. `AuthClient` is defined in Task 6 and consumed by Tasks 7–8, 10–11 by those exact names. `ThemeToggle` is produced in Task 4 and consumed in Tasks 9, 10, 12. `useChartTokens`/`ChartTokens` are produced and consumed within Task 5 but named as in the spec.

**Proportion.** 13 tasks for two subsystems (theme: 1–5, 12; front door/auth: 6–11) plus verification. Each task is independently shippable; Tasks 1–5 leave the console themable before any page exists, and Tasks 6–11 leave the front door working on the existing dark theme if the light work is reverted.
