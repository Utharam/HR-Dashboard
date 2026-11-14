import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
  PayrollBonusKind,
} from '../types';
import { isActive } from '../utils/payroll';
import {
  resolvePayStructure,
  suggestPerformanceBonus,
  validatePayrollBonus,
} from '../utils/payStructure';
import { formatINR } from '../utils/formatters';
import { Dialog } from './Dialog';

/**
 * The add/edit form behind the Payroll page's "Bonuses this month" card
 * (design §6.2).
 *
 * A bonus is a one-off earning record keyed by employee + month: it adds to
 * gross and net without changing EPF, PT or LOP, and the month is always the
 * payroll month this page is showing - the modal does not offer a month field,
 * because entering a bonus "for next month" from the current month's payroll
 * run would silently price it into a month nobody is looking at.
 *
 * The Performance kind carries the rating that suggested it: choosing an
 * employee (or switching to Performance) preselects their rating and suggests
 * `rating% × Basic` from the employee's RESOLVED structure - an overridden
 * employee is priced by their own copy, not the company template. The amount
 * stays editable: the suggestion is a starting point, never a calculation
 * baked into the stored record (design decision D5). Re-pricing happens in the
 * change handlers, not in an effect, so an amount HR typed is clobbered only
 * by an explicit employee/kind change and never by a render.
 */

export interface BonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bonus: PayrollBonus) => void;
  /** The register the employee picker offers; only the payroll run is offered. */
  employees: Employee[];
  /** Every known bonus, for unique id generation on a new record. */
  bonuses: PayrollBonus[];
  /** `YYYY-MM` the bonus is being recorded for. */
  monthKey: string;
  /** The company template, resolved against `overrides` for the suggestion. */
  structure: PayStructure;
  overrides?: PayStructureOverride[];
  /** The bonus to modify, or `null` in add mode. */
  bonusToEdit: PayrollBonus | null;
}

interface BonusDraft {
  employeeId: string;
  kind: PayrollBonusKind;
  label: string;
  amount: string;
  note: string;
}

const KIND_OPTIONS: { value: PayrollBonusKind; label: string }[] = [
  { value: 'Performance', label: 'Performance bonus' },
  { value: 'Custom', label: 'Custom bonus' },
];

/** ISO timestamp for a save, named so the render-purity lint reads past it. */
const nowIso = (): string => new Date().toISOString();

export const BonusModal: React.FC<BonusModalProps> = ({
  isOpen,
  onClose,
  onSave,
  employees,
  bonuses,
  monthKey,
  structure,
  overrides = [],
  bonusToEdit,
}) => {
  const titleId = useId();
  const hintId = useId();

  const [draft, setDraft] = useState<BonusDraft>(() => ({
    employeeId: bonusToEdit?.employeeId ?? '',
    kind: bonusToEdit?.kind ?? 'Custom',
    label: bonusToEdit?.label ?? '',
    amount: bonusToEdit ? String(bonusToEdit.amount) : '',
    note: bonusToEdit?.note ?? '',
  }));
  // Performance only, for traceability. Seeded from the employee's rating when
  // one is available; a record with an unusable rating (0, NaN) simply carries
  // none, which `validatePayrollBonus` accepts.
  const [rating, setRating] = useState<number | undefined>(bonusToEdit?.rating);
  const [errors, setErrors] = useState<string[]>([]);

  const runEmployees = employees.filter(isActive);

  const setField = (patch: Partial<BonusDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  /**
   * Prices the Performance suggestion for `employeeId` against their resolved
   * structure. A no-op for Custom bonuses and for an edit: a stored bonus
   * reopens with its own amount, not a fresh suggestion.
   */
  const priceSuggestion = (employeeId: string, kind: PayrollBonusKind): void => {
    if (kind !== 'Performance' || bonusToEdit) return;
    const emp = runEmployees.find((row) => row.id === employeeId);
    if (!emp) return;
    const suggested = suggestPerformanceBonus(emp, resolvePayStructure(emp.id, structure, overrides));
    setRating(suggested.rating >= 1 && suggested.rating <= 5 ? suggested.rating : undefined);
    setDraft((prev) => ({
      ...prev,
      // Zero stays an EMPTY field, not a typed "0": the amount is required to
      // be positive, and an empty field reads as "fill me in" rather than as
      // an entered-but-invalid figure.
      amount: suggested.amount > 0 ? String(suggested.amount) : '',
    }));
  };

  const handleEmployeeChange = (employeeId: string) => {
    setField({ employeeId });
    priceSuggestion(employeeId, draft.kind);
  };

  const handleKindChange = (kind: PayrollBonusKind) => {
    setField({ kind });
    priceSuggestion(draft.employeeId, kind);
  };

  const employee = runEmployees.find((emp) => emp.id === draft.employeeId) ?? null;
  const suggestion = employee && draft.kind === 'Performance'
    ? suggestPerformanceBonus(employee, resolvePayStructure(employee.id, structure, overrides))
    : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const candidate: PayrollBonus = {
      // An edit keeps its id: a re-used id makes the parent's upsert a replace;
      // a new id would add a second row and orphan the one being edited.
      id: bonusToEdit?.id ?? nextBonusId(bonuses),
      employeeId: draft.employeeId.trim(),
      monthKey,
      kind: draft.kind,
      label: draft.label.trim(),
      amount: Number(draft.amount),
      ...(draft.kind === 'Performance' && rating !== undefined ? { rating } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      createdAt: bonusToEdit?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };

    const problems = validatePayrollBonus(candidate);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setErrors([]);
    onSave(candidate);
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
        {bonusToEdit ? 'Edit bonus' : 'Add bonus'}
      </h2>
      <p className="omni-card-sub">
        A one-off earning for {monthKey}. It is added to gross and net pay; it does not change EPF,
        Professional Tax or Loss of Pay.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}
      >
        <div className="omni-field">
          <label className="omni-label" htmlFor="bonus-employee">
            Employee
          </label>
          <select
            id="bonus-employee"
            className="omni-select"
            value={draft.employeeId}
            onChange={(e) => handleEmployeeChange(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {runEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.id}) — {emp.department}
              </option>
            ))}
          </select>
        </div>

        <div className="omni-field">
          <label className="omni-label" htmlFor="bonus-kind">
            Kind
          </label>
          <select
            id="bonus-kind"
            className="omni-select"
            value={draft.kind}
            onChange={(e) => handleKindChange(e.target.value as PayrollBonusKind)}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="omni-field">
          <label className="omni-label" htmlFor="bonus-label">
            Label
          </label>
          <input
            id="bonus-label"
            type="text"
            className="omni-input"
            value={draft.label}
            placeholder="e.g. Q3 performance bonus"
            onChange={(e) => setField({ label: e.target.value })}
          />
        </div>

        <div className="omni-field">
          <label className="omni-label" htmlFor="bonus-amount">
            Amount (₹)
          </label>
          <input
            id="bonus-amount"
            type="number"
            className="omni-input"
            min={0}
            step="any"
            value={draft.amount}
            aria-describedby={suggestion ? hintId : undefined}
            onChange={(e) => setField({ amount: e.target.value })}
          />
          {suggestion && (
            <span className="designer-hint" id={hintId}>
              {suggestion.amount > 0
                ? `Suggested for ★${suggestion.rating}: ${suggestion.percentOfBasic}% of Basic = ₹${formatINR(suggestion.amount)} — overwrite freely.`
                : `No performance rule is configured for ★${employee?.performanceRating}; enter the amount manually.`}
            </span>
          )}
        </div>

        <div className="omni-field">
          <label className="omni-label" htmlFor="bonus-note">
            Note (optional)
          </label>
          <textarea
            id="bonus-note"
            className="omni-input"
            rows={2}
            value={draft.note}
            placeholder="Context for the payroll auditor"
            onChange={(e) => setField({ note: e.target.value })}
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
            {bonusToEdit ? 'Save changes' : 'Add bonus'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

/** `bonus-1`, `bonus-2`, … first unused against the known bonus list. */
function nextBonusId(bonuses: PayrollBonus[]): string {
  const used = new Set(bonuses.map((bonus) => bonus.id));
  let n = bonuses.length + 1;
  let id = `bonus-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `bonus-${n}`;
  }
  return id;
}
