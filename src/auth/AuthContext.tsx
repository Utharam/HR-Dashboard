/* oxlint-disable react/only-export-components -- a context module owns its provider and its hook by design */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthStatus, Credentials, Session, SsoProvider } from '../types'
import type { AuthClient } from './AuthClient'
import { createAuthClient } from '../config/env'

export interface AuthValue {
  session: Session | null
  status: AuthStatus
  signIn: (credentials: Credentials) => Promise<Session>
  signInWithProvider: (provider: SsoProvider, payload?: string) => Promise<Session>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export const AuthProvider: React.FC<{ client?: AuthClient; children: React.ReactNode }> = ({
  client,
  children,
}) => {
  // Resolved once. A default parameter would build a new client on every render,
  // and the mount effect must depend on a stable object.
  const [resolvedClient] = useState<AuthClient>(() => client ?? createAuthClient())
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let active = true
    resolvedClient
      .getSession()
      .then((restored) => {
        if (!active) return
        setSession(restored)
        setStatus(restored ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        // A backend that cannot answer is an anonymous visitor, not a white screen.
        if (!active) return
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
    if (status !== 'authenticated') return
    const revalidate = () => {
      resolvedClient
        .getSession()
        .then((current) => {
          if (current) return
          setSession(null)
          setStatus('anonymous')
        })
        .catch(() => {
          setSession(null)
          setStatus('anonymous')
        })
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [status, resolvedClient])

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const next = await resolvedClient.signIn(credentials)
      setSession(next)
      setStatus('authenticated')
      return next
    },
    [resolvedClient],
  )

  const signInWithProvider = useCallback(
    async (provider: SsoProvider, payload?: string) => {
      const next = await resolvedClient.signInWithProvider(provider, payload)
      setSession(next)
      setStatus('authenticated')
      return next
    },
    [resolvedClient],
  )

  const signOut = useCallback(async () => {
    await resolvedClient.signOut()
    setSession(null)
    setStatus('anonymous')
  }, [resolvedClient])

  const value = useMemo(
    () => ({ session, status, signIn, signInWithProvider, signOut }),
    [session, status, signIn, signInWithProvider, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider')
  return value
}
