import React, { useState } from 'react';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, formatCrores } from '../utils/formatters';

interface PayrollSectionProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

export const PayrollSection: React.FC<PayrollSectionProps> = ({
  employees,
  onSelectEmployee
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const totalMonthlyGross = employees.reduce((acc, e) => acc + e.monthlyCTC, 0);
  const totalBasic = employees.reduce((acc, e) => acc + e.basicSalary, 0);
  
  // Total Statutory Deductions: EPF + ESI/PT
  const totalEPF = employees.reduce((acc, e) => acc + Math.round(Math.min(e.basicSalary, 15000) * 0.12), 0);
  const totalPT = employees.length * 200; // Standard ₹200/mo
  const totalNetDisbursable = totalMonthlyGross - (totalEPF + totalPT);

  const totalPages = Math.ceil(employees.length / pageSize) || 1;
  const currentItems = employees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="section-stack">
      {/* 4 Summary Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Monthly CTC</span>
          <div className="kpi-value">{formatCrores(totalMonthlyGross)}</div>
          <span className="kpi-sub">Across {employees.length} active roster</span>
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
            <p className="omni-card-sub">Standard Indian wage formula: 50% Basic, 25% HRA, 25% Special Allowance minus EPF and PT.</p>
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
                const epf = Math.round(Math.min(emp.basicSalary, 15000) * 0.12);
                const pt = 200;
                const net = emp.monthlyCTC - (epf + pt);

                return (
                  <tr key={emp.id}>
                    <td className="cell-id">{emp.id}</td>
                    <td className="cell-strong">{emp.name}</td>
                    <td>{emp.department}</td>
                    <td className="cell-strong">₹{formatINR(emp.monthlyCTC)}</td>
                    <td>₹{formatINR(emp.basicSalary)}</td>
                    <td>₹{formatINR(emp.hra)}</td>
                    <td>₹{formatINR(emp.specialAllowance)}</td>
                    <td className="text-danger-soft">−₹{formatINR(epf)}</td>
                    <td className="text-danger-soft">−₹{pt}</td>
                    <td className="cell-strong text-success">₹{formatINR(net)}</td>
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
