import React, { useId } from 'react';
import { X, Printer } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, formatLakhs } from '../utils/formatters';
import { computePayroll, isActive } from '../utils/payroll';
import { statusBadgeClass } from './statusBadge';
import { Dialog } from './Dialog';

interface EmployeeModalProps {
  employee: Employee | null;
  onClose: () => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({ employee, onClose }) => {
  // Before the early return, because it is a hook and hooks are not conditional. `useId`
  // rather than a literal, so a second payslip open at the same time - a compare view, a
  // split pane - does not emit the same `aria-labelledby` twice and leave both dialogs
  // resolving to whichever heading the document happens to list first.
  const titleId = useId();

  if (!employee) return null;

  // A payslip is a statement of money payable, so one is computed only for staff in the
  // payroll run. A Resigned or Unknown employee gets an explicit notice in place of the
  // figures instead: their profile stays visible (batch B keeps resigned staff in the
  // payroll *table*), but no Net Take-Home figure is shown for someone who is not being
  // paid. Previously every profile computed and printed a full payslip regardless.
  const payslip = isActive(employee) ? computePayroll(employee) : null;

  return (
    // `Dialog` owns the scrim, the role, the Escape key and the focus lifecycle. It mounts
    // at the moment `employee` becomes non-null, which is while focus is still on the
    // control that opened it - so the trigger is captured as the restore target.
    <Dialog isOpen onClose={onClose} labelledBy={titleId}>
      <button
        onClick={onClose}
        aria-label="Close payslip"
        className="modal-close no-print"
      >
        <X size={20} aria-hidden="true" />
      </button>

      {/* Header Profile */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', marginBottom: 'var(--space-5)', paddingRight: 'var(--space-10)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <h2 id={titleId} className="omni-card-title" style={{ fontSize: 'var(--fs-3xl)' }}>{employee.name}</h2>
              <span className={`badge ${statusBadgeClass(employee.status)}`}>
                {employee.status}
              </span>
            </div>
            <p className="text-muted" style={{ marginTop: '2px' }}>
              {employee.role} • <strong className="text-main">{employee.department}</strong>
            </p>
          </div>
          <span className="cell-id" style={{ padding: '4px 10px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
            {employee.id}
          </span>
        </div>

        {/* Profile Details Grid */}
        <dl className="inset-panel detail-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 'var(--space-5)' }}>
          <div><dt>Location:</dt> <dd>{employee.location}</dd></div>
          <div><dt>Date of Joining:</dt> <dd>{employee.doj}</dd></div>
          <div><dt>Work Email:</dt> <dd>{employee.email}</dd></div>
          <div><dt>Contact:</dt> <dd>{employee.phone}</dd></div>
          <div><dt>PF UAN:</dt> <dd className="text-mono">{employee.uan}</dd></div>
          <div><dt>Performance Rating:</dt> <dd className="text-purple-soft">★ {employee.performanceRating}.0 / 5.0</dd></div>
        </dl>

        {/* Payslip Card Breakdown */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
            <h3 className="omni-card-title text-primary">
              {payslip ? 'Executive Compensation & Monthly Payslip' : 'Executive Compensation'}
            </h3>
            <span className="text-dim" style={{ fontSize: 'var(--fs-xs)' }}>
              Annual CTC: <strong className="text-success">{formatLakhs(employee.monthlyCTC * 12)}</strong>
            </span>
          </div>

          {payslip ? (
            <table className="omni-table" style={{ fontSize: 'var(--fs-sm)' }}>
              {/* Outside the brief's original list of tables, but the same defect: without a
                  caption a screen reader announces this as an unnamed two-column grid. It has
                  no column headers to `scope` - it is a line-item breakdown, not a data
                  register - so the caption is all it needs. */}
              <caption className="sr-only">Monthly payslip breakdown for {employee.name}</caption>
              <tbody>
                <tr>
                  <td>Monthly Gross CTC (Fixed)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'var(--fw-semibold)' }}>₹{formatINR(employee.monthlyCTC)}</td>
                </tr>
                <tr>
                  <td className="payslip-line">• Basic Salary (50%)</td>
                  <td style={{ textAlign: 'right' }} className="text-muted">₹{formatINR(employee.basicSalary)}</td>
                </tr>
                <tr>
                  <td className="payslip-line">• House Rent Allowance / HRA (25%)</td>
                  <td style={{ textAlign: 'right' }} className="text-muted">₹{formatINR(employee.hra)}</td>
                </tr>
                <tr>
                  <td className="payslip-line">• Special / Executive Allowance (25%)</td>
                  <td style={{ textAlign: 'right' }} className="text-muted">₹{formatINR(employee.specialAllowance)}</td>
                </tr>
                <tr className="text-danger-soft">
                  <td>− Employee Provident Fund (EPF 12% @ ₹15k cap)</td>
                  <td style={{ textAlign: 'right' }}>−₹{formatINR(payslip.epf)}</td>
                </tr>
                <tr className="text-danger-soft">
                  <td>− Professional Tax (State Statutory)</td>
                  <td style={{ textAlign: 'right' }}>−₹{payslip.professionalTax}</td>
                </tr>
                {payslip.lossOfPay > 0 && (
                  <tr className="text-danger-soft">
                    <td>− Loss of Pay ({employee.lopDays} days @ Basic/26)</td>
                    <td style={{ textAlign: 'right' }}>−₹{formatINR(payslip.lossOfPay)}</td>
                  </tr>
                )}
                <tr className="payslip-total">
                  <td>Net Take-Home Pay</td>
                  <td style={{ textAlign: 'right' }}>₹{formatINR(payslip.netPayable)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-muted" role="note">
              No payslip is available for this employee. Their recorded status is
              {' '}<strong>{employee.status}</strong>, so they are not part of the payroll run
              {' '}— no PF, professional tax or net pay is computed until the status is resolved
              to Active, Probation or Notice Period.
            </p>
          )}
        </div>

        {/* Leave Balances */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: 'var(--space-6)', textAlign: 'center' }}>
          <div className="stat-tile">
            <span className="stat-tile__label">Casual Leave (CL)</span>
            <div className="stat-tile__value text-info-soft">{employee.clBalance} Days</div>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__label">Sick Leave (SL)</span>
            <div className="stat-tile__value text-warning-soft">{employee.slBalance} Days</div>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__label">Privilege Leave (EL)</span>
            <div className="stat-tile__value text-success-soft">{employee.elBalance} Days</div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }} className="no-print">
          {payslip && (
            <button onClick={() => window.print()} className="btn btn-secondary">
              <Printer size={16} /> Print Payslip
            </button>
          )}
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
    </Dialog>
  );
};
