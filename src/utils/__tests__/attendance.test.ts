import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_CODES,
  monthKey,
  parseMonthKey,
  daysInMonth,
  monthDateKeys,
  isSunday,
  holidayDateSet,
  workingDateKeys,
  codeToRecord,
  recordToCode,
  rollupMonth,
} from '../attendance';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Holiday,
  LeaveType,
} from '../../types';

const employee = (over: Partial<Employee> = {}): Employee => ({
  ...INITIAL_EMPLOYEES[0],
  ...over,
});

const holiday = (date: string, name = 'Holiday'): Holiday => ({
  id: `holiday-${date}`,
  date,
  name,
});

const record = (
  over: Partial<AttendanceRecord> & Pick<AttendanceRecord, 'employeeId' | 'date'>,
): AttendanceRecord => ({
  id: `${over.employeeId}|${over.date}`,
  status: 'Present',
  source: 'manual',
  updatedAt: '2026-01-02T03:04:05.000Z',
  ...over,
});

describe('month math', () => {
  it('knows leap-year February lengths', () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28);
  });

  it('knows the length of every month', () => {
    expect([
      daysInMonth(2026, 0),
      daysInMonth(2026, 2),
      daysInMonth(2026, 3),
      daysInMonth(2026, 11),
    ]).toEqual([31, 31, 30, 31]);
    expect(daysInMonth(2026, 12)).toBe(0);
    expect(daysInMonth(2026, -1)).toBe(0);
  });

  it('builds and parses the YYYY-MM key round trip', () => {
    expect(monthKey(2026, 0)).toBe('2026-01');
    expect(monthKey(2026, 10)).toBe('2026-11');
    expect(parseMonthKey('2026-11')).toEqual({ year: 2026, monthIndex: 10 });
    expect(parseMonthKey(' 2024-02 ')).toEqual({ year: 2024, monthIndex: 1 });
  });

  it('rejects malformed month keys', () => {
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
    expect(parseMonthKey('2026-1')).toBeNull();
    expect(parseMonthKey('November 2026')).toBeNull();
    expect(parseMonthKey('0000-01')).toBeNull();
  });

  it('lists every day key in calendar order', () => {
    const february = monthDateKeys(2024, 1);
    expect(february).toHaveLength(29);
    expect(february[0]).toBe('2024-02-01');
    expect(february.at(-1)).toBe('2024-02-29');
    expect(monthDateKeys(2026, 1)).toHaveLength(28);
    expect(monthDateKeys(2026, 12)).toEqual([]);
  });

  it('detects Sundays without shifting the date', () => {
    expect(isSunday('2026-01-04')).toBe(true);
    expect(isSunday('2026-01-05')).toBe(false);
    expect(isSunday('2026-11-01')).toBe(true);
    expect(isSunday('not-a-date')).toBe(false);
    expect(isSunday('2026-02-30')).toBe(false);
  });
});

describe('holidays and working days', () => {
  it('keeps only valid, distinct holiday dates', () => {
    const set = holidayDateSet([
      holiday('2026-01-01'),
      holiday('2026-01-01'),
      holiday('2026-02-30'),
      holiday('not-a-date'),
    ]);
    expect(Array.from(set)).toEqual(['2026-01-01']);
  });

  it('excludes Sundays and week-day holidays from working days', () => {
    // January 2026: 31 days, Sundays on the 4th, 11th, 18th and 25th.
    expect(workingDateKeys(2026, 0, [])).toHaveLength(27);
    expect(
      workingDateKeys(2026, 0, [holiday('2026-01-01'), holiday('2026-01-26')]),
    ).toHaveLength(25);
  });

  it('does not double-count a holiday that falls on a Sunday', () => {
    expect(workingDateKeys(2026, 0, [holiday('2026-01-04')])).toHaveLength(27);
  });

  it('ignores holidays outside the month', () => {
    expect(workingDateKeys(2026, 0, [holiday('2025-12-25')])).toHaveLength(27);
  });
});

describe('matrix code mapping', () => {
  it('maps every status and leave code', () => {
    const expectations: Array<[string, AttendanceStatus, LeaveType?]> = [
      ['P', 'Present'],
      ['A', 'Absent'],
      ['W', 'WFH'],
      ['HD', 'HalfDay'],
      ['CL', 'Leave', 'CL'],
      ['SL', 'Leave', 'SL'],
      ['EL', 'Leave', 'EL'],
      ['LOP', 'Leave', 'LOP'],
      ['ML', 'Leave', 'Maternity'],
      ['PL', 'Leave', 'Paternity'],
      ['CO', 'Leave', 'Comp Off'],
      ['O', 'Leave', 'Other'],
    ];

    for (const [code, status, leaveType] of expectations) {
      const mapped = codeToRecord(code, 'EMP-1001', '2026-01-05');
      expect(mapped).not.toBeNull();
      expect(mapped?.status).toBe(status);
      expect(mapped?.leaveType).toBe(leaveType);
      expect(mapped?.id).toBe('EMP-1001|2026-01-05');
      expect(mapped?.source).toBe('excel');
    }
  });

  it('treats H, WO, blank and unknown codes as non-records', () => {
    for (const code of ['H', 'WO', '', '   ', 'X', 'Leave', 'P!']) {
      expect(codeToRecord(code, 'EMP-1001', '2026-01-05')).toBeNull();
    }
  });

  it('normalises case and surrounding spaces', () => {
    expect(codeToRecord(' p ', 'EMP-1001', '2026-01-05')?.status).toBe('Present');
    expect(codeToRecord('Sl', 'EMP-1001', '2026-01-05')?.leaveType).toBe('SL');
  });

  it('uses the supplied timestamp and rejects an impossible date', () => {
    const now = new Date('2026-02-03T04:05:06.000Z');
    expect(codeToRecord('P', 'EMP-1001', '2026-01-05', now)?.updatedAt).toBe(now.toISOString());
    expect(codeToRecord('P', 'EMP-1001', '2026-02-30', now)).toBeNull();
    expect(codeToRecord('P', '', '2026-01-05', now)).toBeNull();
  });

  it('round-trips every record-producing code', () => {
    for (const code of ['P', 'A', 'W', 'HD', 'CL', 'SL', 'EL', 'LOP', 'ML', 'PL', 'CO', 'O']) {
      const mapped = codeToRecord(code, 'EMP-1001', '2026-01-05');
      expect(mapped).not.toBeNull();
      expect(recordToCode(mapped as AttendanceRecord)).toBe(code);
    }
  });

  it('always renders a half-day with a leave type as HD', () => {
    expect(
      recordToCode(record({ employeeId: 'E1', date: '2026-01-05', status: 'HalfDay', leaveType: 'CL' })),
    ).toBe('HD');
  });

  it('exposes the derived markers in the shared table', () => {
    expect(ATTENDANCE_CODES.H).toBe('H');
    expect(ATTENDANCE_CODES.WO).toBe('WO');
    expect(ATTENDANCE_CODES['']).toBe('blank');
  });
});

describe('rollupMonth', () => {
  // January 2026 has four Sundays and two seeded holidays, so 31 - 4 - 2 = 25
  // working days. The fixture deliberately also puts records on a Sunday and a
  // holiday to prove they cannot inflate present days.
  const employees = [
    employee({ id: 'E1', name: 'One' }),
    employee({ id: 'E2', name: 'Two' }),
    employee({ id: 'E3', name: 'Three' }),
  ];
  const holidays = [holiday('2026-01-01'), holiday('2026-01-26')];

  const attendance: AttendanceRecord[] = [
    record({ employeeId: 'E1', date: '2026-01-05', status: 'Present' }),
    record({ employeeId: 'E1', date: '2026-01-06', status: 'WFH' }),
    record({ employeeId: 'E1', date: '2026-01-07', status: 'HalfDay', leaveType: 'CL' }),
    record({ employeeId: 'E1', date: '2026-01-08', status: 'HalfDay' }),
    record({ employeeId: 'E1', date: '2026-01-01', status: 'Present' }),
    record({ employeeId: 'E1', date: '2026-01-04', status: 'Present' }),
    record({ employeeId: 'E2', date: '2026-01-05', status: 'Leave', leaveType: 'CL' }),
    record({ employeeId: 'E2', date: '2026-01-06', status: 'Leave', leaveType: 'LOP' }),
    record({ employeeId: 'E2', date: '2026-01-07', status: 'Absent' }),
    record({ employeeId: 'E3', date: '2025-12-31', status: 'Present' }),
    record({ employeeId: 'E404', date: '2026-01-05', status: 'Present' }),
  ];

  const rollup = rollupMonth(attendance, employees, holidays, 2026, 0);

  it('includes every employee, zeros when there are no records', () => {
    expect(rollup.size).toBe(3);
    const e3 = rollup.get('E3');
    expect(e3).toMatchObject({
      employeeId: 'E3',
      presentDays: 0,
      leaveDays: 0,
      absentDays: 0,
      wfhDays: 0,
      lopDays: 0,
      workingDays: 25,
      unmarkedDays: 25,
      hasRecords: false,
    });
    expect(e3?.leaveByType).toEqual({});
  });

  it('counts present, WFH and half-days', () => {
    const e1 = rollup.get('E1');
    expect(e1?.presentDays).toBe(3);
    expect(e1?.wfhDays).toBe(1);
    expect(e1?.leaveDays).toBe(0.5);
    expect(e1?.leaveByType).toEqual({ CL: 0.5 });
    expect(e1?.absentDays).toBe(0);
    expect(e1?.lopDays).toBe(0);
    expect(e1?.unmarkedDays).toBe(21.5);
    expect(e1?.hasRecords).toBe(true);
  });

  it('counts every leave type and LOP leave', () => {
    const e2 = rollup.get('E2');
    expect(e2?.presentDays).toBe(0);
    expect(e2?.leaveDays).toBe(2);
    expect(e2?.leaveByType).toEqual({ CL: 1, LOP: 1 });
    expect(e2?.absentDays).toBe(1);
    expect(e2?.lopDays).toBe(2);
    expect(e2?.unmarkedDays).toBe(22);
    expect(e2?.hasRecords).toBe(true);
  });

  it('reports holiday and weekly-off calendar facts', () => {
    for (const employeeId of ['E1', 'E2', 'E3']) {
      expect(rollup.get(employeeId)?.holidayDays).toBe(2);
      expect(rollup.get(employeeId)?.weeklyOffDays).toBe(4);
      expect(rollup.get(employeeId)?.workingDays).toBe(25);
    }
  });

  it('ignores records on Sundays, holidays and other months for the totals', () => {
    // E1's Sunday/holiday records are intentionally present in the fixture; the
    // asserted 3 present days contain neither of them.
    expect(rollup.get('E1')?.presentDays).toBe(3);
    expect(rollup.get('E3')?.presentDays).toBe(0);
  });

  it('ignores records for employees outside the roster', () => {
    expect(rollup.has('E404')).toBe(false);
  });
});
