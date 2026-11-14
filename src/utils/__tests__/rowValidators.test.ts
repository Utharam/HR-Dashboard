import { describe, it, expect } from 'vitest';
import {
  isEmployeeRow,
  isPolicyRow,
  isLeavePlanRow,
  isAttendanceRecordRow,
  isHolidayRow,
  isPlannerEventRow,
  isPlannerSettingsRow,
} from '../rowValidators';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import { INITIAL_POLICIES } from '../../data/initialPolicies';
import { createInitialLeavePlans } from '../../data/initialLeavePlans';
import { createInitialHolidays } from '../../data/initialHolidays';
import { createInitialAttendance } from '../../data/initialAttendance';
import { createInitialPlannerEvents } from '../../data/initialPlannerEvents';
import { codeToRecord } from '../attendance';
import type {
  AttendanceRecord,
  Holiday,
  LeavePlan,
  LeaveType,
  PlannerEvent,
} from '../../types';

const employee = () => ({ ...INITIAL_EMPLOYEES[0] });

describe('isEmployeeRow', () => {
  it('accepts a real employee from the seed data', () => {
    expect(isEmployeeRow(employee())).toBe(true);
  });

  // Each of these is dereferenced by `filteredEmployees` in App.tsx as
  // `emp.<field>.toLowerCase()`. A payload where one of them is a number or missing
  // is the measured white screen: the render throws, the persistence effect never
  // runs, and the "Reset Demo State" button that would fix it never mounts. The
  // validator is the only place this can be caught, so it has to know the exact
  // fields the consumer touches - hence one assertion per field.
  it.each(['id', 'name', 'email', 'department', 'role'] as const)(
    'rejects a row whose %s is not a string',
    (field) => {
      expect(isEmployeeRow({ ...employee(), [field]: 42 })).toBe(false);
      expect(isEmployeeRow({ ...employee(), [field]: null })).toBe(false);
      expect(isEmployeeRow({ ...employee(), [field]: undefined })).toBe(false);
      const missing = employee() as Record<string, unknown>;
      delete missing[field];
      expect(isEmployeeRow(missing)).toBe(false);
    },
  );

  it('rejects a row whose location is not a string', () => {
    // `filteredEmployees` compares location by equality rather than calling a method
    // on it, so a number here fails the filter silently instead of throwing - the row
    // vanishes from every view with no error anywhere.
    expect(isEmployeeRow({ ...employee(), location: 7 })).toBe(false);
  });

  it.each([
    'monthlyCTC', 'basicSalary', 'hra', 'specialAllowance',
    'performanceRating', 'presentDays', 'clBalance', 'slBalance',
    'elBalance', 'lopDays',
  ] as const)('rejects a row whose %s is not a finite number', (field) => {
    // A stringified number does not crash the filter, it silently poisons every
    // downstream total: the formatters call `.toFixed()` on these.
    expect(isEmployeeRow({ ...employee(), [field]: '30' })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: NaN })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: Infinity })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: null })).toBe(false);
  });

  it('keeps a genuine zero on a numeric field', () => {
    // Zero lop days and a zero leave balance are real values, not absence. A validator
    // written as `if (!value)` would discard the roster every time one employee had a
    // zero balance.
    expect(isEmployeeRow({ ...employee(), lopDays: 0, clBalance: 0, elBalance: 0 })).toBe(true);
  });

  it('accepts reportsTo as a string or null, but not a number', () => {
    expect(isEmployeeRow({ ...employee(), reportsTo: null })).toBe(true);
    expect(isEmployeeRow({ ...employee(), reportsTo: 'EMP-1002' })).toBe(true);
    expect(isEmployeeRow({ ...employee(), reportsTo: 1002 })).toBe(false);
  });

  it('keeps a status or gender this build has never heard of', () => {
    // The unions in types.ts are widened over time. A value outside the union is still a
    // string, and `isActive` / the gender ratios already fail closed on it; discarding
    // the entire roster because one cell read "Retiring" would be a far worse outcome.
    expect(isEmployeeRow({ ...employee(), status: 'Retiring' })).toBe(true);
    expect(isEmployeeRow({ ...employee(), gender: 'Unspecified' })).toBe(true);
  });

  it.each([null, undefined, 42, 'EMP-1', ['x'], true])('rejects the non-object %s', (row) => {
    expect(isEmployeeRow(row)).toBe(false);
  });

  it('rejects an empty object', () => {
    // `{"employees":[{}]}` was one of the two payloads measured as white-screening
    // the app.
    expect(isEmployeeRow({})).toBe(false);
  });
});

describe('isPolicyRow', () => {
  const policy = () => ({ ...INITIAL_POLICIES[0] });

  it('accepts a real policy from the seed data', () => {
    expect(isPolicyRow(policy())).toBe(true);
  });

  it.each(['id', 'title', 'category', 'shortDesc', 'eligibility'] as const)(
    'rejects a policy whose %s is not a string',
    (field) => {
      expect(isPolicyRow({ ...policy(), [field]: 7 })).toBe(false);
      expect(isPolicyRow({ ...policy(), [field]: null })).toBe(false);
    },
  );

  it('rejects a policy whose rules is not an array of strings', () => {
    // PolicySection searches with `p.rules.some(r => r.toLowerCase()...)`.
    expect(isPolicyRow({ ...policy(), rules: 'no rules' })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: [1, 2] })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: null })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: [] })).toBe(true);
  });

  it('rejects a policy whose daysAllowed is not a finite number', () => {
    // daysAllowed feeds `safeBalance` and is rendered as `{policy.daysAllowed} {policy.timeUnit}`.
    expect(isPolicyRow({ ...policy(), daysAllowed: '12' })).toBe(false);
    expect(isPolicyRow({ ...policy(), daysAllowed: NaN })).toBe(false);
    expect(isPolicyRow({ ...policy(), daysAllowed: 0 })).toBe(true);
  });

  it('rejects a policy whose isActive is not a boolean', () => {
    // `policies.filter(p => p.isActive).length` is the active-count KPI: a truthy
    // string "false" would count a disabled policy as active.
    expect(isPolicyRow({ ...policy(), isActive: 'false' })).toBe(false);
    expect(isPolicyRow({ ...policy(), isActive: 0 })).toBe(false);
    expect(isPolicyRow({ ...policy(), isActive: true })).toBe(true);
  });

  it('tolerates the optional gift fields being absent', () => {
    const {
      giftOrPerk: _giftOrPerk,
      giftOptions: _giftOptions,
      statutoryReference: _statutoryReference,
      isCustom: _isCustom,
      ...rest
    } = policy();
    expect(isPolicyRow(rest)).toBe(true);
  });

  it.each([null, 42, 'POL-MAT', []])('rejects the non-object %s', (row) => {
    expect(isPolicyRow(row)).toBe(false);
  });
});

describe('isLeavePlanRow', () => {
  const leavePlan = (): LeavePlan => ({
    ...createInitialLeavePlans(new Date(2026, 0, 15))[0],
  });

  it('accepts a plan from the seeded demo data', () => {
    expect(isLeavePlanRow(leavePlan())).toBe(true);
  });

  it('accepts every seeded plan', () => {
    for (const plan of createInitialLeavePlans(new Date(2026, 0, 15))) {
      expect(isLeavePlanRow(plan)).toBe(true);
    }
  });

  it.each(['id', 'employeeId'] as const)('rejects a row whose %s is empty or not a string', (field) => {
    expect(isLeavePlanRow({ ...leavePlan(), [field]: '' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), [field]: 42 })).toBe(false);
    const missing = leavePlan() as unknown as Record<string, unknown>;
    delete missing[field];
    expect(isLeavePlanRow(missing)).toBe(false);
  });

  it('rejects an impossible or malformed start or end date', () => {
    for (const field of ['startDate', 'endDate'] as const) {
      expect(isLeavePlanRow({ ...leavePlan(), [field]: '2024-02-30' })).toBe(false);
      expect(isLeavePlanRow({ ...leavePlan(), [field]: '2023-02-29' })).toBe(false);
      expect(isLeavePlanRow({ ...leavePlan(), [field]: '15/01/2026' })).toBe(false);
      expect(isLeavePlanRow({ ...leavePlan(), [field]: 20260115 })).toBe(false);
      expect(isLeavePlanRow({ ...leavePlan(), [field]: null })).toBe(false);
    }
  });

  it('rejects an end date before the start date', () => {
    expect(
      isLeavePlanRow({ ...leavePlan(), startDate: '2026-01-20', endDate: '2026-01-19' }),
    ).toBe(false);
  });

  it('accepts a single-day half-day', () => {
    expect(
      isLeavePlanRow({ ...leavePlan(), startDate: '2026-01-20', endDate: '2026-01-20', halfDay: 'AM' }),
    ).toBe(true);
    expect(
      isLeavePlanRow({ ...leavePlan(), startDate: '2026-01-20', endDate: '2026-01-20', halfDay: 'PM' }),
    ).toBe(true);
  });

  it('rejects a half-day on a multi-day plan', () => {
    expect(
      isLeavePlanRow({ ...leavePlan(), startDate: '2026-01-20', endDate: '2026-01-21', halfDay: 'AM' }),
    ).toBe(false);
  });

  it('rejects an unknown half-day marker', () => {
    expect(isLeavePlanRow({ ...leavePlan(), halfDay: 'FULL' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), halfDay: undefined })).toBe(false);
  });

  it('rejects unknown leave types and statuses', () => {
    expect(isLeavePlanRow({ ...leavePlan(), type: 'Vacation' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), type: null })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), status: 'Pending' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), status: 1 })).toBe(false);
  });

  it('treats the note as optional but rejects a non-string one', () => {
    const withoutNote = leavePlan() as unknown as Record<string, unknown>;
    delete withoutNote.note;
    expect(isLeavePlanRow(withoutNote)).toBe(true);
    expect(isLeavePlanRow({ ...leavePlan(), note: 'Family function' })).toBe(true);
    expect(isLeavePlanRow({ ...leavePlan(), note: 42 })).toBe(false);
  });

  it('rejects unparseable created/updated timestamps', () => {
    expect(isLeavePlanRow({ ...leavePlan(), createdAt: 'not-a-date' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), updatedAt: 'not-a-date' })).toBe(false);
    expect(isLeavePlanRow({ ...leavePlan(), updatedAt: 0 })).toBe(false);
  });

  it.each([null, undefined, 42, 'leave-1', ['x'], true])('rejects the non-object %s', (row) => {
    expect(isLeavePlanRow(row)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isLeavePlanRow({})).toBe(false);
  });
});

describe('isAttendanceRecordRow', () => {
  const attendanceRecord = (): AttendanceRecord =>
    codeToRecord('P', 'EMP-1001', '2026-01-05', new Date('2026-01-05T00:00:00.000Z')) as AttendanceRecord;

  it('accepts a mapped matrix record', () => {
    expect(isAttendanceRecordRow(attendanceRecord())).toBe(true);
  });

  it('accepts every seeded demo record', () => {
    const seeded = createInitialAttendance(
      INITIAL_EMPLOYEES.slice(0, 3),
      createInitialHolidays(2026),
      new Date(2026, 0, 15),
    );
    expect(seeded.length).toBeGreaterThan(0);
    for (const record of seeded) {
      expect(isAttendanceRecordRow(record)).toBe(true);
    }
  });

  it.each(['id', 'employeeId'] as const)('rejects a row whose %s is empty or not a string', (field) => {
    expect(isAttendanceRecordRow({ ...attendanceRecord(), [field]: '' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), [field]: 42 })).toBe(false);
    const missing = attendanceRecord() as unknown as Record<string, unknown>;
    delete missing[field];
    expect(isAttendanceRecordRow(missing)).toBe(false);
  });

  it('rejects an impossible or malformed date', () => {
    expect(isAttendanceRecordRow({ ...attendanceRecord(), date: '2026-02-30' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), date: '05/01/2026' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), date: 20260105 })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), date: null })).toBe(false);
  });

  it('accepts every status this build renders', () => {
    for (const status of ['Present', 'Absent', 'WFH', 'HalfDay'] as const) {
      expect(isAttendanceRecordRow({ ...attendanceRecord(), status })).toBe(true);
    }
    expect(isAttendanceRecordRow({ ...attendanceRecord(), status: 'Leave', leaveType: 'CL' })).toBe(
      true,
    );
  });

  it('rejects an unknown status', () => {
    expect(isAttendanceRecordRow({ ...attendanceRecord(), status: 'Holiday' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), status: null })).toBe(false);
  });

  it('accepts every persisted source', () => {
    for (const source of ['manual', 'excel', 'leave', 'seed'] as const) {
      expect(isAttendanceRecordRow({ ...attendanceRecord(), source })).toBe(true);
    }
    expect(isAttendanceRecordRow({ ...attendanceRecord(), source: 'import' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), source: 1 })).toBe(false);
  });

  it('requires a valid leave type on a Leave record', () => {
    const leaveTypes: LeaveType[] = [
      'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
    ];
    for (const leaveType of leaveTypes) {
      expect(
        isAttendanceRecordRow({ ...attendanceRecord(), status: 'Leave', leaveType }),
      ).toBe(true);
    }

    const withoutType = { ...attendanceRecord(), status: 'Leave' as const };
    expect(isAttendanceRecordRow(withoutType)).toBe(false);
    expect(
      isAttendanceRecordRow({ ...attendanceRecord(), status: 'Leave', leaveType: null }),
    ).toBe(false);
    expect(
      isAttendanceRecordRow({ ...attendanceRecord(), status: 'Leave', leaveType: 'Vacation' }),
    ).toBe(false);
  });

  it('accepts a leave type on a half-day and rejects an unknown one', () => {
    expect(
      isAttendanceRecordRow({ ...attendanceRecord(), status: 'HalfDay', leaveType: 'CL' }),
    ).toBe(true);
    expect(
      isAttendanceRecordRow({ ...attendanceRecord(), status: 'HalfDay', leaveType: 'Vacation' }),
    ).toBe(false);
  });

  it('treats halfDay as optional but rejects unknown markers', () => {
    const withoutHalfDay = attendanceRecord() as unknown as Record<string, unknown>;
    delete withoutHalfDay.halfDay;
    expect(isAttendanceRecordRow(withoutHalfDay)).toBe(true);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), halfDay: null })).toBe(true);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), halfDay: 'AM' })).toBe(true);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), halfDay: 'PM' })).toBe(true);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), halfDay: 'FULL' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), halfDay: 1 })).toBe(false);
  });

  it('treats the note as optional but rejects a non-string one', () => {
    const withoutNote = attendanceRecord() as unknown as Record<string, unknown>;
    delete withoutNote.note;
    expect(isAttendanceRecordRow(withoutNote)).toBe(true);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), note: 'Worked from client site' })).toBe(
      true,
    );
    expect(isAttendanceRecordRow({ ...attendanceRecord(), note: 42 })).toBe(false);
  });

  it('rejects an unparseable updatedAt', () => {
    expect(isAttendanceRecordRow({ ...attendanceRecord(), updatedAt: 'not-a-date' })).toBe(false);
    expect(isAttendanceRecordRow({ ...attendanceRecord(), updatedAt: 0 })).toBe(false);
  });

  it.each([null, undefined, 42, 'attendance', ['x'], true])(
    'rejects the non-object %s',
    (row) => {
      expect(isAttendanceRecordRow(row)).toBe(false);
    },
  );

  it('rejects an empty object', () => {
    expect(isAttendanceRecordRow({})).toBe(false);
  });
});

describe('isPlannerEventRow', () => {
  const event = (): PlannerEvent => ({
    ...createInitialPlannerEvents(new Date(2026, 0, 15))[0],
  });

  it('accepts a seeded demo event', () => {
    expect(isPlannerEventRow(event())).toBe(true);
  });

  it('accepts every seeded event', () => {
    for (const row of createInitialPlannerEvents(new Date(2026, 0, 15))) {
      expect(isPlannerEventRow(row)).toBe(true);
    }
  });

  it('rejects an empty or non-string id', () => {
    expect(isPlannerEventRow({ ...event(), id: '' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), id: 42 })).toBe(false);
    const missing = event() as unknown as Record<string, unknown>;
    delete missing.id;
    expect(isPlannerEventRow(missing)).toBe(false);
  });

  it('requires a non-blank title', () => {
    expect(isPlannerEventRow({ ...event(), title: '' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), title: '   ' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), title: 42 })).toBe(false);
    const missing = event() as unknown as Record<string, unknown>;
    delete missing.title;
    expect(isPlannerEventRow(missing)).toBe(false);
  });

  it('rejects an impossible or malformed start or end date', () => {
    for (const field of ['startDate', 'endDate'] as const) {
      expect(isPlannerEventRow({ ...event(), [field]: '2024-02-30' })).toBe(false);
      expect(isPlannerEventRow({ ...event(), [field]: '2023-02-29' })).toBe(false);
      expect(isPlannerEventRow({ ...event(), [field]: '15/01/2026' })).toBe(false);
      expect(isPlannerEventRow({ ...event(), [field]: 20260115 })).toBe(false);
      expect(isPlannerEventRow({ ...event(), [field]: null })).toBe(false);
    }
  });

  it('rejects an end date before the start date', () => {
    expect(
      isPlannerEventRow({ ...event(), startDate: '2026-01-20', endDate: '2026-01-19' }),
    ).toBe(false);
  });

  it('accepts every event type this build renders', () => {
    for (const type of ['Event', 'Training', 'Meeting', 'Holiday', 'Other'] as const) {
      expect(isPlannerEventRow({ ...event(), type })).toBe(true);
    }
    expect(isPlannerEventRow({ ...event(), type: 'Conference' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), type: null })).toBe(false);
  });

  it('treats department, location and notes as optional but rejects non-strings', () => {
    const withoutOptional = event() as unknown as Record<string, unknown>;
    delete withoutOptional.department;
    delete withoutOptional.location;
    delete withoutOptional.notes;
    expect(isPlannerEventRow(withoutOptional)).toBe(true);
    expect(isPlannerEventRow({ ...event(), department: 'Finance & Operations' })).toBe(true);
    expect(isPlannerEventRow({ ...event(), location: 'Mumbai Hub' })).toBe(true);
    expect(isPlannerEventRow({ ...event(), notes: 'Bring the deck.' })).toBe(true);
    expect(isPlannerEventRow({ ...event(), department: 42 })).toBe(false);
    expect(isPlannerEventRow({ ...event(), location: null })).toBe(false);
    expect(isPlannerEventRow({ ...event(), notes: ['x'] })).toBe(false);
  });

  it('rejects unparseable created/updated timestamps', () => {
    expect(isPlannerEventRow({ ...event(), createdAt: 'not-a-date' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), updatedAt: 'not-a-date' })).toBe(false);
    expect(isPlannerEventRow({ ...event(), updatedAt: 0 })).toBe(false);
  });

  it('does not enforce store-level id uniqueness on a single row', () => {
    // Uniqueness needs the whole dataset and belongs to the store/snapshot layer.
    expect(isPlannerEventRow({ ...event(), id: 'event-copy' })).toBe(true);
  });

  it.each([null, undefined, 42, 'event-1', ['x'], true])(
    'rejects the non-object %s',
    (row) => {
      expect(isPlannerEventRow(row)).toBe(false);
    },
  );

  it('rejects an empty object', () => {
    expect(isPlannerEventRow({})).toBe(false);
  });
});

describe('isHolidayRow', () => {
  const holiday = (): Holiday => ({ ...createInitialHolidays(2026)[0] });

  it('accepts a seeded holiday', () => {
    expect(isHolidayRow(holiday())).toBe(true);
    for (const row of createInitialHolidays(2026)) {
      expect(isHolidayRow(row)).toBe(true);
    }
  });

  it('rejects an empty or non-string id', () => {
    expect(isHolidayRow({ ...holiday(), id: '' })).toBe(false);
    expect(isHolidayRow({ ...holiday(), id: 42 })).toBe(false);
    const missing = holiday() as unknown as Record<string, unknown>;
    delete missing.id;
    expect(isHolidayRow(missing)).toBe(false);
  });

  it('rejects an impossible or malformed date', () => {
    expect(isHolidayRow({ ...holiday(), date: '2026-02-30' })).toBe(false);
    expect(isHolidayRow({ ...holiday(), date: '01/01/2026' })).toBe(false);
    expect(isHolidayRow({ ...holiday(), date: null })).toBe(false);
  });

  it('requires a non-blank name', () => {
    expect(isHolidayRow({ ...holiday(), name: '' })).toBe(false);
    expect(isHolidayRow({ ...holiday(), name: '   ' })).toBe(false);
    expect(isHolidayRow({ ...holiday(), name: 42 })).toBe(false);
    const missing = holiday() as unknown as Record<string, unknown>;
    delete missing.name;
    expect(isHolidayRow(missing)).toBe(false);
  });

  it('does not enforce store-level date uniqueness on a single row', () => {
    // Uniqueness needs the whole dataset; that rule belongs to the store/snapshot
    // layer, not to a row guard that cannot see siblings.
    expect(isHolidayRow({ ...holiday() })).toBe(true);
    expect(isHolidayRow({ ...holiday(), id: 'holiday-copy' })).toBe(true);
  });

  it.each([null, 42, 'holiday', [], true])('rejects the non-object %s', (row) => {
    expect(isHolidayRow(row)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isHolidayRow({})).toBe(false);
  });
});

describe('isPlannerSettingsRow', () => {
  it('accepts the default settings', () => {
    expect(isPlannerSettingsRow({ maxConcurrentLeave: 3 })).toBe(true);
  });

  it('rejects a missing or non-numeric threshold', () => {
    expect(isPlannerSettingsRow({})).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: '3' })).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: null })).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: NaN })).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: Infinity })).toBe(false);
  });

  it('rejects a threshold that cannot describe a coverage limit', () => {
    expect(isPlannerSettingsRow({ maxConcurrentLeave: 0 })).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: -2 })).toBe(false);
    expect(isPlannerSettingsRow({ maxConcurrentLeave: 1.5 })).toBe(false);
  });

  it.each([null, 42, 'settings', [], true])('rejects the non-object %s', (row) => {
    expect(isPlannerSettingsRow(row)).toBe(false);
  });
});