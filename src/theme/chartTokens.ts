import { useMemo } from 'react'
import { useOptionalTheme } from './ThemeContext'

/**
 * The values Chart.js needs. Canvas cannot resolve CSS custom properties, so
 * they are read from the document and handed to the chart as plain strings.
 */
export interface ChartTokens {
  primary: string
  primaryGlow: string
  success: string
  warning: string
  danger: string
  info: string
  purple: string
  pink: string
  neutral: string
  surface: string
  tick: string
  dim: string
  grid: string
  font: string
  well: string
  bright: string
  border: string
}

/**
 * Pure: the injected source is the whole input, so this is testable without a
 * DOM and without a theme.
 */
export function readChartTokens(readVar: (name: string) => string): ChartTokens {
  return {
    primary: readVar('--primary').trim(),
    primaryGlow: readVar('--primary-glow').trim(),
    success: readVar('--success').trim(),
    warning: readVar('--warning').trim(),
    danger: readVar('--danger').trim(),
    info: readVar('--info').trim(),
    purple: readVar('--purple').trim(),
    pink: readVar('--pink').trim(),
    neutral: readVar('--neutral-tone').trim(),
    surface: readVar('--bg-card').trim(),
    tick: readVar('--text-muted').trim(),
    dim: readVar('--text-dim').trim(),
    grid: readVar('--grid-line').trim(),
    font: readVar('--font-sans').trim(),
    well: readVar('--bg-well').trim(),
    bright: readVar('--text-bright').trim(),
    border: readVar('--border').trim(),
  }
}

/**
 * Re-reads whenever the resolved theme changes. The palette used to be a
 * module-level constant captured at import, which meant a theme switch never
 * reached a mounted chart.
 */
export function useChartTokens(): ChartTokens {
  // Subscribing to the theme is what makes a switch re-render a mounted chart;
  // the values themselves come from the DOM the provider has already updated.
  // Optional, so a chart section can still render in isolation (its own tests).
  const theme = useOptionalTheme()
  const resolved = theme?.resolved ?? null
  // Memoised on the resolved theme: between theme changes the DOM read is
  // idempotent, so an unrelated rerender must return the same token object.
  // The chart sections key their own data/options memos on this identity.
  return useMemo(
    () =>
      readChartTokens((name) =>
        getComputedStyle(document.documentElement).getPropertyValue(name),
      ),
    // `resolved` is intentionally the only dependency even though the memo body
    // does not read it: it is the invalidation key for the DOM re-read.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [resolved],
  )
}
