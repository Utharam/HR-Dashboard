import React from 'react';
import { Search, UserPlus, Building2, MapPin } from 'lucide-react';
import type { Department } from '../types';

interface PageToolbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  selectedLocation: string;
  setSelectedLocation: (loc: string) => void;
  departments: Department[];
  locations: string[];
  onOpenAddModal: () => void;
}

/**
 * The page-owned tool row for every tab that works on the filtered roster.
 *
 * The slim header (design decision D1) keeps only the title block and the theme
 * control, so the search / department / location / Add Staff controls that used
 * to live there moved HERE, onto the pages that actually use them (D2). The
 * state is App's, exactly as before: hiding the bar on Attendance / Planner /
 * Admin / Policies / Guides hides the CONTROLS, not the values, so leaving one
 * of those tabs and coming back restores what was typed.
 */
export const PageToolbar: React.FC<PageToolbarProps> = ({
  searchQuery,
  setSearchQuery,
  selectedDept,
  setSelectedDept,
  selectedLocation,
  setSelectedLocation,
  departments,
  locations,
  onOpenAddModal,
}) => {
  return (
    <div className="page-toolbar no-print">
      {/* Search */}
      <div className="page-toolbar__field page-toolbar__search">
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
      <div className="page-toolbar__field">
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
      <div className="page-toolbar__field">
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

      {/* Add Staff */}
      <button onClick={onOpenAddModal} className="btn btn-primary">
        <UserPlus size={16} /> Add Staff
      </button>
    </div>
  );
};
