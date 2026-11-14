import React, { useState } from 'react';
import { FileText, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../types';
import { formatINR, formatCrores } from '../utils/formatters';
import { computePayrollWithStructure, createDefaultPayStructure } from '../utils/payStructure';
import { toISODate } from '../utils/dates';
import { isActive } from '../utils/payroll';
import { statusBadgeClass, statusBadgeLabel } from './statusBadge';
import { clampPage, describeTable, pageRangeLabel, scrollRegionLabel, totalPagesFor } from '../utils/pagination';
import { BonusModal } from './BonusModal';

const PAGE_SIZE = 25;
const TABLE_TITLE = 'Compensation structure and take-home salary breakdown';

/**
 * The Payroll register (design §6.2), priced by `computePayrollWithStructure`.
 *
 * Every figure on the page - each row and each KPI - comes from the same
 * structure-aware calculation the payslip, the payroll export and the finance
 * report use, so a company template edit or a per-employee override is visible
 * here the moment it is saved. The columns are structure-agnostic: Basic, HRA
 * and Special Allowance were hard-coded columns of the fixed 50/25/25 split,
 * and a custom structure does not have those lines - Gross Earnings carries the
 * sum the structure produced, with the bonus total (this month's one-off
 * earnings) beside it.
 *
 * The structure/overrides/bonuses props are optional so callers (and the tests
 * that pin this section's shape) that predate Phase B still render truthfully:
 * absent means the default company template and no bonuses, which is exactly
 * what a fresh v4 store reports. The bonus handlers are optional the same way -
 * the card lists what it is given and only offers Add/Edit/Delete when the
 * caller can persist the change (the AdminSection onSignOut precedent).
 */

interface PayrollSectionProps {
  employees: Employee[];
  /** The company pay-structure template. Absent = the default structure. */
  structure?: PayStructure;
  /** Per-employee overrides. Absent = none. */
  overrides?: PayStructureOverride[];
  /** Monthly bonuses. Absent = none. */
  bonuses?: PayrollBonus[];
  /** `YYYY-MM` the bonuses are scoped to. Absent = the current month. */
  monthKey?: string;
  /**
   * The register the bonus picker offers. Defaults to `employees`; App passes
   * the full payroll roster so a header filter cannot hide an employee from the
   * bonus form while the card still lists their bonus.
   */
  bonusEmployees?: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onSaveBonus?: (bonus: PayrollBonus) => void;
  onDeleteBonus?: (id: string) => void;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

const describeMonth = (monthKey: string): string => {
  // Parse the parts locally. `Date.parse('2026-11-01')` is UTC midnight, which
  // renders as October in any timezone west of Greenwich.
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return MONTH_LABEL.format(new Date(year, month - 1, 1));
};

type BonusModalState = { mode: 'add' } | { mode: 'edit'; bonus: PayrollBonus } | null;

export const PayrollSection: React.FC<PayrollSectionProps> = ({
  employees,
  bonusEmployees,
  structure,
  overrides = [],
  bonuses = [],
  monthKey,
  onSelectEmployee,
  onSaveBonus,
  onDeleteBonus,
}) => {
  // The month a caller does not name is the current one, captured once per
  // mount like App's own clock (AttendanceSection's `today`), so the page's
  // figures cannot drift because a render straddled midnight.
  const [fallbackMonthKey] = useState(() => toISODate(new Date()).slice(0, 7));
  const effectiveMonthKey = monthKey ?? fallbackMonthKey;
  const pageSize = PAGE_SIZE;

  // Payroll run figures come from employees.filter(isActive) — resigned staff are
  // not paid, and neither is an `Unknown` status: an unresolved import is not
  // evidence that the person is on the roster, so they must not be charged PF,
  // professional tax or appear in the aggregates until the status is resolved.
  const activeRoster = employees.filter(isActive);
  const payroll = activeRoster.map((emp) =>
    computePayrollWithStructure(emp, { structure: structure ?? createDefaultPayStructure(), overrides, bonuses, monthKey: effectiveMonthKey }),
  );

  const totalMonthlyGross = payroll.reduce((acc, p) => acc + p.gross, 0);
  // Gross Earnings INCLUDES the month's bonuses: it is the sum the payslips
  // actually earn. The Bonus column then shows how much of it is one-off.
  const totalGrossEarnings = payroll.reduce((acc, p) => acc + p.gross + p.bonusTotal, 0);
  const totalBonus = payroll.reduce((acc, p) => acc + p.bonusTotal, 0);
  const totalEPF = payroll.reduce((acc, p) => acc + p.epf, 0);
  // Read the per-row figures rather than `activeRoster.length * PROFESSIONAL_TAX` and the
  // gross-minus-deductions formula: the calculation floors a net at zero, so a run that
  // contains a zero-CTC row must sum what the table's Net column prints, not a parallel
  // formula that would disagree with it.
  const totalPT = payroll.reduce((acc, p) => acc + p.professionalTax, 0);
  const totalNetDisbursable = payroll.reduce((acc, p) => acc + p.netPayable, 0);

  // The page control follows the data: reset to page 1 when the roster changes size, and
  // re-derive the page on every render so a page one render behind the data cannot slice
  // an empty table. Done during render rather than in an effect - see DirectorySection for
  // why. utils/pagination owns the arithmetic, so this section cannot drift from the
  // Directory and Attendance registers.
  const [pageState, setPageState] = useState({ size: employees.length, page: 1 });
  if (pageState.size !== employees.length) {
    setPageState({ size: employees.length, page: 1 });
  }

  const totalPages = totalPagesFor(employees.length, pageSize);
  const page = clampPage(pageState.page, totalPages);
  const currentItems = employees.slice((page - 1) * pageSize, page * pageSize);

  // ── Bonuses this month ──────────────────────────────────────────────────
  const monthBonuses = bonuses.filter((bonus) => bonus.monthKey === effectiveMonthKey);
  const [bonusModal, setBonusModal] = useState<BonusModalState>(null);
  // Bumped on every open so the BonusModal REMOUNTS: its form state is
  // initialised from `bonusToEdit` at mount, and a form that survived a
  // close/open cycle would reopen holding the previous session's values -
  // "Add" showing the last bonus you edited, or your half-cleared draft.
  const [bonusModalTick, setBonusModalTick] = useState(0);
  const openBonusModal = (state: BonusModalState) => {
    setBonusModal(state);
    setBonusModalTick((tick) => tick + 1);
  };
  const bonusPersists = onSaveBonus !== undefined || onDeleteBonus !== undefined;
  const employeeName = (id: string): string =>
    employees.find((emp) => emp.id === id)?.name ?? id;

  return (
    <div className="section-stack">
      {/* 4 Summary Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Monthly CTC</span>
          <div className="kpi-value">{formatCrores(totalMonthlyGross)}</div>
          <span className="kpi-sub">Across {activeRoster.length} active roster</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Earnings</span>
          <div className="kpi-value text-primary">{formatCrores(totalGrossEarnings)}</div>
          <span className="kpi-sub">
            Gross ₹{formatINR(totalMonthlyGross)} plus ₹{formatINR(totalBonus)} in bonuses
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Statutory EPF & PT</span>
          <div className="kpi-value text-danger">₹{formatINR(totalEPF + totalPT)}</div>
          <span className="kpi-sub">EPF: ₹{formatINR(totalEPF)} • PT: ₹{formatINR(totalPT)}</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Disbursable Net Payroll</span>
          <div className="kpi-value text-success">{formatCrores(totalNetDisbursable)}</div>
          <span className="kpi-sub">Direct Bank Transfer Advice</span>
        </div>
      </div>

      {/* Bonuses this month */}
      <section className="omni-card" aria-labelledby="payroll-bonus-title">
        <div className="omni-card-header" style={{ padding: 0, border: 'none' }}>
          <div>
            <h3 id="payroll-bonus-title" className="omni-card-title">
              Bonuses this month
            </h3>
            <p className="omni-card-sub">
              Performance and custom one-off earnings for {describeMonth(effectiveMonthKey)}. They add to
              gross and net pay; they do not change EPF, Professional Tax or LOP.
            </p>
          </div>
          {onSaveBonus && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openBonusModal({ mode: 'add' })}
            >
              <Plus size={14} aria-hidden="true" /> Add bonus
            </button>
          )}
        </div>

        {monthBonuses.length === 0 ? (
          <p className="designer-hint" style={{ padding: '0' }}>
            No bonuses recorded for this month yet.
          </p>
        ) : (
          <ul className="bonus-list">
            {monthBonuses.map((bonus) => (
              <li key={bonus.id} className="bonus-row">
                <div className="bonus-row__who">
                  <span className="bonus-row__name">{employeeName(bonus.employeeId)}</span>
                  <span className={`badge ${bonus.kind === 'Performance' ? 'badge-primary' : 'badge-purple'}`}>
                    {bonus.kind}
                  </span>
                  <span className="bonus-row__label">{bonus.label}</span>
                </div>
                <div className="bonus-row__side">
                  <span className="bonus-row__amount">+₹{formatINR(bonus.amount)}</span>
                  {bonusPersists && (
                    <span className="bonus-row__actions">
                      {onSaveBonus && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Edit ${bonus.label} for ${employeeName(bonus.employeeId)}`}
                          onClick={() => openBonusModal({ mode: 'edit', bonus })}
                        >
                          <Pencil size={13} aria-hidden="true" /> Edit
                        </button>
                      )}
                      {onDeleteBonus && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Delete ${bonus.label} for ${employeeName(bonus.employeeId)}`}
                          onClick={() => onDeleteBonus(bonus.id)}
                        >
                          <Trash2 size={13} aria-hidden="true" /> Delete
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Compensation Structure & Take-Home Salary Breakdown</h3>
            <p className="omni-card-sub">
              Priced by the company pay structure (or the employee's override) with this month's
              bonuses; EPF, Professional Tax and LOP deducted.
            </p>
          </div>
          <span className="pagination__count">
            {pageRangeLabel(page, pageSize, employees.length)}
          </span>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label={scrollRegionLabel(TABLE_TITLE)}
          tabIndex={0}
        >
          <table className="omni-table">
            <caption className="sr-only">
              {describeTable(TABLE_TITLE, currentItems.length, employees.length, page, totalPages)}
            </caption>
            <thead>
              <tr>
                {/* `col-optional`: an identifier and a flat tax line are the two columns a
                    reader can most afford to lose when the register has to fit a laptop.
                    Both the heading and its cells carry it - a `<th>` left behind with no
                    `<td>` under it is a header for nothing. */}
                <th scope="col" className="col-optional">Emp ID</th>
                <th scope="col">Employee</th>
                <th scope="col">Department</th>
                <th scope="col">Status</th>
                <th scope="col">Monthly CTC</th>
                <th scope="col">Total Earnings</th>
                <th scope="col">Bonus (incl.)</th>
                <th scope="col">EPF (12%)</th>
                <th scope="col" className="col-optional">PT</th>
                <th scope="col">LOP</th>
                <th scope="col">Net Disbursable</th>
                <th scope="col">Payslip</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map(emp => {
                const p = computePayrollWithStructure(emp, {
                  structure: structure ?? createDefaultPayStructure(),
                  overrides,
                  bonuses,
                  monthKey: effectiveMonthKey,
                });
                const grossEarnings = p.gross + p.bonusTotal;

                return (
                  <tr key={emp.id}>
                    <td className="cell-id col-optional">{emp.id}</td>
                    <td className="cell-strong">{emp.name}</td>
                    <td>{emp.department}</td>
                    {/* Resigned and Unknown rows stay visible - a master register is a
                        record of who is on file - but the Status column is what tells a
                        reader why their Net does not sit in the active-only card above. */}
                    <td>
                      <span className={`badge ${statusBadgeClass(emp.status)}`}>
                        {statusBadgeLabel(emp.status)}
                      </span>
                    </td>
                    <td>₹{formatINR(emp.monthlyCTC)}</td>
                    <td className="cell-strong">₹{formatINR(grossEarnings)}</td>
                    <td className={p.bonusTotal > 0 ? 'text-success-soft' : 'text-dim'}>
                      {p.bonusTotal > 0 ? `+₹${formatINR(p.bonusTotal)}` : '—'}
                    </td>
                    <td className="text-danger-soft">−₹{formatINR(p.epf)}</td>
                    <td className="text-danger-soft col-optional">−₹{p.professionalTax}</td>
                    <td className="text-danger-soft">−₹{formatINR(p.lossOfPay)}</td>
                    <td className="cell-strong text-success">₹{formatINR(p.netPayable)}</td>
                    <td>
                      <button 
                        onClick={() => onSelectEmployee(emp)}
                        className="btn btn-secondary btn-sm"
                      >
                        <FileText size={13} /> Slip
                      </button>
                    </td>
                  </tr>
                );
              })}
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <div className="empty-cell">
                      No payroll records match the current search and filters.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="pagination">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="pagination__controls">
            <button
              disabled={page === 1}
              onClick={() => setPageState((s) => ({ ...s, page: clampPage(page - 1, totalPages) }))}
              className="btn btn-secondary btn-sm"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPageState((s) => ({ ...s, page: clampPage(page + 1, totalPages) }))}
              className="btn btn-secondary btn-sm"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <BonusModal
        key={bonusModalTick}
        isOpen={bonusModal !== null}
        onClose={() => setBonusModal(null)}
        onSave={(bonus) => onSaveBonus?.(bonus)}
        employees={bonusEmployees ?? employees}
        bonuses={bonuses}
        monthKey={effectiveMonthKey}
        structure={structure ?? createDefaultPayStructure()}
        overrides={overrides}
        bonusToEdit={bonusModal?.mode === 'edit' ? bonusModal.bonus : null}
      />
    </div>
  );
};
