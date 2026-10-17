import type { Employee } from '../types'

/**
 * The single owner of the status-badge vocabulary.
 *
 * Both records are keyed by the full `Employee['status']` union, so adding a status is
 * a compile error until it is given a tone and a label here — a widening that silently
 * falls through to a `default` branch is how an `Unknown` import ended up rendered in
 * the danger tone that `badge-notice` uses for staff on notice period.
 *
 * `Unknown` is deliberately neutral: it means the source column could not be read, which
 * is missing data rather than a performance or conduct signal.
 */
const STATUS_BADGE_CLASS: Record<Employee['status'], string> = {
  Active: 'badge-active',
  Probation: 'badge-probation',
  'Notice Period': 'badge-notice',
  Resigned: 'badge-resigned',
  Unknown: 'badge-neutral',
}

/** Directory-width labels; the profile modal renders the full status instead. */
const STATUS_BADGE_LABEL: Record<Employee['status'], string> = {
  Active: 'Active',
  Probation: 'Probation',
  'Notice Period': 'Notice',
  Resigned: 'Resigned',
  Unknown: 'Unknown',
}

export function statusBadgeClass(status: Employee['status']): string {
  return STATUS_BADGE_CLASS[status]
}

export function statusBadgeLabel(status: Employee['status']): string {
  return STATUS_BADGE_LABEL[status]
}
