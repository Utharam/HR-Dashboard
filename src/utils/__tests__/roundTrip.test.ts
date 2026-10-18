import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildStaffRosterRows } from '../excelSchema';
import { mapExcelRowsToEmployees } from '../excelParser';
import { INITIAL_EMPLOYEES } from '../../data/initialData';

const roundTrip = (employees: typeof INITIAL_EMPLOYEES) => {
  const rows = buildStaffRosterRows(employees);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'array', cellDates: false });
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(back.Sheets.Staff_Roster);
  return mapExcelRowsToEmployees(json).employees;
};

describe('staff roster export round-trip', () => {
  it('preserves every field of every record', () => {
    const out = roundTrip(INITIAL_EMPLOYEES);
    expect(out).toHaveLength(INITIAL_EMPLOYEES.length);
    expect(out).toEqual(INITIAL_EMPLOYEES);
  });

  it('preserves the reporting line', () => {
    const out = roundTrip(INITIAL_EMPLOYEES);
    expect(out.filter(e => e.reportsTo !== null)).toHaveLength(
      INITIAL_EMPLOYEES.filter(e => e.reportsTo !== null).length
    );
  });

  it('preserves the canonical department id', () => {
    const out = roundTrip(INITIAL_EMPLOYEES);
    expect(new Set(out.map(e => e.deptId))).toEqual(new Set(INITIAL_EMPLOYEES.map(e => e.deptId)));
  });

  it('emits the date of joining as an Excel date cell, not text', () => {
    const rows = buildStaffRosterRows(INITIAL_EMPLOYEES.slice(0, 1));
    expect(rows[0]['Date of Joining']).toBeInstanceOf(Date);
  });
});

describe('documented import aliases', () => {
  it('reads every alias the guide advertises instead of falling back to a default', () => {
    const { employees, warnings } = mapExcelRowsToEmployees([{
      'Employee ID': 'EMP-2001',
      'Full Name': 'Asha Menon',
      Department: 'Finance & Operations',
      'Work email': 'asha.menon@omnixhr.io',
      'Employment Status': 'probation',
      Sex: 'F',
      Score: 3,
      'Present Days': 20,
      'Casual Leave Balance': 4,
      'Sick Leave Balance': 5,
      'Earned Leave Balance': 6,
      'Annual Salary': 600000,
      'UAN Number': '123456789012',
    }]);

    const [emp] = employees;
    // `Annual Salary` is the documented BambooHR path. Without it this row landed on the
    // ₹1,20,000 default and warned about a salary the sheet had actually supplied.
    expect(emp.monthlyCTC).toBe(50000);
    expect(emp.email).toBe('asha.menon@omnixhr.io');
    expect(emp.status).toBe('Probation');
    expect(emp.gender).toBe('Female');
    expect(emp.performanceRating).toBe(3);
    expect(emp.presentDays).toBe(20);
    expect(emp.clBalance).toBe(4);
    expect(emp.slBalance).toBe(5);
    expect(emp.elBalance).toBe(6);
    expect(emp.uan).toBe('123456789012');
    expect(emp.deptId).toBe('finance');
    expect(warnings.some((w) => /salary/i.test(w))).toBe(false);
  });
});

