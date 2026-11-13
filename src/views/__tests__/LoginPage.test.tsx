import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../LoginPage'
import { AuthProvider } from '../../auth/AuthContext'
import { ThemeProvider } from '../../theme/ThemeContext'
import type { AuthClient } from '../../auth/AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
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
  it('keeps the theme control inside the auth card', () => {
    const { container } = renderPage()
    expect(container.querySelector('.auth-card')).toContainElement(
      screen.getByRole('button', { name: /theme:/i }),
    )
  })

  it('labels the submit "Signing in…" while pending and re-enables after resolution', async () => {
    const pending = deferred<typeof session>()
    const client = makeClient({ signIn: vi.fn(() => pending.promise) })
    renderPage(client)
    await userEvent.type(screen.getByLabelText(/work email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'demo')
    const submit = screen.getByRole('button', { name: /^sign in$/i })

    await userEvent.click(submit)
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /signing in/i })).toBe(submit)

    await act(async () => {
      pending.resolve(session)
      await pending.promise
    })
    await waitFor(() => expect(submit).toBeEnabled())
    expect(submit).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBe(submit)
  })

  it('sends Microsoft and Okta through the provider client without a payload', async () => {
    const client = makeClient()
    renderPage(client)
    await userEvent.click(screen.getByRole('button', { name: /microsoft/i }))
    await waitFor(() =>
      expect(client.signInWithProvider).toHaveBeenCalledWith('microsoft', undefined),
    )
    await userEvent.click(screen.getByRole('button', { name: /okta/i }))
    await waitFor(() => expect(client.signInWithProvider).toHaveBeenCalledWith('okta', undefined))
  })

  it('sends a domain sign-in through the provider client', async () => {
    const client = makeClient()
    renderPage(client)
    await userEvent.click(screen.getByRole('button', { name: /sso by domain/i }))
    await userEvent.type(screen.getByLabelText(/work domain/i), 'acme.com')
    await userEvent.click(screen.getByRole('button', { name: /continue with domain/i }))
    await waitFor(() =>
      expect(client.signInWithProvider).toHaveBeenCalledWith('domain', 'acme.com'),
    )
  })

  it('rejects a non-domain-like value without calling the client', async () => {
    const client = makeClient()
    renderPage(client)
    await userEvent.click(screen.getByRole('button', { name: /sso by domain/i }))
    await userEvent.type(screen.getByLabelText(/work domain/i), 'not a domain')
    await userEvent.click(screen.getByRole('button', { name: /continue with domain/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a valid work domain/i)
    expect(client.signInWithProvider).not.toHaveBeenCalled()
  })
})
