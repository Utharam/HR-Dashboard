import { describe, it, expect } from 'vitest';
import { createInitialAttendance } from '../initialAttendance';
import { createInitialHolidays } from '../initialHolidays';
import { INITIAL_EMPLOYEES } from '../initialData';
import { isSunday, workingDateKeys } from '../../utils/attendance';
import type { AttendanceRecord, Employee } from '../../types';

const employee = (index: number, over: Partial<Employee> = {}): Employee => ({
  ...INITIAL_EMPLOYEES[index],
  ...over,
});

const now = new Date(2026, 0, 15, 10, 30);
const holidays = createInitialHolidays(2026);
const workingDates = workingDateKeys(2026, 0, holidays);

const recordsFor = (records: AttendanceRecord[], employeeId: string): AttendanceRecord[] =>
  records.filter((record) => record.employeeId === employeeId);

describe('createInitialAttendance', () => {
  it('marks Present up to presentDays and then Absent up to lopDays', () => {
    const employees = [employee(0, { presentDays: 10, lopDays: 4 })];
    const records = createInitialAttendance(employees, holidays, now);
    const employeeRecords = recordsFor(records, employees[0].id);

    expect(employeeRecords).toHaveLength(14);
    expect(employeeRecords.slice(0, 10).map((record) => record.status)).toEqual(
      Array.from({ length: 10 }, () => 'Present'),
    );
    expect(employeeRecords.slice(10).map((record) => record.status)).toEqual(
      Array.from({ length: 4 }, () => 'Absent'),
    );
    expect(employeeRecords.map((record) => record.date)).toEqual(workingDates.slice(0, 14));
  });

  it('caps present and absent counts at the working days available', () => {
    const employees = [
      employee(0, { presentDays: 30, lopDays: 5 }),
      employee(1, { presentDays: 23, lopDays: 5 }),
    ];
    const records = createInitialAttendance(employees, holidays, now);

    const allPresent = recordsFor(records, employees[0].id);
    expect(allPresent).toHaveLength(workingDates.length);
    expect(new Set(allPresent.map((record) => record.status))).toEqual(new Set(['Present']));

    const mixed = recordsFor(records, employees[1].id);
    expect(mixed).toHaveLength(workingDates.length);
    expect(mixed.filter((record) => record.status === 'Present')).toHaveLength(23);
    expect(mixed.filter((record) => record.status === 'Absent')).toHaveLength(
      workingDates.length - 23,
    );
  });

  it('never writes a Sunday or a holiday', () => {
    const employees = [employee(0, { presentDays: 26, lopDays: 4 })];
    const records = createInitialAttendance(employees, holidays, now);
    const holidayDates = new Set(holidays.map((holiday) => holiday.date));

    for (const record of records) {
      expect(isSunday(record.date)).toBe(false);
      expect(holidayDates.has(record.date)).toBe(false);
    }
  });

  it('writes records only for the current month', () => {
    const employees = [employee(0)];
    const records = createInitialAttendance(employees, holidays, now);

    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.date.startsWith('2026-01')).toBe(true);
    }
  });

  it('uses stable ids, the seed source and the supplied timestamp', () => {
    const employees = [employee(0, { presentDays: 2, lopDays: 1 })];
    const records = createInitialAttendance(employees, holidays, now);

    expect(records.map((record) => record.id)).toEqual([
      `${employees[0].id}|${workingDates[0]}`,
      `${employees[0].id}|${workingDates[1]}`,
      `${employees[0].id}|${workingDates[2]}`,
    ]);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    for (const record of records) {
      expect(record.source).toBe('seed');
      expect(record.updatedAt).toBe(now.toISOString());
    }
  });

  it('writes nothing when the employee has no present or LOP days', () => {
    const employees = [employee(0, { presentDays: 0, lopDays: 0 })];
    expect(createInitialAttendance(employees, holidays, now)).toEqual([]);
  });

  it('writes nothing for an empty roster', () => {
    expect(createInitialAttendance([], holidays, now)).toEqual([]);
  });
});
