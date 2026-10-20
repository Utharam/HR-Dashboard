import type { Session } from '../types'

/** Persisted through `utils/storage.ts`, never as raw localStorage. */
export const SESSION_KEY = 'omnihr_session'

const isParseableDate = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime())

/**
 * All-or-nothing validation. A session without an identity or a parseable issue
 * time is not a session the app can route on, and a half-restored session is how
 * a signed-out visitor ends up looking at the console.
 *
 * `expiresAt` must PARSE, not merely be a string: an unreadable expiry would make
 * `NaN <= now` false and grant a session that never expires.
 */
export function isSessionRow(row: unknown): row is Session {
  if (row === null || typeof row !== 'object') return false
  const candidate = row as { user?: unknown; issuedAt?: unknown; expiresAt?: unknown }
  if (!isParseableDate(candidate.issuedAt)) return false
  if (candidate.expiresAt !== undefined && !isParseableDate(candidate.expiresAt)) return false

  const user = candidate.user
  if (user === null || typeof user !== 'object') return false
  const fields = user as { id?: unknown; name?: unknown; email?: unknown; org?: unknown }
  if (typeof fields.id !== 'string') return false
  if (typeof fields.name !== 'string') return false
  if (typeof fields.email !== 'string') return false
  if (fields.org !== undefined && typeof fields.org !== 'string') return false
  return true
}
