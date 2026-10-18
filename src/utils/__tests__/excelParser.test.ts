import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseExcelBuffer,
  parseCurrencyCell,
  toFiniteNumber,
  ExcelImportError,
  MAX_IMPORT_ROWS,
} from '../excelParser';

// A workbook is built the way a user's file is built, then round-tripped through the
// real writer, so the parser sees exactly what SheetJS would read off disk.
const workbook = (rows: unknown[]): ArrayBuffer => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

const rosterRow = (over: Record<string, unknown> = {}) => ({
  'Employee ID': 'EMP-1001',
  'Full Name': 'Asha Menon',
  Department: 'Engineering & Technology',
  'Monthly CTC': 185000,
  Status: 'Active',
  Gender: 'Female',
  ...over,
});

/** Runs the parser and returns the rejection, asserting it is the typed error. */
const rejectionOf = async (buf: ArrayBuffer): Promise<ExcelImportError> => {
  try {
    await parseExcelBuffer(buf);
  } catch (err) {
    expect(err).toBeInstanceOf(ExcelImportError);
    const typed = err as ExcelImportError;
    expect(typeof typed.code).toBe('string');
    expect(typed.hint.trim().length).toBeGreaterThan(0);
    return typed;
  }
  throw new Error('expected parseExcelBuffer to reject');
};

describe('parseCurrencyCell', () => {
  it.each([
    [185000, 185000],
    ['185000', 185000],
    ['₹1,85,000', 185000],
    ['"185,000.00"', 185000],
    ['Rs. 1,85,000/-', 185000],
    ['1,85,000', 185000],
    ['RS 25000', 25000],
    ['  12,000  ', 12000],
    ['1.5', 1.5],
    ['(1,200)', -1200],
    ['-1200', -1200],
    ['₹ 0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseCurrencyCell(input)).toBe(expected);
  });

  it.each([
    ['abc'],
    ['₹'],
    [''],
    ['   '],
    ['—'],
    ['N/A'],
    [null],
    [undefined],
    [{}],
    [NaN],
    [Infinity],
  ])('returns null for %s rather than a default', (input) => {
    // `null`, never a silent zero: a caller that receives a number has a real number.
    expect(parseCurrencyCell(input as unknown)).toBeNull();
  });
});

describe('toFiniteNumber', () => {
  it('falls back for junk', () => {
    expect(toFiniteNumber('abc', { min: 0, max: 30, fallback: 8 })).toBe(8);
    expect(toFiniteNumber('', { min: 0, max: 30, fallback: 8 })).toBe(8);
    expect(toFiniteNumber(null, { min: 0, max: 30, fallback: 8 })).toBe(8);
  });

  it('clamps an out-of-range value to the bound', () => {
    expect(toFiniteNumber(99, { min: 0, max: 26, fallback: 0 })).toBe(26);
    expect(toFiniteNumber(-4, { min: 0, max: 26, fallback: 8 })).toBe(0);
  });

  it('keeps a genuine zero instead of substituting the fallback', () => {
    // Zero LOP days and a zero leave balance are real answers. Treating them as missing
    // invents attendance and leave that nobody recorded.
    expect(toFiniteNumber(0, { min: 0, max: 26, fallback: 25 })).toBe(0);
    expect(toFiniteNumber('0', { min: 0, max: 26, fallback: 25 })).toBe(0);
  });

  it('reads a currency-formatted cell', () => {
    expect(toFiniteNumber('₹1,85,000', { min: 0, max: 10000000, fallback: 0 })).toBe(185000);
  });
});

describe('parseExcelBuffer rejects workbooks that are not a staff roster', () => {
  it('rejects a vendor invoice instead of fabricating employees from it', async () => {
    // Measured before these gates existed: this exact sheet produced two employees
    // named "Staff Member 1" with a made-up CTC, UAN and DOB, and the UI reported
    // "Successfully parsed 2 employee records". `recognizedColumns` was EMPTY.
    const buf = workbook([
      { Invoice: 'INV-991', Customer: 'Acme Corp', Amount: 50000, GST: 9000 },
      { Invoice: 'INV-992', Customer: 'Acme Corp', Amount: 12000, GST: 2160 },
    ]);

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_MATCHING_COLUMNS');
  });

  it('rejects a sheet whose headers are recognised but which identifies nobody', async () => {
    // Verified against the real writer: `json_to_sheet` with empty-string values
    // produces ONE row of empty strings, not zero rows. So this is not a "no data rows"
    // case - it is three recognised headers over nothing usable, and the parser used to
    // turn it into an employee called "Staff Member 1".
    const buf = workbook([{ 'Employee ID': '', 'Full Name': '', Department: '' }]);

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_DATA_ROWS');
  });

  it('rejects a sheet with a header row and no data at all', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Employee ID', 'Full Name', 'Monthly CTC']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_DATA_ROWS');
  });

  it('rejects a payroll register re-import with an explicit message', async () => {
    // Ruling G: this sheet matches only `Employee ID`, so a "fewer than two recognised
    // columns" gate would fire first and report the wrong problem. The user re-uploaded
    // a file this app just exported to them, so the file identity has to be checked
    // before the column count.
    const buf = workbook([{ 'Employee ID': 'EMP-1001', 'Basic (50%)': 92500, 'Net Salary Payable': 149000 }]);

    const err = await rejectionOf(buf);
    expect(err.code).toBe('UNSUPPORTED_FILE');
    expect(err.hint).toMatch(/payroll register/i);
  });

  it('rejects the full payroll register this app exports', async () => {
    const buf = workbook([
      {
        'Employee ID': 'EMP-1001',
        'Employee Name': 'Asha Menon',
        Department: 'Engineering & Technology',
        Designation: 'VP of Engineering',
        Location: 'Bengaluru HQ',
        'Monthly Gross CTC': 185000,
        'Basic (50%)': 92500,
        'HRA (25%)': 46250,
        'Special Allowance (25%)': 46250,
        'EPF (12% @ ₹15k cap)': 1800,
        'Professional Tax': 200,
        'Loss of Pay (LOP)': 0,
        'Total Deductions': 2000,
        'Net Salary Payable': 149000,
      },
    ]);

    const err = await rejectionOf(buf);
    expect(err.code).toBe('UNSUPPORTED_FILE');
  });

  it('rejects more rows than the import cap', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      rosterRow({ 'Employee ID': `E${i}`, 'Full Name': `N${i}` }),
    );

    const err = await rejectionOf(workbook(rows));
    expect(err.code).toBe('TOO_MANY_ROWS');
  });

  it('accepts a roster exactly at the cap, so the boundary is not off by one', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) =>
      rosterRow({ 'Employee ID': `E${i}`, 'Full Name': `N${i}` }),
    );

    const result = await parseExcelBuffer(workbook(rows));
    expect(result.employees).toHaveLength(MAX_IMPORT_ROWS);
  });

  it('rejects a file that is not a spreadsheet, without leaking the library error', async () => {
    // Before this change the raw SheetJS message reached the UI verbatim:
    // "Failed to parse Excel file: Invalid HTML: could not find <table>".
    const html = new TextEncoder().encode('<html><body><h1>Not a spreadsheet</h1></body></html>');

    const err = await rejectionOf(html.buffer as ArrayBuffer);
    expect(err.code).toBe('UNREADABLE_FILE');
    expect(err.hint).not.toMatch(/invalid html|could not find <table>/i);
    expect(err.message).not.toMatch(/invalid html|could not find <table>/i);
  });

  it('accepts a genuine roster, so the gates are not simply closed', async () => {
    const result = await parseExcelBuffer(workbook([rosterRow()]));
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].name).toBe('Asha Menon');
    expect(result.employees[0].monthlyCTC).toBe(185000);
  });

  it('accepts a minimal roster carrying only an ID and a name', async () => {
    const result = await parseExcelBuffer(
      workbook([{ 'Employee ID': 'EMP-1001', 'Full Name': 'Asha Menon' }]),
    );
    expect(result.employees[0].name).toBe('Asha Menon');
  });
});

describe('mapExcelRowsToEmployees does not invent values', () => {
  it('never produces NaN from an unreadable leave balance', async () => {
    // Three unguarded `Number(row['CL Balance'] ?? 8)` calls: "—" and "N/A" both became
    // NaN, and NaN then flowed into every leave balance figure on screen.
    const result = await parseExcelBuffer(
      workbook([rosterRow({ 'CL Balance': '—', 'SL Balance': 'N/A', 'EL Balance': '' })]),
    );

    const [emp] = result.employees;
    expect(Number.isNaN(emp.clBalance)).toBe(false);
    expect(Number.isNaN(emp.slBalance)).toBe(false);
    expect(Number.isNaN(emp.elBalance)).toBe(false);
    expect(emp.clBalance).toBe(8);
    expect(emp.slBalance).toBe(8);
    expect(emp.elBalance).toBe(12);
  });

  it('keeps a real zero leave balance at zero', async () => {
    const result = await parseExcelBuffer(workbook([rosterRow({ 'CL Balance': 0, 'SL Balance': 0 })]));
    expect(result.employees[0].clBalance).toBe(0);
    expect(result.employees[0].slBalance).toBe(0);
  });

  it('does not read a blank attendance cell as zero days present', async () => {
    // `Number('')` is 0, not NaN, so the old guard let an empty cell through as a fully
    // absent month.
    const result = await parseExcelBuffer(workbook([rosterRow({ 'Attendance (Days Present)': '' })]));
    expect(result.employees[0].presentDays).toBe(25);
  });

  it('defaults an unreadable CTC to the documented figure AND says which value failed', async () => {
    const result = await parseExcelBuffer(workbook([rosterRow({ 'Monthly CTC': 'per annum' })]));

    expect(result.employees[0].monthlyCTC).toBe(120000);
    const salaryWarning = result.warnings.find((w) => /salary/i.test(w));
    expect(salaryWarning).toBeDefined();
    expect(salaryWarning).toContain('Row 1 (Asha Menon)');
    expect(salaryWarning).toContain('per annum');
  });

  it('never emits an unbounded warning list', async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      rosterRow({
        'Employee ID': `E${i}`,
        'Full Name': `N${i}`,
        'Monthly CTC': 'not a number',
        'Date of Joining': 'someday',
        Status: 'Retired',
      }),
    );

    const result = await parseExcelBuffer(workbook(rows));
    expect(result.warnings.length).toBeLessThanOrEqual(5);
    // A truncated list must not read as "that was all of them".
    expect(result.warnings.some((w) => /more row/i.test(w))).toBe(true);
  });
});