import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Root } from '../Root'
import { SESSION_KEY } from '../auth/session'

const validSession = {
  user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' },
  issuedAt: '2026-10-18T08:00:00.000Z',
  // A future expiry: this fixture must fail on the VERSION check alone, not
  // because the clock has moved past its expiresAt.
  expiresAt: '2030-01-01T00:00:00.000Z',
}

const storeRaw = (payload: string) => localStorage.setItem(SESSION_KEY, payload)

const expectLanding = async () => {
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/operating console/i),
  )
  expect(
    screen.queryByRole('navigation', { name: /main navigation/i }),
  ).not.toBeInTheDocument()
}

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

  it('falls back to the landing for a corrupt stored payload', async () => {
    storeRaw('{"v":2,"rows":[')
    render(<Root />)
    await expectLanding()
  })

  it('falls back to the landing for a legacy v1 envelope', async () => {
    storeRaw(JSON.stringify({ v: 1, rows: [validSession] }))
    render(<Root />)
    await expectLanding()
  })

  it('falls back to the landing for an expired session', async () => {
    storeRaw(
      JSON.stringify({
        v: 2,
        rows: [
          {
            user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' },
            issuedAt: '2020-01-01T08:00:00.000Z',
            expiresAt: '2020-01-01T16:00:00.000Z',
          },
        ],
      }),
    )
    render(<Root />)
    await expectLanding()
    // The expiry is definitive, so the unusable session is cleared, not kept.
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
})
