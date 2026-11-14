/**
 * Relative-date demo events for the first run and the "Reset Demo State" path.
 *
 * The dates are anchored to the coming Monday (today itself when today is Monday),
 * exactly like the demo leave plans, so the demo calendar always shows upcoming
 * company events instead of stale hardcoded dates. Offsets are chosen to land on
 * weekdays and to stay inside the next month or so.
 *
 * The seed is deterministic for a given `now`: the same instant yields the same
 * events. It is only installed by the store layer when the roster is the exact demo
 * set and no planner-events key exists yet (D7), so a custom register never sees
 * invented company events.
 */

import type { PlannerEvent, PlannerEventType } from '../types'
import { toDateKey } from '../utils/leavePlanner'

interface SeedSpec {
  /** Days after the anchor Monday. */
  offset: number
  /** Inclusive duration in days. */
  days: number
  title: string
  type: PlannerEventType
  department?: string
  location?: string
  notes?: string
}

const SEED_SPECS: SeedSpec[] = [
  {
    offset: 9,
    days: 2,
    title: 'Quarterly Business Review',
    type: 'Event',
    location: 'Bengaluru HQ',
    notes: 'Company-wide review of quarterly priorities and results.',
  },
  {
    offset: 16,
    days: 1,
    title: 'Manager Training Day',
    type: 'Training',
    department: 'People & Human Resources',
    location: 'Bengaluru HQ',
    notes: 'People managers: feedback, coaching and performance conversations.',
  },
]

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Monday-first anchor: today when today is Monday, otherwise the coming Monday. */
function upcomingMonday(today: Date): Date {
  const daysUntilMonday = (8 - today.getDay()) % 7
  return addDays(today, daysUntilMonday)
}

export function createInitialPlannerEvents(now: Date = new Date()): PlannerEvent[] {
  const today = startOfDay(now)
  const monday = upcomingMonday(today)
  const stamp = now.toISOString()

  return SEED_SPECS.map((spec, index) => {
    const start = addDays(monday, spec.offset)
    const end = addDays(start, spec.days - 1)

    return {
      id: `event-seed-${index + 1}`,
      title: spec.title,
      startDate: toDateKey(start),
      endDate: toDateKey(end),
      type: spec.type,
      ...(spec.department ? { department: spec.department } : {}),
      ...(spec.location ? { location: spec.location } : {}),
      ...(spec.notes ? { notes: spec.notes } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    }
  })
}
