import type { Credentials, Session, SsoProvider } from '../types'

export type AuthErrorCode = 'invalid_credentials' | 'not_configured'

/**
 * The only failure type the UI is allowed to reason about. A real backend maps
 * its HTTP failures onto these codes; the form never sees a raw transport error.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'AuthError'
    this.code = code
  }
}

/**
 * The contract a future backend implements. Swapping `LocalAuthClient` for an
 * API-backed client should not touch a single component.
 */
export interface AuthClient {
  getSession(): Promise<Session | null>
  signIn(credentials: Credentials): Promise<Session>
  signInWithProvider(provider: SsoProvider, payload?: string): Promise<Session>
  refreshSession(): Promise<Session | null>
  signOut(): Promise<void>
}
