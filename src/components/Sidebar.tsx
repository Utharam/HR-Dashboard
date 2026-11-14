import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  ReceiptText,
  Wallet,
  TrendingUp,
  Briefcase,
  ShieldCheck,
  LineChart,
  Database,
  BookOpen,
  Scale,
  Layers,
  ChevronDown,
} from 'lucide-react';
import type { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  /**
   * Whether the navigation is open. Above the drawer breakpoint this collapses or restores
   * the in-grid sidebar; below it, it opens the off-canvas drawer. App owns the state
   * because the header toggle and the drawer scrim are both outside this component.
   */
  isOpen?: boolean;
}

interface NavLeaf {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
}

/** The pages before the Workforce Planning group. */
const LEADING_ITEMS: NavLeaf[] = [
  { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard size={18} /> },
  { id: 'directory', label: 'Employee Directory', icon: <Users size={18} /> },
  { id: 'attendance', label: 'Time & Attendance', icon: <CalendarCheck size={18} /> },
  { id: 'leave', label: 'Planner', icon: <CalendarDays size={18} /> },
  { id: 'payroll', label: 'Payroll & Compensation', icon: <CreditCard size={18} /> },
  { id: 'payslip', label: 'Payslip Designer', icon: <ReceiptText size={18} /> },
  { id: 'finance', label: 'Finance Report', icon: <Wallet size={18} /> },
  { id: 'performance', label: 'Performance & 9-Box', icon: <TrendingUp size={18} /> },
];

/** The Workforce Planning group's submodules (design decision D5). */
const PLANNING_CHILDREN: NavLeaf[] = [
  { id: 'recruitment', label: 'Recruitment Pipeline', icon: <Briefcase size={16} /> },
  { id: 'retention', label: 'ESOB & Gratuity', icon: <ShieldCheck size={16} /> },
  { id: 'trends', label: '3-Year Headcount Trends', icon: <LineChart size={16} /> },
];

/** The pages after the group. Admin is renamed Admin & Settings (D4). */
const TRAILING_ITEMS: NavLeaf[] = [
  { id: 'admin', label: 'Admin & Settings', icon: <Database size={18} /> },
  { id: 'policies', label: 'HR Policy Hub', icon: <Scale size={18} /> },
  { id: 'guides', label: 'User Guides & Manual', icon: <BookOpen size={18} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen = false,
}) => {
  const childActive = PLANNING_CHILDREN.some(item => item.id === activeTab);

  /**
   * The group starts expanded: the three modules were ordinary top-level pages
   * before, and a collapsed group would hide them behind a first click the user
   * did not ask for. It can be collapsed from the parent toggle; navigating to a
   * child re-expands it, so the active highlight is never showing in a closed
   * panel.
   */
  const [planningOpen, setPlanningOpen] = useState(true);
  const [childActiveOnLastRender, setChildActiveOnLastRender] = useState(childActive);

  // A render-time adjustment (React's "reset state when a prop changes"
  // pattern), not an effect: the flip of `childActive` from false to true is
  // the only trigger, so collapsing the group while a child is active stays
  // collapsed and child-to-child navigation never fights the user's choice.
  if (childActive !== childActiveOnLastRender) {
    setChildActiveOnLastRender(childActive);
    if (childActive) setPlanningOpen(true);
  }

  const renderLeaf = (item: NavLeaf, extraClass = '') => {
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setActiveTab(item.id)}
        className={`nav-item${extraClass}${isActive ? ' nav-item--active' : ''}`}
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
  };

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
        {LEADING_ITEMS.map(item => renderLeaf(item))}

        {/* Workforce Planning group: a disclosure whose children are the three
            workforce-planning modules. The parent is never `aria-current` - the
            page marker stays on the child the user is actually on. */}
        <div className="nav-group">
          <button
            type="button"
            onClick={() => setPlanningOpen(open => !open)}
            className={`nav-item nav-item--group${childActive ? ' nav-item--group-active' : ''}`}
            aria-expanded={planningOpen}
            aria-controls="nav-group-workforce"
            title="Workforce Planning"
          >
            <span className="nav-item__icon" aria-hidden="true">
              <Layers size={18} />
            </span>
            <span className="app-sidebar__label">Workforce Planning</span>
            <ChevronDown size={15} className="nav-group__chevron" aria-hidden="true" />
          </button>
          <div
            id="nav-group-workforce"
            className="nav-group__children"
            hidden={!planningOpen}
          >
            {PLANNING_CHILDREN.map(item => renderLeaf(item, ' nav-item--sub'))}
          </div>
        </div>

        {TRAILING_ITEMS.map(item => renderLeaf(item))}
      </nav>
    </aside>
  );
};
