import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../LoginPage'
import { AuthProvider } from '../../auth/AuthContext'
import { ThemeProvider } from '../../theme/ThemeContext'
import type { AuthClient } from '../../auth/AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }
const makeClient = (over: Partial<AuthClient> = {}): AuthClient => ({
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => session),
  signInWithProvider: vi.fn(async () => session),
  refreshSession: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
  ...over,
})

const renderPage = (client = makeClient(), onBack = vi.fn()) =>
  render(<ThemeProvider><AuthProvider client={client}><LoginPage onBack={onBack} /></AuthProvider></ThemeProvider>)

beforeEach(() => localStorage.clear())

describe('LoginPage', () => {
  it('validates empty fields before calling the client', async () => {
    const client = makeClient()
    renderPage(client)
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(client.signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your work email/i)
  })
  it('renders an invalid-credentials failure as a Callout, not an alert dialog', async () => {
    const client = makeClient({ signIn: vi.fn(async () => { throw Object.assign(new Error('no'), { code: 'invalid_credentials' }) }) })
    renderPage(client)
    await userEvent.type(screen.getByLabelText(/work email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'demo')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not sign you in/i))
  })
  it('advertises enterprise auth as three stubs', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /okta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sso by domain/i })).toBeInTheDocument()
  })
  it('reveals the domain field only after SSO-by-domain is chosen', async () => {
    renderPage()
    expect(screen.queryByLabelText(/work domain/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sso by domain/i }))
    expect(screen.getByLabelText(/work domain/i)).toBeInTheDocument()
  })
  it('shows the provisioning footer and a way back', async () => {
    const onBack = vi.fn()
    renderPage(makeClient(), onBack)
    expect(screen.getByText(/provisioned by your organisation's administrator/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
