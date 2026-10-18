import React, { useState } from 'react';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, formatCrores } from '../utils/formatters';
import { computePayroll, isActive, PROFESSIONAL_TAX } from '../utils/payroll';
import { clampPage, pageRangeLabel, totalPagesFor } from '../utils/pagination';

const PAGE_SIZE = 25;

interface PayrollSectionProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

export const PayrollSection: React.FC<PayrollSectionProps> = ({
  employees,
  onSelectEmployee
}) => {
  const pageSize = PAGE_SIZE;

  // Payroll run figures come from employees.filter(isActive) — resigned staff are
  // not paid, and neither is an `Unknown` status: an unresolved import is not
  // evidence that the person is on the roster, so they must not be charged PF,
  // professional tax or appear in the aggregates until the status is resolved.
  const activeRoster = employees.filter(isActive);
  const payroll = activeRoster.map(computePayroll);

  const totalMonthlyGross = payroll.reduce((acc, p) => acc + p.gross, 0);
  const totalBasic = payroll.reduce((acc, p) => acc + p.basic, 0);
  const totalEPF = payroll.reduce((acc, p) => acc + p.epf, 0);
  const totalPT = activeRoster.length * PROFESSIONAL_TAX; // Standard ₹200/mo
  const totalLOP = payroll.reduce((acc, p) => acc + p.lossOfPay, 0);
  const totalNetDisbursable = totalMonthlyGross - (totalEPF + totalPT + totalLOP);

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
          <span className="kpi-label">Fixed Basic Wages (50%)</span>
          <div className="kpi-value text-primary">{formatCrores(totalBasic)}</div>
          <span className="kpi-sub">EPF & Gratuity Calculation Base</span>
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

      {/* Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Compensation Structure & Take-Home Salary Breakdown</h3>
            <p className="omni-card-sub">Standard Indian wage formula: 50% Basic, 25% HRA, 25% Special Allowance minus EPF, Professional Tax and LOP.</p>
          </div>
          <span className="pagination__count">
            {pageRangeLabel(page, pageSize, employees.length)}
          </span>
        </div>

        <div className="omni-table-wrap">
          <table className="omni-table">
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Monthly CTC</th>
                <th>Basic (50%)</th>
                <th>HRA (25%)</th>
                <th>Special Allow.</th>
                <th>EPF (12%)</th>
                <th>PT</th>
                <th>Net Disbursable</th>
                <th>Payslip</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map(emp => {
                const p = computePayroll(emp);

                return (
                  <tr key={emp.id}>
                    <td className="cell-id">{emp.id}</td>
                    <td className="cell-strong">{emp.name}</td>
                    <td>{emp.department}</td>
                    <td className="cell-strong">₹{formatINR(emp.monthlyCTC)}</td>
                    <td>₹{formatINR(emp.basicSalary)}</td>
                    <td>₹{formatINR(emp.hra)}</td>
                    <td>₹{formatINR(emp.specialAllowance)}</td>
                    <td className="text-danger-soft">−₹{formatINR(p.epf)}</td>
                    <td className="text-danger-soft">−₹{p.professionalTax}</td>
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
                  <td colSpan={11}>
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
    </div>
  );
};
