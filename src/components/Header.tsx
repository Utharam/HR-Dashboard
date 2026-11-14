import React from 'react';
import { Menu } from 'lucide-react';
import type { ActiveTab } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  activeTab: ActiveTab;
  /**
   * Opens and closes the navigation. Required rather than optional: below the collapse
   * breakpoint the sidebar is a fixed panel that only this control can summon, and a
   * keyboard user has to be able to reach it from wherever they are on the page.
   */
  onToggleNav: () => void;
  /** Whether the navigation is currently showing, published as `aria-expanded`. */
  navOpen: boolean;
}

/**
 * The slim page header (design decision D1): menu toggle, page title/subtitle and
 * the theme control - and nothing else. Search, the department/location filters
 * and Add Staff belong to the pages that use them (`PageToolbar`); Admin and
 * Guides are reached through the sidebar, where every destination lives.
 */
export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onToggleNav,
  navOpen,
}) => {
  const getTabTitle = (tab: ActiveTab) => {
    switch (tab) {
      case 'overview': return { title: 'Executive Workforce Overview', sub: 'High-level headcount, payroll allocation, diversity & attrition health' };
      case 'directory': return { title: 'Employee Master Directory', sub: '200 active corporate profiles with role hierarchy and salary structures' };
      case 'attendance': return { title: 'Time & Attendance', sub: 'Daily ledger, monthly matrix, company holidays and LOP impact' };
      case 'leave': return { title: 'Leave Planner & Coverage Calendar', sub: 'Month calendar of who is away, coverage peak days and the next 30 days of planned leave' };
      case 'payroll': return { title: 'Payroll & Compensation Engine', sub: 'Statutory CTC components, EPF, ESI, Professional Tax & Disbursable Net' };
      case 'performance': return { title: 'Performance & 9-Box Talent Matrix', sub: 'Bell curve distribution, potential vs performance rating grid' };
      case 'recruitment': return { title: 'Talent Acquisition & Hiring Pipeline', sub: 'Active requisitions, candidate funnel stages & time-to-hire' };
      case 'retention': return { title: 'Statutory EOSB & Gratuity Calculator', sub: 'Payment of Gratuity Act 1972 compliance with tenure rounding & ₹20L cap' };
      case 'trends': return { title: '33-Month Financial & Headcount Analytics', sub: 'Historical trends from Jan 2024 to Sep 2026' };
      case 'admin': return { title: 'Admin & Settings', sub: 'Workspace actions, business-data snapshots, storage status and the Excel ingestion hub' };
      case 'policies': return { title: 'Corporate HR Policy & Benefits Hub', sub: 'Maternal & paternal provisions, leave quotas, notice periods, sabbaticals & custom enterprise rules' };
      case 'guides': return { title: 'OmniHR Knowledge Base & Operational Guides', sub: 'Comprehensive operational manual and technical Excel spreadsheet synchronization guide' };
    }
  };

  const info = getTabTitle(activeTab);

  return (
    <header className="page-header no-print">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/*
          The navigation toggle is a real control at every width: above the 760px drawer
          breakpoint it collapses and restores the in-grid sidebar; below it, it opens the
          drawer. It is always rendered rather than swapped in and out with the viewport,
          so its place in the tab order does not change under a keyboard user.
        */}
        <button
          type="button"
          onClick={onToggleNav}
          className="btn btn-secondary btn-sm"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        >
          <Menu size={16} aria-hidden="true" />
        </button>

        <div>
          <h2 className="page-title">
            {info.title}
          </h2>
          <p className="page-sub">
            {info.sub}
          </p>
        </div>
      </div>

      {/* Last in the action row: the same control ends the action cluster on the
          landing and login, so the theme affordance stays with the cluster
          even when the row wraps. */}
      <div className="page-actions">
        <ThemeToggle />
      </div>
    </header>
  );
};
