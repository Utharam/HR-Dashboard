import React, { useState } from 'react';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, formatLakhs } from '../utils/formatters';
import { clampPage, describeTable, pageRangeLabel, scrollRegionLabel, totalPagesFor } from '../utils/pagination';
import { statusBadgeClass, statusBadgeLabel } from './statusBadge';

const PAGE_SIZE = 25;
const TABLE_TITLE = 'Staff master register';

interface DirectorySectionProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

export const DirectorySection: React.FC<DirectorySectionProps> = ({
  employees,
  onSelectEmployee
}) => {
  const pageSize = PAGE_SIZE;

  // The page control follows the data. `currentPage` used to be plain state that only the
  // Prev/Next handlers moved, and those clamped against `totalPages` at click time - never
  // on a dataset that shrank underneath them. Paging to 8 of 200 records and then typing a
  // search matching 3 people left `currentPage` at 8: `employees.slice(175, 200)` on a
  // 3-element array is `[]`, so the register showed "No staff records found" over three
  // matching records and the header read "Showing 176 - 3 of 3".
  //
  // The reset happens during render, not in an effect: an effect paints the stale page one
  // more time first, and a synchronous setState inside an effect is the cascading render
  // `react/set-state-in-effect` exists to prevent. `clampPage` below is what makes this
  // safe in the render that precedes it - it is the second half of the fix, not a backup.
  const [pageState, setPageState] = useState({ size: employees.length, page: 1 });
  if (pageState.size !== employees.length) {
    setPageState({ size: employees.length, page: 1 });
  }

  // Re-derived from the current roster on every render, so a page that is one render
  // behind the data still yields a valid window. utils/pagination owns this arithmetic,
  // which is what stops the three paginated sections drifting apart again.
  const totalPages = totalPagesFor(employees.length, pageSize);
  const page = clampPage(pageState.page, totalPages);
  const currentItems = employees.slice((page - 1) * pageSize, page * pageSize);

  // Tone and label both come from statusBadge, which is keyed by the full
  // Employee['status'] union - so an `Unknown` import renders as neutral here instead
  // of falling through to whatever a `default` branch happened to pick.
  const getStatusBadge = (status: Employee['status']) => (
    <span className={`badge ${statusBadgeClass(status)}`}>{statusBadgeLabel(status)}</span>
  );

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
                <th scope="col">Emp ID</th>
                <th scope="col">Staff Member</th>
                <th scope="col">Department</th>
                <th scope="col">Designation / Role</th>
                <th scope="col">Location</th>
                <th scope="col">DOJ</th>
                <th scope="col">Annual CTC</th>
                <th scope="col">Monthly Basic</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
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
