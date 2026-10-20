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
import { buildStaffRosterRows, STAFF_ROSTER_COLUMNS } from './utils/excelSchema';
import { loadPersisted, savePersisted, clearPersisted } from './utils/storage';
import { isEmployeeRow, isPolicyRow } from './utils/rowValidators';

const EMPLOYEES_KEY = 'omnihr_employees';
const POLICIES_KEY = 'omnihr_policies';
/**
 * A one-shot snapshot of the register as it stood immediately before an import.
 *
 * Written through the same versioned envelope as the live key, so it comes back through
 * the same validating loader and a payload that cannot be trusted is refused rather than
 * restored. Cleared the moment it is used, so an old snapshot can never undo a later,
 * deliberate import.
 */
const EMPLOYEES_BACKUP_KEY = 'omnihr_employees_backup';

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

export const App: React.FC<{ onSignOut?: () => void }> = ({ onSignOut }) => {
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

  // Below 760px the sidebar leaves the layout grid and becomes a fixed panel (see the shell
  // breakpoints in index.css). The state lives here, not in the Sidebar, because the
  // control that owns it is in the Header and the scrim that dismisses it is a sibling of
  // both. Escape closes it for the same reason a dialog closes on Escape: leaving is never
  // the same gesture as choosing.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  const handleNavigate = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // The one thing a "nothing matches" page can usefully offer: the way back. Each section
  // that can render an empty state takes this as its single action, so the reset lives here
  // next to the three pieces of state that caused the emptiness.
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedLocation('ALL');
  };

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [guideInitialSection, setGuideInitialSection] = useState<'general' | 'excel'>('general');

  // A destructive action is a QUESTION, and the question is state. It used to be a blocking
  // native prompt that froze the main thread, could not be themed, could not say what was
  // about to be lost, and told a screen-reader user nothing until focus came back.
  const [isResetRequested, setIsResetRequested] = useState(false);
  // Confirmation of something that DID happen, shown inline and dismissible.
  // `undoable` is carried here rather than as a second piece of state so the banner and
  // its Undo button cannot disagree about whether there is anything to undo.
  const [confirmation, setConfirmation] = useState<{ text: string; undoable?: boolean } | null>(null);

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
    // One contract for the writer and the importer: see `utils/excelSchema.ts`. The old
    // inline literal omitted `reportsTo` and `deptId` while emitting the joining date as
    // text, so the file this app produced could not be read back as the register it came
    // from.
    const data = buildStaffRosterRows(filteredEmployees);

    const ws = XLSX.utils.json_to_sheet(data, {
      header: STAFF_ROSTER_COLUMNS.map((column) => column.header),
      dateNF: 'yyyy-mm-dd',
    });
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
    setConfirmation({
      text: 'Demo data reset: the register is back to the 200 staff Master Dataset.',
    });
  };

  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees(prev => [newEmp, ...prev]);
    setConfirmation({
      text: `${newEmp.name} (${newEmp.id}) was added to the employee register.`,
    });
  };

  /**
   * The roster is only replaced once the user has answered the question in
   * `ExcelHubSection`, and the answer arrives as a MODE rather than as an implicit
   * "and you meant destroy everything".
   *
   * The snapshot is written HERE, before `setEmployees`, in the same tick as the caller's
   * click. Waiting for the persistence effect to take one would capture the register
   * AFTER the replacement and make the Undo a no-op that reports success.
   */
  const handleImportEmployees = (
    newEmps: Employee[],
    mode: 'replace' | 'append',
  ) => {
    savePersisted(EMPLOYEES_BACKUP_KEY, employees);
    setEmployees(mode === 'replace' ? newEmps : [...employees, ...newEmps]);
    setActiveTab('directory');
    setConfirmation({
      text:
        mode === 'replace'
          ? `Replaced the register with ${newEmps.length} imported staff records.`
          : `Added ${newEmps.length} imported staff records to the register.`,
      undoable: true,
    });
  };

  /**
   * Puts the register back from the snapshot and destroys the snapshot.
   *
   * An unreadable snapshot is reported as such rather than swallowed. Restoring the
   * current roster and calling it an undo would leave the user believing their data was
   * back when nothing changed, which is the same failure this whole mechanism exists to
   * stop.
   */
  const handleUndoImport = () => {
    const restored = loadPersisted(EMPLOYEES_BACKUP_KEY, isEmployeeRow, employees);
    clearPersisted(EMPLOYEES_BACKUP_KEY);

    if (restored.status !== 'loaded' || restored.rows.length === 0) {
      setConfirmation({
        text:
          'There is nothing left to undo: the pre-import snapshot could not be read back.',
      });
      return;
    }

    setEmployees(restored.rows);
    setConfirmation({
      text: `Undo complete: the register is back to its ${restored.rows.length} pre-import records.`,
    });
  };

  const noticeCopy = notice
    ? notice.kind === 'not-saved'
      ? SAVE_NOTICE_COPY[notice.reason]
      : DISCARDED_NOTICE_COPY[notice.scope]
    : '';
  const noticeTitle = notice?.kind === 'discarded' ? 'Saved data could not be read' : 'Change not saved';

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleNavigate} 
        onExportExcel={handleExportEmployees}
        onResetData={handleResetData}
        isOpen={isSidebarOpen}
        onSignOut={onSignOut}
      />

      {/* Main Content Pane.
          The column sizes itself: `minmax(0, 1fr)` in `.app-shell` plus `min-width: 0`
          here is what lets it shrink below its content, and nothing here sets a width
          against the viewport any more. `100vw` included the scrollbar gutter, so the old
          `calc(100vw - 270px)` clipped a sliver even on a desktop. <main> does not scroll
          either - the document does, which is what makes `Dialog`'s body scroll lock
          actually lock something. */}
      <main className="app-shell__main">
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
          onToggleNav={() => setIsSidebarOpen(open => !open)}
          navOpen={isSidebarOpen}
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
          <Callout
            tone="success"
            onDismiss={() => setConfirmation(null)}
            action={confirmation.undoable ? { label: 'Undo', onClick: handleUndoImport } : undefined}
          >
            {confirmation.text}
          </Callout>
        )}

        {/* View Switching */}
        {activeTab === 'overview' && (
          <OverviewSection
            employees={filteredEmployees}
            departments={departments}
            onSelectEmployee={setSelectedEmployee}
            onClearFilters={handleClearFilters}
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
            departments={departments}
            onClearFilters={handleClearFilters}
          />
        )}

        {/*
          Every section that reads the register reads `filteredEmployees`, this one included.
          It was the one exception, which made its "Clear filters" action a control that
          could not help: the list it empties was never emptied by the filter in the first
          place. Its empty state now has a cause the reader can act on, like every other
          tab's.
        */}
        {activeTab === 'retention' && (
          <RetentionSection
            employees={filteredEmployees}
            onClearFilters={handleClearFilters}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsSection
            tracker={tracker}
            onClearFilters={handleClearFilters}
          />
        )}

        {activeTab === 'excel' && (
          <ExcelHubSection
            employees={filteredEmployees}
            registerSize={employees.length}
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

      {/* Dismissal surface for the off-canvas navigation. Rendered only while the drawer
          is open, and below `--z-sticky` so it cannot cover the panel it is dismissing. It
          is a real button so that closing the drawer is not a pointer-only gesture; the
          header toggle and Escape do the same thing for a keyboard user. */}
      {isSidebarOpen && (
        <button
          type="button"
          className="app-shell__scrim"
          aria-label="Dismiss navigation overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
