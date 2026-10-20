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
