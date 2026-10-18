import { describe, it, expect } from 'vitest'
import { clampPage, pageRangeLabel, describeTable } from '../pagination'

describe('clampPage', () => {
  it('leaves a valid page alone', () => expect(clampPage(3, 8)).toBe(3))
  it('clamps a page beyond the end back to the last page', () => expect(clampPage(8, 2)).toBe(2))
  it('never returns less than 1', () => expect(clampPage(0, 5)).toBe(1))
})

describe('pageRangeLabel', () => {
  it('labels a full first page', () => {
    expect(pageRangeLabel(1, 25, 200)).toBe('Showing 1 - 25 of 200')
  })
  it('labels a partial last page', () => {
    expect(pageRangeLabel(8, 25, 200)).toBe('Showing 176 - 200 of 200')
  })
  it('never renders the impossible "1 - 0 of 0"', () => {
    expect(pageRangeLabel(1, 25, 0)).toBe('No results')
  })
  it('reports the clamped range when the page is stale', () => {
    expect(pageRangeLabel(8, 25, 3)).toBe('Showing 1 - 3 of 3')
  })

  // The three paginated sections used to compute this range inline, from a
  // `currentPage` that only the Prev/Next handlers ever moved. A page left at 8 by a
  // 200-record roster survived a search down to 3 matches, so the header claimed
  // "Showing 176 - 3 of 3" over an empty table. Clamping has to hold for every
  // shape of stale input, not just the one the sections produced.
  it('clamps a page below 1 instead of counting backwards', () => {
    expect(pageRangeLabel(0, 25, 200)).toBe('Showing 1 - 25 of 200')
    expect(pageRangeLabel(-4, 25, 200)).toBe('Showing 1 - 25 of 200')
  })
  it('never shows a start index past the end of the dataset', () => {
    expect(pageRangeLabel(99, 25, 200)).toBe('Showing 176 - 200 of 200')
  })
  it('truncates the end index on a partial page', () => {
    expect(pageRangeLabel(3, 25, 60)).toBe('Showing 51 - 60 of 60')
  })
  it('reports no results rather than a negative range for a negative count', () => {
    expect(pageRangeLabel(1, 25, -7)).toBe('No results')
  })
  it('does not divide by a zero or negative page size', () => {
    // Degenerate page size falls back to one row per page, which keeps start <= end.
    // Division by zero would make totalPages Infinity and render "NaN" in the header.
    expect(pageRangeLabel(1, 0, 200)).toBe('Showing 1 - 1 of 200')
    expect(pageRangeLabel(1, -25, 200)).toBe('Showing 1 - 1 of 200')
  })
  it('ignores a non-finite count or page rather than rendering NaN', () => {
    expect(pageRangeLabel(1, 25, NaN)).toBe('No results')
    expect(pageRangeLabel(NaN, 25, 200)).toBe('Showing 1 - 25 of 200')
  })
})

describe('describeTable', () => {
  it('names the table and states the window being shown', () => {
    expect(describeTable('Staff master register', 25, 200, 1, 8)).toBe(
      'Staff master register. Page 1 of 8, showing 25 of 200 records.',
    )
  })
  it('clamps a stale page so the caption cannot contradict the rows', () => {
    expect(describeTable('Staff master register', 3, 3, 8, 1)).toBe(
      'Staff master register. Page 1 of 1, showing 3 of 3 records.',
    )
  })
  it('describes an empty table instead of a page of nothing', () => {
    expect(describeTable('Staff master register', 0, 0, 1, 1)).toBe(
      'Staff master register. No records to display.',
    )
  })
})