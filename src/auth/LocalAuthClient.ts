import type { Credentials, Session, SessionUser, SsoProvider } from '../types'
import { AuthError } from './AuthClient'
import type { AuthClient } from './AuthClient'
import { SESSION_KEY, isSessionRow } from './session'
import { clearPersisted, loadPersisted, savePersisted } from '../utils/storage'

const SESSION_HOURS = 8
const HOUR_MS = 60 * 60 * 1000

const PROVIDER_NAME: Record<Exclude<SsoProvider, 'domain'>, string> = {
  microsoft: 'Microsoft user',
  okta: 'Okta user',
}

/**
 * The shipped stub. It fakes a successful sign-in and stores the resulting
 * session through the versioned envelope, so the whole flow — including a
 * refresh keeping you signed in, and an expired session dropping you back to
 * the door — is real. Only the decision to say "yes" is fake.
 *
 * A real client implements the same `AuthClient` interface against an API.
 */
export class LocalAuthClient implements AuthClient {
  private readonly now: () => Date

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date())
  }

  private issue(user: SessionUser): Session {
    const issuedAt = this.now()
    return {
      user,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + SESSION_HOURS * HOUR_MS).toISOString(),
    }
  }

  async getSession(): Promise<Session | null> {
    const { rows } = loadPersisted<Session>(SESSION_KEY, isSessionRow, [])
    const session = rows[0]
    if (!session) return null
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= this.now().getTime()) {
      clearPersisted(SESSION_KEY)
      return null
    }
    return session
  }

  async signIn(credentials: Credentials): Promise<Session> {
    const email = credentials.email.trim()
    if (!email || !credentials.password) {
      throw new AuthError('invalid_credentials', 'A work email and password are required.')
    }
    const session = this.issue({
      id: 'local-user',
      name: email.split('@')[0],
      email,
    })
    savePersisted(SESSION_KEY, [session])
    return session
  }

  async signInWithProvider(provider: SsoProvider, payload?: string): Promise<Session> {
    const domain = payload?.trim()
    if (provider === 'domain' && !domain) {
      throw new AuthError('invalid_credentials', 'A work domain is required.')
    }
    const isDomain = provider === 'domain'
    const session = this.issue({
      id: `local-${provider}`,
      name: isDomain ? (domain as string) : PROVIDER_NAME[provider],
      email: isDomain ? `user@${domain}` : `${provider}@local.omnihr`,
    })
    savePersisted(SESSION_KEY, [session])
    return session
  }

  async refreshSession(): Promise<Session | null> {
    const current = await this.getSession()
    if (!current) return null
    const refreshed = this.issue(current.user)
    savePersisted(SESSION_KEY, [refreshed])
    return refreshed
  }

  async signOut(): Promise<void> {
    clearPersisted(SESSION_KEY)
  }
}
