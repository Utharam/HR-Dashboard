import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../AuthContext'
import type { AuthClient } from '../AuthClient'

const session = { user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' }, issuedAt: '2026-10-18T08:00:00.000Z' }
const newerSession = { user: { id: 'u2', name: 'Ravi', email: 'ravi@acme.com' }, issuedAt: '2026-10-18T09:00:00.000Z' }

const makeClient = (over: Partial<AuthClient> = {}): AuthClient => ({
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => session),
  signInWithProvider: vi.fn(async () => session),
  refreshSession: vi.fn(async () => session),
  signOut: vi.fn(async () => {}),
  ...over,
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Overrides jsdom's read-only visibilityState for the duration of a test. */
const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

afterEach(() => {
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
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
  it('revalidates the session when the window regains focus', async () => {
    const getSession = vi
      .fn<() => Promise<typeof session | null>>()
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(null)
    render(<AuthProvider client={makeClient({ getSession })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await act(async () => {})
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(getSession).toHaveBeenCalledTimes(2)
  })
  it('revalidates on a visible visibilitychange and signs out on a definitive null', async () => {
    const getSession = vi
      .fn<() => Promise<typeof session | null>>()
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(null)
    render(<AuthProvider client={makeClient({ getSession })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await act(async () => {})
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(getSession).toHaveBeenCalledTimes(2)
  })
  it('does not revalidate when the tab becomes hidden', async () => {
    const getSession = vi.fn<() => Promise<typeof session | null>>().mockResolvedValue(session)
    render(<AuthProvider client={makeClient({ getSession })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await act(async () => {})
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
  })
  it('keeps the session when revalidation rejects', async () => {
    const getSession = vi
      .fn<() => Promise<typeof session | null>>()
      .mockResolvedValueOnce(session)
      .mockRejectedValueOnce(new Error('network down'))
    render(<AuthProvider client={makeClient({ getSession })}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await act(async () => {})
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('email')).toHaveTextContent('asha@acme.com')
  })
  it('ignores a stale null response that resolves after a newer sign-in', async () => {
    const pending = deferred<typeof session | null>()
    const getSession = vi
      .fn<() => Promise<typeof session | null>>()
      .mockResolvedValueOnce(session)
      .mockReturnValueOnce(pending.promise)
    render(
      <AuthProvider client={makeClient({ getSession, signIn: vi.fn(async () => newerSession) })}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {})
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2))

    await userEvent.click(screen.getByRole('button', { name: 'in' }))
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('ravi@acme.com'))

    await act(async () => {
      pending.resolve(null)
      await pending.promise
    })

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('email')).toHaveTextContent('ravi@acme.com')
  })
  it('stays anonymous when a sign-in resolves after a sign-out', async () => {
    const pending = deferred<typeof session>()
    const client = makeClient({ signIn: vi.fn(() => pending.promise) })
    render(<AuthProvider client={client}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    // The user backs out while the sign-in is still in flight.
    await userEvent.click(screen.getByRole('button', { name: 'in' }))
    await userEvent.click(screen.getByRole('button', { name: 'out' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    // The stale response must not resurrect the session it was answering for.
    await act(async () => {
      pending.resolve(session)
      await pending.promise
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('email')).toHaveTextContent('none')
    expect(client.signIn).toHaveBeenCalledTimes(1)
  })
  it('signs out locally even when the client rejects the sign-out call', async () => {
    const client = makeClient({
      signOut: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    render(<AuthProvider client={client}><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    await userEvent.click(screen.getByRole('button', { name: 'in' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await userEvent.click(screen.getByRole('button', { name: 'out' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(client.signOut).toHaveBeenCalledTimes(1)
  })
  it('renders a configuration error instead of crashing when the factory throws', () => {
    render(
      <AuthProvider
        clientFactory={() => {
          throw new Error('VITE_AUTH_MODE=http is set, but no HTTP auth client has been implemented.')
        }}
      >
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/authentication is not configured/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/VITE_AUTH_MODE=http/i)
    expect(screen.queryByTestId('status')).not.toBeInTheDocument()
  })
})
