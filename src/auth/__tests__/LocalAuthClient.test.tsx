import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  it('drops the session in another tab when that tab signs out', async () => {
    // Two clients over the same storage are two tabs: A signs in, B reads the
    // shared session, B signs out. A's next read must not resurrect the session
    // from memory — sign-out is cross-tab even though the memory cache is not.
    const tabA = client()
    await tabA.signIn({ email: 'ceo@acme.com', password: 'demo' })
    const tabB = client()
    expect((await tabB.getSession())?.user.email).toBe('ceo@acme.com')
    await tabB.signOut()
    expect(await tabA.getSession()).toBeNull()
    expect(await tabB.getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('rejects SSO-by-domain without a domain and accepts with one', async () => {
    await expect(client().signInWithProvider('domain')).rejects.toMatchObject({ code: 'invalid_credentials' })
    const s = await client().signInWithProvider('domain', 'acme.com')
    expect(s.user.email).toContain('@acme.com')
  })
  it('rejects a payload that is not domain-like', async () => {
    await expect(client().signInWithProvider('domain', 'not a domain')).rejects.toMatchObject({
      code: 'invalid_credentials',
    })
    await expect(client().signInWithProvider('domain', 'https://acme.com/login')).rejects.toMatchObject({
      code: 'invalid_credentials',
    })
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('resolves the Microsoft and Okta stubs', async () => {
    expect((await client().signInWithProvider('microsoft')).user.name.length).toBeGreaterThan(0)
    expect((await client().signInWithProvider('okta')).user.name.length).toBeGreaterThan(0)
  })

  it('keeps the tab signed in when storage rejects the write as full', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    try {
      const c = client()
      const s = await c.signIn({ email: 'ceo@acme.com', password: 'demo' })
      expect(s.user.email).toBe('ceo@acme.com')
      // Nothing was persisted, so only the in-memory fallback can answer.
      expect(localStorage.getItem(SESSION_KEY)).toBeNull()
      expect((await c.getSession())?.user.email).toBe('ceo@acme.com')
    } finally {
      setItem.mockRestore()
    }
  })

  it('refreshes and clears the in-memory fallback too', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    try {
      const c = client()
      const first = await c.signIn({ email: 'ceo@acme.com', password: 'demo' })
      now = new Date('2026-10-18T09:00:00.000Z')
      const refreshed = await c.refreshSession()
      expect(refreshed?.user.email).toBe(first.user.email)
      expect(refreshed?.expiresAt).not.toBe(first.expiresAt)
      expect((await c.getSession())?.expiresAt).toBe(refreshed?.expiresAt)

      await c.signOut()
      expect(await c.getSession()).toBeNull()
      expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    } finally {
      setItem.mockRestore()
    }
  })

  it('expires an in-memory session when storage cannot persist it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    try {
      const c = client()
      await c.signIn({ email: 'ceo@acme.com', password: 'demo' })
      now = new Date('2030-01-01T00:00:00.000Z')
      expect(await c.getSession()).toBeNull()
    } finally {
      setItem.mockRestore()
    }
  })
})
