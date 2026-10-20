import type { Session } from '../types'

/** Persisted through `utils/storage.ts`, never as raw localStorage. */
export const SESSION_KEY = 'omnihr_session'

/**
 * All-or-nothing validation. A session without an identity or an issue time is
 * not a session the app can route on, and a half-restored session is how a
 * signed-out visitor ends up looking at the console.
 */
export function isSessionRow(row: unknown): row is Session {
  if (row === null || typeof row !== 'object') return false
  const candidate = row as { user?: unknown; issuedAt?: unknown; expiresAt?: unknown }
  if (typeof candidate.issuedAt !== 'string') return false
  if (candidate.expiresAt !== undefined && typeof candidate.expiresAt !== 'string') return false

  const user = candidate.user
  if (user === null || typeof user !== 'object') return false
  const fields = user as { id?: unknown; name?: unknown; email?: unknown; org?: unknown }
  if (typeof fields.id !== 'string') return false
  if (typeof fields.name !== 'string') return false
  if (typeof fields.email !== 'string') return false
  if (fields.org !== undefined && typeof fields.org !== 'string') return false
  return true
}
