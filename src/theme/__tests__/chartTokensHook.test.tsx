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
  document.documentElement.removeAttribute('data-theme')
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
