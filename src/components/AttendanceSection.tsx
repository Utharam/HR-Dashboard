import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR } from '../utils/formatters';
import { computeLOP } from '../utils/payroll';

interface AttendanceSectionProps {
  employees: Employee[];
}

export const AttendanceSection: React.FC<AttendanceSectionProps> = ({ employees }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const totalPresentSum = employees.reduce((acc, e) => acc + (e.presentDays || 25), 0);
  const avgPresent = employees.length ? (totalPresentSum / employees.length).toFixed(1) : '24.8';
  
  // Total LOP Deductions. computeLOP is the single owner of this arithmetic, so
  // the Attendance tab and the Payroll tab can never quote different LOP figures
  // for the same employee — including the [0, 26] day clamp it enforces.
  const totalLOPAmount = employees.reduce((acc, e) => acc + computeLOP(e.basicSalary, e.lopDays), 0);

  const totalCL = employees.reduce((acc, e) => acc + (12 - (e.clBalance || 8)), 0);
  const totalSL = employees.reduce((acc, e) => acc + (12 - (e.slBalance || 8)), 0);
  const totalEL = employees.reduce((acc, e) => acc + (15 - (e.elBalance || 10)), 0);

  const totalPages = Math.ceil(employees.length / pageSize) || 1;
  const currentItems = employees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          <span className="kpi-sub">95.4% Workforce Availability</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Leaves Availed (MTD)</span>
          <div className="kpi-value text-info">{totalCL + totalSL + totalEL}</div>
          <span className="kpi-sub">{totalCL} CL • {totalSL} SL • {totalEL} EL</span>
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
            Showing {employees.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, employees.length)} of {employees.length}
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
                const attPct = ((emp.presentDays / 26) * 100).toFixed(1);
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
                      <span className={`badge ${Number(attPct) >= 95 ? 'badge-active' : 'badge-notice'}`}>
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
            Page {currentPage} of {totalPages}
          </span>
          <div className="pagination__controls">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="btn btn-secondary btn-sm"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
