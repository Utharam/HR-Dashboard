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
