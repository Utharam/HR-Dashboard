import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import type { Employee, HalfDay, LeavePlan, LeaveStatus, LeaveType } from '../types';
import { countWorkingDays, isValidDateKey } from '../utils/leavePlanner';
import { Dialog } from './Dialog';

/**
 * The add/edit form behind the leave planner's "Add leave" action.
 *
 * The parent mounts this component only while it is open, so the form state is
 * created fresh from `planToEdit`/`initialDates` on every open - no stale-value
 * reset effect is needed. `Dialog` owns the scrim, focus lifecycle and Escape.
 *
 * Validation is explicit and blocking (employee, valid date keys, start <= end,
 * half-day only on a single day, no duplicate identical entry); overlaps are
 * flagged live but allowed, because two people occasionally book the same window
 * and HR decides - the UI should not silently veto what the data permits.
 */

const LEAVE_TYPES: LeaveType[] = [
  'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
];
const LEAVE_STATUSES: LeaveStatus[] = ['Planned', 'Approved', 'Cancelled'];

export interface LeavePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: LeavePlan) => void;
  employees: Employee[];
  /**
   * Every known plan, used for the duplicate and overlap checks. The plan being
   * edited is excluded automatically, so an edit never flags itself.
   */
  plans: LeavePlan[];
  /** The plan to modify, or `null` in add mode. */
  planToEdit: LeavePlan | null;
  /** Pre-fills both dates when the entry is anchored to a calendar day. */
  initialDates?: { startDate: string; endDate: string } | null;
}

const nowIso = (): string => new Date().toISOString();

const newPlanId = (): string =>
  `leave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const LeavePlanModal: React.FC<LeavePlanModalProps> = ({
  isOpen,
  onClose,
  onSave,
  employees,
  plans,
  planToEdit,
  initialDates = null,
}) => {
  const titleId = useId();

  const [employeeId, setEmployeeId] = useState(planToEdit?.employeeId ?? '');
  const [startDate, setStartDate] = useState(
    planToEdit?.startDate ?? initialDates?.startDate ?? '',
  );
  const [endDate, setEndDate] = useState(
    planToEdit?.endDate ?? initialDates?.endDate ?? '',
  );
  const [type, setType] = useState<LeaveType>(planToEdit?.type ?? 'CL');
  const [status, setStatus] = useState<LeaveStatus>(planToEdit?.status ?? 'Planned');
  const [halfDay, setHalfDay] = useState<HalfDay>(planToEdit?.halfDay ?? null);
  const [note, setNote] = useState(planToEdit?.note ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const isSingleDay = startDate === endDate && startDate !== '';
  const otherPlans = plans.filter((plan) => plan.id !== planToEdit?.id);

  // Overlaps are derived, not stored: the warning follows the fields as they are
  // edited and never needs to be cleared. Cancelled entries do not block anyone.
  const overlapping = otherPlans.filter((plan) => {
    if (plan.employeeId !== employeeId || plan.status === 'Cancelled') return false;
    return (
      isValidDateKey(plan.startDate) &&
      isValidDateKey(plan.endDate) &&
      isValidDateKey(startDate) &&
      isValidDateKey(endDate) &&
      plan.startDate <= endDate &&
      plan.endDate >= startDate
    );
  });

  const durationLabel = (() => {
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || endDate < startDate) {
      return 'select valid dates';
    }
    if (startDate === endDate && halfDay) return `0.5 day (${halfDay})`;
    const days = countWorkingDays(startDate, endDate);
    return `${days} working ${days === 1 ? 'day' : 'days'}`;
  })();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const problems: string[] = [];
    if (!employeeId) problems.push('Select the employee taking the leave.');
    if (!isValidDateKey(startDate)) problems.push('Enter a valid start date.');
    if (!isValidDateKey(endDate)) problems.push('Enter a valid end date.');
    if (
      isValidDateKey(startDate) &&
      isValidDateKey(endDate) &&
      endDate < startDate
    ) {
      problems.push('End date cannot be before the start date.');
    }
    if (halfDay !== null && startDate !== endDate) {
      problems.push('Half-day applies only to a single-day leave.');
    }
    if (
      employeeId &&
      isValidDateKey(startDate) &&
      isValidDateKey(endDate) &&
      otherPlans.some(
        (plan) =>
          plan.employeeId === employeeId &&
          plan.startDate === startDate &&
          plan.endDate === endDate &&
          plan.type === type &&
          plan.status === status &&
          plan.halfDay === halfDay,
      )
    ) {
      problems.push(
        'An identical leave entry already exists for this employee.',
      );
    }

    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setErrors([]);
    const timestamp = nowIso();
    onSave({
      id: planToEdit?.id ?? newPlanId(),
      employeeId,
      startDate,
      endDate,
      type,
      status,
      halfDay: startDate === endDate ? halfDay : null,
      note: note.trim() ? note.trim() : undefined,
      createdAt: planToEdit?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
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
        {planToEdit ? 'Edit leave entry' : 'Add leave entry'}
      </h2>
      <p className="omni-card-sub">
        {planToEdit
          ? 'Update the dates, type or status of an existing leave entry.'
          : 'Record time away from work. Future and past leave both belong here.'}
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}
      >
        <div className="omni-field">
          <label className="omni-label" htmlFor="leave-employee">
            Employee
          </label>
          <select
            id="leave-employee"
            className="omni-select"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.id})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-start">
              Start date
            </label>
            <input
              id="leave-start"
              type="date"
              className="omni-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-end">
              End date
            </label>
            <input
              id="leave-end"
              type="date"
              className="omni-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-type">
              Leave type
            </label>
            <select
              id="leave-type"
              className="omni-select"
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
            >
              {LEAVE_TYPES.map((leaveType) => (
                <option key={leaveType} value={leaveType}>
                  {leaveType}
                </option>
              ))}
            </select>
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-status">
              Status
            </label>
            <select
              id="leave-status"
              className="omni-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeaveStatus)}
            >
              {LEAVE_STATUSES.map((leaveStatus) => (
                <option key={leaveStatus} value={leaveStatus}>
                  {leaveStatus}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid--form-2">
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-half">
              Half-day
            </label>
            <select
              id="leave-half"
              className="omni-select"
              value={halfDay ?? ''}
              disabled={!isSingleDay}
              onChange={(e) => setHalfDay(e.target.value === '' ? null : (e.target.value as HalfDay))}
            >
              <option value="">Full day</option>
              <option value="AM">AM only</option>
              <option value="PM">PM only</option>
            </select>
            {!isSingleDay && (
              <span className="planner-hint">Half-days apply to a single day only.</span>
            )}
          </div>
          <div className="omni-field">
            <label className="omni-label" htmlFor="leave-note">
              Note
            </label>
            <input
              id="leave-note"
              type="text"
              className="omni-input"
              value={note}
              placeholder="Optional context"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <p className="planner-hint">Working days in this entry: {durationLabel}.</p>

        {overlapping.length > 0 && (
          <p className="alert tone-warning" role="status">
            This entry overlaps{' '}
            {overlapping.length === 1
              ? 'one other leave entry'
              : `${overlapping.length} other leave entries`}{' '}
            for this employee. Overlaps are allowed; review before saving.
          </p>
        )}

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
            {planToEdit ? 'Save changes' : 'Save leave entry'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
