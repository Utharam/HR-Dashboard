import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildAttendanceWorkbook,
  parseAttendanceWorkbook,
  attendanceTemplateFileName,
} from '../attendanceExcel';
import { createInitialHolidays } from '../../data/initialHolidays';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import type { AttendanceRecord, Employee, LeavePlan } from '../../types';

const employee = (index: number): Employee => ({ ...INITIAL_EMPLOYEES[index] });

const employees = [employee(0), employee(1)];
const holidays = createInitialHolidays(2026);

const leavePlan = (
  over: Partial<LeavePlan> & Pick<LeavePlan, 'employeeId' | 'startDate' | 'endDate' | 'type'>,
): LeavePlan => ({
  id: `leave-${over.employeeId}-${over.startDate}`,
  status: 'Approved',
  halfDay: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const leavePlans: LeavePlan[] = [
  leavePlan({
    employeeId: employees[0].id,
    startDate: '2026-01-05',
    endDate: '2026-01-05',
    type: 'CL',
  }),
  leavePlan({
    employeeId: employees[1].id,
    startDate: '2026-01-06',
    endDate: '2026-01-06',
    type: 'EL',
  }),
  // Not approved: must not reach the template.
  leavePlan({
    employeeId: employees[0].id,
    startDate: '2026-01-20',
    endDate: '2026-01-20',
    type: 'SL',
    status: 'Planned',
  }),
  leavePlan({
    employeeId: employees[1].id,
    startDate: '2026-01-21',
    endDate: '2026-01-21',
    type: 'CL',
    status: 'Cancelled',
  }),
];

const build = (
  prefillPresent: boolean,
  attendance: AttendanceRecord[] = [],
  plans: LeavePlan[] = leavePlans,
): XLSX.WorkBook =>
  buildAttendanceWorkbook({
    employees,
    holidays,
    leavePlans: plans,
    attendance,
    year: 2026,
    monthIndex: 0,
    prefillPresent,
  });

const attendanceRecord = (
  employeeId: string,
  day: number,
  status: AttendanceRecord['status'],
  leaveType?: AttendanceRecord['leaveType'],
): AttendanceRecord => ({
  id: `${employeeId}|2026-01-${String(day).padStart(2, '0')}`,
  employeeId,
  date: `2026-01-${String(day).padStart(2, '0')}`,
  status,
  ...(leaveType ? { leaveType } : {}),
  source: 'manual',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const toBuffer = (workbook: XLSX.WorkBook): ArrayBuffer =>
  XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

/** The day columns start at D (index 3), so day N sits at column index 3 + N - 1. */
const dayCell = (workbook: XLSX.WorkBook, row: number, day: number): XLSX.CellObject | undefined =>
  workbook.Sheets.Attendance[XLSX.utils.encode_cell({ r: row - 1, c: 3 + day - 1 })];

describe('buildAttendanceWorkbook', () => {
  it('writes the documented month, header and roster layout', () => {
    const workbook = build(true);
    const sheet = workbook.Sheets.Attendance;

    expect(workbook.SheetNames).toEqual(['Attendance', 'Legend']);
    expect(sheet['A1'].v).toBe('OmniHR Monthly Attendance');
    expect(sheet['A2'].v).toBe('Month');
    expect(sheet['B2'].v).toBe('2026-01');
    expect(sheet['A3'].v).toBe('Generated');
    expect(Number.isNaN(Date.parse(String(sheet['B3'].v)))).toBe(false);

    expect(sheet['A5'].v).toBe('Employee ID');
    expect(sheet['B5'].v).toBe('Employee Name');
    expect(sheet['C5'].v).toBe('Department');
    expect(sheet['D5'].v).toBe(1);
    expect(sheet['AH5'].v).toBe(31);

    expect(sheet['A6'].v).toBe(employees[0].id);
    expect(sheet['B6'].v).toBe(employees[0].name);
    expect(sheet['C6'].v).toBe(employees[0].department);
    expect(sheet['A7'].v).toBe(employees[1].id);
  });

  it('marks Sundays WO and holidays H ahead of any other cell', () => {
    const workbook = build(true);

    expect(dayCell(workbook, 6, 1)?.v).toBe('H'); // New Year
    expect(dayCell(workbook, 6, 4)?.v).toBe('WO'); // Sunday
    expect(dayCell(workbook, 6, 26)?.v).toBe('H'); // Republic Day
    expect(dayCell(workbook, 6, 6)?.v).toBe('P'); // ordinary working day
  });

  it('prefills approved leave only', () => {
    const workbook = build(true);

    expect(dayCell(workbook, 6, 5)?.v).toBe('CL');
    expect(dayCell(workbook, 7, 6)?.v).toBe('EL');
    // Planned and cancelled plans are not pre-filled; prefill catches them as P.
    expect(dayCell(workbook, 6, 20)?.v).toBe('P');
    expect(dayCell(workbook, 7, 21)?.v).toBe('P');
  });

  it('leaves working days blank when prefill is off', () => {
    const workbook = build(false);

    expect(dayCell(workbook, 6, 2)?.v).toBeUndefined();
    expect(dayCell(workbook, 6, 5)?.v).toBe('CL');
    expect(dayCell(workbook, 6, 1)?.v).toBe('H');
    expect(dayCell(workbook, 6, 4)?.v).toBe('WO');
  });

  it('preserves existing A/W/HD/CL records through template and parse', () => {
    // Day 5 has an approved CL plan, day 1 is New Year and day 4 is a Sunday: the
    // ledger mark wins over the plan, but never over the derived calendar.
    const existing: AttendanceRecord[] = [
      attendanceRecord(employees[0].id, 2, 'WFH'),
      attendanceRecord(employees[0].id, 5, 'Absent'),
      attendanceRecord(employees[0].id, 7, 'HalfDay'),
      attendanceRecord(employees[0].id, 8, 'Leave', 'CL'),
      attendanceRecord(employees[0].id, 1, 'Present'),
      attendanceRecord(employees[0].id, 4, 'Present'),
    ];
    const workbook = build(true, existing);

    expect(dayCell(workbook, 6, 1)?.v).toBe('H');
    expect(dayCell(workbook, 6, 4)?.v).toBe('WO');
    expect(dayCell(workbook, 6, 2)?.v).toBe('W');
    expect(dayCell(workbook, 6, 5)?.v).toBe('A');
    expect(dayCell(workbook, 6, 7)?.v).toBe('HD');
    expect(dayCell(workbook, 6, 8)?.v).toBe('CL');

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const byId = new Map(parsed.records.map((record) => [record.id, record]));
    expect(byId.get(`${employees[0].id}|2026-01-02`)).toMatchObject({ status: 'WFH' });
    expect(byId.get(`${employees[0].id}|2026-01-05`)).toMatchObject({ status: 'Absent' });
    expect(byId.get(`${employees[0].id}|2026-01-07`)).toMatchObject({ status: 'HalfDay' });
    expect(byId.get(`${employees[0].id}|2026-01-08`)).toMatchObject({
      status: 'Leave',
      leaveType: 'CL',
    });
    expect(parsed.records.some((record) => record.date === '2026-01-01')).toBe(false);
    expect(parsed.records.some((record) => record.date === '2026-01-04')).toBe(false);
  });

  it('prefills approved half-day plans as HD-<code> and round-trips SL/LOP', () => {
    const halfDayPlans: LeavePlan[] = [
      leavePlan({
        employeeId: employees[0].id,
        startDate: '2026-01-09',
        endDate: '2026-01-09',
        type: 'SL',
        halfDay: 'AM',
      }),
      leavePlan({
        employeeId: employees[1].id,
        startDate: '2026-01-12',
        endDate: '2026-01-12',
        type: 'LOP',
        halfDay: 'PM',
      }),
    ];
    const workbook = build(false, [], halfDayPlans);

    expect(dayCell(workbook, 6, 9)?.v).toBe('HD-SL');
    expect(dayCell(workbook, 7, 12)?.v).toBe('HD-LOP');

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const byId = new Map(parsed.records.map((record) => [record.id, record]));
    expect(byId.get(`${employees[0].id}|2026-01-09`)).toMatchObject({
      status: 'HalfDay',
      leaveType: 'SL',
    });
    expect(byId.get(`${employees[1].id}|2026-01-12`)).toMatchObject({
      status: 'HalfDay',
      leaveType: 'LOP',
    });
  });

  it('includes a legend mapping every code', () => {
    const legend = build(true).Sheets.Legend;
    const values = Object.values(legend)
      .map((cell) => (cell && typeof cell === 'object' && 'v' in cell ? String(cell.v) : ''))
      .join(' ');

    for (const label of [
      'Present', 'Absent', 'Work From Home', 'Half Day',
      'Half Day - Casual Leave', 'Half Day - Loss of Pay',
      'Holiday', 'Weekly Off',
    ]) {
      expect(values).toContain(label);
    }
  });

  it('names the download after the month', () => {
    expect(attendanceTemplateFileName(2026, 0)).toBe('omnihr-attendance-2026-01.xlsx');
    expect(attendanceTemplateFileName(2026, 10)).toBe('omnihr-attendance-2026-11.xlsx');
  });
});

describe('parseAttendanceWorkbook', () => {
  it('round-trips a generated workbook without storing H or WO cells', () => {
    const parsed = parseAttendanceWorkbook(toBuffer(build(true)), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.monthKey).toBe('2026-01');
    expect(parsed.matchedEmployees).toBe(2);
    expect(parsed.issues).toEqual([]);
    expect(parsed.unknownEmployeeIds).toEqual([]);
    expect(parsed.missingEmployeeIds).toEqual([]);
    expect(parsed.missingDayNumbers).toEqual([]);

    // 25 working days x 2 employees. Approved leave days are records too (Leave),
    // while New Year, Republic Day and all four Sundays are derived and must not be.
    expect(parsed.records).toHaveLength(50);
    expect(parsed.records.every((record) => record.date.startsWith('2026-01'))).toBe(true);
    expect(parsed.records.some((record) => record.date === '2026-01-01')).toBe(false);
    expect(parsed.records.some((record) => record.date === '2026-01-04')).toBe(false);
    expect(parsed.records.some((record) => record.date === '2026-01-26')).toBe(false);

    const byId = new Map(parsed.records.map((record) => [record.id, record]));
    expect(byId.get(`${employees[0].id}|2026-01-05`)).toMatchObject({
      status: 'Leave',
      leaveType: 'CL',
      source: 'excel',
    });
    expect(byId.get(`${employees[1].id}|2026-01-06`)).toMatchObject({
      status: 'Leave',
      leaveType: 'EL',
      source: 'excel',
    });
    expect(byId.get(`${employees[0].id}|2026-01-02`)).toMatchObject({ status: 'Present' });
    expect(byId.get(`${employees[0].id}|2026-01-20`)).toMatchObject({ status: 'Present' });
    expect(byId.get(`${employees[1].id}|2026-01-21`)).toMatchObject({ status: 'Present' });
    expect(parsed.records.every((record) => record.id === `${record.employeeId}|${record.date}`)).toBe(
      true,
    );
  });

  it('imports only approved leave when prefill is off', () => {
    const parsed = parseAttendanceWorkbook(toBuffer(build(false)), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.records).toHaveLength(2);
    expect(parsed.records.map((record) => record.id).sort()).toEqual(
      [`${employees[0].id}|2026-01-05`, `${employees[1].id}|2026-01-06`].sort(),
    );
    expect(parsed.records.every((record) => record.status === 'Leave')).toBe(true);
  });

  it('reports unknown employee ids and keeps the known rows', () => {
    const workbook = build(true);
    workbook.Sheets.Attendance['A6'] = { t: 's', v: 'EMP-9999' };

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.matchedEmployees).toBe(1);
    expect(parsed.unknownEmployeeIds).toEqual(['EMP-9999']);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]).toMatchObject({
      row: 6,
      employeeId: 'EMP-9999',
    });
    expect(parsed.records.every((record) => record.employeeId === employees[1].id)).toBe(true);
    // The replaced roster row is now a gap: the employee is missing, not an unknown.
    expect(parsed.missingEmployeeIds).toEqual([employees[0].id]);
  });

  it('reports every roster employee with no row in the sheet', () => {
    const workbook = build(true);
    workbook.Sheets.Attendance['A7'] = { t: 's', v: '' };

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.matchedEmployees).toBe(1);
    expect(parsed.missingEmployeeIds).toEqual([employees[1].id]);
  });

  it('reports day columns absent from the header', () => {
    const workbook = build(true);
    // Day 15 lives at row 5, column 3 + 14 (zero-based).
    delete workbook.Sheets.Attendance[XLSX.utils.encode_cell({ r: 4, c: 3 + 14 })];

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.missingDayNumbers).toEqual([15]);
    // 25 working days per employee, minus the missing day, for both employees.
    expect(parsed.records).toHaveLength(48);
    expect(parsed.records.some((record) => record.date === '2026-01-15')).toBe(false);
  });

  it('reports an invalid code with its row, employee and date', () => {
    const workbook = build(true);
    // Row 6 is the first employee; day 5 is a Monday in January 2026.
    workbook.Sheets.Attendance['H6'] = { t: 's', v: 'ZZ' };

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]).toMatchObject({
      row: 6,
      employeeId: employees[0].id,
      date: '2026-01-05',
      code: 'ZZ',
    });
    expect(parsed.records.some((record) => record.date === '2026-01-05' && record.employeeId === employees[0].id)).toBe(false);
  });

  it('reports a day column outside the month', () => {
    const rows = [
      ['OmniHR Monthly Attendance'],
      ['Month', '2026-02'],
      ['Generated', '2026-02-01T00:00:00.000Z'],
      [''],
      ['Employee ID', 'Employee Name', 'Department', 1, 30],
      [employees[0].id, employees[0].name, employees[0].department, 'P', 'P'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    const parsed = parseAttendanceWorkbook(toBuffer(workbook), employees);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].date).toBe('2026-02-01');
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]).toMatchObject({
      row: 6,
      employeeId: employees[0].id,
      code: 'P',
    });
    expect(parsed.issues[0].message).toContain('Day 30');
    // February has 28 days, so days 2..28 are genuinely absent from this header.
    expect(parsed.missingDayNumbers).toEqual(
      Array.from({ length: 27 }, (_, index) => index + 2),
    );
  });

  it('rejects a workbook without a readable month', () => {
    const workbook = build(true);
    workbook.Sheets.Attendance['B2'] = { t: 's', v: 'not-a-month' };

    expect(parseAttendanceWorkbook(toBuffer(workbook), employees)).toEqual({
      ok: false,
      reason: 'missing-month',
    });
  });

  it('rejects a workbook without an Employee ID header', () => {
    const workbook = build(true);
    workbook.Sheets.Attendance['A5'] = { t: 's', v: 'Employee Number' };

    expect(parseAttendanceWorkbook(toBuffer(workbook), employees)).toEqual({
      ok: false,
      reason: 'missing-header',
    });
  });

  it('rejects a non-workbook buffer', () => {
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;

    expect(parseAttendanceWorkbook(garbage, employees)).toEqual({
      ok: false,
      reason: 'not-a-workbook',
    });
  });

  it('rejects an empty roster', () => {
    expect(parseAttendanceWorkbook(toBuffer(build(true)), [])).toEqual({
      ok: false,
      reason: 'no-employees',
    });
  });
});
