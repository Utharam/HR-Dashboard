import { describe, it, expect } from 'vitest'
import { normalizeStatus, normalizeGender } from '../excelParser'

describe('normalizeStatus', () => {
  it.each([
    ['Active', 'Active'], ['Probation', 'Probation'],
    ['Notice Period', 'Notice Period'], ['Resigned', 'Resigned'],
  ])('maps %s', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })
  it('maps a blank status to Unknown, not the expensive default', () => {
    expect(normalizeStatus('')).toBe('Unknown')
  })
  it.each(['Retired', 'On Hold', 'Full Time'])('maps the unmapped state %s to Unknown', (input) => {
    expect(normalizeStatus(input)).toBe('Unknown')
  })
})

describe('normalizeGender', () => {
  it('maps Female, Male and Non-Binary exactly', () => {
    expect(normalizeGender('Female')).toBe('Female')
    expect(normalizeGender('Male')).toBe('Male')
    expect(normalizeGender('Non-Binary')).toBe('Non-Binary')
  })
  it('maps an unrecognised value to Unknown, not Female', () => {
    expect(normalizeGender('X')).toBe('Unknown')
  })
  it('maps a declined value to Prefer Not to Say', () => {
    expect(normalizeGender('Prefer not to say')).toBe('Prefer Not to Say')
  })
})
