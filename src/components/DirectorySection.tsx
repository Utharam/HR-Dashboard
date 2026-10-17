import React, { useState } from 'react';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, formatLakhs } from '../utils/formatters';

interface DirectorySectionProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

export const DirectorySection: React.FC<DirectorySectionProps> = ({
  employees,
  onSelectEmployee
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const totalPages = Math.ceil(employees.length / pageSize) || 1;
  const currentItems = employees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return <span className="badge badge-active">Active</span>;
      case 'Probation': return <span className="badge badge-probation">Probation</span>;
      case 'Notice Period': return <span className="badge badge-notice">Notice</span>;
      case 'Resigned': return <span className="badge badge-resigned">Resigned</span>;
      default: return <span className="badge badge-primary">{status}</span>;
    }
  };

  return (
    <div className="section-stack">
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">
              Staff Master Register ({employees.length} Profiles)
            </h3>
            <p className="omni-card-sub">
              Click any staff member to view full compensation structure, verified payslip, and leave balance.
            </p>
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
                <th>Staff Member</th>
                <th>Department</th>
                <th>Designation / Role</th>
                <th>Location</th>
                <th>DOJ</th>
                <th>Annual CTC</th>
                <th>Monthly Basic</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map(emp => (
                <tr key={emp.id}>
                  <td className="cell-id">{emp.id}</td>
                  <td>
                    <div className="cell-strong">{emp.name}</div>
                    <div className="cell-dim">{emp.email}</div>
                  </td>
                  <td>{emp.department}</td>
                  <td>{emp.role}</td>
                  <td>{emp.location}</td>
                  <td className="cell-muted">{emp.doj}</td>
                  <td className="cell-strong text-success">{formatLakhs(emp.monthlyCTC * 12)}</td>
                  <td>₹{formatINR(emp.basicSalary)}</td>
                  <td>{getStatusBadge(emp.status)}</td>
                  <td>
                    <button 
                      onClick={() => onSelectEmployee(emp)}
                      className="btn btn-secondary btn-sm"
                    >
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-cell">
                      No staff records found matching search and filters.
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
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="btn btn-secondary btn-sm"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
