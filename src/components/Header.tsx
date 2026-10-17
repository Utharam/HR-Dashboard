import React from 'react';
import { Search, UserPlus, FileSpreadsheet, Building2, MapPin, BookOpen } from 'lucide-react';
import type { ActiveTab, Department } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  selectedLocation: string;
  setSelectedLocation: (loc: string) => void;
  departments: Department[];
  locations: string[];
  onOpenAddModal: () => void;
  onNavigateToExcel: () => void;
  onNavigateToGuides?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  searchQuery,
  setSearchQuery,
  selectedDept,
  setSelectedDept,
  selectedLocation,
  setSelectedLocation,
  departments,
  locations,
  onOpenAddModal,
  onNavigateToExcel,
  onNavigateToGuides
}) => {
  const getTabTitle = (tab: ActiveTab) => {
    switch (tab) {
      case 'overview': return { title: 'Executive Workforce Overview', sub: 'High-level headcount, payroll allocation, diversity & attrition health' };
      case 'directory': return { title: 'Employee Master Directory', sub: '200 active corporate profiles with role hierarchy and salary structures' };
      case 'attendance': return { title: 'Time, Attendance & Leave Quotas', sub: 'Standard 26-day working cycle, leave balances and LOP impact' };
      case 'payroll': return { title: 'Payroll & Compensation Engine', sub: 'Statutory CTC components, EPF, ESI, Professional Tax & Disbursable Net' };
      case 'performance': return { title: 'Performance & 9-Box Talent Matrix', sub: 'Bell curve distribution, potential vs performance rating grid' };
      case 'recruitment': return { title: 'Talent Acquisition & Hiring Pipeline', sub: 'Active requisitions, candidate funnel stages & time-to-hire' };
      case 'retention': return { title: 'Statutory EOSB & Gratuity Calculator', sub: 'Payment of Gratuity Act 1972 compliance with tenure rounding & ₹20L cap' };
      case 'trends': return { title: '33-Month Financial & Headcount Analytics', sub: 'Historical trends from Jan 2024 to Sep 2026' };
      case 'excel': return { title: 'Excel Data Hub & Spreadsheet Ingestion', sub: 'Drag-and-drop parser for any HR/payroll Excel workbook' };
      case 'policies': return { title: 'Corporate HR Policy & Benefits Hub', sub: 'Maternal & paternal provisions, leave quotas, notice periods, sabbaticals & custom enterprise rules' };
      case 'guides': return { title: 'OmniHR Knowledge Base & Operational Guides', sub: 'Comprehensive operational manual and technical Excel spreadsheet synchronization guide' };
    }
  };

  const info = getTabTitle(activeTab);

  return (
    <header className="page-header no-print">
      <div>
        <h2 className="page-title">
          {info.title}
        </h2>
        <p className="page-sub">
          {info.sub}
        </p>
      </div>

      <div className="page-actions">
        {/* Global Search Input */}
        <div style={{ width: '220px' }}>
          <label className="omni-icon-field">
            <Search size={15} />
            <span className="sr-only">Search staff</span>
            <input
              type="text"
              className="omni-input"
              placeholder="Search staff, ID, role..."
              aria-label="Search staff, ID or role"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        </div>

        {/* Department Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-micro)' }}>
          <Building2 size={15} className="text-dim" />
          <select
            className="omni-select"
            aria-label="Filter by department"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="ALL">All Departments (7 Orgs)</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Location Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-micro)' }}>
          <MapPin size={15} className="text-dim" />
          <select
            className="omni-select"
            aria-label="Filter by office location"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="ALL">All Locations (5 Hubs)</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <button onClick={onOpenAddModal} className="btn btn-primary">
          <UserPlus size={16} /> Add Staff
        </button>
        <button onClick={onNavigateToExcel} className="btn btn-secondary">
          <FileSpreadsheet size={16} /> Excel Hub
        </button>
        {onNavigateToGuides && (
          <button 
            onClick={onNavigateToGuides} 
            className={`btn ${activeTab === 'guides' ? 'btn-active' : 'btn-secondary'}`}
          >
            <BookOpen size={16} /> Guides
          </button>
        )}
      </div>
    </header>
  );
};
