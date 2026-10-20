import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
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
    await act(async () => {})
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
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
