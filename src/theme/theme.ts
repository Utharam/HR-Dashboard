import type { ResolvedTheme, ThemeMode } from '../types'

export type { ResolvedTheme, ThemeMode }

/**
 * Where the preference lives. Stored through the versioned envelope in
 * `utils/storage.ts` as a one-row array — never as raw localStorage.
 */
export const THEME_KEY = 'omnihr_theme'

/**
 * The first visit is dark on purpose. OmniHR's identity is a dark console, and
 * the people who see this first are executives being handed a product, not
 * users who have expressed a preference.
 */
export const DEFAULT_MODE: ThemeMode = 'dark'

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

export function nextMode(mode: ThemeMode): ThemeMode {
  switch (mode) {
    case 'dark':
      return 'light'
    case 'light':
      return 'system'
    case 'system':
      return 'dark'
  }
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system'
}

export function isThemeModeRow(row: unknown): row is { mode: ThemeMode } {
  if (row === null || typeof row !== 'object') return false
  return isThemeMode((row as { mode?: unknown }).mode)
}
