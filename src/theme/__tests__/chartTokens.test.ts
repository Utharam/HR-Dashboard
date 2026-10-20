import { describe, it, expect } from 'vitest'
import { readChartTokens } from '../chartTokens'

describe('readChartTokens', () => {
  it('maps every chart token from the injected style source', () => {
    const read = (name: string) => `value-of-${name}`
    const t = readChartTokens(read)
    expect(t.primary).toBe('value-of---primary')
    expect(t.surface).toBe('value-of---bg-card')
    expect(t.grid).toBe('value-of---grid-line')
    expect(t.font).toBe('value-of---font-sans')
    expect(t.well).toBe('value-of---bg-well')
    expect(t.border).toBe('value-of---border')
  })
  it('trims whitespace returned by the source', () => {
    expect(readChartTokens(() => '  #fff  ').primary).toBe('#fff')
  })
})
