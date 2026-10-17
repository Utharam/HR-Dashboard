import { describe, it, expect } from 'vitest'
import { formatINR, formatLakhs, formatCrores, computeStatutoryGratuity } from '../formatters'

describe('currency formatters', () => {
  it('groups thousands in the Indian lakh format', () => {
    expect(formatINR(1234567)).toBe('12,34,567')
  })
  it('renders an em dash for NaN instead of a confident zero', () => {
    expect(formatINR(NaN)).toBe('—')
  })
  it('renders an em dash for Infinity', () => {
    expect(formatLakhs(Infinity)).toBe('—')
  })
  it('never renders a negative zero', () => {
    expect(formatINR(-0.4)).not.toContain('-0')
  })
  it('renders an em dash for a non-finite crore value', () => {
    expect(formatCrores(NaN)).toBe('—')
  })
})

describe('computeStatutoryGratuity', () => {
  it('pays nothing below five completed years', () => {
    expect(computeStatutoryGratuity(50000, 4.4)).toEqual({
      gratuity: 0, roundedTenure: 4, eligible: false, invalid: false,
    })
  })
  it('rounds a fraction of 6 months or more up to a whole year', () => {
    expect(computeStatutoryGratuity(50000, 4.5).roundedTenure).toBe(5)
  })
  it('applies the statutory 15/26 formula', () => {
    expect(computeStatutoryGratuity(50000, 5).gratuity).toBe(144231)
  })
  it('caps gratuity at ₹20,00,000', () => {
    expect(computeStatutoryGratuity(200000, 40).gratuity).toBe(2000000)
  })
  it('marks an unknown tenure invalid rather than eligible', () => {
    expect(computeStatutoryGratuity(50000, null)).toEqual({
      gratuity: 0, roundedTenure: 0, eligible: false, invalid: true,
    })
  })
  it('marks a NaN tenure invalid rather than eligible', () => {
    expect(computeStatutoryGratuity(50000, NaN).eligible).toBe(false)
  })
  it('marks a negative tenure invalid', () => {
    expect(computeStatutoryGratuity(50000, -2).invalid).toBe(true)
  })
})