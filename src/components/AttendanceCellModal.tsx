import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  LeaveType,
} from '../types';
import { parseDateKey } from '../utils/leavePlanner';
import { Dialog } from './Dialog';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * The add/edit form behind one cell of the attendance matrix.
 *
 * Like `LeavePlanModal`, the parent mounts this component only while it is open,
 * so the form state is created fresh from `existing` on every open - no
 * stale-value reset effect is needed. `Dialog` owns the scrim, focus lifecycle
 * and Escape.
 *
 * The status is the single source of shape: Leave requires a leave type, a
 * half-day carries an AM/PM part and an optional leave type for the other half,
 * and every other status clears whatever leave fields an earlier record had.
 * Saving always writes `source: 'manual'` - a record last touched by a person
 * through this screen is a manual record, whichever channel brought it in.
 *
 * A deletion is asked, not assumed: the nested `ConfirmDialog` names the entry,
 * and only its confirm button reports `onDeleteRecord` to the parent.
 */

const STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'WFH', 'HalfDay', 'Leave'];

const LEAVE_TYPES: LeaveType[] = [
  'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  Present: 'Present',
  Absent: 'Absent',
  WFH: 'Work from home',
  HalfDay: 'Half day',
  Leave: 'On leave',
};

const SOURCE_LABEL: Record<AttendanceRecord['source'], string> = {
  manual: 'a manual entry',
  excel: 'the monthly matrix import',
  leave: 'the leave planner',
  seed: 'the demo seed',
};

const FULL_DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

export interface AttendanceCellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: AttendanceRecord) => void;
  /** Omitted renders a cell editor that can mark but not clear. */
  onDeleteRecord?: (id: string) => void;
  employee: Employee;
  /** `YYYY-MM-DD` local calendar key of the cell being edited. */
  date: string;
  /** The record already on this cell, or `null` for an unmarked day. */
  existing: AttendanceRecord | null;
  /** `Weekly off (Sunday)` / `Holiday — <name>` on a derived non-working day, else `null`. */
  offDayLabel?: string | null;
}

export const AttendanceCellModal: React.FC<AttendanceCellModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDeleteRecord,
  employee,
  date,
  existing,
  offDayLabel = null,
}) => {
  const titleId = useId();

  const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? 'Present');
  const [leaveType, setLeaveType] = useState<LeaveType>(existing?.leaveType ?? 'CL');
  const [halfDay, setHalfDay] = useState<'AM' | 'PM'>(existing?.halfDay ?? 'AM');
  const [halfLeaveType, setHalfLeaveType] = useState<LeaveType | ''>(
    existing?.leaveType ?? '',
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  // The record awaiting its deletion confirmation. Held whole so the dialog can
  // name exactly what is about to be lost.
  const [pendingDelete, setPendingDelete] = useState(false);

  const isLeave = status === 'Leave';
  const isHalfDay = status === 'HalfDay';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const problems: string[] = [];
    if (isLeave && !leaveType) problems.push('Select the leave type.');

    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setErrors([]);
    const record: AttendanceRecord = {
      id: existing?.id ?? `${employee.id}|${date}`,
      employeeId: employee.id,
      date,
      status,
      // A record last saved from this screen is manual, whatever brought it in.
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
    if (isLeave) {
      record.leaveType = leaveType;
    } else if (isHalfDay) {
      record.halfDay = halfDay;
      if (halfLeaveType) record.leaveType = halfLeaveType;
    }
    if (note.trim()) record.note = note.trim();

    onSave(record);
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
        Attendance — {employee.name}
      </h2>
      <p className="omni-card-sub">
        {FULL_DAY_LABEL.format(parseDateKey(date))}
        {existing ? ` · recorded via ${SOURCE_LABEL[existing.source]}` : ' · unmarked'}
      </p>

      {offDayLabel && (
        <p className="alert tone-info" role="status">
          {offDayLabel}. This day is not counted in the working-day rollup; a mark
          here is kept only as a record of what happened.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}
      >
        <div className="omni-field">
          <label className="omni-label" htmlFor="attendance-status">
            Status
          </label>
          <select
            id="attendance-status"
            className="omni-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        {isLeave && (
          <div className="omni-field">
            <label className="omni-label" htmlFor="attendance-leave-type">
              Leave type
            </label>
            <select
              id="attendance-leave-type"
              className="omni-select"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}

        {isHalfDay && (
          <div className="grid grid--form-2">
            <div className="omni-field">
              <label className="omni-label" htmlFor="attendance-half">
                Part of the day
              </label>
              <select
                id="attendance-half"
                className="omni-select"
                value={halfDay}
                onChange={(e) => setHalfDay(e.target.value === 'PM' ? 'PM' : 'AM')}
              >
                <option value="AM">AM worked</option>
                <option value="PM">PM worked</option>
              </select>
            </div>
            <div className="omni-field">
              <label className="omni-label" htmlFor="attendance-half-leave">
                Leave for the other half
              </label>
              <select
                id="attendance-half-leave"
                className="omni-select"
                value={halfLeaveType}
                onChange={(e) => setHalfLeaveType(e.target.value as LeaveType | '')}
              >
                <option value="">Worked (no leave)</option>
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="omni-field">
          <label className="omni-label" htmlFor="attendance-note">
            Note
          </label>
          <input
            id="attendance-note"
            type="text"
            className="omni-input"
            value={note}
            placeholder="Optional context"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

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
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
            paddingTop: 'var(--space-4)',
          }}
        >
          {existing && onDeleteRecord ? (
            <button type="button" className="btn btn-danger" onClick={() => setPendingDelete(true)}>
              Delete record
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save attendance
            </button>
          </div>
        </div>
      </form>

      {pendingDelete && existing && (
        <ConfirmDialog
          isOpen
          title="Delete this attendance record?"
          message={`This clears the ${FULL_DAY_LABEL.format(parseDateKey(date))} entry for ${employee.name}. The day goes back to unmarked. This cannot be undone.`}
          confirmLabel="Delete record"
          onConfirm={() => {
            onDeleteRecord?.(existing.id);
            setPendingDelete(false);
            onClose();
          }}
          onCancel={() => setPendingDelete(false)}
        />
      )}
    </Dialog>
  );
};
