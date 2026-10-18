import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewSection } from './components/OverviewSection';
import { DirectorySection } from './components/DirectorySection';
import { AttendanceSection } from './components/AttendanceSection';
import { PayrollSection } from './components/PayrollSection';
import { PerformanceSection } from './components/PerformanceSection';
import { RecruitmentSection } from './components/RecruitmentSection';
import { RetentionSection } from './components/RetentionSection';
import { TrendsSection } from './components/TrendsSection';
import { ExcelHubSection } from './components/ExcelHubSection';
import { PolicySection } from './components/PolicySection';
import { GuidesSection } from './components/GuidesSection';
import { EmployeeModal } from './components/EmployeeModal';
import { AddEmployeeModal } from './components/AddEmployeeModal';
import { Callout } from './components/Callout';
import { ConfirmDialog } from './components/ConfirmDialog';

import type { Employee, ActiveTab, HRPolicy } from './types';
import { 
  INITIAL_EMPLOYEES, 
  INITIAL_DEPARTMENTS, 
  INITIAL_LOCATIONS, 
  INITIAL_TRACKER, 
  INITIAL_REQUISITIONS 
} from './data/initialData';
import { INITIAL_POLICIES } from './data/initialPolicies';
import { computePayroll, isActive } from './utils/payroll';
import { loadPersisted, savePersisted } from './utils/storage';
import { isEmployeeRow, isPolicyRow } from './utils/rowValidators';

const EMPLOYEES_KEY = 'omnihr_employees';
const POLICIES_KEY = 'omnihr_policies';

/**
 * Something the user has to know about their data, shown as one banner.
 *
 * - `discarded` (read side): a stored payload existed and could not be used, so seed data
 *   was substituted. This is the state the previous boolean contract could not express:
 *   it reported the same thing for a first visit, where nothing was lost, so any banner
 *   built on it greeted every new user with a warning about data that never existed.
 * - `not-saved` (write side): the change is on screen but was NOT written down.
 *
 * A user must never have to guess whether the register they are looking at is the one
 * that will survive a refresh.
 */
type AppNotice =
  | { kind: 'discarded'; scope: 'employees' | 'policies' }
  | { kind: 'not-saved'; scope: 'employees' | 'policies'; reason: 'quota' | 'unavailable' };

const SAVE_NOTICE_COPY: Record<'quota' | 'unavailable', string> = {
  quota:
    'Your change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove staff, or close other OmniHR tabs, then make the change again.',
  unavailable:
    'Your change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.',
};

const DISCARDED_NOTICE_COPY: Record<'employees' | 'policies', string> = {
  employees:
    'The staff register saved in this browser could not be read and has been set aside. The demo dataset is showing in its place - anything you imported earlier is gone. Re-import your roster to continue.',
  policies:
    'The HR policies saved in this browser could not be read and have been set aside. The default policies are showing in their place - any policy you added or edited is gone.',
};

export const App: React.FC = () => {
  // Read once per mount through the validating loader. `loadPersisted` is a pure read of
  // storage, so a re-run is harmless and returns the same answer.
  //
  // Only `status === 'recovered'` produces a notice. `'empty'` covers both a first visit
  // and a register the user deliberately emptied, and warning about either would be a
  // lie about data that does not exist.
  const initialLoad = useMemo(
    () => ({
      employees: loadPersisted(EMPLOYEES_KEY, isEmployeeRow, INITIAL_EMPLOYEES),
      policies: loadPersisted(POLICIES_KEY, isPolicyRow, INITIAL_POLICIES),
    }),
    [],
  );

  const [employees, setEmployees] = useState<Employee[]>(initialLoad.employees.rows);
  const [departments] = useState(INITIAL_DEPARTMENTS);
  const [locations] = useState(INITIAL_LOCATIONS);
  const [tracker] = useState(INITIAL_TRACKER);
  const [requisitions] = useState(INITIAL_REQUISITIONS);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedLocation, setSelectedLocation] = useState('ALL');

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [guideInitialSection, setGuideInitialSection] = useState<'general' | 'excel'>('general');

  // A destructive action is a QUESTION, and the question is state. It used to be a blocking
  // native prompt that froze the main thread, could not be themed, could not say what was
  // about to be lost, and told a screen-reader user nothing until focus came back.
  const [isResetRequested, setIsResetRequested] = useState(false);
  // Confirmation of something that DID happen, shown inline and dismissible.
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [policies, setPolicies] = useState<HRPolicy[]>(initialLoad.policies.rows);

  // One banner, one dismiss. A dismissed notice stays dismissed until the NEXT thing that
  // goes wrong: the save effect is keyed to the roster, not to the banner, so a re-render
  // has nothing to retry and nothing to re-raise.
  const [notice, setNotice] = useState<AppNotice | null>(() => {
    if (initialLoad.employees.status === 'recovered') {
      return { kind: 'discarded', scope: 'employees' };
    }
    if (initialLoad.policies.status === 'recovered') {
      return { kind: 'discarded', scope: 'policies' };
    }
    return null;
  });

  const handleNavigateToGuides = (sec: 'general' | 'excel' = 'general') => {
    setGuideInitialSection(sec);
    setActiveTab('guides');
  };

  const handleUpdatePolicy = (updated: HRPolicy) => {
    setPolicies(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleAddPolicy = (newPol: HRPolicy) => {
    setPolicies(prev => [newPol, ...prev]);
  };

  const handleDeletePolicy = (id: string) => {
    setPolicies(prev => prev.filter(p => p.id !== id));
  };

  // The reset is carried entirely by the state change; the sync effect below rewrites
  // the key on the next render. The `localStorage.removeItem` call that used to sit here
  // was dead code - it removed the key and the effect immediately put it back.
  const handleResetPolicies = () => {
    setPolicies(INITIAL_POLICIES);
  };

  // Sync to localStorage. `savePersisted` reports failure instead of throwing: an
  // unguarded `setItem` raised `QuotaExceededError` at roughly 9,300 employees
  // (~494 bytes a row against a 5 MB origin budget), which propagated out of this
  // effect, unmounted the root, and did so AFTER the user had been told their import
  // succeeded. A failure now becomes a visible notice and nothing else claims to have
  // been saved.
  //
  // The setState-in-effect warnings below are suppressed on purpose. Writing to an
  // external system and reporting that it failed is precisely an effect's job, and the
  // alternative - persisting from each event handler - silently stops persisting the
  // moment a future change arrives by some path that forgot to call the helper. This
  // cannot cascade: the notice only changes the banner, and the effect's dependency is
  // the roster, so the effect does not re-run.
  useEffect(() => {
    const result = savePersisted(EMPLOYEES_KEY, employees);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'employees', reason: result.reason });
    }
  }, [employees]);

  useEffect(() => {
    const result = savePersisted(POLICIES_KEY, policies);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'policies', reason: result.reason });
    }
  }, [policies]);

  // Global Filtered Employees
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return employees.filter(emp => {
      const matchSearch = !q || 
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q);

      const matchDept = selectedDept === 'ALL' || emp.department === selectedDept;
      const matchLoc = selectedLocation === 'ALL' || emp.location === selectedLocation;

      return matchSearch && matchDept && matchLoc;
    });
  }, [employees, searchQuery, selectedDept, selectedLocation]);

  // Export Complete Employee Roster to Excel
  const handleExportEmployees = () => {
    const data = filteredEmployees.map(e => ({
      'Employee ID': e.id,
      'Full Name': e.name,
      'Work Email': e.email,
      'Phone': e.phone,
      'Department': e.department,
      'Designation / Role': e.role,
      'Office Location': e.location,
      'Date of Joining': e.doj,
      'Monthly CTC': e.monthlyCTC,
      'Annual CTC (INR)': e.monthlyCTC * 12,
      'Monthly Basic Salary': e.basicSalary,
      'HRA': e.hra,
      'Special Allowance': e.specialAllowance,
      'Status': e.status,
      'Gender': e.gender,
      'Performance Rating': e.performanceRating,
      'Attendance (Days Present)': e.presentDays,
      'CL Balance': e.clBalance,
      'SL Balance': e.slBalance,
      'EL Balance': e.elBalance,
      'LOP Days': e.lopDays,
      'PF UAN': e.uan
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
    XLSX.writeFile(wb, `OmniHR_Staff_Roster_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export Monthly Payroll Advice to Excel
  const handleExportPayroll = () => {
    // The payroll run excludes Resigned and Unknown staff, and this register is a
    // statement of money payable - so it must be filtered by the same `isActive` the
    // Payroll tab uses. It was not: an Unknown import still had a Net Salary Payable
    // written into the file, which is how an unresolved import becomes a real payment.
    // The roster export above is deliberately NOT filtered — it is the master list,
    // not a disbursement.
    const payrollRun = filteredEmployees.filter(isActive);
    const data = payrollRun.map(e => {
      const p = computePayroll(e);

      return {
        'Employee ID': e.id,
        'Employee Name': e.name,
        'Department': e.department,
        'Designation': e.role,
        'Location': e.location,
        'Monthly Gross CTC': p.gross,
        'Basic (50%)': p.basic,
        'HRA (25%)': p.hra,
        'Special Allowance (25%)': p.specialAllowance,
        'EPF (12% @ ₹15k cap)': p.epf,
        'Professional Tax': p.professionalTax,
        'Loss of Pay (LOP)': p.lossOfPay,
        'Total Deductions': p.totalDeductions,
        'Net Salary Payable': p.netPayable
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll_Register');
    XLSX.writeFile(wb, `OmniHR_Payroll_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // As with `handleResetPolicies`, the state change is the whole reset; the sync effect
  // rewrites the key. The `removeItem` call here was dead code that the effect undid.
  //
  // This now only ASKS. The roster is replaced when the answer comes back through
  // `ConfirmDialog`, which is the only way the reset can now happen - so there is no
  // branch here that can discard the register on a stray click.
  const handleResetData = () => setIsResetRequested(true);

  const handleConfirmResetData = () => {
    setEmployees(INITIAL_EMPLOYEES);
    setIsResetRequested(false);
    setConfirmation('Demo data reset: the register is back to the 200 staff Master Dataset.');
  };

  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees(prev => [newEmp, ...prev]);
    setConfirmation(`${newEmp.name} (${newEmp.id}) was added to the employee register.`);
  };

  const handleImportEmployees = (newEmps: Employee[]) => {
    setEmployees(newEmps);
    setActiveTab('directory');
  };

  const noticeCopy = notice
    ? notice.kind === 'not-saved'
      ? SAVE_NOTICE_COPY[notice.reason]
      : DISCARDED_NOTICE_COPY[notice.scope]
    : '';
  const noticeTitle = notice?.kind === 'discarded' ? 'Saved data could not be read' : 'Change not saved';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onExportExcel={handleExportEmployees}
        onResetData={handleResetData}
      />

      {/* Main Content Pane */}
      <main style={{ flex: 1, padding: 'var(--shell-pad)', overflowY: 'auto', maxWidth: 'calc(100vw - var(--sidebar-w))' }}>
        <Header 
          activeTab={activeTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedDept={selectedDept}
          setSelectedDept={setSelectedDept}
          selectedLocation={selectedLocation}
          setSelectedLocation={setSelectedLocation}
          departments={departments}
          locations={locations}
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onNavigateToExcel={() => setActiveTab('excel')}
          onNavigateToGuides={() => handleNavigateToGuides('general')}
        />

        {/*
          Persistence problems are shown here, above the view and below the header, so
          they stay visible on every tab: a failed write is not a property of the section
          the user happens to be looking at. `tone-warning` supplies the colour through
          the `--tone-*` tokens in index.css - no inline hex, no blocking browser dialog.
        */}
        {notice && (
          <div className="alert tone-warning" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="section-stack" style={{ flex: 1 }}>
              <strong>{noticeTitle}</strong>
              <span>{noticeCopy}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setNotice(null)}
              aria-label="Dismiss this message"
            >
              <X size={14} aria-hidden="true" />
              Dismiss
            </button>
          </div>
        )}

        {/*
          A confirmation that something DID happen, in the same slot as the warnings above.
          It is inline rather than modal because nothing is at stake: the user is not being
          asked to decide anything, and a scrim over their own dashboard to say "saved" would
          cost them their place. It is dismissed explicitly, and it never claims a write
          succeeded - that is the `notice` banner's job, and the two are deliberately kept
          apart so a failed save can never be mistaken for this.
        */}
        {confirmation && (
          <Callout tone="success" onDismiss={() => setConfirmation(null)}>
            {confirmation}
          </Callout>
        )}

        {/* View Switching */}
        {activeTab === 'overview' && (
          <OverviewSection 
            employees={filteredEmployees}
            departments={departments}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'directory' && (
          <DirectorySection 
            employees={filteredEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceSection 
            employees={filteredEmployees}
          />
        )}

        {activeTab === 'payroll' && (
          <PayrollSection 
            employees={filteredEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'performance' && (
          <PerformanceSection 
            employees={filteredEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'recruitment' && (
          <RecruitmentSection 
            requisitions={requisitions}
          />
        )}

        {activeTab === 'retention' && (
          <RetentionSection 
            employees={employees}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsSection 
            tracker={tracker}
          />
        )}

        {activeTab === 'excel' && (
          <ExcelHubSection 
            employees={filteredEmployees}
            onImportEmployees={handleImportEmployees}
            onExportEmployees={handleExportEmployees}
            onExportPayroll={handleExportPayroll}
            onNavigateToGuides={(sec) => handleNavigateToGuides(sec || 'excel')}
          />
        )}

        {activeTab === 'policies' && (
          <PolicySection 
            policies={policies}
            onUpdatePolicy={handleUpdatePolicy}
            onAddPolicy={handleAddPolicy}
            onDeletePolicy={handleDeletePolicy}
            onResetPolicies={handleResetPolicies}
          />
        )}

        {activeTab === 'guides' && (
          <GuidesSection 
            initialGuide={guideInitialSection}
            onNavigateTab={setActiveTab}
          />
        )}
      </main>

      {/* Modals */}
      <EmployeeModal 
        employee={selectedEmployee} 
        onClose={() => setSelectedEmployee(null)} 
      />

      <AddEmployeeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        departments={departments}
        locations={locations}
        onAddEmployee={handleAddEmployee}
        totalEmployeesCount={employees.length}
      />

      {/*
        Asked last, and rendered last, so it stacks above the other modals. The message says
        what is actually lost, which the native prompt it replaced could not: this discards
        every imported and hand-added record, not merely the current view.
      */}
      <ConfirmDialog
        isOpen={isResetRequested}
        title="Reset application to the Master Demo state?"
        message="Every staff record you imported or added will be replaced by the 200-person Master Demo Dataset. This cannot be undone."
        confirmLabel="Reset demo data"
        onConfirm={handleConfirmResetData}
        onCancel={() => setIsResetRequested(false)}
      />
    </div>
  );
};

export default App;
