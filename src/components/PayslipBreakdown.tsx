import React from 'react';
import type { Employee } from '../types';
import type { PayrollBreakdownWithStructure } from '../utils/payStructure';
import { formatINR } from '../utils/formatters';

/**
 * The shared payslip breakdown (design §6.3).
 *
 * One component renders the money lines for BOTH the per-employee payslip modal
 * and the Payslip Designer's live previews, so the payslip a finance reader sees
 * is the same statement the designer previews while HR edits the structure. The
 * lines are the RESOLVED earnings in structure order, then the month's bonuses,
 * then the deductions, then net — which is exactly the order
 * `computePayrollWithStructure` computes them in. Employer EPF is a company
 * cost: it is reported in a note under the table and is never a deduction.
 *
 * The component is deliberately dumb about the payroll run: a caller that hands
 * it a Resigned employee's breakdown gets a payslip. Gating that (the
 * no-payslip note for staff outside the run) is the caller's contract, because
 * only the caller knows whether the figures are a statement of money payable or
 * a what-if preview.
 */

export interface PayslipBreakdownProps {
  employee: Employee;
  breakdown: PayrollBreakdownWithStructure;
  /**
   * Accessible name of the table. Defaults to the per-employee payslip name the
   * modal has always used; the designer passes its own.
   */
  caption?: string;
}

export const PayslipBreakdown: React.FC<PayslipBreakdownProps> = ({
  employee,
  breakdown,
  caption,
}) => {
  const tableCaption = caption ?? `Monthly payslip breakdown for ${employee.name}`;

  return (
    <div>
      <table className="omni-table" style={{ fontSize: 'var(--fs-sm)' }}>
        {/* A line-item breakdown has no column headers to `scope` - it is two
            columns of label and amount, not a register - so the sr-only caption
            is all the naming it needs (see tableSemantics.test.tsx). */}
        <caption className="sr-only">{tableCaption}</caption>
        <tbody>
          <tr>
            <td>Monthly CTC (Fixed)</td>
            <td style={{ textAlign: 'right', fontWeight: 'var(--fw-semibold)' }}>
              ₹{formatINR(employee.monthlyCTC)}
            </td>
          </tr>
          {/* The resolved earning lines, in the structure's own order. The key
              carries the index because an INVALID draft can hold a duplicate
              component id, and a duplicate React key would drop a line the
              validation errors are simultaneously complaining about. */}
          {breakdown.earnings.map((line, index) => (
            <tr key={`${line.componentId}-${index}`}>
              <td className="payslip-line">• {line.name}</td>
              <td style={{ textAlign: 'right' }} className="text-muted">
                ₹{formatINR(line.amount)}
              </td>
            </tr>
          ))}
          {/* Bonuses ride AFTER the earnings and are marked as one-off: they
              add to gross and net without changing EPF, PT or LOP. */}
          {breakdown.bonuses.map((bonus, index) => (
            <tr key={`${bonus.id}-${index}`}>
              <td className="payslip-line">
                • {bonus.label}
                <span
                  className={`badge ${bonus.kind === 'Performance' ? 'badge-primary' : 'badge-purple'}`}
                  style={{ marginLeft: 'var(--space-2)' }}
                >
                  {bonus.kind}
                </span>
              </td>
              <td style={{ textAlign: 'right' }} className="text-success-soft">
                +₹{formatINR(bonus.amount)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="cell-strong">Gross Earnings</td>
            <td style={{ textAlign: 'right', fontWeight: 'var(--fw-semibold)' }}>
              ₹{formatINR(breakdown.gross + breakdown.bonusTotal)}
            </td>
          </tr>
          {/* Deductions read only when there is one to read: a toggle that is
              OFF prices a zero, and a "− Professional Tax −₹0" line would imply
              money moved that did not. LOP was always conditional. */}
          {breakdown.epf > 0 && (
            <tr className="text-danger-soft">
              <td>− Employee Provident Fund (EPF 12%)</td>
              <td style={{ textAlign: 'right' }}>−₹{formatINR(breakdown.epf)}</td>
            </tr>
          )}
          {breakdown.professionalTax > 0 && (
            <tr className="text-danger-soft">
              <td>− Professional Tax (State Statutory)</td>
              <td style={{ textAlign: 'right' }}>−₹{breakdown.professionalTax}</td>
            </tr>
          )}
          {breakdown.lossOfPay > 0 && (
            <tr className="text-danger-soft">
              <td>− Loss of Pay ({employee.lopDays} days @ Basic/26)</td>
              <td style={{ textAlign: 'right' }}>−₹{formatINR(breakdown.lossOfPay)}</td>
            </tr>
          )}
          <tr className="payslip-total">
            <td>Net Take-Home Pay</td>
            <td style={{ textAlign: 'right' }}>₹{formatINR(breakdown.netPayable)}</td>
          </tr>
        </tbody>
      </table>

      {/* The employer's matching contribution: company cost, stated but never
          deducted. Stated only when there is one to state - EPF off means the
          note would be a confident ₹0 that reads as a deduction of nothing. */}
      {breakdown.employerEpf > 0 && (
        <p className="text-dim" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-2)' }}>
          Employer EPF contribution: ₹{formatINR(breakdown.employerEpf)} — a company cost paid on
          top of the payslip; it is not deducted from the employee.
        </p>
      )}
    </div>
  );
};
