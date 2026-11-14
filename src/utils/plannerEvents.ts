/**
 * Pure helpers for the Planner's general events.
 *
 * An event is a range of LOCAL calendar days, exactly like a leave plan, so the
 * range logic is shared with `leavePlanner`'s date-key helpers rather than reading
 * UTC instants. The module deliberately stays free of React and storage concerns:
 * the modal, the calendar and the seed data all build on the same rules, and a row
 * persisted by any of them is accepted by `isPlannerEventRow`.
 */

import type { PlannerEvent, PlannerEventType } from '../types'
import { isValidDateKey } from './leavePlanner'

/** Every event type this build can render, in the order the picker shows them. */
export const PLANNER_EVENT_TYPES: readonly PlannerEventType[] = [
  'Event',
  'Training',
  'Meeting',
  'Holiday',
  'Other',
]

export function isPlannerEventType(value: unknown): value is PlannerEventType {
  return (
    typeof value === 'string' &&
    (PLANNER_EVENT_TYPES as readonly string[]).includes(value)
  )
}

/** The fields the add/edit form edits; identity and timestamps are added on save. */
export interface PlannerEventDraft {
  title: string
  startDate: string
  endDate: string
  type: PlannerEventType
  department?: string
  location?: string
  notes?: string
}

/**
 * Blocking validation for an event draft, in the order the form should surface it.
 *
 * Overlaps are deliberately not errors: two company events may share a day, and HR
 * decides whether that is intentional. Only facts that make the row unusable (no
 * title, an unreal date, an end before the start, an unknown type) are rejected.
 */
export function validatePlannerEventDraft(draft: PlannerEventDraft): string[] {
  const problems: string[] = []

  if (draft.title.trim().length === 0) {
    problems.push('Enter an event title.')
  }

  const startValid = isValidDateKey(draft.startDate)
  const endValid = isValidDateKey(draft.endDate)
  if (!startValid) problems.push('Enter a valid start date.')
  if (!endValid) problems.push('Enter a valid end date.')
  if (startValid && endValid && draft.startDate > draft.endDate) {
    problems.push('End date cannot be before the start date.')
  }

  if (!isPlannerEventType(draft.type)) {
    problems.push('Select an event type.')
  }

  return problems
}

/**
 * True when `dateKey` falls inside the event's inclusive range.
 *
 * A key that is not a real calendar day is never covered, which keeps a malformed
 * filter value from matching every event through lexical comparison.
 */
export function plannerEventOccursOn(
  event: Pick<PlannerEvent, 'startDate' | 'endDate'>,
  dateKey: string,
): boolean {
  if (!isValidDateKey(dateKey)) return false
  return event.startDate <= dateKey && dateKey <= event.endDate
}

/**
 * Builds a persistable event from a validated draft.
 *
 * Editing keeps the original id and `createdAt`; `updatedAt` always follows the
 * clock. Optional fields are trimmed and dropped when blank so an empty text input
 * does not become a stored empty string. Throws on an invalid draft because the
 * modal validates first - reaching this throw means a caller skipped that gate,
 * and writing a half-valid event is the failure this guard exists to prevent.
 */
export function buildPlannerEvent(
  draft: PlannerEventDraft,
  options: { existing?: PlannerEvent | null; now?: Date } = {},
): PlannerEvent {
  const problems = validatePlannerEventDraft(draft)
  if (problems.length > 0) {
    throw new RangeError(problems.join(' '))
  }

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const existing = options.existing ?? null
  const department = draft.department?.trim()
  const location = draft.location?.trim()
  const notes = draft.notes?.trim()

  return {
    id:
      existing?.id ??
      `event-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: draft.title.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    type: draft.type,
    ...(department ? { department } : {}),
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}
