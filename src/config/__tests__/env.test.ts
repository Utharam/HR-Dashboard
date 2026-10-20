import { describe, it, expect } from 'vitest'
import { createAuthClientFor } from '../env'
import { LocalAuthClient } from '../../auth/LocalAuthClient'
import { AuthError } from '../../auth/AuthClient'

describe('createAuthClientFor', () => {
  it('returns the local stub in local mode', () => {
    expect(createAuthClientFor('local')).toBeInstanceOf(LocalAuthClient)
  })
  it('refuses to fail open when HTTP mode is requested', () => {
    expect(() => createAuthClientFor('http')).toThrowError(AuthError)
    try {
      createAuthClientFor('http')
    } catch (error) {
      expect((error as AuthError).code).toBe('not_configured')
    }
  })
})
