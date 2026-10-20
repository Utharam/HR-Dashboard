import { describe, it, expect, beforeEach } from 'vitest'
import { LocalAuthClient } from '../LocalAuthClient'
import { AuthError } from '../AuthClient'
import { SESSION_KEY } from '../session'

let now = new Date('2026-10-18T08:00:00.000Z')
const client = () => new LocalAuthClient({ now: () => now })

beforeEach(() => {
  localStorage.clear()
  now = new Date('2026-10-18T08:00:00.000Z')
})

describe('LocalAuthClient', () => {
  it('rejects an empty email or password with invalid_credentials', async () => {
    await expect(client().signIn({ email: '', password: 'x' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(client().signIn({ email: 'a@b.com', password: '' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(client().signIn({ email: '', password: '' })).rejects.toBeInstanceOf(AuthError)
  })
  it('signs in a documented test account and persists the session', async () => {
    const s = await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    expect(s.user.email).toBe('ceo@acme.com')
    expect(s.expiresAt).toBeDefined()
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}').rows[0].user.email).toBe('ceo@acme.com')
  })
  it('returns the persisted session from getSession', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    expect((await client().getSession())?.user.email).toBe('ceo@acme.com')
  })
  it('drops an expired session', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    const later = new LocalAuthClient({ now: () => new Date('2030-01-01T00:00:00.000Z') })
    expect(await later.getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('refreshes the expiry without changing the user', async () => {
    const s = await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    now = new Date('2026-10-18T09:00:00.000Z')
    const r = await client().refreshSession()
    expect(r?.user.email).toBe(s.user.email)
    expect(r?.expiresAt).not.toBe(s.expiresAt)
  })
  it('signs out by clearing the session', async () => {
    await client().signIn({ email: 'ceo@acme.com', password: 'demo' })
    await client().signOut()
    expect(await client().getSession()).toBeNull()
  })
  it('rejects SSO-by-domain without a domain and accepts with one', async () => {
    await expect(client().signInWithProvider('domain')).rejects.toMatchObject({ code: 'invalid_credentials' })
    const s = await client().signInWithProvider('domain', 'acme.com')
    expect(s.user.email).toContain('@acme.com')
  })
  it('resolves the Microsoft and Okta stubs', async () => {
    expect((await client().signInWithProvider('microsoft')).user.name.length).toBeGreaterThan(0)
    expect((await client().signInWithProvider('okta')).user.name.length).toBeGreaterThan(0)
  })
})
