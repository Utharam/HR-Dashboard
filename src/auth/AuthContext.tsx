/* oxlint-disable react/only-export-components -- a context module owns its provider and its hook by design */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthStatus, Credentials, Session, SsoProvider } from '../types'
import { AuthError } from './AuthClient'
import type { AuthClient } from './AuthClient'
import { createAuthClient } from '../config/env'

export interface AuthValue {
  session: Session | null
  status: AuthStatus
  signIn: (credentials: Credentials) => Promise<Session>
  signInWithProvider: (provider: SsoProvider, payload?: string) => Promise<Session>
  signOut: () => Promise<void>
}

export interface AuthProviderProps {
  client?: AuthClient
  /**
   * Test seam only: the default resolves the client from environment
   * configuration, and a deployment can make that resolution throw. Keeping the
   * factory injectable is what lets the failure UI be exercised directly.
   */
  clientFactory?: () => AuthClient
  children: React.ReactNode
}

interface ClientResolution {
  client: AuthClient | null
  error: Error | null
}

const AuthContext = createContext<AuthValue | null>(null)

export const AuthProvider: React.FC<AuthProviderProps> = ({
  client,
  clientFactory = createAuthClient,
  children,
}) => {
  // Resolved once. A default parameter would build a new client on every render,
  // and the mount effect must depend on a stable object. A bad configuration
  // (`VITE_AUTH_MODE=http` with no HTTP client) throws HERE, so it is caught
  // here: a deployment error must render an explanation, not a white screen.
  const [resolution] = useState<ClientResolution>(() => {
    try {
      return { client: client ?? clientFactory(), error: null }
    } catch (err) {
      return {
        client: null,
        error: err instanceof Error ? err : new Error(String(err)),
      }
    }
  })
  const resolvedClient = resolution.client

  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Every request that may write auth state gets a generation. A slow, older
  // response is then unable to overwrite a newer sign-in/sign-out — the race
  // that would otherwise bounce a freshly signed-in user back to the door.
  const requestRef = useRef(0)

  useEffect(() => {
    if (!resolvedClient) return
    let active = true
    const request = ++requestRef.current
    resolvedClient
      .getSession()
      .then((restored) => {
        if (!active || request !== requestRef.current) return
        setSession(restored)
        setStatus(restored ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        // A backend that cannot answer is an anonymous visitor, not a white screen.
        if (!active || request !== requestRef.current) return
        setSession(null)
        setStatus('anonymous')
      })
    return () => {
      active = false
    }
  }, [resolvedClient])

  // A session is read once on mount, but a tab can outlive it. Revalidate when
  // the user comes back to the tab, so an expiry in another tab (or the passage
  // of the 8-hour lifetime) does not leave a signed-out visitor on the console.
  useEffect(() => {
    if (!resolvedClient || status !== 'authenticated') return
    let active = true

    const revalidate = () => {
      const request = ++requestRef.current
      resolvedClient
        .getSession()
        .then((current) => {
          if (!active || request !== requestRef.current) return
          // Only a definitive `null` ends the session. A transient rejection is
          // not evidence that the user was signed out.
          if (current) return
          setSession(null)
          setStatus('anonymous')
        })
        .catch(() => {
          /* keep the authenticated state through a transient failure */
        })
    }

    const onVisibilityChange = () => {
      // Hiding the tab fires this event too; only a return to the foreground is
      // a reason to ask the backend anything.
      if (document.visibilityState !== 'visible') return
      revalidate()
    }

    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [status, resolvedClient])

  const signIn = useCallback(
    async (credentials: Credentials) => {
      if (!resolvedClient) {
        throw new AuthError('not_configured', 'Authentication is not configured.')
      }
      // A sign-in is newer truth than any in-flight revalidation.
      requestRef.current += 1
      const next = await resolvedClient.signIn(credentials)
      setSession(next)
      setStatus('authenticated')
      return next
    },
    [resolvedClient],
  )

  const signInWithProvider = useCallback(
    async (provider: SsoProvider, payload?: string) => {
      if (!resolvedClient) {
        throw new AuthError('not_configured', 'Authentication is not configured.')
      }
      requestRef.current += 1
      const next = await resolvedClient.signInWithProvider(provider, payload)
      setSession(next)
      setStatus('authenticated')
      return next
    },
    [resolvedClient],
  )

  const signOut = useCallback(async () => {
    requestRef.current += 1
    try {
      await resolvedClient?.signOut()
    } catch {
      // Local sign-out wins even when the backend cannot confirm it: the user
      // asked to leave, and a failed revocation call must not keep them in.
    } finally {
      setSession(null)
      setStatus('anonymous')
    }
  }, [resolvedClient])

  const value = useMemo(
    () => ({ session, status, signIn, signInWithProvider, signOut }),
    [session, status, signIn, signInWithProvider, signOut],
  )

  if (!resolvedClient) {
    return (
      <div className="boot-screen" role="alert">
        <div
          className="omni-card"
          style={{ maxWidth: '32rem', margin: 'var(--space-5)' }}
        >
          <h1 className="auth-title" style={{ marginBottom: 'var(--space-2)' }}>
            Authentication is not configured
          </h1>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-sm)',
              margin: 0,
            }}
          >
            {resolution.error?.message ??
              'The app could not create an authentication client. Check the deployment configuration.'}
          </p>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider')
  return value
}
