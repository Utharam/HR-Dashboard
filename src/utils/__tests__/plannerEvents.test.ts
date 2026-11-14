import { describe, it, expect } from 'vitest'
import type { PlannerEvent } from '../../types'
import {
  PLANNER_EVENT_TYPES,
  buildPlannerEvent,
  isPlannerEventType,
  plannerEventOccursOn,
  validatePlannerEventDraft,
} from '../plannerEvents'
import { createInitialPlannerEvents } from '../../data/initialPlannerEvents'

const NOW = new Date('2026-01-15T09:30:00.000Z')

const draft = () => ({
  title: 'Quarterly Business Review',
  startDate: '2026-01-19',
  endDate: '2026-01-20',
  type: 'Event' as const,
})

describe('planner event types', () => {
  it('lists every renderable type exactly once', () => {
    expect(PLANNER_EVENT_TYPES).toEqual([
      'Event',
      'Training',
      'Meeting',
      'Holiday',
      'Other',
    ])
    for (const type of PLANNER_EVENT_TYPES) {
      expect(isPlannerEventType(type)).toBe(true)
    }
  })

  it('rejects unknown or non-string types', () => {
    expect(isPlannerEventType('Conference')).toBe(false)
    expect(isPlannerEventType(null)).toBe(false)
    expect(isPlannerEventType(1)).toBe(false)
  })
})

describe('validatePlannerEventDraft', () => {
  it('accepts a complete draft', () => {
    expect(validatePlannerEventDraft(draft())).toEqual([])
    expect(validatePlannerEventDraft({ ...draft(), startDate: '2026-01-19', endDate: '2026-01-19' })).toEqual([])
  })

  it('reports a blank title', () => {
    expect(validatePlannerEventDraft({ ...draft(), title: '   ' })).toContain(
      'Enter an event title.',
    )
  })

  it('reports malformed dates', () => {
    expect(
      validatePlannerEventDraft({ ...draft(), startDate: '2026-02-30' }),
    ).toContain('Enter a valid start date.')
    expect(validatePlannerEventDraft({ ...draft(), endDate: 'not-a-date' })).toContain(
      'Enter a valid end date.',
    )
  })

  it('reports an end before the start', () => {
    expect(
      validatePlannerEventDraft({ ...draft(), startDate: '2026-01-20', endDate: '2026-01-19' }),
    ).toContain('End date cannot be before the start date.')
  })

  it('reports an unknown type', () => {
    expect(
      validatePlannerEventDraft({ ...draft(), type: 'Conference' as never }),
    ).toContain('Select an event type.')
  })
})

describe('plannerEventOccursOn', () => {
  const event = createInitialPlannerEvents(NOW)[0]

  it('covers both ends of the inclusive range', () => {
    expect(plannerEventOccursOn(event, event.startDate)).toBe(true)
    expect(plannerEventOccursOn(event, event.endDate)).toBe(true)
  })

  it('rejects days before and after the range', () => {
    expect(plannerEventOccursOn(event, '2026-01-01')).toBe(false)
    expect(plannerEventOccursOn(event, '2026-02-01')).toBe(false)
  })

  it('rejects an invalid date key', () => {
    expect(plannerEventOccursOn(event, 'not-a-date')).toBe(false)
  })
})

describe('buildPlannerEvent', () => {
  it('builds a persistable row from a draft', () => {
    const event = buildPlannerEvent(
      {
        ...draft(),
        department: '  Finance & Operations  ',
        location: '  Mumbai Hub ',
        notes: '  Bring the deck.  ',
      },
      { now: NOW },
    )

    expect(event.id).toMatch(/^event-/)
    expect(event.title).toBe('Quarterly Business Review')
    expect(event.department).toBe('Finance & Operations')
    expect(event.location).toBe('Mumbai Hub')
    expect(event.notes).toBe('Bring the deck.')
    expect(event.createdAt).toBe(NOW.toISOString())
    expect(event.updatedAt).toBe(NOW.toISOString())
  })

  it('drops blank optional fields instead of storing empty strings', () => {
    const event = buildPlannerEvent(
      { ...draft(), department: '   ', location: '', notes: '   ' },
      { now: NOW },
    )

    expect(event.department).toBeUndefined()
    expect(event.location).toBeUndefined()
    expect(event.notes).toBeUndefined()
  })

  it('keeps the id and createdAt when editing', () => {
    const existing: PlannerEvent = {
      ...buildPlannerEvent(draft(), { now: new Date('2026-01-01T00:00:00.000Z') }),
      id: 'event-existing',
    }

    const updated = buildPlannerEvent(
      { ...draft(), title: 'Updated title' },
      { existing, now: NOW },
    )

    expect(updated.id).toBe('event-existing')
    expect(updated.createdAt).toBe(existing.createdAt)
    expect(updated.updatedAt).toBe(NOW.toISOString())
    expect(updated.title).toBe('Updated title')
  })

  it('throws rather than building a half-valid event', () => {
    expect(() => buildPlannerEvent({ ...draft(), title: '' }, { now: NOW })).toThrow(
      RangeError,
    )
  })
})
