import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  CreditCard, 
  TrendingUp, 
  Briefcase, 
  ShieldCheck, 
  LineChart, 
  FileSpreadsheet,
  BookOpen,
  Scale,
  Download,
  RotateCcw
} from 'lucide-react';
import type { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onExportExcel: () => void;
  onResetData: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onExportExcel,
  onResetData
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'directory', label: 'Employee Directory', icon: <Users size={18} /> },
    { id: 'attendance', label: 'Time & Attendance', icon: <CalendarCheck size={18} /> },
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
    <aside style={{
      width: 'var(--sidebar-w)',
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      padding: 'var(--space-6) var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      flexShrink: 0
    }} className="no-print">
      {/* Brand Header */}
      <div style={{ marginBottom: 'var(--space-7)', paddingLeft: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="brand-mark">
            Ω
          </div>
          <div>
            <h1 className="brand-name">
              Omni<span className="text-primary">HR</span>
            </h1>
            <p className="brand-tagline">
              Enterprise Workforce Suite v3.0
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item${isActive ? ' nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-item__icon">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer Quick Actions */}
      <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-inline)' }}>
        <button 
          onClick={onExportExcel} 
          className="btn btn-secondary btn-block btn-sm" 
        >
          <Download size={15} /> Export Roster (Excel)
        </button>
        <button 
          onClick={onResetData} 
          className="btn btn-secondary btn-block btn-sm text-dim" 
        >
          <RotateCcw size={14} /> Reset Demo State
        </button>
      </div>
    </aside>
  );
};
