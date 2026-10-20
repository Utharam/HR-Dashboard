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
