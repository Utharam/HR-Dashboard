import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../AuthContext'
import type { AuthClient } from '../AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }

const makeClient = (over: Partial<AuthClient> = {}): AuthClient => ({
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => session),
  signInWithProvider: vi.fn(async () => session),
  refreshSession: vi.fn(async () => session),
  signOut: vi.fn(async () => {}),
  ...over,
})

const Probe = () => {
  const { status, session, signIn, signOut } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{session?.user.email ?? 'none'}</span>
      <button onClick={() => void signIn({ email: 'asha@acme.com', password: 'demo' })}>in</button>
      <button onClick={() => void signOut()}>out</button>
    </div>
  )
}

describe('AuthProvider', () => {
  it('resolves to anonymous when there is no session', async () => {
    render(<AuthProvider client={makeClient()}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })
  it('resolves to authenticated when a session exists', async () => {
    render(<AuthProvider client={makeClient({ getSession: async () => session })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('email')).toHaveTextContent('asha@acme.com')
  })
  it('signs in and out', async () => {
    render(<AuthProvider client={makeClient()}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    await userEvent.click(screen.getByRole('button', { name: 'in' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await userEvent.click(screen.getByRole('button', { name: 'out' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })
})
