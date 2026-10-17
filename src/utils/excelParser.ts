import * as XLSX from 'xlsx';
import type { Employee } from '../types';
import { parseSpreadsheetDate } from './dates';

export interface ParseResult {
  sheetName: string;
  employees: Employee[];
  totalRows: number;
  recognizedColumns: string[];
  warnings: string[];
}

/**
 * Robust date parser for spreadsheets: JS Date objects, Excel serial numbers
 * and textual dates, resolved timezone-independently by `dates.ts`.
 *
 * Re-exported under its original name so existing importers keep working.
 * It now returns `string | null`: an unreadable cell yields `null` (and a
 * warning at the call site) instead of the old fake `'2023-01-15'` default,
 * which invented a tenure for every row it could not understand.
 */
export { parseSpreadsheetDate as parseExcelDate };

/**
 * Resolves an imported status cell to a real roster state, or `Unknown`.
 *
 * `Unknown` — never `Active`. The previous `return 'Active'` fallback made a billable,
 * attending, PF-contributing employee out of every typo, every unmapped HRMS lifecycle
 * state ("Retired", "On Hold") and every blank cell, silently enlarging the payroll run
 * and the active headcount with no warning anywhere. `Active` is matched exactly, not
 * by substring: `includes('active')` would swallow "Inactive", which is the same defect
 * wearing a different hat. Probation / Notice / Resigned keep their substring matches,
 * which are unambiguous lifecycle keywords ("Probationary", "On Notice", "Exit Interview").
 */
export function normalizeStatus(val: unknown): Employee['status'] {
  if (val === null || val === undefined) return 'Unknown';
  const clean = String(val).trim().toLowerCase();
  if (!clean) return 'Unknown';
  if (clean === 'active') return 'Active';
  if (clean.includes('probation')) return 'Probation';
  if (clean.includes('notice')) return 'Notice Period';
  if (clean.includes('resign') || clean.includes('exit') || clean.includes('terminated')) return 'Resigned';
  return 'Unknown';
}

/**
 * Resolves an imported gender cell to a real roster value, or `Unknown` / `Prefer Not
 * Say` — never `Female`.
 *
 * The previous `return 'Female'` fallback meant an HRMS export that writes `X` for
 * "decline to specify" produced a roster that was silently 100% Female, skewing every
 * diversity figure with no signal that the column was unreadable. A declined answer is
 * its own value (`Prefer Not to Say`) and an unreadable one is `Unknown`; neither belongs
 * in the numerator or the denominator of a diversity ratio.
 */
export function normalizeGender(val: unknown): Employee['gender'] {
  if (val === null || val === undefined) return 'Unknown';
  const clean = String(val).trim().toLowerCase();
  if (!clean) return 'Unknown';
  if (clean === 'f' || clean === 'female') return 'Female';
  if (clean === 'm' || clean === 'male') return 'Male';
  if (
    clean.includes('non-binary') ||
    clean.includes('nonbinary') ||
    clean.includes('non binary') ||
    clean === 'other'
  ) return 'Non-Binary';
  if (
    clean.includes('prefer not to') ||
    clean === 'pnts' ||
    clean.includes('declined to specify') ||
    clean.includes('decline to specify') ||
    clean.includes('not disclosed') ||
    clean.includes('not specified')
  ) return 'Prefer Not to Say';
  return 'Unknown';
}

/**
 * Parses raw JSON rows extracted from an Excel sheet into typed Employee records.
 */
export function mapExcelRowsToEmployees(rows: Record<string, unknown>[]): {
  employees: Employee[];
  recognizedColumns: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const recognizedColSet = new Set<string>();

  const employees: Employee[] = rows.map((row, idx) => {
    // 1. Employee ID
    const rawId = 
      row['Employee ID'] ?? 
      row['Emp ID'] ?? 
      row.EmployeeID ?? 
      row.id ?? 
      row.ID ?? 
      row['Staff ID'];
    if (rawId) recognizedColSet.add('Employee ID');
    const id = String(rawId || `EMP-${1201 + idx}`).trim();

    // 2. Name
    const rawName = 
      row['Full Name'] ?? 
      row['Employee Name'] ?? 
      row.Name ?? 
      row.name ?? 
      row.Employee ?? 
      row['Staff Name'];
    if (rawName) recognizedColSet.add('Name');
    const name = String(rawName || `Staff Member ${idx + 1}`).trim();

    // 3. Department
    const rawDept = 
      row.Department ?? 
      row.department ?? 
      row.Dept ?? 
      row['Dept Name'] ?? 
      row.Division;
    if (rawDept) recognizedColSet.add('Department');
    const department = String(rawDept || 'Engineering & Technology').trim();

    // 4. Role / Designation
    const rawRole = 
      row['Designation / Role'] ?? 
      row.Designation ?? 
      row.Role ?? 
      row.role ?? 
      row.Title ?? 
      row['Job Title'] ?? 
      row.Position;
    if (rawRole) recognizedColSet.add('Role / Designation');
    const role = String(rawRole || 'Software Engineer').trim();

    // 5. Office Location
    const rawLoc = 
      row['Office Location'] ?? 
      row.Location ?? 
      row.location ?? 
      row.Branch ?? 
      row.City ?? 
      row.Office;
    if (rawLoc) recognizedColSet.add('Location');
    const location = String(rawLoc || 'Bengaluru HQ').trim();

    // 6. Date of Joining
    const rawDoj = 
      row.DOJ ?? 
      row['Date of Joining'] ?? 
      row['Joining Date'] ?? 
      row['Hire Date'] ?? 
      row.doj;
    if (rawDoj) recognizedColSet.add('Date of Joining');
    const parsedDoj = parseSpreadsheetDate(rawDoj);
    if (parsedDoj === null && rawDoj != null && String(rawDoj).trim() !== '') {
      warnings.push(
        `Row ${idx + 1} (${name}): Date of Joining "${String(rawDoj).trim()}" could not be read as a date. Left blank — tenure and gratuity will be unavailable.`
      );
    }
    const doj = parsedDoj ?? '';

    // 7. Monthly CTC & Annual CTC
    let monthlyCTC = 120000;
    const rawMonthlyCTC = 
      row['Monthly CTC'] ?? 
      row.MonthlyCTC ?? 
      row['Monthly Gross CTC'] ?? 
      row.CTC ?? 
      row.salary ?? 
      row['Gross Salary'];
    const rawAnnualCTC = 
      row['Annual CTC (INR)'] ?? 
      row['Annual CTC'] ?? 
      row.AnnualCTC ?? 
      row['Yearly CTC'] ?? 
      row.package;

    if (rawMonthlyCTC != null && !isNaN(Number(rawMonthlyCTC)) && Number(rawMonthlyCTC) > 0) {
      monthlyCTC = Math.round(Number(rawMonthlyCTC));
      recognizedColSet.add('Monthly CTC');
    } else if (rawAnnualCTC != null && !isNaN(Number(rawAnnualCTC)) && Number(rawAnnualCTC) > 0) {
      monthlyCTC = Math.round(Number(rawAnnualCTC) / 12);
      recognizedColSet.add('Annual CTC');
    } else {
      warnings.push(`Row ${idx + 1} (${name}): Salary missing or invalid. Defaulted to ₹1,20,000/mo.`);
    }

    // 8. Basic Salary (Standard 50% CTC)
    const rawBasic = 
      row['Monthly Basic Salary'] ?? 
      row['Basic Salary'] ?? 
      row.BasicSalary ?? 
      row.Basic ?? 
      row.basic;
    let basicSalary = Math.round(monthlyCTC * 0.5);
    if (rawBasic != null && !isNaN(Number(rawBasic)) && Number(rawBasic) > 0) {
      basicSalary = Math.round(Number(rawBasic));
      recognizedColSet.add('Basic Salary');
    }

    // 9. HRA (Standard 25% CTC / 50% Basic)
    const rawHra = row.HRA ?? row['House Rent Allowance'] ?? row.hra;
    let hra = Math.round(basicSalary * 0.5);
    if (rawHra != null && !isNaN(Number(rawHra)) && Number(rawHra) >= 0) {
      hra = Math.round(Number(rawHra));
      recognizedColSet.add('HRA');
    }

    // 10. Special Allowance (Difference)
    const rawSpecial = row['Special Allowance'] ?? row.SpecialAllowance ?? row.specialAllowance;
    let specialAllowance = Math.max(0, monthlyCTC - (basicSalary + hra));
    if (rawSpecial != null && !isNaN(Number(rawSpecial)) && Number(rawSpecial) >= 0) {
      specialAllowance = Math.round(Number(rawSpecial));
      recognizedColSet.add('Special Allowance');
    }

    // 11. Status & Gender
    const status = normalizeStatus(row.Status ?? row.status);
    const gender = normalizeGender(row.Gender ?? row.gender);
    if (row.Status || row.status) recognizedColSet.add('Status');
    if (row.Gender || row.gender) recognizedColSet.add('Gender');

    // 12. Attendance
    const rawPresent = 
      row['Attendance (Days Present)'] ?? 
      row['Attendance Days'] ?? 
      row.PresentDays ?? 
      row.presentDays ?? 
      row.Attendance;
    let presentDays = 25;
    if (rawPresent != null && !isNaN(Number(rawPresent))) {
      presentDays = Math.min(26, Math.max(0, Number(rawPresent)));
      recognizedColSet.add('Attendance Days');
    }

    // 13. Leave balances
    const clBalance = Number(row['CL Balance'] ?? row.clBalance ?? 8);
    const slBalance = Number(row['SL Balance'] ?? row.slBalance ?? 8);
    const elBalance = Number(row['EL Balance'] ?? row.elBalance ?? 12);
    if (row['CL Balance'] || row.clBalance) recognizedColSet.add('CL Balance');
    if (row['SL Balance'] || row.slBalance) recognizedColSet.add('SL Balance');
    if (row['EL Balance'] || row.elBalance) recognizedColSet.add('EL Balance');

    // 14. LOP Days
    const rawLop = row['LOP Days'] ?? row.lopDays;
    let lopDays = Math.max(0, 26 - presentDays - 1);
    if (rawLop != null && !isNaN(Number(rawLop))) {
      lopDays = Math.max(0, Number(rawLop));
      recognizedColSet.add('LOP Days');
    }

    // 15. Performance Rating (1 to 5)
    const rawRating = row['Performance Rating'] ?? row.Rating ?? row.performanceRating ?? row.rating;
    let performanceRating = 4;
    if (rawRating != null && !isNaN(Number(rawRating))) {
      performanceRating = Math.min(5, Math.max(1, Math.round(Number(rawRating))));
      recognizedColSet.add('Performance Rating');
    }

    // 16. Work Email & Phone
    const email = String(
      row['Work Email'] ?? 
      row.Email ?? 
      row.email ?? 
      `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@omnixhr.io`
    ).trim();
    if (row['Work Email'] || row.Email || row.email) recognizedColSet.add('Work Email');

    const phone = String(row.Phone ?? row['Phone Number'] ?? row.Mobile ?? row.Contact ?? '+91 9876543210').trim();
    if (row.Phone || row['Phone Number'] || row.Mobile) recognizedColSet.add('Phone');

    // 17. PF UAN
    const uan = String(row['PF UAN'] ?? row.UAN ?? row.uan ?? '100123456789').trim();
    if (row['PF UAN'] || row.UAN || row.uan) recognizedColSet.add('PF UAN');

    return {
      id,
      name,
      email,
      phone,
      department,
      deptId: department.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4),
      role,
      location,
      doj,
      monthlyCTC,
      basicSalary,
      hra,
      specialAllowance,
      status,
      gender,
      performanceRating,
      reportsTo: null,
      presentDays,
      clBalance,
      slBalance,
      elBalance,
      lopDays,
      uan
    };
  });

  return {
    employees,
    recognizedColumns: Array.from(recognizedColSet),
    warnings: warnings.slice(0, 5) // Cap warnings display to avoid clutter
  };
}

/**
 * Reads and parses an Excel file buffer into structured Employee data.
 */
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook contains no sheets.');
  }

  const sheet = wb.Sheets[sheetName];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

  if (!json || json.length === 0) {
    throw new Error(`Sheet '${sheetName}' contains no data rows.`);
  }

  const { employees, recognizedColumns, warnings } = mapExcelRowsToEmployees(json);

  return {
    sheetName,
    employees,
    totalRows: employees.length,
    recognizedColumns,
    warnings
  };
}
