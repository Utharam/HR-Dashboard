import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR } from '../utils/formatters';
import { computeLOP } from '../utils/payroll';
import { computeAttendancePct } from '../utils/dates';
import { sumLeaveBalances } from '../utils/leave';
import { clampPage, pageRangeLabel, totalPagesFor } from '../utils/pagination';

const PAGE_SIZE = 25;

interface AttendanceSectionProps {
  employees: Employee[];
}

export const AttendanceSection: React.FC<AttendanceSectionProps> = ({ employees }) => {
  const pageSize = PAGE_SIZE;

  // Summed directly: `e.presentDays || 25` silently promoted a genuine 0 (someone
  // absent all month) to 25, inflating the "Workforce Present Avg" KPI.
  const totalPresentSum = employees.reduce((acc, e) => acc + e.presentDays, 0);
  // Both fallbacks below used to be invented statistics — '24.8' days and a hardcoded
  // '95.4% Workforce Availability' in the JSX — shown for a roster with no employees to
  // measure. An empty roster reports 0.0 for both, and the sub-label is now derived from
  // the same array as the card above it instead of being typed into the markup.
  const avgPresent = employees.length ? (totalPresentSum / employees.length).toFixed(1) : '0.0';
  const workforceAvailabilityPct = employees.length
    ? (employees.reduce((acc, e) => acc + computeAttendancePct(e.presentDays), 0) / employees.length).toFixed(1)
    : '0.0';
  
  // Total LOP Deductions. computeLOP is the single owner of this arithmetic, so
  // the Attendance tab and the Payroll tab can never quote different LOP figures
  // for the same employee — including the [0, 26] day clamp it enforces.
  const totalLOPAmount = employees.reduce((acc, e) => acc + computeLOP(e.basicSalary, e.lopDays), 0);

  // The roster holds remaining balances, not consumption, so this card states the
  // balance. The previous site derived "days availed" by subtracting a hardcoded
  // entitlement (12 / 12 / 15) from a remaining balance and defaulted each bucket
  // with `|| 8` / `|| 10`, which turned a genuine 0 into a positive figure and
  // produced a NEGATIVE contribution for the 52 of 200 seed staff holding EL
  // above the 15-day cap. sumLeaveBalances is the single owner of the arithmetic.
  const leave = sumLeaveBalances(employees);

  // The page control follows the data: reset to page 1 when the roster changes size, and
  // re-derive the page on every render so a page one render behind the data cannot slice
  // an empty table. Done during render rather than in an effect - see DirectorySection for
  // why. utils/pagination owns the arithmetic, so this section cannot drift from the
  // Directory and Payroll registers.
  const [pageState, setPageState] = useState({ size: employees.length, page: 1 });
  if (pageState.size !== employees.length) {
    setPageState({ size: employees.length, page: 1 });
  }

  const totalPages = totalPagesFor(employees.length, pageSize);
  const page = clampPage(pageState.page, totalPages);
  const currentItems = employees.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="section-stack">
      {/* KPI Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Standard Working Days</span>
          <div className="kpi-value">26 Days</div>
          <span className="kpi-sub">Excluding 4 Sundays / Weekly Offs</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Workforce Present Avg</span>
          <div className="kpi-value text-success">{avgPresent} Days</div>
          <span className="kpi-sub">{workforceAvailabilityPct}% Workforce Availability</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Leave Balance</span>
          <div className="kpi-value text-info">{leave.total} Days</div>
          <span className="kpi-sub">{leave.casual} CL • {leave.sick} SL • {leave.earned} EL</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total LOP Deducted</span>
          <div className="kpi-value text-danger">₹{formatINR(totalLOPAmount)}</div>
          <span className="kpi-sub">Calculated @ (Basic / 26) per LOP day</span>
        </div>
      </div>

      {/* Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Monthly Attendance & Absence Register</h3>
            <p className="omni-card-sub">Real-time synchronization with biometric punch cards & manual regularization.</p>
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
                <th>Present Days</th>
                <th>CL Remaining</th>
                <th>SL Remaining</th>
                <th>EL Remaining</th>
                <th>LOP Days</th>
                <th>LOP Deduction (₹)</th>
                <th>Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map(emp => {
                const lopDed = computeLOP(emp.basicSalary, emp.lopDays);
                const attPct = computeAttendancePct(emp.presentDays);
                return (
                  <tr key={emp.id}>
                    <td className="cell-id">{emp.id}</td>
                    <td className="cell-strong">{emp.name}</td>
                    <td>{emp.department}</td>
                    <td><strong>{emp.presentDays}</strong> / 26</td>
                    <td>{emp.clBalance}</td>
                    <td>{emp.slBalance}</td>
                    <td>{emp.elBalance}</td>
                    <td style={{ color: emp.lopDays > 0 ? 'var(--danger)' : 'inherit', fontWeight: emp.lopDays > 0 ? 700 : 400 }}>
                      {emp.lopDays}
                    </td>
                    <td>₹{formatINR(lopDed)}</td>
                    <td>
                      <span className={`badge ${attPct >= 95 ? 'badge-active' : 'badge-notice'}`}>
                        {attPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-cell">
                      No attendance records match the current search and filters.
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
