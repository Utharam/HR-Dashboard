import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  CalendarDays,
  CreditCard, 
  TrendingUp, 
  Briefcase, 
  ShieldCheck, 
  LineChart, 
  FileSpreadsheet,
  BookOpen,
  Scale,
  Download,
  RotateCcw,
  LogOut
} from 'lucide-react';
import type { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onExportExcel: () => void;
  onResetData: () => void;
  /**
   * Whether the navigation is open. Above the drawer breakpoint this collapses or restores
   * the in-grid sidebar; below it, it opens the off-canvas drawer. App owns the state
   * because the header toggle and the drawer scrim are both outside this component.
   */
  isOpen?: boolean;
  /**
   * Ends the session and returns to the front door. Optional because the console
   * is also rendered directly in tests and in isolation, where there is no
   * session to end.
   */
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onExportExcel,
  onResetData,
  isOpen = false,
  onSignOut,
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'directory', label: 'Employee Directory', icon: <Users size={18} /> },
    { id: 'attendance', label: 'Time & Attendance', icon: <CalendarCheck size={18} /> },
    { id: 'leave', label: 'Leave Planner', icon: <CalendarDays size={18} /> },
    { id: 'payroll', label: 'Payroll & Compensation', icon: <CreditCard size={18} /> },
    { id: 'performance', label: 'Performance & 9-Box', icon: <TrendingUp size={18} /> },
    { id: 'recruitment', label: 'Recruitment Pipeline', icon: <Briefcase size={18} /> },
    { id: 'retention', label: 'EOSB & Gratuity Calc', icon: <ShieldCheck size={18} /> },
    { id: 'trends', label: '3-Year Headcount Trends', icon: <LineChart size={18} /> },
    { id: 'excel', label: 'Excel Data Hub', icon: <FileSpreadsheet size={18} /> },
    { id: 'policies', label: 'HR Policy Hub', icon: <Scale size={18} /> },
    { id: 'guides', label: 'User Guides & Manual', icon: <BookOpen size={18} /> },
  ];

  return (
    <aside
      id="app-sidebar"
      data-open={isOpen}
      className="app-sidebar no-print"
    >
      {/* Brand Header */}
      <div className="app-sidebar__brand">
        <div className="brand-mark">
          Ω
        </div>
        <div className="app-sidebar__brand-text">
          <h1 className="brand-name">
            Omni<span className="text-primary">HR</span>
          </h1>
          <p className="brand-tagline">
            Enterprise Workforce Suite v3.0
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="app-sidebar__nav" aria-label="Main navigation">
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item${isActive ? ' nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              // The label is hidden when the sidebar collapses to an icon rail, so the
              // native tooltip has to carry it from then on. It is redundant above the
              // breakpoint and load-bearing below it.
              title={item.label}
            >
              <span className="nav-item__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="app-sidebar__label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer Quick Actions */}
      <div className="app-sidebar__footer">
        <button 
          onClick={onExportExcel} 
          className="btn btn-secondary btn-block btn-sm" 
          title="Export the staff roster to Excel"
        >
          <Download size={15} aria-hidden="true" /> <span className="app-sidebar__label">Export Roster (Excel)</span>
        </button>
        <button 
          onClick={onResetData} 
          className="btn btn-secondary btn-block btn-sm text-dim" 
          title="Reset the register to the master demo dataset"
        >
          <RotateCcw size={14} aria-hidden="true" /> <span className="app-sidebar__label">Reset Demo State</span>
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="btn btn-secondary btn-block btn-sm"
            title="Sign out of OmniHR"
          >
            <LogOut size={15} aria-hidden="true" /> <span className="app-sidebar__label">Sign out</span>
          </button>
        )}
      </div>
    </aside>
  );
};
