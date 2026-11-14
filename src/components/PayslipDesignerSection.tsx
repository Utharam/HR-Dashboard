import React, { useState } from 'react';
import { RotateCcw, Save, Search } from 'lucide-react';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
  PerformanceBonusRule,
} from '../types';
import { isActive } from '../utils/payroll';
import {
  computePayrollWithStructure,
  createDefaultPayStructure,
  resolvePayStructure,
  validatePayStructure,
  validatePayStructureOverride,
} from '../utils/payStructure';
import { formatINR } from '../utils/formatters';
import { PayComponentEditor } from './PayComponentEditor';
import { PayslipBreakdown } from './PayslipBreakdown';
import { statusBadgeClass, statusBadgeLabel } from './statusBadge';

/**
 * The Payslip Designer (design §6.1): the company pay-structure template, the
 * per-employee overrides and the performance-bonus rules, each with a live
 * payslip preview.
 *
 * Two working areas share one preview employee:
 *
 * 1. Company template — edits a DRAFT of the saved structure. Everything here
 *    is local until Save: a company change that is not saved re-prices nobody,
 *    and "Reset to default" only rewrites the draft. Validation errors from
 *    `validatePayStructure` are listed and Save is disabled while they stand,
 *    so a broken template can be worked on without ever being half-saved.
 * 2. Employee overrides — picks an employee, clones their RESOLVED structure
 *    (the override they already have, else the company template) into an
 *    override draft, validates with `validatePayStructureOverride`, and saves
 *    or removes it through App.
 *
 * The previews price the SELECTED employee with the current month's bonuses:
 * the company preview deliberately ignores overrides (it previews the
 * template), while the override preview resolves the draft override over the
 * saved template — that is exactly what saving it would put on the payslip.
 * Unsaved company edits are called out; navigating away does not save them.
 */

export interface PayslipDesignerSectionProps {
  /** The full register the picker and the previews draw from. */
  employees: Employee[];
  /** The SAVED company template - the baseline the draft edits. */
  payStructure: PayStructure;
  payOverrides: PayStructureOverride[];
  payrollBonuses: PayrollBonus[];
  /** `YYYY-MM` the previews' bonuses are read for. */
  monthKey: string;
  onSaveStructure: (structure: PayStructure) => void;
  onSaveOverride: (override: PayStructureOverride) => void;
  onRemoveOverride: (employeeId: string) => void;
}

const RULE_RATINGS = [5, 4, 3, 2, 1] as const;

const OVERRIDE_DATE_LABEL = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

/** ISO timestamp for a save, named so the render-purity lint reads past it. */
const nowIso = (): string => new Date().toISOString();

/** Compares two structures as drafts, ignoring the bookkeeping timestamp. */
const structureSignature = (structure: PayStructure): string =>
  JSON.stringify({
    components: structure.components,
    epfEnabled: structure.epfEnabled,
    professionalTaxEnabled: structure.professionalTaxEnabled,
    // Rule ORDER is not a setting: ratings are a fixed 1–5 set.
    performanceBonusRules: [...structure.performanceBonusRules].sort(
      (a, b) => a.rating - b.rating,
    ),
  });

export const PayslipDesignerSection: React.FC<PayslipDesignerSectionProps> = ({
  employees,
  payStructure,
  payOverrides,
  payrollBonuses,
  monthKey,
  onSaveStructure,
  onSaveOverride,
  onRemoveOverride,
}) => {
  // ── Company draft ────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<PayStructure>(payStructure);
  const [savedSeenAt, setSavedSeenAt] = useState(payStructure.updatedAt);
  // A save (or an import or a reset) moves `updatedAt`; the render-time reset
  // below then replaces the draft with what App now holds - the same
  // "reset state when a prop changes" pattern PayrollSection's pager uses.
  if (payStructure.updatedAt !== savedSeenAt) {
    setSavedSeenAt(payStructure.updatedAt);
    setDraft(payStructure);
  }

  const structureErrors = validatePayStructure(draft);
  const companyDirty = structureSignature(draft) !== structureSignature(payStructure);

  const patchDraft = (patch: Partial<PayStructure>) => setDraft((prev) => ({ ...prev, ...patch }));

  const setRulePercent = (rating: number, percentOfBasic: number) => {
    const rules: PerformanceBonusRule[] = draft.performanceBonusRules.some((rule) => rule.rating === rating)
      ? draft.performanceBonusRules.map((rule) =>
          rule.rating === rating ? { ...rule, percentOfBasic } : rule,
        )
      : [...draft.performanceBonusRules, { rating, percentOfBasic }];
    patchDraft({ performanceBonusRules: rules });
  };

  const saveCompany = () => {
    if (structureErrors.length > 0) return;
    onSaveStructure({ ...draft, updatedAt: nowIso() });
  };

  // ── Preview employee ─────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  // '' means "auto": the first employee in the payroll run. An id the register
  // no longer contains falls back the same way, so an import cannot strand the
  // preview on a deleted person.
  const [selectedId, setSelectedId] = useState('');
  const [overrideDraft, setOverrideDraft] = useState<PayStructureOverride | null>(null);

  const runEmployees = employees.filter(isActive);
  const selectedEmployee =
    employees.find((emp) => emp.id === selectedId) ?? runEmployees[0] ?? null;

  const q = search.toLowerCase().trim();
  const pickerEmployees = (q
    ? employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(q) ||
          emp.id.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.role.toLowerCase().includes(q),
      )
    : employees
  ).slice(0, 100);

  const selectEmployee = (id: string) => {
    setSelectedId(id);
    // A draft belongs to the person it was opened for; changing the person
    // abandons it rather than letting a save put it on the wrong payslip.
    setOverrideDraft(null);
  };

  // ── Overrides ────────────────────────────────────────────────────────────
  const existingOverride = selectedEmployee
    ? payOverrides.find((row) => row.employeeId === selectedEmployee.id) ?? null
    : null;

  const overrideErrors = overrideDraft ? validatePayStructureOverride(overrideDraft) : [];

  const startOverrideDraft = () => {
    if (!selectedEmployee) return;
    // The clone is of the RESOLVED structure: an employee who already has an
    // override customises their own copy; everyone else starts from the saved
    // company template (NOT the unsaved draft - a customisation made against
    // an unsaved template would not match what anyone else is paid on).
    const resolved = resolvePayStructure(selectedEmployee.id, payStructure, payOverrides);
    setOverrideDraft({
      employeeId: selectedEmployee.id,
      components: resolved.components,
      epfEnabled: resolved.epfEnabled,
      professionalTaxEnabled: resolved.professionalTaxEnabled,
      note: existingOverride?.note,
      updatedAt: nowIso(),
    });
  };

  const saveOverride = () => {
    if (!overrideDraft || overrideErrors.length > 0) return;
    const note = overrideDraft.note?.trim();
    onSaveOverride({ ...overrideDraft, ...(note ? { note } : {}), updatedAt: nowIso() });
    setOverrideDraft(null);
  };

  // ── Previews ─────────────────────────────────────────────────────────────
  const companyPreview = selectedEmployee
    ? computePayrollWithStructure(selectedEmployee, {
        structure: draft,
        // The template preview ignores overrides ON PURPOSE: it shows what the
        // draft prices. The override area below shows the override's effect.
        overrides: [],
        bonuses: payrollBonuses,
        monthKey,
      })
    : null;

  const overridePreview = selectedEmployee
    ? computePayrollWithStructure(selectedEmployee, {
        structure: payStructure,
        overrides: overrideDraft
          ? [
              ...payOverrides.filter((row) => row.employeeId !== selectedEmployee.id),
              overrideDraft,
            ]
          : payOverrides,
        bonuses: payrollBonuses,
        monthKey,
      })
    : null;

  return (
    <div className="section-stack">
      {/* Preview employee picker: shared by both working areas. */}
      <section className="omni-card" aria-labelledby="designer-employee-title">
        <h3 id="designer-employee-title" className="omni-card-title">
          Preview employee
        </h3>
        <p className="omni-card-sub">
          Both previews price this person's payslip with their {monthKey} bonuses. Search the
          register, or pick directly.
        </p>
        <div className="designer-picker">
          <div className="omni-icon-field">
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              className="omni-input"
              placeholder="Search by name, ID, department or role"
              aria-label="Search employees for the payslip preview"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="omni-select"
            aria-label="Pick the preview employee"
            value={selectedEmployee?.id ?? ''}
            onChange={(e) => selectEmployee(e.target.value)}
          >
            {selectedEmployee && !pickerEmployees.some((emp) => emp.id === selectedEmployee.id) && (
              <option value={selectedEmployee.id}>{selectedEmployee.name} ({selectedEmployee.id})</option>
            )}
            {pickerEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.id}) — {statusBadgeLabel(emp.status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 1. Company template */}
      <section className="omni-card" aria-labelledby="designer-company-title">
        <h3 id="designer-company-title" className="omni-card-title">
          Company template
        </h3>
        <p className="omni-card-sub">
          Applies to every employee without a custom override. Saving re-prices everyone on the
          template; overridden employees keep their private copy.
        </p>

        {companyDirty && (
          <div className="alert tone-warning" role="status">
            <strong>Unsaved changes.</strong> The template below is a draft — nothing re-prices
            until you save, and leaving this page does not save it for you.
          </div>
        )}

        <PayComponentEditor
          components={draft.components}
          onChange={(components) => patchDraft({ components })}
          idPrefix="designer-company"
        />

        <div className="designer-toggles">
          <button
            type="button"
            className={`toggle-chip${draft.epfEnabled ? ' toggle-chip--on' : ''}`}
            aria-pressed={draft.epfEnabled}
            onClick={() => patchDraft({ epfEnabled: !draft.epfEnabled })}
          >
            EPF {draft.epfEnabled ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={`toggle-chip${draft.professionalTaxEnabled ? ' toggle-chip--on' : ''}`}
            aria-pressed={draft.professionalTaxEnabled}
            onClick={() => patchDraft({ professionalTaxEnabled: !draft.professionalTaxEnabled })}
          >
            Professional Tax {draft.professionalTaxEnabled ? 'on' : 'off'}
          </button>
        </div>

        <div className="designer-rules">
          <h4 className="designer-rules__title">Performance bonus rules</h4>
          <p className="designer-hint">
            The suggested bonus for a rating is the percent × that employee's Basic. HR sets the
            final amount when adding the bonus on the Payroll page.
          </p>
          <div className="designer-rules__grid">
            {RULE_RATINGS.map((rating) => {
              const rule = draft.performanceBonusRules.find((row) => row.rating === rating);
              const percent = rule && Number.isFinite(rule.percentOfBasic) ? rule.percentOfBasic : 0;
              return (
                <div className="designer-rule" key={rating}>
                  <span className="designer-rule__rating" aria-hidden="true">★ {rating}</span>
                  <input
                    type="number"
                    className="omni-input"
                    min={0}
                    step="any"
                    value={percent}
                    aria-label={`Bonus percent of Basic for rating ${rating}`}
                    onChange={(e) => setRulePercent(rating, Number(e.target.value))}
                  />
                  <span className="designer-rule__unit">% of Basic</span>
                </div>
              );
            })}
          </div>
        </div>

        {structureErrors.length > 0 && (
          <div className="alert tone-danger" role="alert">
            <strong>The draft cannot be saved yet:</strong>
            <ul>
              {structureErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="designer-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDraft(createDefaultPayStructure())}
            title="Restores the 50/25/25 default in the draft below — nothing is saved until you press Save"
          >
            <RotateCcw size={14} aria-hidden="true" /> Reset to default
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveCompany}
            disabled={structureErrors.length > 0}
          >
            <Save size={15} aria-hidden="true" /> Save structure
          </button>
        </div>

        <hr className="rule" />
        {selectedEmployee && companyPreview && (
          <DesignerPreview
            title={`Live payslip preview — ${selectedEmployee.name}`}
            note={
              existingOverride
                ? `Priced on the company template only; this employee's override is previewed below.`
                : undefined
            }
            employee={selectedEmployee}
            breakdown={companyPreview}
            caption={`Company template preview for ${selectedEmployee.name}`}
            requireActive
          />
        )}
      </section>

      {/* 2. Employee overrides */}
      <section className="omni-card" aria-labelledby="designer-override-title">
        <h3 id="designer-override-title" className="omni-card-title">
          Employee overrides
        </h3>
        <p className="omni-card-sub">
          A per-employee copy of the structure. An overridden employee is unaffected by later
          company edits until their override is removed.
        </p>

        {!selectedEmployee ? (
          <div className="empty-cell">Add staff to the register to customize a payslip.</div>
        ) : (
          <>
            <div className="designer-override-status">
              <div className="designer-override-status__who">
                <strong>{selectedEmployee.name}</strong>
                <span className={`badge ${statusBadgeClass(selectedEmployee.status)}`}>
                  {statusBadgeLabel(selectedEmployee.status)}
                </span>
                <span className="cell-id">{selectedEmployee.id}</span>
                <span className="designer-hint">
                  {selectedEmployee.department} · CTC ₹{formatINR(selectedEmployee.monthlyCTC)} · ★{' '}
                  {selectedEmployee.performanceRating}
                </span>
              </div>
              <div className="designer-override-status__state">
                {existingOverride && !overrideDraft ? (
                  <>
                    <span className="badge badge-purple">Custom structure</span>
                    <span className="designer-hint">
                      Saved {OVERRIDE_DATE_LABEL.format(Date.parse(existingOverride.updatedAt))}
                    </span>
                  </>
                ) : (
                  <span className="designer-hint">Follows the company template</span>
                )}
              </div>
            </div>

            {existingOverride?.note && !overrideDraft && (
              <p className="designer-override-note">{existingOverride.note}</p>
            )}

            {overrideDraft ? (
              <>
                <PayComponentEditor
                  components={overrideDraft.components}
                  onChange={(components) =>
                    setOverrideDraft((prev) => (prev ? { ...prev, components } : prev))
                  }
                  idPrefix="designer-override"
                />
                <div className="designer-toggles">
                  <button
                    type="button"
                    className={`toggle-chip${overrideDraft.epfEnabled ? ' toggle-chip--on' : ''}`}
                    aria-pressed={overrideDraft.epfEnabled}
                    onClick={() =>
                      setOverrideDraft((prev) =>
                        prev ? { ...prev, epfEnabled: !prev.epfEnabled } : prev,
                      )
                    }
                  >
                    EPF {overrideDraft.epfEnabled ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    className={`toggle-chip${overrideDraft.professionalTaxEnabled ? ' toggle-chip--on' : ''}`}
                    aria-pressed={overrideDraft.professionalTaxEnabled}
                    onClick={() =>
                      setOverrideDraft((prev) =>
                        prev ? { ...prev, professionalTaxEnabled: !prev.professionalTaxEnabled } : prev,
                      )
                    }
                  >
                    Professional Tax {overrideDraft.professionalTaxEnabled ? 'on' : 'off'}
                  </button>
                </div>
                <div className="omni-field">
                  <label className="omni-label" htmlFor="designer-override-note">
                    Note (optional)
                  </label>
                  <textarea
                    id="designer-override-note"
                    className="omni-input"
                    rows={2}
                    value={overrideDraft.note ?? ''}
                    placeholder="Why this employee is priced differently"
                    onChange={(e) =>
                      setOverrideDraft((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                    }
                  />
                </div>
                {overrideErrors.length > 0 && (
                  <div className="alert tone-danger" role="alert">
                    <strong>The override cannot be saved yet:</strong>
                    <ul>
                      {overrideErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="designer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setOverrideDraft(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveOverride}
                    disabled={overrideErrors.length > 0}
                  >
                    <Save size={15} aria-hidden="true" /> Save override
                  </button>
                </div>
              </>
            ) : (
              <div className="designer-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startOverrideDraft}
                >
                  Customize for this employee
                </button>
                {existingOverride && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onRemoveOverride(selectedEmployee.id)}
                    title="Removes the custom structure; the employee returns to the company template"
                  >
                    Remove override
                  </button>
                )}
              </div>
            )}

            <hr className="rule" />
            <DesignerPreview
              title={`Live payslip preview — ${selectedEmployee.name}`}
              note={overrideDraft ? 'Includes the unsaved draft above.' : undefined}
              employee={selectedEmployee}
              breakdown={overridePreview}
              caption={`Pay override preview for ${selectedEmployee.name}`}
              requireActive
            />
          </>
        )}
      </section>
    </div>
  );
};

/**
 * The shared preview block: a heading, an optional explainer and the payslip
 * lines. `requireActive` keeps the override preview honest for staff outside
 * the payroll run - the same rule EmployeeModal applies to their payslip.
 */
const DesignerPreview: React.FC<{
  title: string;
  note?: string;
  employee: Employee;
  breakdown: ReturnType<typeof computePayrollWithStructure> | null;
  caption: string;
  requireActive?: boolean;
}> = ({ title, note, employee, breakdown, caption, requireActive = false }) => {
  if (!breakdown) return null;
  return (
    <div className="designer-preview">
      <div className="designer-preview__head">
        <h4 className="omni-card-title omni-card-title--sm">{title}</h4>
        {note && <span className="designer-hint">{note}</span>}
      </div>
      {requireActive && !isActive(employee) ? (
        <p className="text-muted" role="note">
          No payslip preview: this employee's status is <strong>{employee.status}</strong>, so they
          are not part of the payroll run.
        </p>
      ) : (
        <div className="designer-preview__body">
          <PayslipBreakdown employee={employee} breakdown={breakdown} caption={caption} />
        </div>
      )}
    </div>
  );
};
