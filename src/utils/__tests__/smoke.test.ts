import { describe, it, expect } from 'vitest'
import { formatINR } from '../formatters'

describe('formatINR', () => {
  it('groups thousands in the Indian lakh format', () => {
    expect(formatINR(1234567)).toBe('12,34,567')
  })
})