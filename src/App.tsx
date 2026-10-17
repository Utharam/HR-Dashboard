import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
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

export const App: React.FC = () => {
  // Local persistence in localStorage
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('omnihr_employees');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_EMPLOYEES;
  });

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

  // Policies persistence in localStorage
  const [policies, setPolicies] = useState<HRPolicy[]>(() => {
    const saved = localStorage.getItem('omnihr_policies');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_POLICIES;
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

  const handleResetPolicies = () => {
    setPolicies(INITIAL_POLICIES);
    localStorage.removeItem('omnihr_policies');
  };

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('omnihr_employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('omnihr_policies', JSON.stringify(policies));
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

  const handleResetData = () => {
    if (confirm('Reset application back to the 200 staff Master Demo state?')) {
      setEmployees(INITIAL_EMPLOYEES);
      localStorage.removeItem('omnihr_employees');
      alert('OmniHR demo data successfully reset.');
    }
  };

  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees(prev => [newEmp, ...prev]);
    alert(`Added ${newEmp.name} (${newEmp.id}) to employee register.`);
  };

  const handleImportEmployees = (newEmps: Employee[]) => {
    setEmployees(newEmps);
    setActiveTab('directory');
  };

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
    </div>
  );
};

export default App;
