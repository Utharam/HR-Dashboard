import type { Credentials, Session, SessionUser, SsoProvider } from '../types'
import { AuthError } from './AuthClient'
import type { AuthClient } from './AuthClient'
import { isDomainLike } from './domain'
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

  /**
   * The fallback for a tab whose storage is denied or full. A hardened profile
   * (SecurityError) and a full origin (QuotaExceededError) both make
   * `savePersisted` report failure instead of writing; without this, a correct
   * sign-in would be immediately forgotten and the user bounced back to the door.
   * Memory lasts as long as this client, which is the tab — acceptable for a
   * stub, and the same lifetime a real in-memory token would have.
   */
  private memorySession: Session | null = null

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

  private isExpired(session: Session): boolean {
    return Boolean(
      session.expiresAt && new Date(session.expiresAt).getTime() <= this.now().getTime(),
    )
  }

  /**
   * Makes `session` the tab's session and tries to persist it. A failed write
   * (denied storage, full origin) leaves the session in memory. The persisted
   * key is then cleared so an older row cannot shadow the newer in-memory
   * session on the next read; where storage is entirely denied, clearing is a
   * harmless no-op.
   */
  private remember(session: Session): void {
    this.memorySession = session
    const saved = savePersisted(SESSION_KEY, [session])
    if (!saved.ok) clearPersisted(SESSION_KEY)
  }

  async getSession(): Promise<Session | null> {
    const { rows } = loadPersisted<Session>(SESSION_KEY, isSessionRow, [])
    const stored = rows[0]
    if (stored && !this.isExpired(stored)) {
      this.memorySession = stored
      return stored
    }
    if (stored) {
      // A persisted session past its expiry is definitive: drop it so it cannot
      // be offered again, then fall through to the memory fallback.
      clearPersisted(SESSION_KEY)
    }

    // No usable persisted session. That is either "signed out" or "storage could
    // not have told us" — the memory fallback is what separates the two.
    const remembered = this.memorySession
    if (!remembered) return null
    if (this.isExpired(remembered)) {
      this.memorySession = null
      return null
    }
    return remembered
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
    // Keep the session before attempting the write: a denied or full storage
    // must not undo a successful sign-in for this tab.
    this.remember(session)
    return session
  }

  async signInWithProvider(provider: SsoProvider, payload?: string): Promise<Session> {
    const domain = payload?.trim()
    if (provider === 'domain') {
      if (!domain) {
        throw new AuthError('invalid_credentials', 'A work domain is required.')
      }
      if (!isDomainLike(domain)) {
        throw new AuthError(
          'invalid_credentials',
          'Enter a valid work domain (for example, acme.com).',
        )
      }
    }
    const isDomain = provider === 'domain'
    const session = this.issue({
      id: `local-${provider}`,
      name: isDomain ? (domain as string) : PROVIDER_NAME[provider],
      email: isDomain ? `user@${domain}` : `${provider}@local.omnihr`,
    })
    this.remember(session)
    return session
  }

  async refreshSession(): Promise<Session | null> {
    const current = await this.getSession()
    if (!current) return null
    const refreshed = this.issue(current.user)
    this.remember(refreshed)
    return refreshed
  }

  async signOut(): Promise<void> {
    this.memorySession = null
    clearPersisted(SESSION_KEY)
  }
}
