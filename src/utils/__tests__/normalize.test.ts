import { describe, it, expect } from 'vitest'
import { normalizeStatus, normalizeGender, mapExcelRowsToEmployees } from '../excelParser'

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
  // The regression pins for exact matching. 'Inactive' contains 'active', so a reverted
  // `includes('active')` match silently re-promotes it to a billable, attending,
  // PF-generating Active - the exact defect this batch exists to kill. None of the cases
  // above can catch it, because 'X' / 'Retired' / 'Full Time' contain neither substring.
  it.each([
    ['Inactive', 'a state that merely contains "active"'],
    ['INACTIVE', 'a state that merely contains "active"'],
    ['Not Active', 'a state that merely contains "active"'],
    ['Active - Deceased', 'an exact match with a trailing note'],
  ])('maps %s (%s) to Unknown, not Active', (input) => {
    expect(normalizeStatus(input)).toBe('Unknown')
  })
  // The null guards at excelParser.ts:36/:57 had no coverage; an absent Status or Gender
  // column makes every row resolve to Unknown, which silently empties the payroll run.
  it('maps a missing status cell to Unknown', () => {
    expect(normalizeStatus(null)).toBe('Unknown')
    expect(normalizeStatus(undefined)).toBe('Unknown')
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
  // The regression pins for the tightened Non-Binary match. All three contain 'non', so a
  // reverted `includes('non')` reads them as Non-Binary with the suite still green - 'X'
  // alone cannot catch it.
  it.each([
    ['None', 'a value that merely contains "non"'],
    ['Non', 'a value that merely contains "non"'],
    ['Nonetheless', 'a value that merely contains "non"'],
  ])('maps %s (%s) to Unknown, not a declared value', (input) => {
    expect(normalizeGender(input)).toBe('Unknown')
  })
  it('maps a missing gender cell to Unknown', () => {
    expect(normalizeGender(null)).toBe('Unknown')
    expect(normalizeGender(undefined)).toBe('Unknown')
  })
  it('maps a declined value to Prefer Not to Say', () => {
    expect(normalizeGender('Prefer not to say')).toBe('Prefer Not to Say')
  })
})

describe('mapExcelRowsToEmployees warnings', () => {
  // Every field that would otherwise raise a warning is supplied, so each expectation
  // below is about the Status / Gender warning alone. PF UAN and Phone joined that set
  // when a missing column there started warning (it used to substitute silently).
  const row = (over: Record<string, unknown>) => ({
    'Employee ID': 'EMP-1',
    'Full Name': 'Asha Menon',
    DOJ: '2024-01-15',
    'Monthly CTC': 150000,
    'PF UAN': '100123456789',
    Phone: '+91 9000000000',
    ...over,
  })

  it('warns that an unrecognised status was recorded as Unknown and excluded from payroll', () => {
    const { employees, warnings } = mapExcelRowsToEmployees([
      row({ Status: 'Retired', Gender: 'Female' }),
    ])
    expect(employees[0].status).toBe('Unknown')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Row 1 (Asha Menon)')
    expect(warnings[0]).toContain('"Retired"')
    expect(warnings[0]).toContain('excluded from the payroll run')
  })

  it('warns when the Status column is absent entirely, rather than failing silently', () => {
    const { employees, warnings } = mapExcelRowsToEmployees([
      row({ Gender: 'Female' }),
    ])
    expect(employees[0].status).toBe('Unknown')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('no Status value found')
  })

  it('warns that an unrecognised gender was recorded as Unknown', () => {
    const { employees, warnings } = mapExcelRowsToEmployees([
      row({ Status: 'Active', Gender: 'None' }),
    ])
    expect(employees[0].gender).toBe('Unknown')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Row 1 (Asha Menon)')
    expect(warnings[0]).toContain('"None"')
  })

  it('stays silent on a fully recognised row', () => {
    const { warnings } = mapExcelRowsToEmployees([
      row({ Status: 'Active', Gender: 'Female' }),
    ])
    expect(warnings).toEqual([])
  })

  it('caps an unreadable column at the existing 5-warning limit and counts the remainder', () => {
    const { warnings } = mapExcelRowsToEmployees(
      Array.from({ length: 40 }, (_, i) =>
        row({ 'Employee ID': `EMP-${i}`, 'Full Name': `Staff ${i}`, Status: 'Retired', Gender: 'Female' })
      )
    )
    // 4 rows are named individually, and the 5th line states how many were not shown —
    // a truncated list must not read as "that was all of them".
    expect(warnings).toHaveLength(5)
    expect(warnings[0]).toContain('Row 1 (Staff 0)')
    expect(warnings[4]).toContain('36 more row')
  })
})