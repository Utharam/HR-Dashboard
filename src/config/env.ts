import type { AuthClient } from '../auth/AuthClient'
import { LocalAuthClient } from '../auth/LocalAuthClient'

/**
 * The single place configuration lives. Nothing else reads `import.meta.env`,
 * so pointing the product at a real API is one edit here, not a hunt.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export const AUTH_MODE: 'local' | 'http' =
  import.meta.env.VITE_AUTH_MODE === 'http' ? 'http' : 'local'

/**
 * Where an `HttpAuthClient` would be selected from `AUTH_MODE` once it exists.
 * The local stub is the only implementation today; the interface is the seam.
 */
export function createAuthClient(): AuthClient {
  return new LocalAuthClient()
}
