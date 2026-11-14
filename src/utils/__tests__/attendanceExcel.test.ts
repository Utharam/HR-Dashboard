import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildAttendanceWorkbook,
  parseAttendanceWorkbook,
  attendanceTemplateFileName,
} from '../attendanceExcel';
import { createInitialHolidays } from '../../data/initialHolidays';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import type { Employee, LeavePlan } from '../../types';

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

const build = (prefillPresent: boolean): XLSX.WorkBook =>
  buildAttendanceWorkbook({
    employees,
    holidays,
    leavePlans,
    year: 2026,
    monthIndex: 0,
    prefillPresent,
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

  it('includes a legend mapping every code', () => {
    const legend = build(true).Sheets.Legend;
    const values = Object.values(legend)
      .map((cell) => (cell && typeof cell === 'object' && 'v' in cell ? String(cell.v) : ''))
      .join(' ');

    for (const label of ['Present', 'Absent', 'Work From Home', 'Half Day', 'Holiday', 'Weekly Off']) {
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
