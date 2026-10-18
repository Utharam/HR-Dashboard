import React from 'react';
import type { JobRequisition } from '../types';
import { describeTable, scrollRegionLabel } from '../utils/pagination';

const TABLE_TITLE = 'Corporate hiring pipeline and requisitions';

interface RecruitmentSectionProps {
  requisitions: JobRequisition[];
}

export const RecruitmentSection: React.FC<RecruitmentSectionProps> = ({ requisitions }) => {
  const totalOpenings = requisitions.length;
  const totalApplicants = requisitions.reduce((acc, r) => acc + r.applicants, 0);

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'Offer Extended': return <span className="badge badge-active">Offer Extended</span>;
      case 'Interviewing': return <span className="badge badge-primary">Interviewing</span>;
      case 'Screening': return <span className="badge badge-probation">Screening</span>;
      default: return <span className="badge badge-neutral">Sourcing</span>;
    }
  };

  return (
    <div className="section-stack">
      {/* 4 Pipeline Metric Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Active Requisitions</span>
          <div className="kpi-value">{totalOpenings} Roles</div>
          <span className="kpi-sub">Across 6 Functional Orgs</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Active Candidates</span>
          <div className="kpi-value text-primary">{totalApplicants}</div>
          <span className="kpi-sub">Avg 36 Applicants per Opening</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Average Time-to-Hire</span>
          <div className="kpi-value text-success">24.5 Days</div>
          <span className="kpi-sub">Industry Benchmark: 32 Days</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Offers Extended (MTD)</span>
          <div className="kpi-value text-warning">
            {requisitions.filter(r => r.stage === 'Offer Extended').length} Offers
          </div>
          <span className="kpi-sub">92% Offer Acceptance Ratio</span>
        </div>
      </div>

      {/* Requisitions Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Corporate Hiring Pipeline & Requisitions</h3>
            <p className="omni-card-sub">Approved headcount budget and recruitment lifecycle stages.</p>
          </div>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label={scrollRegionLabel(TABLE_TITLE)}
          tabIndex={0}
        >
          <table className="omni-table">
            <caption className="sr-only">
              {describeTable(TABLE_TITLE, requisitions.length, requisitions.length, 1, 1)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Req ID</th>
                <th scope="col">Position Title</th>
                <th scope="col">Department</th>
                <th scope="col">Location</th>
                <th scope="col">Salary Band</th>
                <th scope="col">Applicants</th>
                <th scope="col">Current Stage</th>
                <th scope="col">Target DOJ</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map(req => (
                <tr key={req.id}>
                  <td className="cell-id">{req.id}</td>
                  <td className="cell-strong">{req.title}</td>
                  <td>{req.department}</td>
                  <td>{req.location}</td>
                  <td className="cell-strong text-success">{req.salaryRange}</td>
                  <td><strong>{req.applicants}</strong> candidates</td>
                  <td>{getStageBadge(req.stage)}</td>
                  <td className="cell-muted">{req.targetDOJ}</td>
                </tr>
              ))}
              {requisitions.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-cell">No requisitions are currently open.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
