import type { Employee } from '../types';
import { INITIAL_DEPARTMENTS } from '../data/initialData';

/**
 * The one export contract for the staff roster.
 *
 * `buildStaffRosterRows` is driven by this list, and the Excel Data Hub's own copy of the
 * column names is read from it, so the writer and the documentation cannot drift apart.
 * `annualCtc` is not stored on `Employee`; it is derived as `monthlyCTC * 12`.
 */
export const STAFF_ROSTER_COLUMNS: ReadonlyArray<{
  header: string;
  field: keyof Employee | 'annualCtc';
}> = [
  { header: 'Employee ID', field: 'id' },
  { header: 'Full Name', field: 'name' },
  { header: 'Work Email', field: 'email' },
  { header: 'Phone', field: 'phone' },
  { header: 'Department', field: 'department' },
  { header: 'Department ID', field: 'deptId' },
  { header: 'Designation / Role', field: 'role' },
  { header: 'Office Location', field: 'location' },
  { header: 'Date of Joining', field: 'doj' },
  { header: 'Monthly CTC', field: 'monthlyCTC' },
  { header: 'Annual CTC (INR)', field: 'annualCtc' },
  { header: 'Monthly Basic Salary', field: 'basicSalary' },
  { header: 'HRA', field: 'hra' },
  { header: 'Special Allowance', field: 'specialAllowance' },
  { header: 'Status', field: 'status' },
  { header: 'Gender', field: 'gender' },
  { header: 'Performance Rating', field: 'performanceRating' },
  { header: 'Reports To', field: 'reportsTo' },
  { header: 'Attendance (Days Present)', field: 'presentDays' },
  { header: 'CL Balance', field: 'clBalance' },
  { header: 'SL Balance', field: 'slBalance' },
  { header: 'EL Balance', field: 'elBalance' },
  { header: 'LOP Days', field: 'lopDays' },
  { header: 'PF UAN', field: 'uan' },
];

/** A cell value accepted by `XLSX.utils.json_to_sheet`. */
export type StaffRosterCell = string | number | Date;

/**
 * Resolves a department name to the canonical id held by `INITIAL_DEPARTMENTS`.
 *
 * The old derivation (`lowercase`, strip non-alphanumerics, take four characters) turned
 * the canonical `eng` into `engi` and `sales` into `sale` on every import, so a
 * department filter keyed on the canonical id silently stopped matching after a sheet was
 * imported. An unknown department still gets a stable, deterministic slug so a custom
 * sheet does not produce blank ids.
 */
export function resolveDeptId(department: string): string {
  const target = department.trim().toLowerCase();
  const canonical = INITIAL_DEPARTMENTS.find(
    (dept) => dept.name.trim().toLowerCase() === target || dept.id.toLowerCase() === target,
  );
  if (canonical) return canonical.id;
  return target.replace(/[^a-z0-9]/g, '').slice(0, 4);
}

/** Turns a `YYYY-MM-DD` roster date into the local calendar Date Excel expects. */
function toExcelDate(isoDate: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function cellValue(employee: Employee, field: keyof Employee | 'annualCtc'): StaffRosterCell {
  if (field === 'annualCtc') return employee.monthlyCTC * 12;
  if (field === 'doj') return toExcelDate(employee.doj);
  if (field === 'reportsTo') return employee.reportsTo ?? '';
  return employee[field];
}

/**
 * Builds the roster rows in `STAFF_ROSTER_COLUMNS` order.
 *
 * A real `Date` for `Date of Joining` is what makes the exported file a date range rather
 * than text: `json_to_sheet` turns it into a numeric date cell with a date number format,
 * which Excel can sort, filter and feed to `DATEDIF`. The previous string date could only
 * be sorted lexically and was invisible to every date function.
 */
export function buildStaffRosterRows(employees: Employee[]): Record<string, StaffRosterCell>[] {
  return employees.map((employee) => {
    const row: Record<string, StaffRosterCell> = {};
    for (const column of STAFF_ROSTER_COLUMNS) {
      row[column.header] = cellValue(employee, column.field);
    }
    return row;
  });
}
