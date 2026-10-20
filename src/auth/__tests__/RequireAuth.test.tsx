import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RequireAuth } from '../RequireAuth'
import { AuthProvider } from '../AuthContext'
import type { AuthClient } from '../AuthClient'

const client = (session: Awaited<ReturnType<AuthClient['getSession']>>): AuthClient => ({
  getSession: vi.fn(async () => session),
  signIn: vi.fn(), signInWithProvider: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(),
} as unknown as AuthClient)

const session = { user: { id: 'u1', name: 'A', email: 'a@b.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }

describe('RequireAuth', () => {
  it('renders the fallback while the session is unresolved', () => {
    render(<AuthProvider client={client(null)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    expect(screen.getByText('door')).toBeInTheDocument()
  })
  it('renders children for an authenticated session', async () => {
    render(<AuthProvider client={client(session)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    await waitFor(() => expect(screen.getByText('console')).toBeInTheDocument())
  })
  it('renders the fallback for an anonymous visitor', async () => {
    render(<AuthProvider client={client(null)}><RequireAuth fallback={<div>door</div>}><div>console</div></RequireAuth></AuthProvider>)
    await waitFor(() => expect(screen.getByText('door')).toBeInTheDocument())
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })
})
