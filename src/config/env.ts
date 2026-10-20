import type { AuthClient } from '../auth/AuthClient'
import { AuthError } from '../auth/AuthClient'
import { LocalAuthClient } from '../auth/LocalAuthClient'

/**
 * The single place configuration lives. Nothing else reads `import.meta.env`,
 * so pointing the product at a real API is one edit here, not a hunt.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export const AUTH_MODE: 'local' | 'http' =
  import.meta.env.VITE_AUTH_MODE === 'http' ? 'http' : 'local'

/**
 * Where an `HttpAuthClient` would be selected. Until one exists, asking for HTTP
 * mode is a deployment error, not a reason to silently accept any password.
 */
export function createAuthClientFor(mode: 'local' | 'http'): AuthClient {
  if (mode === 'http') {
    throw new AuthError(
      'not_configured',
      'VITE_AUTH_MODE=http is set, but no HTTP auth client has been implemented.',
    )
  }
  return new LocalAuthClient()
}

export function createAuthClient(): AuthClient {
  return createAuthClientFor(AUTH_MODE)
}
