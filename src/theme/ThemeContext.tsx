/* oxlint-disable react/only-export-components -- a context module owns its provider, its hook and the bootstrap helpers; splitting them would scatter one responsibility */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ResolvedTheme, ThemeMode } from '../types'
import { DEFAULT_MODE, THEME_KEY, isThemeModeRow, nextMode, resolveTheme } from './theme'
import { loadPersisted, savePersisted } from '../utils/storage'

export interface ThemeValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  cycle: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

/**
 * Older browsers and jsdom do not implement `matchMedia`. Dark is the safer
 * fallback: it is the product's default identity, so an unavailable OS
 * preference cannot hand a first-time executive a light console they did not ask
 * for.
 */
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function readStoredMode(): ThemeMode {
  const { rows } = loadPersisted<{ mode: ThemeMode }>(THEME_KEY, isThemeModeRow, [])
  return rows[0]?.mode ?? DEFAULT_MODE
}

export function writeStoredMode(mode: ThemeMode): void {
  // A preference that cannot be written is not worth interrupting the user with.
  // The choice still applies for this session.
  savePersisted(THEME_KEY, [{ mode }])
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

/**
 * Applies the stored preference before React mounts, so a user who chose light
 * never sees a dark frame first. Called from `main.tsx` at module scope.
 */
export function bootstrapTheme(): void {
  applyResolvedTheme(resolveTheme(readStoredMode(), systemPrefersDark()))
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark)
  const resolved = resolveTheme(mode, systemDark)

  // Applied during render, not in an effect. Children that read the CSS custom
  // properties in their own render (the charts) must see the theme being
  // rendered; an effect runs after them, so they would read the previous
  // palette. The write is idempotent and targets an element React does not own.
  applyResolvedTheme(resolved)

  // Track the OS only while the user has actually delegated the decision. The
  // subscription is torn down the moment they choose dark or light, so a stale
  // listener cannot overwrite an explicit preference.
  useEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    // Read the OS at the moment the user delegates the decision. Doing it here,
    // rather than synchronously inside the subscription effect, keeps the effect
    // a pure external-system subscription and avoids a cascading render.
    if (next === 'system') setSystemDark(systemPrefersDark())
    writeStoredMode(next)
  }, [])

  const cycle = useCallback(() => {
    setMode(nextMode(mode))
  }, [mode, setMode])

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within a ThemeProvider')
  return value
}

/**
 * For leaf components that need to *subscribe* to the theme but must also render
 * in isolation (the chart sections in their own tests). They get the real theme
 * when a provider is present and the document's current tokens otherwise.
 */
export function useOptionalTheme(): ThemeValue | null {
  return useContext(ThemeContext)
}
