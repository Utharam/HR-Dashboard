import { describe, it, expect } from 'vitest'
import { isSessionRow } from '../session'

const valid = {
  user: { id: 'u1', name: 'Asha', email: 'asha@acme.com' },
  issuedAt: '2026-10-18T08:00:00.000Z',
}
describe('isSessionRow', () => {
  it('accepts a complete session', () => expect(isSessionRow(valid)).toBe(true))
  it('accepts one with an expiry and an org', () => {
    expect(isSessionRow({ ...valid, expiresAt: '2026-10-18T16:00:00.000Z', user: { ...valid.user, org: 'Acme' } })).toBe(true)
  })
  it('rejects a row without a user', () => expect(isSessionRow({ issuedAt: valid.issuedAt })).toBe(false))
  it('rejects a user without an email', () => expect(isSessionRow({ ...valid, user: { id: 'u1', name: 'A' } })).toBe(false))
  it('rejects null and strings', () => {
    expect(isSessionRow(null)).toBe(false)
    expect(isSessionRow('session')).toBe(false)
  })
  it('rejects an unparseable expiry rather than treating it as never-expiring', () => {
    expect(isSessionRow({ ...valid, expiresAt: 'garbage' })).toBe(false)
    expect(isSessionRow({ ...valid, expiresAt: '' })).toBe(false)
  })
  it('rejects an unparseable issue time', () => {
    expect(isSessionRow({ ...valid, issuedAt: 'not-a-date' })).toBe(false)
  })
})
