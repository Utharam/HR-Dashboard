import React from 'react';
import type { Department, JobRequisition } from '../types';
import { describeTable, scrollRegionLabel } from '../utils/pagination';

const TABLE_TITLE = 'Corporate hiring pipeline and requisitions';

interface RecruitmentSectionProps {
  requisitions: JobRequisition[];
  /**
   * Used only to count the organisation units in the pipeline summary.
   *
   * Optional because the section can be rendered on its own; without it the summary says
   * nothing about orgs rather than guessing. The sub-label used to read a hardcoded
   * "Across 6 Functional Orgs" while the header filter one screen up read "7", which is
   * the kind of contradiction a reader resolves by distrusting both.
   */
  departments?: Department[];
  onClearFilters?: () => void;
}

export const RecruitmentSection: React.FC<RecruitmentSectionProps> = ({
  requisitions,
  departments,
  onClearFilters
}) => {
  const totalOpenings = requisitions.length;
  const totalApplicants = requisitions.reduce((acc, r) => acc + r.applicants, 0);
  // Derived, not asserted. "Avg 36 Applicants per Opening" was a constant, and on a
  // single requisition with 4 applicants it claimed 36.
  const avgApplicants = totalOpenings ? (totalApplicants / totalOpenings).toFixed(0) : '0';

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'Offer Extended': return <span className="badge badge-active">Offer Extended</span>;
      case 'Interviewing': return <span className="badge badge-primary">Interviewing</span>;
      case 'Screening': return <span className="badge badge-probation">Screening</span>;
      default: return <span className="badge badge-neutral">Sourcing</span>;
    }
  };

  // A bare `<thead>` over an empty `<tbody>` is a table that failed to load, not a page
  // with nothing on it. There is a difference a user can act on, so it is stated.
  if (requisitions.length === 0) {
    return (
      <div className="section-stack">
        <div className="omni-card empty-state">
          <p className="empty-state__title">No requisitions match the current filters</p>
          <p className="empty-state__body">
            The hiring pipeline is empty. Approved headcount budget and candidate stages
            appear here as soon as a requisition is open &mdash; this is not a pipeline that
            has stalled at zero.
          </p>
          {onClearFilters && (
            <button type="button" onClick={onClearFilters} className="btn btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {/* 4 Pipeline Metric Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Active Requisitions</span>
          <div className="kpi-value">{totalOpenings} Roles</div>
          <span className="kpi-sub">
            {departments ? `Across ${departments.length} Functional Orgs` : 'Across all functional orgs'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Active Candidates</span>
          <div className="kpi-value text-primary">{totalApplicants}</div>
          <span className="kpi-sub">Avg {avgApplicants} Applicants per Opening</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          {/*
            There is no time-to-hire field anywhere in the requisition data, so 24.5 was a
            figure with no source. It stays on the page because a published reference is
            useful, but it is labelled as a reference rather than presented as this
            pipeline's average.
          */}
          <span className="kpi-label">Time-to-Hire Benchmark</span>
          <div className="kpi-value text-success">24.5 Days</div>
          <span className="kpi-sub">Industry reference figure, not measured from this pipeline</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Offers Extended</span>
          <div className="kpi-value text-warning">
            {requisitions.filter(r => r.stage === 'Offer Extended').length} Offers
          </div>
          <span className="kpi-sub">Open requisitions at the offer stage</span>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
