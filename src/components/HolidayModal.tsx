import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import type { Holiday } from '../types';
import { isValidDateKey } from '../utils/leavePlanner';
import { Dialog } from './Dialog';

/**
 * The add/edit form behind the Attendance holiday card.
 *
 * One date can carry only one company-wide holiday: a second entry on the same
 * day would silently double the exclusion in every working-day count, the
 * matrix and the rollup, so the duplicate is refused with the existing holiday
 * named. The holiday being edited is excluded from its own check.
 *
 * The id is `holiday-${date}` for a NEW holiday and the original id when
 * editing - an id that followed a re-dated holiday would orphan the stored row
 * it was replacing, so stability wins over the pretty key.
 */

export interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (holiday: Holiday) => void;
  /** Every known holiday, for the one-date-one-holiday rule. */
  holidays: Holiday[];
  /** The holiday to modify, or `null` in add mode. */
  holidayToEdit: Holiday | null;
}

export const HolidayModal: React.FC<HolidayModalProps> = ({
  isOpen,
  onClose,
  onSave,
  holidays,
  holidayToEdit,
}) => {
  const titleId = useId();

  const [date, setDate] = useState(holidayToEdit?.date ?? '');
  const [name, setName] = useState(holidayToEdit?.name ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const problems: string[] = [];
    if (!isValidDateKey(date)) problems.push('Enter the holiday date.');
    const trimmedName = name.trim();
    if (!trimmedName) problems.push('Give the holiday a name.');
    if (
      isValidDateKey(date) &&
      holidays.some((holiday) => holiday.date === date && holiday.id !== holidayToEdit?.id)
    ) {
      const taken = holidays.find((holiday) => holiday.date === date);
      problems.push(
        `${date} already carries the holiday "${taken?.name ?? 'Unknown'}". One date, one holiday.`,
      );
    }

    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setErrors([]);
    onSave({
      id: holidayToEdit?.id ?? `holiday-${date}`,
      date,
      name: trimmedName,
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
        {holidayToEdit ? 'Edit holiday' : 'Add holiday'}
      </h2>
      <p className="omni-card-sub">
        Company-wide holidays are excluded from working days in the matrix, the
        rollup and payroll.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}
      >
        <div className="omni-field">
          <label className="omni-label" htmlFor="holiday-date">
            Date
          </label>
          <input
            id="holiday-date"
            type="date"
            className="omni-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="omni-field">
          <label className="omni-label" htmlFor="holiday-name">
            Name
          </label>
          <input
            id="holiday-name"
            type="text"
            className="omni-input"
            value={name}
            placeholder="e.g. Founders' Day"
            onChange={(e) => setName(e.target.value)}
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
            {holidayToEdit ? 'Save changes' : 'Save holiday'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
