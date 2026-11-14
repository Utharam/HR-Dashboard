import * as XLSX from 'xlsx';
import type { Employee } from '../types';
import { parseSpreadsheetDate } from './dates';
import { resolveDeptId } from './excelSchema';

export interface ParseResult {
  sheetName: string;
  employees: Employee[];
  totalRows: number;
  recognizedColumns: string[];
  warnings: string[];
}

/**
 * Largest sheet this app will import.
 *
 * At roughly 494 bytes per employee against a 5 MB origin budget, a browser runs out of
 * storage at about 9,300 rows. Capping the import well below that means the roster can
 * always be written down; a sheet that cannot be saved is a sheet whose work is lost on
 * the next refresh.
 */
export const MAX_IMPORT_ROWS = 5000;

/**
 * A sheet must supply at least this many recognised OmniHR fields before it is treated
 * as a staff roster.
 *
 * One is not enough: a payroll register (which this app itself exports) carries
 * `Employee ID` and nothing else OmniHR recognises, and mapping it produced staff named
 * "Staff Member 1" with a fabricated CTC, UAN and date of joining.
 */
const MIN_RECOGNIZED_COLUMNS = 2;

/**
 * Rows inspected when deciding whether a sheet looks like a roster at all.
 *
 * Recognition is delegated to the mapper itself rather than to a second copy of the
 * alias tables, because a second list of "which headers do we know" is a list that will
 * drift. Sampling keeps that cheap and also makes the verdict stable: a sheet whose
 * first rows are blank-ish cannot be talked into looking like a roster.
 */
const RECOGNITION_SAMPLE_ROWS = 50;

/** Never show more than this many warning lines, including the overflow count. */
const MAX_WARNINGS = 5;

/**
 * Headers that only ever appear in the payroll register this app exports.
 *
 * `Net Salary Payable` is the anchor: it is a statement of money payable, not a record
 * of a person. At least one companion header is required so a user sheet that happens to
 * carry a single identically-named column is not rejected.
 */
const PAYROLL_REGISTER_HEADERS = [
  'Net Salary Payable',
  'Total Deductions',
  'Gross Earnings',
  'Bonus',
  'Basic (50%)',
  'Basic',
  'HRA (25%)',
  'HRA',
  'Special Allowance (25%)',
  'Special Allowance',
  'EPF (12% @ \u20b915k cap)',
  'Professional Tax',
  'Loss of Pay (LOP)',
  'Monthly Gross CTC',
];

export type ExcelErrorCode =
  | 'UNREADABLE_FILE'
  | 'NO_SHEET'
  | 'NO_MATCHING_COLUMNS'
  | 'NO_DATA_ROWS'
  | 'TOO_MANY_ROWS'
  | 'UNSUPPORTED_FILE';

/**
 * Every rejection a user can see, with something they can act on.
 *
 * `message` is the same sentence as `hint` on purpose: this error used to be a bare
 * `new Error('...')`, and the UI rendered `err.message` directly, which is how SheetJS
 * text like "Invalid HTML: could not find <table>" reached the screen. `code` is what the
 * UI switches on, so an unmapped failure can be reported in the app's own words instead
 * of the library's.
 */
export class ExcelImportError extends Error {
  readonly code: ExcelErrorCode;
  readonly hint: string;

  constructor(code: ExcelErrorCode, hint: string) {
    super(hint);
    this.name = 'ExcelImportError';
    this.code = code;
    this.hint = hint;
  }
}

/** Unicode spaces that survive a copy-paste out of Excel and defeat `trim()`. */
const EXOTIC_SPACES = /[\u00A0\u2007\u202F\u2009]/g;

/**
 * What a warning is about, so a truncated list can say what it is hiding.
 *
 * `enum`  - a Status or Gender value that could not be resolved. There is no UI to
 *           repair either after an import, and each one changes a payroll total.
 * `row`   - a salary, date or attendance value that was defaulted for one row.
 */
type WarningKind = 'enum' | 'row';
type Warning = { kind: WarningKind; text: string };

/**
 * Reads a money cell, or `null` if it is not one.
 *
 * Handles what Indian payroll exports actually contain: a rupee sign, an `Rs.` prefix,
 * Indian or Western digit grouping, non-breaking spaces, wrapping quotes from a CSV
 * round-trip, a trailing `/-`, and bracketed negatives for accounting-style credit
 * memos.
 *
 * `null` - never a zero, never a default. A caller that receives a number has a number
 * someone typed; a caller that receives `null` knows to warn or to ask.
 */
export function parseCurrencyCell(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string') return null;

  // Wrapping quotes survive `"185,000.00"` from a CSV written as one field.
  let text = val.replace(EXOTIC_SPACES, ' ').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!text) return null;

  // Accounting negatives: (1,200) means -1200.
  let negative = false;
  const bracketed = /^\((.*)\)$/.exec(text);
  if (bracketed) {
    negative = true;
    text = bracketed[1].trim();
  }

  text = text
    .replace(/\u20b9/g, '')                                   // ₹
    .replace(/\b(?:rs|inr)\.?\s*/gi, '')                      // Rs. / Rs / INR
    .replace(/[,\s]/g, '')                                   // grouping and spaces
    .replace(/\/-\s*$/, '')                                  // Indian "nothing" suffix
    .trim();

  if (!text) return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/**
 * The single coercion helper: read a cell as a number inside a range, or fall back.
 *
 * Junk and out-of-range values resolve to the documented fallback or to the nearest
 * bound. A genuine zero is a value, not an absence, and is returned as-is - `0` LOP days
 * and a `0` leave balance are what the sheet said.
 */
export function toFiniteNumber(
  val: unknown,
  opts: { min: number; max: number; fallback: number },
): number {
  const parsed = parseCurrencyCell(val);
  if (parsed === null) return opts.fallback;
  if (parsed < opts.min) return opts.min;
  if (parsed > opts.max) return opts.max;
  return parsed;
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
  // Per-row warnings are kept apart from the enum warnings so a 200-row unreadable
  // column cannot push the enum failures out of the display cap, and so the cap can
  // report how many rows it is not showing. The `kind` tag is what lets the overflow
  // note say WHICH warnings it is hiding.
  const unresolvedEnumWarnings: Warning[] = [];
  const statutoryWarnings: Warning[] = [];
  const rowWarnings: Warning[] = [];
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

    // The canonical id is exported alongside the name, so a roster this app wrote comes
    // back with the id it left with. The fallback resolves the name against
    // `INITIAL_DEPARTMENTS`; re-deriving it from the name is what turned `eng` into `engi`
    // and broke every department filter after an import.
    const rawDeptId =
      row['Department ID'] ??
      row['Dept ID'] ??
      row.deptId;
    if (rawDeptId) recognizedColSet.add('Department ID');
    const deptId =
      rawDeptId == null || String(rawDeptId).trim() === ''
        ? resolveDeptId(department)
        : String(rawDeptId).trim();

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
      rowWarnings.push({
        kind: 'row',
        text: `Row ${idx + 1} (${name}): Date of Joining "${String(rawDoj).trim()}" could not be read as a date. Left blank — tenure and gratuity will be unavailable.`,
      });
    }
    const doj = parsedDoj ?? '';

    // 7. Monthly CTC & Annual CTC
    //
    // A salary that cannot be read becomes the documented ₹1,20,000 default, and the
    // warning names the row AND the raw value that failed. A silent default is a
    // fabricated salary that looks like data in every payslip derived from it.
    const DEFAULT_MONTHLY_CTC = 120000;
    const MAX_MONTHLY_CTC = 10000000; // ₹1 crore a month: past this it is a typing error
    let monthlyCTC = DEFAULT_MONTHLY_CTC;
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
      row.package ??
      row['Annual Salary'];

    const readMonthlyCTC = parseCurrencyCell(rawMonthlyCTC);
    const readAnnualCTC = parseCurrencyCell(rawAnnualCTC);

    if (readMonthlyCTC !== null && readMonthlyCTC >= 0 && readMonthlyCTC <= MAX_MONTHLY_CTC) {
      monthlyCTC = Math.round(readMonthlyCTC);
      recognizedColSet.add('Monthly CTC');
    } else if (readAnnualCTC !== null && readAnnualCTC > 0) {
      monthlyCTC = Math.round(readAnnualCTC / 12);
      recognizedColSet.add('Annual CTC');
    } else {
      const offending = rawMonthlyCTC ?? rawAnnualCTC;
      const shownValue = offending == null ? '' : String(offending).trim();
      rowWarnings.push({
        kind: 'row',
        text: shownValue
          ? `Row ${idx + 1} (${name}): salary "${shownValue}" could not be read as an amount. Defaulted to ₹1,20,000/mo.`
          : `Row ${idx + 1} (${name}): no salary column found in the sheet. Defaulted to ₹1,20,000/mo.`,
      });
    }

    // A genuine zero is kept (parseCurrencyCell is right to read it as an amount), but
    // it still needs saying: the payslip is floored at ₹0 and the row adds nothing to
    // the disbursable total, which is a payroll question someone has to answer.
    if (readMonthlyCTC === 0) {
      rowWarnings.push({
        kind: 'row',
        text: `Row ${idx + 1} (${name}): salary is ₹0/mo in the sheet. The payslip is floored at ₹0; correct the figure if that is not intended.`,
      });
    }

    // 8. Basic Salary (Standard 50% CTC)
    const rawBasic = 
      row['Monthly Basic Salary'] ?? 
      row['Basic Salary'] ?? 
      row.BasicSalary ?? 
      row.Basic ?? 
      row.basic;
    // Every numeric field below goes through `toFiniteNumber`, so "—" and "N/A" resolve
    // to the documented default instead of NaN, an out-of-range figure is clamped, and a
    // genuine zero survives. The old code mixed three strategies - `Number(x)` with an
    // `isNaN` guard, `Number(x ?? default)`, and a `> 0` positivity test - and all three
    // fail differently on the same cell.
    const basicSalary = Math.round(
      toFiniteNumber(rawBasic, { min: 0, max: monthlyCTC, fallback: monthlyCTC * 0.5 }),
    );
    if (parseCurrencyCell(rawBasic) !== null) recognizedColSet.add('Basic Salary');

    // 9. HRA (Standard 25% CTC / 50% Basic)
    const rawHra = row.HRA ?? row['House Rent Allowance'] ?? row.hra;
    const hra = Math.round(
      toFiniteNumber(rawHra, { min: 0, max: monthlyCTC, fallback: basicSalary * 0.5 }),
    );
    if (parseCurrencyCell(rawHra) !== null) recognizedColSet.add('HRA');

    // 10. Special Allowance (Difference)
    const rawSpecial = row['Special Allowance'] ?? row.SpecialAllowance ?? row.specialAllowance;
    const specialAllowance = Math.round(
      toFiniteNumber(rawSpecial, {
        min: 0,
        max: monthlyCTC,
        fallback: Math.max(0, monthlyCTC - (basicSalary + hra)),
      }),
    );
    if (parseCurrencyCell(rawSpecial) !== null) recognizedColSet.add('Special Allowance');

    // 11. Status & Gender
    //
    // `Employment Status` and `Sex` are the names Workday and BambooHR use; the guides
    // have always advertised them, but only `Status` and `Gender` were read, so a real
    // export landed every row on Unknown and dropped the roster out of the payroll run.
    const rawStatus = row.Status ?? row.status ?? row['Employment Status'];
    const rawGender = row.Gender ?? row.gender ?? row.Sex;
    const status = normalizeStatus(rawStatus);
    const gender = normalizeGender(rawGender);
    if (rawStatus != null && String(rawStatus).trim() !== '') recognizedColSet.add('Status');
    if (rawGender != null && String(rawGender).trim() !== '') recognizedColSet.add('Gender');

    // An unresolved enum is stored faithfully and fails closed, but silently is not
    // enough: `isActive` excludes Unknown from the payroll run, so an import whose
    // Status column is missing drops the whole roster out of every payroll aggregate
    // with no indication of why. There is also no UI to repair a status after import —
    // AddEmployeeModal only creates and DirectorySection only reads — so the import is
    // the only place this can be surfaced. Collected separately from `rowWarnings` so the
    // display cap below cannot starve them behind per-row salary and date messages.
    if (status === 'Unknown') {
      unresolvedEnumWarnings.push({
        kind: 'enum',
        text:
          String(rawStatus ?? '').trim() === ''
            ? `Row ${idx + 1} (${name}): no Status value found in the sheet. Recorded as Unknown and excluded from the payroll run until the status is corrected.`
            : `Row ${idx + 1} (${name}): Status "${String(rawStatus).trim()}" was not recognised; recorded as Unknown and excluded from the payroll run.`,
      });
    }
    if (gender === 'Unknown') {
      unresolvedEnumWarnings.push({
        kind: 'enum',
        text:
          String(rawGender ?? '').trim() === ''
            ? `Row ${idx + 1} (${name}): no Gender value found in the sheet. Recorded as Unknown and excluded from gender-ratio reporting.`
            : `Row ${idx + 1} (${name}): Gender "${String(rawGender).trim()}" was not recognised; recorded as Unknown and excluded from gender-ratio reporting.`,
      });
    }

    // 12. Attendance
    const rawPresent = 
      row['Attendance (Days Present)'] ?? 
      row['Attendance Days'] ?? 
      row['Present Days'] ??
      row.PresentDays ?? 
      row.presentDays ?? 
      row.Attendance;
    // A blank cell is not "zero days present". `Number('')` is 0, not NaN, so the old
    // guard let an empty column mark a whole month absent for everyone.
    const presentDays = toFiniteNumber(rawPresent, { min: 0, max: 26, fallback: 25 });
    if (parseCurrencyCell(rawPresent) !== null) recognizedColSet.add('Attendance Days');

    // 13. Leave balances
    // These were three unguarded `Number(row['CL Balance'] ?? 8)` calls: "—" and "N/A"
    // became NaN, and a NaN balance renders as "NaN" in every leave figure downstream.
    const rawCl = row['CL Balance'] ?? row['Casual Leave Balance'] ?? row.clBalance;
    const rawSl = row['SL Balance'] ?? row['Sick Leave Balance'] ?? row.slBalance;
    const rawEl =
      row['EL Balance'] ??
      row['Earned Leave Balance'] ??
      row['Privilege Leave Balance'] ??
      row.elBalance;
    const clBalance = toFiniteNumber(rawCl, { min: 0, max: 60, fallback: 8 });
    const slBalance = toFiniteNumber(rawSl, { min: 0, max: 60, fallback: 8 });
    const elBalance = toFiniteNumber(rawEl, { min: 0, max: 60, fallback: 12 });
    if (parseCurrencyCell(rawCl) !== null) recognizedColSet.add('CL Balance');
    if (parseCurrencyCell(rawSl) !== null) recognizedColSet.add('SL Balance');
    if (parseCurrencyCell(rawEl) !== null) recognizedColSet.add('EL Balance');

    // 14. LOP Days
    const rawLop = row['LOP Days'] ?? row['Loss of Pay Days'] ?? row.lopDays;
    const lopDays = toFiniteNumber(rawLop, {
      min: 0,
      max: 26,
      fallback: Math.max(0, 26 - presentDays - 1),
    });
    if (parseCurrencyCell(rawLop) !== null) recognizedColSet.add('LOP Days');

    // 15. Performance Rating (1 to 5)
    const rawRating =
      row['Performance Rating'] ??
      row.Rating ??
      row.performanceRating ??
      row.rating ??
      row.Score;
    const performanceRating = Math.round(
      toFiniteNumber(rawRating, { min: 1, max: 5, fallback: 4 }),
    );
    if (parseCurrencyCell(rawRating) !== null) recognizedColSet.add('Performance Rating');

    // 16. Work Email & Phone
    const email = String(
      row['Work Email'] ?? 
      row['Work email'] ??
      row.Email ?? 
      row.email ?? 
      `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@omnixhr.io`
    ).trim();
    if (row['Work Email'] || row['Work email'] || row.Email || row.email) recognizedColSet.add('Work Email');

    const phone = String(row.Phone ?? row['Phone Number'] ?? row.Mobile ?? row.Contact ?? '+91 9876543210').trim();
    const hasPhoneColumn = Boolean(row.Phone || row['Phone Number'] || row.Mobile || row.Contact);
    if (hasPhoneColumn) {
      recognizedColSet.add('Phone');
    } else {
      rowWarnings.push({
        kind: 'row',
        text: `Row ${idx + 1} (${name}): no Phone column found in the sheet. Recorded the placeholder +91 9876543210; replace it before using it to contact staff.`,
      });
    }

    // 17. PF UAN
    const hasUanColumn = Boolean(row['PF UAN'] || row.UAN || row['UAN Number'] || row.uan);
    const uan = String(
      row['PF UAN'] ?? row.UAN ?? row['UAN Number'] ?? row.uan ?? '100123456789',
    ).trim();
    if (hasUanColumn) {
      recognizedColSet.add('PF UAN');
    } else {
      // This one reaches a statutory form. A two-column sheet otherwise imports a whole
      // roster carrying the same invented EPFO number, silently. Kept in its own list so
      // the display cap cannot hide it behind a salary or phone message.
      statutoryWarnings.push({
        kind: 'row',
        text: `Row ${idx + 1} (${name}): no PF UAN column found in the sheet. Recorded the placeholder 100123456789; replace it before filing any EPF return.`,
      });
    }

    // 18. Reporting line
    //
    // This was hardcoded to `null`, so one export/import cycle erased the org chart.
    // An empty cell is an absent reporting line, not a manager called "".
    const rawReportsTo = row['Reports To'] ?? row['Reporting Manager'] ?? null;
    const reportsTo =
      rawReportsTo == null || String(rawReportsTo).trim() === ''
        ? null
        : String(rawReportsTo).trim();
    if (rawReportsTo) recognizedColSet.add('Reports To');

    return {
      id,
      name,
      email,
      phone,
      department,
      deptId,
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
      reportsTo,
      presentDays,
      clBalance,
      slBalance,
      elBalance,
      lopDays,
      uan
    };
  });

  // Unresolved Status / Gender rows lead the list: they are the failures with no route
  // out of the app, and every one of them changes what the Payroll tab totals. The
  // fabricated-PF-UAN warning sits next because it is the per-row message that reaches a
  // statutory form; salary, date, attendance and phone follow. The cap is the pre-existing
  // 5-line display limit, and the last line always states how many are hidden - a truncated
  // list must not read as "that was all of them".
  //
  // The overflow line is computed over the COMBINED list, and assembled before it is
  // sliced. The previous version appended row warnings after the overflow note and then
  // sliced the whole thing to 5, so on a sheet that produced both kinds the note filled
  // the cap and every per-row salary and date warning was dropped without a word.
  const ordered: Warning[] = [...unresolvedEnumWarnings, ...statutoryWarnings, ...rowWarnings];
  const shown = ordered.slice(0, MAX_WARNINGS - 1);
  const hidden = ordered.slice(MAX_WARNINGS - 1);
  const hiddenEnums = hidden.filter((w) => w.kind === 'enum').length;
  const hiddenRows = hidden.length - hiddenEnums;

  const overflowNote =
    hidden.length === 0
      ? []
      : [
          `+ ${hidden.length} more row(s) in this sheet had a value that could not be read` +
            ` (${hiddenEnums > 0 ? `${hiddenEnums} Status or Gender, ` : ''}` +
            `${hiddenRows > 0 ? `${hiddenRows} salary, date, attendance or identity` : ''}` +
            `); each was recorded as Unknown or defaulted rather than guessed.`,
        ];

  return {
    employees,
    recognizedColumns: Array.from(recognizedColSet),
    warnings: [...shown.map((w) => w.text), ...overflowNote],
  };
}

/** Header names present in the first few data rows. */
function headerNames(rows: Record<string, unknown>[]): Set<string> {
  const headers = new Set<string>();
  for (const row of rows.slice(0, 3)) {
    for (const key of Object.keys(row)) headers.add(key.trim());
  }
  return headers;
}

/**
 * True when the sheet is a payroll register rather than a staff roster.
 *
 * Checked BEFORE the recognised-column count. A payroll register carries `Employee ID`
 * and one or two other headers OmniHR recognises, so a "fewer than two recognised
 * columns" gate would fire first and tell a user who re-uploaded a file this app just
 * exported to them that their file was not a roster at all - which is both wrong and
 * useless advice.
 */
function looksLikePayrollRegister(headers: Set<string>): boolean {
  if (!headers.has('Net Salary Payable')) return false;
  return PAYROLL_REGISTER_HEADERS.some((header) => header !== 'Net Salary Payable' && headers.has(header));
}

/**
 * How many OmniHR fields this sheet supplies, judged by the mapper itself.
 *
 * Delegating to `mapExcelRowsToEmployees` keeps one list of known headers: a second
 * "which columns do we recognise" table would drift from the first, and the drift would
 * show up as a legitimate roster being rejected. Only a sample is mapped, because the
 * answer is a property of the sheet, not of one row - and the sample skips rows with no
 * values at all, so a few spacer rows above the real header block cannot make a genuine
 * roster look unrecognised.
 */
function recognizedColumnCount(rows: Record<string, unknown>[]): number {
  const sample = rows.filter(hasAnyValue).slice(0, RECOGNITION_SAMPLE_ROWS);
  return mapExcelRowsToEmployees(sample).recognizedColumns.length;
}

/**
 * True when at least one cell in the row holds something other than whitespace.
 *
 * Used for DATA rows only, and only after the readable-header gate has established that
 * the sheet has a header at all. The header-only sheet a user gets by typing column names
 * and saving is not an empty sheet: `json_to_sheet` writes the empty strings and
 * `sheet_to_json` hands back one row of them, so without this check the parser mapped it
 * to an employee called "Staff Member 1".
 *
 * Identity is deliberately not part of the test. It sits AFTER this one on purpose - see
 * the ordering note in `parseExcelBuffer` - because a row of empty strings under real
 * headings recognises no column, and asking about columns first would answer "this is not
 * a roster" about a template somebody has simply not filled in yet.
 */
function hasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

/**
 * A letter or a digit: the minimum a cell must contain to be text a person wrote.
 *
 * `trim()` is not enough here. Measured on this project's xlsx: nine garbage bytes are
 * decoded into a single cell of `\u0000`..`\u0008`, and ECMAScript whitespace does not
 * include those, so a `trim() !== ''` test reads binary noise as a column heading and
 * sends the user off to fix a file that has no headings in it.
 */
const READABLE_TEXT = /[\p{L}\p{N}]/u;

/**
 * True when the sheet's first row holds at least one piece of readable text.
 *
 * `sheet_to_json` with `header: 1` returns rows as arrays and does not consume the first
 * row as keys, which is the only way to see the heading of a sheet that has headings and
 * no data rows - `sheet_to_json` in object mode returns `[]` for both "template, unfilled"
 * and "no content whatsoever", which are opposite problems.
 *
 * `defval` is set so a populated-but-empty trailing cell still yields its column.
 */
function hasReadableHeaderRow(sheet: XLSX.WorkSheet): boolean {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];
  const firstRow = matrix[0];
  if (!Array.isArray(firstRow)) return false;
  return firstRow.some((cell) => READABLE_TEXT.test(String(cell ?? '')));
}

/**
 * Reads and parses an Excel file buffer into structured Employee data.
 *
 * Every rejection is an `ExcelImportError` with a code the UI can switch on and a hint
 * the user can act on. Raw library messages never escape: SheetJS raises text like
 * "Invalid HTML: could not find <table>" for a file that is not a workbook, and that
 * was previously rendered verbatim in the import panel.
 */
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { cellDates: true });
  } catch {
    throw new ExcelImportError(
      'UNREADABLE_FILE',
      'That file could not be opened as an Excel workbook. If it is a CSV, open it in Excel and save it as .xlsx first, then upload that.',
    );
  }

  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheetName || !sheet) {
    throw new ExcelImportError(
      'NO_SHEET',
      'That workbook contains no sheets, so there is nothing to read. Re-export it from your HR system and try again.',
    );
  }

  const parsed = XLSX.utils.sheet_to_json(sheet);
  const rows: Record<string, unknown>[] = Array.isArray(parsed)
    ? (parsed as Record<string, unknown>[])
    : [];

  // 1. File identity, before anything is interpreted. A payroll register is a document
  //    ABOUT staff, not a roster OF staff: importing it fabricated employees and told the
  //    user their import had succeeded.
  if (looksLikePayrollRegister(headerNames(rows))) {
    throw new ExcelImportError(
      'UNSUPPORTED_FILE',
      'This is a payroll register - a statement of salaries payable, not a staff roster. Import the Staff Roster instead; the register cannot tell OmniHR who works here, what they do, or whether they are still employed.',
    );
  }

  // 2. Size, before mapping: a 5,001-row sheet is rejected on its row count rather than
  //    after building 5,001 objects the browser will not be able to save.
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ExcelImportError(
      'TOO_MANY_ROWS',
      `That sheet has ${rows.length.toLocaleString('en-IN')} rows and this app imports at most ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} per file. Split it into separate files, or import only the current financial year.`,
    );
  }

  // 3. Is there a sheet here at all? `XLSX.read` does NOT throw for every unreadable file.
  //    Measured on the xlsx this project ships, against the same inputs:
  //
  //      0-byte buffer      -> OK, phantom one-cell "Sheet1", 0 rows
  //      9 garbage bytes    -> OK, phantom one-cell "Sheet1", 0 rows
  //      renamed .txt/.pdf  -> OK, one row of text
  //      truncated ZIP      -> THREW "Unsupported ZIP file"
  //      HTML               -> THREW "Invalid HTML: could not find <table>"
  //
  //    So the catch above only covers HTML-sniffed input and broken archives. Everything
  //    else arrives as an empty sheet and used to fall through to NO_DATA_ROWS, which told
  //    the user their file "has column headings" - untrue of a file with no content - and
  //    to fill in a row that had nowhere to go.
  //
  //    Only reachable when there are no data rows: if `rows` is non-empty, SheetJS already
  //    found a heading line to use as keys, so this cannot fail.
  if (rows.length === 0 && !hasReadableHeaderRow(sheet)) {
    throw new ExcelImportError(
      'UNREADABLE_FILE',
      'No readable spreadsheet content was found in that file. It may be empty, damaged, or not an Excel workbook at all - if it is a CSV, open it in Excel and save it as .xlsx first, then upload that.',
    );
  }

  // 4. A readable sheet with nothing in it.
  //
  //    Order matters here, and it is the reverse of the obvious one. This gate runs BEFORE
  //    the recognised-column count because recognition follows the VALUES under the
  //    headings: a sheet whose cells are all empty strings recognises no column either, so
  //    asking about columns first would answer "this is not a roster" about a template
  //    somebody has simply not filled in yet.
  //
  //    The hint no longer asserts that headings are present. It has to cover both the
  //    unfilled template and a sheet whose single row is whitespace, and claiming a
  //    heading the user cannot see is the kind of statement this batch exists to remove.
  if (!rows.some(hasAnyValue)) {
    throw new ExcelImportError(
      'NO_DATA_ROWS',
      'No staff rows were found in that sheet. If this is the OmniHR template, add at least one employee below the headings and upload it again.',
    );
  }

  // 5. Does this sheet know anything about people? A vendor invoice recognises no OmniHR
  //    column at all, and used to be mapped into employees named "Staff Member 1" with a
  //    made-up CTC, UAN and date of joining.
  if (recognizedColumnCount(rows) < MIN_RECOGNIZED_COLUMNS) {
    throw new ExcelImportError(
      'NO_MATCHING_COLUMNS',
      'No OmniHR columns were recognised in that sheet. Download the Staff Roster template and copy your data into its headers - at minimum Employee ID and Full Name, ideally Department, Designation and Monthly CTC.',
    );
  }

  const { employees, recognizedColumns, warnings } = mapExcelRowsToEmployees(rows);

  return {
    sheetName,
    employees,
    totalRows: employees.length,
    recognizedColumns,
    warnings,
  };
}
