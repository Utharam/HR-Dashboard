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
  // Measured against the xlsx@0.18.5 actually installed here, because these inputs do
  // not all fail the way the code assumed. `XLSX.read` throws for HTML-sniffed input and
  // for a truncated ZIP, but for a 0-byte or garbage buffer it happily returns a phantom
  // one-cell `Sheet1` with zero rows. Nothing is destroyed or fabricated by that - the
  // row is never mapped - but it used to fall through to NO_DATA_ROWS, whose hint
  // claimed the file "has column headings", which is false of a file that has no content
  // at all, and told the user to fill in a row that had nowhere to go.
  const UNREADABLE_INPUTS: [string, ArrayBuffer][] = [
    ['a zero-byte file', new ArrayBuffer(0)],
    ['nine bytes of garbage', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer],
    // A sparse/zero-filled buffer decodes to a cell of NULs. `trim()` does not remove
    // these, which is why the readable-header test looks for a letter or a digit rather
    // than "not whitespace".
    ['a buffer of zero bytes', new Uint8Array(32).buffer as ArrayBuffer],
  ];

  it.each(UNREADABLE_INPUTS)('rejects %s as unreadable rather than as an empty roster', async (_label, buf) => {
    const err = await rejectionOf(buf);
    expect(err.code).toBe('UNREADABLE_FILE');
  });

  it.each(UNREADABLE_INPUTS)('gives %s a hint that is true of that input', async (_label, buf) => {
    const err = await rejectionOf(buf);

    // The two clauses the old NO_DATA_ROWS hint asserted are both false here: the file
    // has no column headings, and "fill in at least one employee" is not an instruction
    // anyone can carry out on an empty buffer.
    expect(err.hint).not.toMatch(/column headings/i);
    expect(err.hint).not.toMatch(/fill in at least one employee/i);
    expect(err.hint).toMatch(/no readable spreadsheet content/i);
  });

  it('does not call a one-line text file unreadable - it does have readable content', async () => {
    // Measured: SheetJS hands back a single row of prose as the heading. Calling that
    // "no readable spreadsheet content" would be its own untruth, so it falls through to
    // the empty-roster message, which is now worded to be true of it.
    const buf = new TextEncoder().encode('notes about the new starter').buffer as ArrayBuffer;

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_DATA_ROWS');
    expect(err.hint).not.toMatch(/no readable spreadsheet content/i);
    expect(err.hint).not.toMatch(/column headings/i);
  });

  it('still reports a header-only template as an empty roster, not an unreadable file', async () => {
    // The distinction the new gate turns on. Real header text, zero data rows: the user
    // has the template and has not filled it in, which is a different problem from
    // handing over a file with no content at all.
    const ws = XLSX.utils.aoa_to_sheet([['Employee ID', 'Full Name', 'Monthly CTC']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_DATA_ROWS');
    expect(err.hint).toMatch(/no staff rows/i);
  });

  it('still reports a template whose only data row is blank as an empty roster', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Employee ID', 'Full Name', 'Monthly CTC'],
      ['   ', '\t', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_DATA_ROWS');
  });

  it('does not call a text file unreadable - it has readable content, just no OmniHR columns', async () => {
    // A misnamed PDF or a .txt arrives with text in it. Calling that "unreadable" would
    // be as untrue as the old message; the honest answer is that it is not a roster.
    const buf = new TextEncoder().encode('%PDF-1.4\nsome binary noise\nmore noise').buffer as ArrayBuffer;

    const err = await rejectionOf(buf);
    expect(err.code).toBe('NO_MATCHING_COLUMNS');
  });

  it('accepts a CSV export, which has no .xlsx container at all', async () => {
    // A guard against the new gate being over-eager: SheetJS reads CSV as a one-sheet
    // workbook, and this is a supported import path.
    const buf = new TextEncoder().encode(
      'Employee ID,Full Name,Department,Monthly CTC\nEMP-1,Asha Menon,Engineering & Technology,185000',
    ).buffer as ArrayBuffer;

    const result = await parseExcelBuffer(buf);
    expect(result.employees[0].name).toBe('Asha Menon');
  });

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

  it('warns when it substitutes a fabricated PF UAN for a missing column', async () => {
    // A two-column sheet now imports a roster carrying EPFO numbers nobody entered,
    // and that field reaches a statutory return. The value is kept (the row is still
    // usable) but the substitution is stated for the row that carries it.
    const result = await parseExcelBuffer(
      workbook([{ 'Employee ID': 'EMP-1001', 'Full Name': 'Asha Menon' }]),
    );

    const uanWarning = result.warnings.find((w) => /UAN/i.test(w));
    expect(uanWarning).toBeDefined();
    expect(uanWarning).toContain('Row 1 (Asha Menon)');
  });

  it('keeps an explicit zero salary at zero and warns that the payslip is zero', async () => {
    // `parseCurrencyCell` correctly reads 0 as a real amount, not as missing data.
    // The value must survive, but a zero-CTC row is still worth flagging: it floors
    // the payslip at zero (computePayroll) and deflates the disbursable total.
    const result = await parseExcelBuffer(workbook([rosterRow({ 'Monthly CTC': 0 })]));

    expect(result.employees[0].monthlyCTC).toBe(0);
    expect(result.warnings.some((w) => /₹0/.test(w))).toBe(true);
  });
});