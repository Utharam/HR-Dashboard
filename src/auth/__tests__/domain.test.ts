import { describe, it, expect } from 'vitest'
import { isDomainLike } from '../domain'

const label = (length: number) => 'a'.repeat(length)

describe('isDomainLike', () => {
  it.each([
    'acme.com',
    'sub.acme.com',
    'a-b.acme.com',
    'ACME.COM',
    'a.co',
    'x.y',
  ])('accepts %s', (value) => {
    expect(isDomainLike(value)).toBe(true)
  })

  it.each([
    '',
    'acme',
    'not a domain',
    'https://acme.com',
    'acme.com/login',
    'acme.com:443',
    'user@acme.com',
    '-acme.com',
    'acme-.com',
    'acme..com',
    '.acme.com',
    'acme.com.',
    'acme_com',
    'acme .com',
  ])('rejects %j', (value) => {
    expect(isDomainLike(value)).toBe(false)
  })

  it('rejects a label longer than 63 characters', () => {
    expect(isDomainLike(`${label(64)}.com`)).toBe(false)
  })

  it('accepts a 253-character domain and rejects 254', () => {
    const longest = [label(63), label(63), label(63), label(61)].join('.')
    expect(longest).toHaveLength(253)
    expect(isDomainLike(longest)).toBe(true)

    const tooLong = [label(63), label(63), label(63), label(62)].join('.')
    expect(tooLong).toHaveLength(254)
    expect(isDomainLike(tooLong)).toBe(false)
  })
})
