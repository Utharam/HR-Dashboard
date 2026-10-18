import React, { useEffect, useId, useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import type { Employee, Department } from '../types';
import { toISODate } from '../utils/dates';
import { Dialog } from './Dialog';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  locations: string[];
  onAddEmployee: (emp: Employee) => void;
  totalEmployeesCount: number;
}

// What "an empty form" means. Stated once because the state below is initialised from these
// AND the reset effect puts every field back to them: when the modal was reopened it kept
// the last person's name, designation, salary and phone, so a user adding several people in
// a row silently duplicated the previous one into the register.
const DEFAULT_ROLE = 'Senior Software Engineer';
const DEFAULT_CTC = 150000;
const DEFAULT_DEPARTMENT = 'Engineering & Technology';
const DEFAULT_LOCATION = 'Bengaluru HQ';

/**
 * The picker's options, typed to the roster vocabulary.
 *
 * `<select>` hands back a raw string; a cast would assert a value the parser has never
 * checked. This guard narrows it instead, and anything unrecognised leaves the field
 * empty - which `handleSubmit` already refuses to persist.
 */
const GENDERS: ReadonlyArray<Employee['gender']> = [
  'Female',
  'Male',
  'Non-Binary',
  'Prefer Not to Say',
  'Unknown',
];
const isGender = (value: string): value is Employee['gender'] =>
  (GENDERS as readonly string[]).includes(value);

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  departments,
  locations,
  onAddEmployee,
  totalEmployeesCount
}) => {
  // `useId` rather than a literal, so two of these open at once cannot emit the same
  // `aria-labelledby` and leave both dialogs resolving to the first heading in the document.
  const titleId = useId();

  const [name, setName] = useState('');
  const [department, setDepartment] = useState(departments[0]?.name || DEFAULT_DEPARTMENT);
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [location, setLocation] = useState(locations[0] || DEFAULT_LOCATION);
  // toISODate reads local components, so a hire created between 00:00 and 05:30 IST
  // is stamped with today's date. `new Date().toISOString().slice(0, 10)` would give
  // it yesterday's - wrong on the field that drives tenure and statutory gratuity.
const [doj, setDoj] = useState(() => toISODate(new Date()));
  const [ctc, setCtc] = useState(DEFAULT_CTC);
  // Keyed off Employee['gender'] rather than a hand-written union, so this form cannot
  // drift from the roster vocabulary. A new hire is always on the roster, so the honest
  // default is 'Active' and the picker offers a declined answer rather than forcing one
  // of the three declared values.
  //
  // The picker offering a declined answer is only half of it: this state used to start on
  // 'Female', so every hire saved without touching the select was written to the roster
  // as Female - biasing the very diversity ratio the declined option exists to protect,
  // and no `??` can fix it because 'Female' is a legitimate roster value here. The state
  // therefore starts EMPTY, which is not a roster value at all. `''` cannot be persisted:
  // the select is `required`, and handleSubmit refuses the save as well. Substituting
  // 'Prefer Not to Say' instead would be the same defect wearing a different hat - it
  // records a decline that nobody made.
  const [gender, setGender] = useState<Employee['gender'] | ''>('');
  const [genderError, setGenderError] = useState(false);
  // Empty, not '+91 9876543210'. A realistic-looking number in the VALUE is one the user
  // reads, judges plausible, and submits into the employee register unchanged - a contact
  // detail belonging to nobody, recorded as though it were somebody's. The same number
  // sits in `placeholder`, where it demonstrates the expected format without being data.
  const [phone, setPhone] = useState('');

  // Keyed on the open edge, not on every render: this is the difference between "opening
  // the Add Staff form gives me a blank form" and "opening it gives me the last person I
  // added". The date is re-stamped here too, so a modal left open across midnight offers
  // tomorrow's date of joining rather than the one it was opened on.
  //
  // `departments` and `locations` are listed because they feed the reset. Every caller
  // passes module-level constants, so their identity never changes and the effect does not
  // re-run on an unrelated parent render - but a caller that DID swap them should have the
  // pickers reset to the new options, so the dependency is real rather than suppressed.
  //
  // The setState calls below are the thing this lint rule exists to catch, and here they are
  // the point: the reset is driven by an external edge (the modal opening), not by any event
  // this component handled. Deriving it during render would mean calling nine setters
  // mid-render, and moving it to the trigger button would mean the caller has to remember to
  // clear someone else's state. Keying a remount would be the other clean option and needs
  // the whole form lifted into its own component.
  useEffect(() => {
    if (!isOpen) return;
    // oxlint-disable-next-line react/set-state-in-effect -- see the note above
    setName('');
    setDepartment(departments[0]?.name || DEFAULT_DEPARTMENT);
    setRole(DEFAULT_ROLE);
    setLocation(locations[0] || DEFAULT_LOCATION);
    setDoj(toISODate(new Date()));
    setCtc(DEFAULT_CTC);
    setGender('');
    setGenderError(false);
    setPhone('');
  }, [isOpen, departments, locations]);

  // No `if (!isOpen) return null` here: `Dialog` is the one place that decides whether a
  // modal exists, and it needs to stay mounted so it can see the `false -> true` edge and
  // capture the opener while focus is still on it.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The select is `required`, so the browser blocks an untouched picker first. This
    // guard is the backstop that makes "an empty gender is never persisted" a property
    // of the save path rather than of the browser's validation UI.
    if (gender === '') {
      setGenderError(true);
      return;
    }
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
    <Dialog isOpen={isOpen} onClose={onClose} labelledBy={titleId}>
        <button 
          onClick={onClose}
          aria-label="Close"
          className="modal-close"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)', marginBottom: 'var(--space-5)' }}>
          <UserPlus size={22} className="text-primary" aria-hidden="true" />
          <h2 id={titleId} className="omni-card-title" style={{ fontSize: 'var(--fs-2xl)' }}>Add New Staff Profile</h2>
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
                required
                aria-invalid={genderError}
                value={gender}
                onChange={(e) => {
                  setGenderError(false);
                  setGender(isGender(e.target.value) ? e.target.value : '');
                }}
              >
                <option value="">Select gender...</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-Binary">Non-Binary</option>
                <option value="Prefer Not to Say">Prefer Not to Say</option>
              </select>
              {genderError && (
                <span className="omni-label text-danger-soft" role="alert">
                  Choose a gender, or select "Prefer Not to Say". It is not assumed for you.
                </span>
              )}
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
    </Dialog>
  );
};
