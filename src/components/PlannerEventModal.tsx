import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import type { PlannerEvent, PlannerEventType } from '../types';
import { PLANNER_EVENT_TYPES, buildPlannerEvent, validatePlannerEventDraft } from '../utils/plannerEvents';
import { eachDateKey, isValidDateKey } from '../utils/leavePlanner';
import { Dialog } from './Dialog';

/**
 * The add/edit form behind the Planner's "Add event" action.
 *
 * The parent mounts this component only while it is open, so the form state is
 * created fresh from `eventToEdit`/`initialDates` on every open - no stale-value
 * reset effect is needed. `Dialog` owns the scrim, focus lifecycle and Escape.
 *
 * Validation is delegated to `validatePlannerEventDraft` (title, real calendar
 * dates, start <= end, a known type), so the modal and the store boundary can
 * never disagree about what a usable event is. Unlike leave, an event is not
 * tied to one employee: department/location are optional selects whose empty
 * value means "company-wide", and overlaps between events are allowed - two
 * company events may share a day, and HR decides.
 */

export interface PlannerEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: PlannerEvent) => void;
  /** The event to modify, or `null` in add mode. */
  eventToEdit: PlannerEvent | null;
  /** Pre-fills both dates when the entry is anchored to a calendar day. */
  initialDates?: { startDate: string; endDate: string } | null;
  /** The roster's departments and locations, for the optional scoping selects. */
  departments: string[];
  locations: string[];
}

export const PlannerEventModal: React.FC<PlannerEventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  eventToEdit,
  initialDates = null,
  departments,
  locations,
}) => {
  const titleId = useId();

  const [title, setTitle] = useState(eventToEdit?.title ?? '');
  const [startDate, setStartDate] = useState(
    eventToEdit?.startDate ?? initialDates?.startDate ?? '',
  );
  const [endDate, setEndDate] = useState(
    eventToEdit?.endDate ?? initialDates?.endDate ?? '',
  );
  const [type, setType] = useState<PlannerEventType>(eventToEdit?.type ?? 'Event');
  const [department, setDepartment] = useState(eventToEdit?.department ?? '');
  const [location, setLocation] = useState(eventToEdit?.location ?? '');
  const [notes, setNotes] = useState(eventToEdit?.notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  // An event edited today may carry a department the current roster no longer
  // names; keeping it in the options is what makes the value visible instead of
  // silently snapping back to company-wide on save.
  const departmentOptions = [
    ...new Set([...departments, ...(eventToEdit?.department ? [eventToEdit.department] : [])]),
  ].sort();
  const locationOptions = [
    ...new Set([...locations, ...(eventToEdit?.location ? [eventToEdit.location] : [])]),
  ].sort();

  const rangeLabel = (() => {
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) {
      return 'select valid dates';
    }
    const days = eachDateKey(startDate, endDate).length;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  })();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const draft = {
      title,
      startDate,
      endDate,
      type,
      department: department || undefined,
      location: location || undefined,
      notes: notes || undefined,
    };
    const problems = validatePlannerEventDraft(draft);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setErrors([]);
    // `buildPlannerEvent` re-validates and assigns the id and timestamps, so a
    // save here is the same row shape the store and snapshot accept.
    onSave(buildPlannerEvent(draft, { existing: eventToEdit }));
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} labelledBy={titleId} className="modal-window--narrow">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="modal-close"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <h2 id={titleId} className="omni-card-title" style={{ fontSize: 'var(--fs-2xl)' }}>
        {eventToEdit ? 'Edit event entry' : 'Add event entry'}
      </h2>
      <p className="omni-card-sub">
        {eventToEdit
          ? 'Update the dates, type or scope of an existing event.'
          : 'Put a company event on the planner calendar: a review, a training day, a meeting.'}
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}
      >
        <div className="omni-field">
          <label className="omni-label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            type="text"
            className="omni-input"
            value={title}
            placeholder="What is happening"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-start">
              Start date
            </label>
            <input
              id="event-start"
              type="date"
              className="omni-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-end">
              End date
            </label>
            <input
              id="event-end"
              type="date"
              className="omni-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-type">
              Event type
            </label>
            <select
              id="event-type"
              className="omni-select"
              value={type}
              onChange={(e) => setType(e.target.value as PlannerEventType)}
            >
              {PLANNER_EVENT_TYPES.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-department">
              Department
            </label>
            <select
              id="event-department"
              className="omni-select"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All departments (company-wide)</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-location">
              Location
            </label>
            <select
              id="event-location"
              className="omni-select"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">All locations (company-wide)</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="event-notes">
              Notes
            </label>
            <input
              id="event-notes"
              type="text"
              className="omni-input"
              value={notes}
              placeholder="Optional context"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <p className="planner-hint">The event covers {rangeLabel}.</p>

        {errors.length > 0 && (
          <div className="alert tone-danger" role="alert">
            <ul>
              {errors.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
            paddingTop: 'var(--space-4)',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {eventToEdit ? 'Save changes' : 'Save event entry'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
