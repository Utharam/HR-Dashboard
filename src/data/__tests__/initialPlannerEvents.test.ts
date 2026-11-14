import { describe, it, expect } from 'vitest'
import { createInitialPlannerEvents } from '../initialPlannerEvents'
import { isPlannerEventRow } from '../../utils/rowValidators'
import {
  eachDateKey,
  isValidDateKey,
  parseDateKey,
  toDateKey,
} from '../../utils/leavePlanner'

const NOW = new Date(2026, 0, 15, 9, 30, 0) // Thursday, 15 January 2026 (local)

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

describe('createInitialPlannerEvents', () => {
  const events = createInitialPlannerEvents(NOW)

  it('returns the two demo events with stable ids', () => {
    expect(events.map((event) => event.id)).toEqual(['event-seed-1', 'event-seed-2'])
    expect(events.map((event) => event.title)).toEqual([
      'Quarterly Business Review',
      'Manager Training Day',
    ])
  })

  it('is deterministic for a fixed now', () => {
    expect(createInitialPlannerEvents(NOW)).toEqual(events)
  })

  it('produces rows the persistence validator accepts', () => {
    for (const event of events) {
      expect(isPlannerEventRow(event)).toBe(true)
    }
  })

  it('starts every event inside the coming weeks', () => {
    const todayKey = toDateKey(NOW)
    const lastKey = toDateKey(addDays(NOW, 27))
    for (const event of events) {
      expect(isValidDateKey(event.startDate)).toBe(true)
      expect(event.startDate >= todayKey).toBe(true)
      expect(event.startDate <= lastKey).toBe(true)
      expect(event.endDate >= event.startDate).toBe(true)
      expect(event.endDate <= lastKey).toBe(true)
    }
  })

  it('never puts an event start, end or covered day on a Sunday', () => {
    for (const event of events) {
      expect(parseDateKey(event.startDate).getDay()).not.toBe(0)
      expect(parseDateKey(event.endDate).getDay()).not.toBe(0)
      for (const key of eachDateKey(event.startDate, event.endDate)) {
        expect(parseDateKey(key).getDay()).not.toBe(0)
      }
    }
  })

  it('uses known event types', () => {
    const types = new Set(['Event', 'Training', 'Meeting', 'Holiday', 'Other'])
    for (const event of events) {
      expect(types.has(event.type)).toBe(true)
    }
    expect(events.some((event) => event.type === 'Training')).toBe(true)
  })

  it('stamps created and updated timestamps from now', () => {
    for (const event of events) {
      expect(event.createdAt).toBe(NOW.toISOString())
      expect(event.updatedAt).toBe(NOW.toISOString())
    }
  })

  it('defaults to the current date when now is omitted', () => {
    const seeded = createInitialPlannerEvents()
    expect(seeded).toHaveLength(2)
    for (const event of seeded) {
      expect(isPlannerEventRow(event)).toBe(true)
    }
  })
})
