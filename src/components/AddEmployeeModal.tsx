import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import type { Employee, Department } from '../types';
import { toISODate } from '../utils/dates';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  locations: string[];
  onAddEmployee: (emp: Employee) => void;
  totalEmployeesCount: number;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  departments,
  locations,
  onAddEmployee,
  totalEmployeesCount
}) => {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState(departments[0]?.name || 'Engineering & Technology');
  const [role, setRole] = useState('Senior Software Engineer');
  const [location, setLocation] = useState(locations[0] || 'Bengaluru HQ');
  // toISODate reads local components, so a hire created between 00:00 and 05:30 IST
// is stamped with today's date. `new Date().toISOString().slice(0, 10)` would give
// it yesterday's - wrong on the field that drives tenure and statutory gratuity.
const [doj, setDoj] = useState(() => toISODate(new Date()));
  const [ctc, setCtc] = useState(150000);
  // Keyed off Employee['gender'] rather than a hand-written union, so this form cannot
  // drift from the roster vocabulary. A new hire is always on the roster, so the honest
  // default is 'Active' and the picker offers a declined answer rather than forcing one
  // of the three declared values.
  const [gender, setGender] = useState<Employee['gender']>('Female');
  const [phone, setPhone] = useState('+91 9876543210');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `EMP-${1201 + totalEmployeesCount}`;
    const monthlyCTC = Number(ctc);
    const basicSalary = Math.round(monthlyCTC * 0.5);
    const hra = Math.round(basicSalary * 0.5);
    const specialAllowance = monthlyCTC - (basicSalary + hra);

    const newEmp: Employee = {
      id: newId,
      name: name.trim(),
      email: `${name.trim().toLowerCase().replace(/\s+/g, '.')}@omnixhr.io`,
      phone: phone.trim(),
      department,
      deptId: department.toLowerCase().slice(0, 4),
      role: role.trim(),
      location,
      doj,
      monthlyCTC,
      basicSalary,
      hra,
      specialAllowance,
      status: 'Active',
      gender,
      performanceRating: 4,
      reportsTo: null,
      presentDays: 25,
      clBalance: 10,
      slBalance: 10,
      elBalance: 15,
      lopDays: 0,
      uan: `100${Math.floor(100000000 + Math.random() * 900000000)}`
    };

    onAddEmployee(newEmp);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add new staff profile">
        <button 
          onClick={onClose}
          aria-label="Close"
          className="modal-close"
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-5)' }}>
          <UserPlus size={22} className="text-primary" />
          <h2 className="omni-card-title" style={{ fontSize: 'var(--fs-2xl)' }}>Add New Staff Profile</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid--form-2" style={{ gap: '14px', marginBottom: 'var(--space-5)' }}>
            <div className="omni-field">
              <label className="omni-label" htmlFor="add-name">Full Name:</label>
              <input 
                id="add-name"
                type="text" 
                required 
                className="omni-input" 
                placeholder="E.g. Siddharth Verma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-phone">Phone Number:</label>
              <input 
                id="add-phone"
                type="text" 
                className="omni-input" 
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-dept">Department:</label>
              <select 
                id="add-dept"
                className="omni-select" 
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-role">Designation / Title:</label>
              <input 
                id="add-role"
                type="text" 
                required 
                className="omni-input" 
                placeholder="E.g. Senior Backend Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-location">Office Location:</label>
              <select 
                id="add-location"
                className="omni-select" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {locations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-doj">Date of Joining:</label>
              <input 
                id="add-doj"
                type="date" 
                required 
                className="omni-input" 
                value={doj}
                onChange={(e) => setDoj(e.target.value)}
              />
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-ctc">Monthly Gross CTC (₹):</label>
              <input 
                id="add-ctc"
                type="number" 
                required 
                className="omni-input" 
                placeholder="150000"
                value={ctc}
                onChange={(e) => setCtc(Number(e.target.value))}
              />
            </div>

            <div className="omni-field">
              <label className="omni-label" htmlFor="add-gender">Gender:</label>
              <select 
                id="add-gender"
                className="omni-select" 
                value={gender}
                onChange={(e) => setGender(e.target.value as Employee['gender'])}
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-Binary">Non-Binary</option>
                <option value="Prefer Not to Say">Prefer Not to Say</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Staff Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
