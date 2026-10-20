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
