import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  AttendanceRecord,
  AttendanceRollup,
  AttendanceStatus,
  Employee,
  Holiday,
  LeavePlan,
  LeaveType,
} from '../types';
import {
  ATTENDANCE_CODES,
  holidayDateSet,
  isSunday,
  monthDateKeys,
  monthKey,
  recordToCode,
  rollupMonth,
  workingDateKeys,
} from '../utils/attendance';
import {
  attendanceTemplateFileName,
  buildAttendanceWorkbook,
  parseAttendanceWorkbook,
} from '../utils/attendanceExcel';
import type { ParseAttendanceResult } from '../utils/attendanceExcel';
import { eachDateKey, isValidDateKey, parseDateKey, toDateKey } from '../utils/leavePlanner';
import { scrollRegionLabel } from '../utils/pagination';
import { AttendanceCellModal, type GhostLeavePlan } from './AttendanceCellModal';
import { Callout } from './Callout';
import { ConfirmDialog } from './ConfirmDialog';
import { HolidayModal } from './HolidayModal';

/**
 * The monthly attendance workspace: a matrix of employees × days, the filters
 * and month navigation around it, a per-day editor, a monthly register (the
 * rollup payroll reads), the company holiday card and the Excel template/import
 * pair.
 *
 * This component is deliberately presentational, exactly like the leave
 * planner: the parent owns employees, attendance records, holidays and leave
 * plans, and every change here is reported back through a callback. Nothing in
 * this file reads a store, localStorage or the App state.
 *
 * Sundays and holidays are DERIVED, never stored per employee: the matrix
 * renders them as `WO`/`H` facts — the primary cell even where a record
 * exists, since the rollup ignores marks on non-working days — and the
 * importer ignores those cells. Approved leave plans show as ghost cells only
 * where no record exists — the planner stays the source of approved leave, the
 * matrix never invents a record from it, and bulk marking skips the planned.
 */

type ParsedAttendance = Extract<ParseAttendanceResult, { ok: true }>;

interface AttendanceSectionProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  holidays: Holiday[];
  leavePlans: LeavePlan[];
  onSaveRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
  onReplaceMonth: (monthKey: string, records: AttendanceRecord[]) => void;
  onSaveHoliday: (holiday: Holiday) => void;
  onDeleteHoliday: (id: string) => void;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const FULL_DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
const SHORT_DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
});
const WEEKDAY_INITIAL = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });

/** Status → cell tone class; the ghost/off variants are applied separately. */
const CELL_TONE: Record<AttendanceStatus, string> = {
  Present: 'attendance-cell--present',
  Absent: 'attendance-cell--absent',
  WFH: 'attendance-cell--wfh',
  HalfDay: 'attendance-cell--half',
  Leave: 'attendance-cell--leave',
};

/** Reverse of `ATTENDANCE_CODES`, derived from the one code table. */
const LEAVE_CODE_BY_TYPE = new Map<LeaveType, string>();
for (const [code, mapping] of Object.entries(ATTENDANCE_CODES)) {
  if (typeof mapping === 'object' && mapping.status === 'Leave' && mapping.leaveType) {
    LEAVE_CODE_BY_TYPE.set(mapping.leaveType, code);
  }
}

/** A short, readable list for preview warnings; a 199-ID wall is not a warning. */
const summarizeValues = (values: Array<string | number>, limit = 6): string => {
  const shown = values.slice(0, limit);
  const extra = values.length - shown.length;
  return extra > 0 ? `${shown.join(', ')} and ${extra} more` : shown.join(', ');
};

/** Half-day leave codes: `HD-<full code>`, derived the same way from the one
 * code table so a ghost cell for a half-day plan renders exactly what the
 * template prefills for the same plan. */
const HALF_LEAVE_CODE_BY_TYPE = new Map<LeaveType, string>();
for (const [code, mapping] of Object.entries(ATTENDANCE_CODES)) {
  if (typeof mapping === 'object' && mapping.status === 'Leave' && mapping.leaveType) {
    HALF_LEAVE_CODE_BY_TYPE.set(mapping.leaveType, `HD-${code}`);
  }
}

/** The ghost code for one approved plan: a half-day plan covers only one half,
 * so it shows the half-day code, everything else the full-leave code. */
const ghostCodeFor = (ghost: GhostLeavePlan): string =>
  ghost.halfDay
    ? HALF_LEAVE_CODE_BY_TYPE.get(ghost.type) ?? 'HD-O'
    : LEAVE_CODE_BY_TYPE.get(ghost.type) ?? 'O';

/** Canonical leave-type order for the register's leave column. */
const LEAVE_TYPE_ORDER: LeaveType[] = [
  'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
];

const LEGEND_ITEMS: Array<[string, string]> = [
  ['P', 'Present'],
  ['A', 'Absent'],
  ['W', 'WFH'],
  ['HD', 'Half day'],
  ['HD-…', 'Half day + leave type'],
  ['CL…O', 'Leave (by type)'],
  ['WO', 'Weekly off'],
  ['H', 'Holiday'],
  ['(blank)', 'Unmarked'],
];

const IMPORT_FAILURE_REASON: Record<string, string> = {
  'not-a-workbook': 'no Attendance sheet could be found in it',
  'missing-month': 'the month cell (B2) is missing or unreadable',
  'missing-header': 'no header row with an "Employee ID" column and day numbers was found',
  'no-employees': 'the roster in this workspace is empty',
};

/**
 * The gap fields the parser reports on a successful parse: roster employees the
 * sheet never carried, and day numbers the header never carried. Declared
 * OPTIONAL here so the preview compiles - and stays honest - against the parser
 * both before and after the parser starts filling them; every read defaults the
 * absence to "no gap known".
 */
export interface AttendanceImportGaps {
  missingEmployeeIds?: string[];
  missingDayNumbers?: number[];
}

/**
 * Why a preview must not offer Replace. Confirming a replace wipes the WHOLE
 * month, so it is only safe when the file described the whole roster and the
 * whole calendar: with sheet rows or day columns missing, the employees and
 * days the file left out would silently lose whatever the ledger already holds
 * for them. Returns the human-readable reasons; an empty list means replaceable.
 *
 * These helpers live beside the preview they govern on purpose (the wave keeps
 * util files out of this agent's scope) and are exported for their tests.
 */
// oxlint-disable-next-line react/only-export-components -- pure helper beside its preview, exported for tests
export const importBlockers = (
  preview: ParsedAttendance & AttendanceImportGaps,
  rosterSize: number,
): string[] => {
  const reasons: string[] = [];
  if (preview.records.length === 0) {
    reasons.push(
      'No attendance codes were parsed from the file; replacing would only erase what the ledger already holds.',
    );
  }
  if (preview.matchedEmployees < rosterSize) {
    reasons.push(
      `Only ${preview.matchedEmployees} of ${rosterSize} roster employees matched; the others would lose this month's records.`,
    );
  }
  const missingDays = preview.missingDayNumbers ?? [];
  if (missingDays.length > 0) {
    reasons.push(`Day columns missing from the header: ${missingDays.join(', ')}.`);
  }
  return reasons;
};

/** Attendance rate for one register row: `presentDays / workingDays * 100`,
 * 0 while the month has no working days to divide by. */
// oxlint-disable-next-line react/only-export-components -- pure helper beside its register, exported for tests
export const registerAttendancePct = (presentDays: number, workingDays: number): number =>
  workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

/** `CL 2 · SL 1` in canonical type order, `null` when the month has no leave.
 * Half-days contribute 0.5 and render with one decimal. */
// oxlint-disable-next-line react/only-export-components -- pure helper beside its register, exported for tests
export const formatLeaveByType = (
  leaveByType: AttendanceRollup['leaveByType'],
): string | null => {
  const parts: string[] = [];
  for (const type of LEAVE_TYPE_ORDER) {
    const days = leaveByType[type];
    if (days) parts.push(`${type} ${Number.isInteger(days) ? days : days.toFixed(1)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
};

// Module scope, like LeavePlanModal: the timestamp is captured at CALL time,
// inside event handlers, not during render.
const nowIso = (): string => new Date().toISOString();

export const AttendanceSection: React.FC<AttendanceSectionProps> = ({
  employees,
  attendance,
  holidays,
  leavePlans,
  onSaveRecord,
  onDeleteRecord,
  onReplaceMonth,
  onSaveHoliday,
  onDeleteHoliday,
}) => {
  // Captured once per mount: "today" cannot drift between renders.
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const [view, setView] = useState({
    year: today.getFullYear(),
    monthIndex: today.getMonth(),
  });

  const [department, setDepartment] = useState('ALL');
  const [location, setLocation] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [cellModal, setCellModal] = useState<{ employeeId: string; date: string } | null>(null);
  const [holidayModal, setHolidayModal] = useState<{ holiday: Holiday | null } | null>(null);
  const [pendingHolidayDelete, setPendingHolidayDelete] = useState<Holiday | null>(null);
  const [prefillPresent, setPrefillPresent] = useState(true);
  const [importPreview, setImportPreview] = useState<ParsedAttendance | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const monthPrefix = `${monthKey(view.year, view.monthIndex)}-`;
  const monthLabel = MONTH_LABEL.format(new Date(view.year, view.monthIndex, 1));
  const dates = monthDateKeys(view.year, view.monthIndex);
  const holidayDates = holidayDateSet(holidays);
  const workingDayCount = workingDateKeys(view.year, view.monthIndex, holidays).length;
  const monthHolidayNames = new Map<string, string>();
  for (const holiday of holidays) {
    if (isValidDateKey(holiday.date) && holiday.date.startsWith(monthPrefix)) {
      monthHolidayNames.set(holiday.date, holiday.name);
    }
  }
  const monthHolidays = holidays
    .filter((holiday) => isValidDateKey(holiday.date) && holiday.date.startsWith(monthPrefix))
    .sort((a, b) => a.date.localeCompare(b.date));

  const departments = [...new Set(employees.map((emp) => emp.department))].sort();
  const locations = [...new Set(employees.map((emp) => emp.location))].sort();

  const query = search.trim().toLowerCase();
  const filteredEmployees = employees.filter(
    (emp) =>
      (department === 'ALL' || emp.department === department) &&
      (location === 'ALL' || emp.location === location) &&
      (!query || `${emp.name} ${emp.id}`.toLowerCase().includes(query)),
  );

  // Canonical record lookup: the id is `${employeeId}|${date}`, so the map key
  // is exactly that and a messy duplicate collapses to its last entry.
  const recordsByEmployeeDate = new Map(
    attendance.map((record) => [`${record.employeeId}|${record.date}`, record] as const),
  );

  // Approved leave behind the ghost cells, in PLAN semantics (`halfDay` is the
  // half ON LEAVE, the planner's `AM only`/`PM only`; `null` a full day). The
  // first approved plan wins, exactly like the template's own map, so the
  // screen and the file can never disagree about a planned day.
  const ghostPlanByEmployeeDate = new Map<string, GhostLeavePlan>();
  for (const plan of leavePlans) {
    if (plan.status !== 'Approved') continue;
    for (const date of eachDateKey(plan.startDate, plan.endDate)) {
      const key = `${plan.employeeId}|${date}`;
      if (!ghostPlanByEmployeeDate.has(key)) {
        ghostPlanByEmployeeDate.set(key, { type: plan.type, halfDay: plan.halfDay });
      }
    }
  }

  // The monthly register reads the same rollup the payroll does, for the month
  // on screen - not for "today".
  const rollups = rollupMonth(attendance, employees, holidays, view.year, view.monthIndex);

  // The daily tiles describe the SELECTED day, defaulting to today while the
  // viewed month contains it. Navigating to another month therefore shows
  // "—" rather than a fake zero for a day that is not on screen.
  const summaryDateKey =
    selectedDateKey ?? (dates.includes(todayKey) ? todayKey : null);
  const summaryIsToday = summaryDateKey === todayKey;

  // M1: an off day is summarised as the off day it is. Records on it are kept
  // but never counted, so the tiles show the derived state and say so, instead
  // of letting a stray Present on a holiday masquerade as attendance.
  const summaryHolidayName = summaryDateKey
    ? monthHolidayNames.get(summaryDateKey)
    : undefined;
  const summaryOffLabel = summaryDateKey
    ? isSunday(summaryDateKey)
      ? 'weekly off'
      : summaryHolidayName
        ? `holiday: ${summaryHolidayName}`
        : null
    : null;
  const summaryIsOffDay = summaryOffLabel !== null;
  const shortSummaryDay = summaryDateKey
    ? SHORT_DAY_LABEL.format(parseDateKey(summaryDateKey))
    : '';

  const countOn = (predicate: (record: AttendanceRecord) => boolean): number | null => {
    if (!summaryDateKey) return null;
    return filteredEmployees.filter((emp) => {
      const record = recordsByEmployeeDate.get(`${emp.id}|${summaryDateKey}`);
      return record !== undefined && predicate(record);
    }).length;
  };
  const presentToday = summaryIsOffDay
    ? 0
    : countOn((record) => record.status === 'Present' || record.status === 'HalfDay');
  // "On leave" is the day's leave STATE: a recorded leave, or an approved plan
  // still awaiting its record. A mark is authoritative; the planner only fills
  // the unmarked rest, so a planned employee is never also counted unmarked.
  const leaveToday = summaryIsOffDay
    ? 0
    : summaryDateKey === null
      ? null
      : filteredEmployees.filter((emp) => {
          const record = recordsByEmployeeDate.get(`${emp.id}|${summaryDateKey}`);
          return record
            ? record.status === 'Leave'
            : ghostPlanByEmployeeDate.has(`${emp.id}|${summaryDateKey}`);
        }).length;
  const absentToday = summaryIsOffDay ? 0 : countOn((record) => record.status === 'Absent');
  const wfhToday = summaryIsOffDay ? 0 : countOn((record) => record.status === 'WFH');
  const unmarkedToday = summaryIsOffDay
    ? 0
    : summaryDateKey === null
      ? null
      : filteredEmployees.filter((emp) => {
          return (
            !recordsByEmployeeDate.has(`${emp.id}|${summaryDateKey}`) &&
            !ghostPlanByEmployeeDate.has(`${emp.id}|${summaryDateKey}`)
          );
        }).length;

  const selectedIsSunday = selectedDateKey !== null && isSunday(selectedDateKey);
  const selectedHolidayName = selectedDateKey
    ? monthHolidayNames.get(selectedDateKey)
    : undefined;
  const selectedIsOffDay = selectedDateKey !== null &&
    (selectedIsSunday || selectedHolidayName !== undefined);
  // Unmarked means "no record AND no approved plan": a planned employee is
  // reported separately below, so bulk marking never talks over the planner.
  const unmarkedOnSelectedDay = selectedDateKey
    ? filteredEmployees.filter(
        (emp) =>
          !recordsByEmployeeDate.has(`${emp.id}|${selectedDateKey}`) &&
          !ghostPlanByEmployeeDate.has(`${emp.id}|${selectedDateKey}`),
      )
    : [];
  const plannedOnSelectedDay = selectedDateKey && !selectedIsOffDay
    ? filteredEmployees.filter(
        (emp) =>
          !recordsByEmployeeDate.has(`${emp.id}|${selectedDateKey}`) &&
          ghostPlanByEmployeeDate.has(`${emp.id}|${selectedDateKey}`),
      )
    : [];

  const goPrevMonth = () => {
    setSelectedDateKey(null);
    setView((current) =>
      current.monthIndex === 0
        ? { year: current.year - 1, monthIndex: 11 }
        : { ...current, monthIndex: current.monthIndex - 1 },
    );
  };
  const goNextMonth = () => {
    setSelectedDateKey(null);
    setView((current) =>
      current.monthIndex === 11
        ? { year: current.year + 1, monthIndex: 0 }
        : { ...current, monthIndex: current.monthIndex + 1 },
    );
  };
  const goToday = () => {
    setSelectedDateKey(null);
    setView({ year: today.getFullYear(), monthIndex: today.getMonth() });
  };

  /** Marks every UNMARKED filtered employee present; an existing mark wins and
   * an approved leave plan is never overwritten by the bulk mark. */
  const markAllPresent = () => {
    if (!selectedDateKey) return;
    const timestamp = nowIso();
    for (const emp of unmarkedOnSelectedDay) {
      onSaveRecord({
        id: `${emp.id}|${selectedDateKey}`,
        employeeId: emp.id,
        date: selectedDateKey,
        status: 'Present',
        source: 'manual',
        updatedAt: timestamp,
      });
    }
  };

  const handleDownloadTemplate = () => {
    // The template always carries the FULL roster: the file HR fills in must
    // not depend on whatever filter happens to be left over on screen.
    try {
      // C1: the ledger rides along so the template reflects existing records
      // (cell precedence: Sunday -> holiday -> record -> approved leave ->
      // prefill). Held in a variable rather than an inline literal so the call
      // compiles both before and after the writer learns to read `attendance`.
      const templateInput = {
        employees,
        holidays,
        leavePlans,
        year: view.year,
        monthIndex: view.monthIndex,
        prefillPresent,
        attendance,
      };
      const workbook = buildAttendanceWorkbook(templateInput);
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attendanceTemplateFileName(view.year, view.monthIndex);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({
        tone: 'danger',
        text: 'The template could not be downloaded in this browser. Try again, or use a different browser.',
      });
    }
  };

  const handleFileChosen = async (file: File) => {
    setNotice(null);
    setImportPreview(null);

    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch {
      setNotice({
        tone: 'danger',
        text: 'The file could not be read in this browser. Try again, or use a different browser.',
      });
      return;
    }

    const result = parseAttendanceWorkbook(data, employees);
    if (!result.ok) {
      setNotice({
        tone: 'danger',
        text: `This file is not a monthly attendance matrix: ${IMPORT_FAILURE_REASON[result.reason] ?? result.reason}.`,
      });
      return;
    }
    setImportPreview(result);
  };

  const confirmImport = () => {
    if (!importPreview) return;
    const { monthKey: parsedMonth, records } = importPreview;
    const replacedCount = attendance.filter(
      (record) => isValidDateKey(record.date) && record.date.startsWith(`${parsedMonth}-`),
    ).length;
    onReplaceMonth(parsedMonth, records);
    setNotice({
      tone: 'success',
      text: `Attendance for ${MONTH_LABEL.format(new Date(
        Number(parsedMonth.slice(0, 4)),
        Number(parsedMonth.slice(5, 7)) - 1,
        1,
      ))} replaced: ${records.length} records imported, ${replacedCount} previous records removed. Other months are untouched.`,
    });
    setImportPreview(null);
  };

  // The parser-reported gaps (Agent A's contract), read defensively so the
  // preview renders and stays honest both before and after the parser fills
  // them; an absent field reads as "no gap known".
  const previewGaps = (importPreview ?? null) as (ParsedAttendance & AttendanceImportGaps) | null;
  const missingEmployeeIds = previewGaps?.missingEmployeeIds ?? [];
  const missingDayNumbers = previewGaps?.missingDayNumbers ?? [];
  const replaceBlockers = previewGaps
    ? importBlockers(previewGaps, employees.length)
    : [];

  const describeCell = (
    dateKey: string,
    record: AttendanceRecord | undefined,
    ghostCode: string | undefined,
  ): string => {
    // M1: on a derived non-working day the calendar fact is what the cell SAYS,
    // even over an existing record - the rollup ignores such marks.
    if (isSunday(dateKey)) {
      return record
        ? `WO — a record (${recordToCode(record)}) is kept but ignored`
        : 'WO';
    }
    if (holidayDates.has(dateKey)) {
      return record
        ? `H — a record (${recordToCode(record)}) is kept but ignored`
        : 'H';
    }
    if (record) return recordToCode(record);
    if (ghostCode) return `${ghostCode} (approved leave, unmarked)`;
    return 'unmarked';
  };

  const renderCell = (employee: Employee, dateKey: string) => {
    const record = recordsByEmployeeDate.get(`${employee.id}|${dateKey}`);
    const sunday = isSunday(dateKey);
    const holidayName = monthHolidayNames.get(dateKey);
    const off = sunday || holidayName !== undefined;
    const ghost = off || record
      ? undefined
      : ghostPlanByEmployeeDate.get(`${employee.id}|${dateKey}`);
    const ghostCode = ghost ? ghostCodeFor(ghost) : undefined;

    const ariaLabel = `${employee.name}, ${FULL_DAY_LABEL.format(parseDateKey(dateKey))}: ${describeCell(dateKey, record, ghostCode)}`;

    // M1: the off-day fact is the PRIMARY cell even where a record exists,
    // because the rollup never counts marks on Sundays or holidays. The cell
    // stays clickable so the record behind it stays reachable and editable;
    // its title and aria name say the record is kept but ignored.
    if (off) {
      const code = sunday ? 'WO' : 'H';
      const tone = sunday ? 'attendance-cell--off' : 'attendance-cell--holiday';
      const offTitle = sunday ? 'Weekly off' : `Holiday — ${holidayName}`;
      if (!record) {
        return (
          <td key={dateKey} className="attendance-matrix__cell">
            <span
              className={`attendance-cell ${tone}`}
              title={offTitle}
              aria-label={ariaLabel}
            >
              {code}
            </span>
          </td>
        );
      }
      return (
        <td key={dateKey} className="attendance-matrix__cell">
          <button
            type="button"
            className={`attendance-cell ${tone} attendance-cell--offday`}
            title={`${offTitle} — a record (${recordToCode(record)}) is kept here but not counted`}
            aria-label={ariaLabel}
            onClick={() => setCellModal({ employeeId: employee.id, date: dateKey })}
          >
            {code}
          </button>
        </td>
      );
    }

    const toneClass = record
      ? CELL_TONE[record.status]
      : ghostCode
        ? 'attendance-cell--ghost'
        : '';
    const title = record
      ? (record.note ?? undefined)
      : ghostCode
        ? 'Approved leave plan — no attendance record yet'
        : undefined;

    return (
      <td key={dateKey} className="attendance-matrix__cell">
        <button
          type="button"
          className={`attendance-cell ${toneClass}`.trim()}
          title={title}
          aria-label={ariaLabel}
          onClick={() => setCellModal({ employeeId: employee.id, date: dateKey })}
        >
          {record ? recordToCode(record) : ghostCode ?? ''}
        </button>
      </td>
    );
  };

  const cellEmployee = cellModal
    ? employees.find((emp) => emp.id === cellModal.employeeId)
    : undefined;

  const previewMonthLabel = importPreview
    ? MONTH_LABEL.format(new Date(
        Number(importPreview.monthKey.slice(0, 4)),
        Number(importPreview.monthKey.slice(5, 7)) - 1,
        1,
      ))
    : '';
  const previewReplacedCount = importPreview
    ? attendance.filter(
        (record) =>
          isValidDateKey(record.date) &&
          record.date.startsWith(`${importPreview.monthKey}-`),
      ).length
    : 0;
  const previewIssues = importPreview?.issues ?? [];
  const shownIssues = previewIssues.slice(0, 8);

  return (
    <div className="section-stack">
      {/* Month navigation, filters and the Excel toolbar */}
      <div className="omni-card attendance-toolbar">
        <div className="attendance-toolbar__nav">
          <button
            type="button"
            className="attendance-nav-btn"
            onClick={goPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="attendance-nav-btn"
            onClick={goNextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <h2 className="attendance-toolbar__month">{monthLabel}</h2>
        </div>

        <div className="attendance-toolbar__filters">
          <div className="omni-field">
            <label className="omni-label" htmlFor="attendance-filter-department">
              Department
            </label>
            <select
              id="attendance-filter-department"
              className="omni-select"
              aria-label="Filter by department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="ALL">All departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="attendance-filter-location">
              Location
            </label>
            <select
              id="attendance-filter-location"
              className="omni-select"
              aria-label="Filter by location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="ALL">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="attendance-filter-search">
              Search
            </label>
            <input
              id="attendance-filter-search"
              type="text"
              className="omni-input"
              aria-label="Search employees"
              placeholder="Name or employee ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="attendance-toolbar__actions">
          <label className="attendance-prefill">
            <input
              type="checkbox"
              checked={prefillPresent}
              onChange={(e) => setPrefillPresent(e.target.checked)}
            />
            Prefill working days as Present
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadTemplate}
            title="Builds the monthly matrix for the full roster, with Sundays, holidays and approved leave filled in"
          >
            <Download size={15} aria-hidden="true" /> Download template
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} aria-hidden="true" /> Import attendance
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            aria-label="Choose attendance file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
              // Allow choosing the SAME file twice in a row to re-open the preview.
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {notice && (
        <Callout tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Callout>
      )}

      {/* Import preview: the month is only replaced after this is confirmed. */}
      {importPreview && (
        <section className="omni-card attendance-preview" aria-label="Import preview">
          <div className="omni-card-header">
            <div>
              <h3 className="omni-card-title">Import preview</h3>
              <p className="omni-card-sub">
                Confirming replaces ALL attendance for {previewMonthLabel}. Other
                months are untouched.
              </p>
            </div>
          </div>

          <dl className="attendance-preview__counts">
            <div className="attendance-preview__count">
              <dt>Month</dt>
              <dd>{previewMonthLabel}</dd>
            </div>
            <div className="attendance-preview__count">
              <dt>Employees matched</dt>
              <dd>{importPreview.matchedEmployees}</dd>
            </div>
            <div className="attendance-preview__count">
              <dt>Records to import</dt>
              <dd>{importPreview.records.length}</dd>
            </div>
            <div className="attendance-preview__count">
              <dt>Records replaced</dt>
              <dd>{previewReplacedCount}</dd>
            </div>
            <div className="attendance-preview__count">
              <dt>Issues</dt>
              <dd>{previewIssues.length}</dd>
            </div>
          </dl>

          {importPreview.unknownEmployeeIds.length > 0 && (
            <p className="attendance-preview__unknown">
              Unknown employee IDs: {summarizeValues(importPreview.unknownEmployeeIds)}. Their
              rows were skipped.
            </p>
          )}

          {missingEmployeeIds.length > 0 && (
            <p className="attendance-preview__danger">
              {missingEmployeeIds.length === 1
                ? '1 roster employee is'
                : `${missingEmployeeIds.length} roster employees are`}{' '}
              not in the file: {summarizeValues(missingEmployeeIds)}.
            </p>
          )}
          {missingDayNumbers.length > 0 && (
            <p className="attendance-preview__danger">
              Day columns missing from the header: {summarizeValues(missingDayNumbers, 8)}.
            </p>
          )}

          {replaceBlockers.length > 0 && (
            <div className="alert tone-danger" role="alert">
              <p>Replace is disabled for this file:</p>
              <ul>
                {replaceBlockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {previewIssues.length > 0 && (
            <div className="attendance-preview__issues">
              <h4 className="attendance-panel__heading">Issues</h4>
              <ul>
                {shownIssues.map((issue, index) => (
                  <li key={`${issue.row}-${index}`}>{issue.message}</li>
                ))}
                {previewIssues.length > shownIssues.length && (
                  <li>+{previewIssues.length - shownIssues.length} more issues not listed.</li>
                )}
              </ul>
            </div>
          )}

          <div className="attendance-preview__actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setImportPreview(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={confirmImport}
              disabled={replaceBlockers.length > 0}
              title={
                replaceBlockers.length > 0
                  ? 'The file does not describe the whole roster and calendar, so replacing would silently lose records.'
                  : undefined
              }
            >
              Replace {previewMonthLabel}
            </button>
          </div>
        </section>
      )}

      {/* Summary tiles */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Working days</span>
          <div className="kpi-value">{workingDayCount}</div>
          <span className="kpi-sub">in {monthLabel}, Sundays &amp; holidays excluded</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Present</span>
          <div className="kpi-value text-success">
            {presentToday === null ? '—' : presentToday}
          </div>
          <span className="kpi-sub">
            {summaryIsOffDay
              ? `${shortSummaryDay} · ${summaryOffLabel} — marks kept, not counted`
              : summaryDateKey
                ? `${shortSummaryDay}${summaryIsToday ? ' (today)' : ''}, half-days included`
                : 'select a day to summarise'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">On leave</span>
          <div className="kpi-value text-info">
            {leaveToday === null ? '—' : leaveToday}
          </div>
          <span className="kpi-sub">
            {summaryIsOffDay
              ? `${shortSummaryDay} · ${summaryOffLabel}`
              : summaryDateKey
                ? `${shortSummaryDay} · records + approved plans`
                : 'select a day to summarise'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Absent</span>
          <div className="kpi-value text-danger">
            {absentToday === null ? '—' : absentToday}
          </div>
          <span className="kpi-sub">
            {summaryIsOffDay
              ? `${shortSummaryDay} · ${summaryOffLabel}`
              : shortSummaryDay || 'select a day to summarise'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">WFH</span>
          <div className="kpi-value text-info">
            {wfhToday === null ? '—' : wfhToday}
          </div>
          <span className="kpi-sub">
            {summaryIsOffDay
              ? `${shortSummaryDay} · ${summaryOffLabel}`
              : shortSummaryDay || 'select a day to summarise'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Unmarked</span>
          <div className="kpi-value text-warning">
            {unmarkedToday === null ? '—' : unmarkedToday}
          </div>
          <span className="kpi-sub">
            {summaryIsOffDay
              ? `${summaryOffLabel} — nothing to mark`
              : summaryDateKey
                ? `of ${filteredEmployees.length} filtered employees on ${shortSummaryDay}`
                : 'select a day to summarise'}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Holidays</span>
          <div className="kpi-value text-purple">{monthHolidays.length}</div>
          <span className="kpi-sub">in {monthLabel}, company-wide</span>
        </div>
      </div>

      {/* Matrix and day editor */}
      <div className="attendance-layout">
        <div className="omni-card omni-card--flush">
          <div className="omni-card-header">
            <div>
              <h3 className="omni-card-title">Attendance matrix</h3>
              <p className="omni-card-sub">
                One row per employee, one column per day. Click a cell to edit it;
                click a day number to open the day editor.
              </p>
            </div>
            <span className="pagination__count">
              {filteredEmployees.length} of {employees.length} employees
            </span>
          </div>

          <div
            className="omni-table-wrap"
            role="region"
            aria-label={scrollRegionLabel(`Attendance matrix, ${monthLabel}`)}
            tabIndex={0}
          >
            <table className="attendance-matrix">
              <caption className="sr-only">
                Attendance matrix for {monthLabel}: {filteredEmployees.length} employees
                by {dates.length} days. Sundays and holidays are derived, not stored.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="attendance-sticky attendance-sticky--id">
                    Employee ID
                  </th>
                  <th scope="col" className="attendance-sticky attendance-sticky--name">
                    Employee
                  </th>
                  {dates.map((dateKey) => {
                    const date = parseDateKey(dateKey);
                    const sunday = isSunday(dateKey);
                    const holidayName = monthHolidayNames.get(dateKey);
                    const selected = selectedDateKey === dateKey;
                    const headClass = [
                      'attendance-day-head',
                      sunday && 'attendance-day-head--sunday',
                      holidayName && 'attendance-day-head--holiday',
                      dateKey === todayKey && 'attendance-day-head--today',
                      selected && 'attendance-day-head--selected',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const dayName = FULL_DAY_LABEL.format(date);
                    const suffix = sunday
                      ? ', weekly off'
                      : holidayName
                        ? `, holiday: ${holidayName}`
                        : '';

                    return (
                      <th key={dateKey} scope="col" className={headClass}>
                        <button
                          type="button"
                          className="attendance-day-head__btn"
                          aria-pressed={selected}
                          aria-label={`${dayName}${suffix}. Open the day editor.`}
                          title={holidayName}
                          onClick={() => setSelectedDateKey(dateKey)}
                        >
                          <span className="attendance-day-head__num">{date.getDate()}</span>
                          <span className="attendance-day-head__wd" aria-hidden="true">
                            {WEEKDAY_INITIAL.format(date)}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <th scope="row" className="attendance-sticky attendance-sticky--id attendance-rowhead">
                      {emp.id}
                    </th>
                    <th scope="row" className="attendance-sticky attendance-sticky--name attendance-rowhead">
                      {emp.name}
                    </th>
                    {dates.map((dateKey) => renderCell(emp, dateKey))}
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={dates.length + 2}>
                      <div className="empty-cell">
                        No employees match the current filters.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="attendance-legend">
            {LEGEND_ITEMS.map(([code, meaning]) => (
              <span key={code} className="attendance-legend__item">
                <span className="attendance-legend__code">{code}</span>
                {meaning}
              </span>
            ))}
          </div>
        </div>

        <aside className="omni-card attendance-panel" aria-label="Day editor">
          <div>
            <h3 className="omni-card-title">Day editor</h3>
            {selectedDateKey ? (
              <p className="attendance-panel__date">
                {FULL_DAY_LABEL.format(parseDateKey(selectedDateKey))}
                {selectedIsSunday ? ' · weekly off' : ''}
                {selectedHolidayName ? ` · holiday: ${selectedHolidayName}` : ''}
              </p>
            ) : (
              <p className="omni-card-sub">
                Select a day column to review and mark attendance.
              </p>
            )}
          </div>

          {selectedDateKey && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={markAllPresent}
                disabled={selectedIsOffDay || unmarkedOnSelectedDay.length === 0}
                title={
                  selectedIsOffDay
                    ? 'Sundays and holidays are non-working days; the rollup ignores records on them'
                    : 'Marks every filtered employee without a record as Present (approved leave plans are skipped)'
                }
              >
                Mark all present
              </button>
              {selectedIsOffDay && (
                <p className="attendance-hint">
                  {selectedIsSunday ? 'A weekly off' : `A holiday (${selectedHolidayName})`}
                  {' '}is not a working day, so no bulk marking is offered.
                </p>
              )}
              {!selectedIsOffDay && plannedOnSelectedDay.length > 0 && (
                <p className="attendance-hint">
                  {plannedOnSelectedDay.length === 1
                    ? '1 employee has'
                    : `${plannedOnSelectedDay.length} employees have`}{' '}
                  an approved leave plan on this day and{' '}
                  {plannedOnSelectedDay.length === 1 ? 'is' : 'are'} skipped by the bulk
                  mark; the planner stays their source of truth.
                  {unmarkedOnSelectedDay.length === 0
                    ? ' Everyone is covered; nothing to mark.'
                    : ''}
                </p>
              )}

              {filteredEmployees.length === 0 ? (
                <p className="attendance-hint">No employees match the current filters.</p>
              ) : (
                <ul className="attendance-daylist">
                  {filteredEmployees.map((emp) => {
                    const record = recordsByEmployeeDate.get(`${emp.id}|${selectedDateKey}`);
                    const ghost = !record && !selectedIsOffDay
                      ? ghostPlanByEmployeeDate.get(`${emp.id}|${selectedDateKey}`)
                      : undefined;
                    const code = record
                      ? recordToCode(record)
                      : selectedIsOffDay
                        ? (selectedIsSunday ? 'WO' : 'H')
                        : ghost
                          ? `${ghostCodeFor(ghost)} (planned)`
                          : '—';
                    return (
                      <li key={emp.id} className="attendance-daylist__row">
                        <span className="attendance-daylist__name">{emp.name}</span>
                        <span
                          className={`attendance-daylist__code${ghost ? ' attendance-daylist__code--planned' : ''}`}
                          title={
                            ghost
                              ? 'Approved leave plan — no attendance record yet'
                              : undefined
                          }
                        >
                          {code}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Edit attendance for ${emp.name}, ${FULL_DAY_LABEL.format(parseDateKey(selectedDateKey))}`}
                          onClick={() =>
                            setCellModal({ employeeId: emp.id, date: selectedDateKey })
                          }
                        >
                          Edit
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>

      {/* I3: the monthly register — the same rollup the payroll reads, for the
          month on screen, so a whole month's ledger is reviewable at a glance. */}
      <div className="omni-card attendance-register">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Monthly register</h3>
            <p className="omni-card-sub">
              Rollup for {monthLabel}: present days, leave by type, LOP and the
              attendance rate against {workingDayCount} working days. Records on
              Sundays and holidays are ignored.
            </p>
          </div>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label={scrollRegionLabel(`Monthly attendance register, ${monthLabel}`)}
          tabIndex={0}
        >
          <table className="omni-table attendance-register__table">
            <caption className="sr-only">
              Monthly attendance register for {monthLabel}: present days, leave by
              type, LOP, working days and attendance rate per employee.
            </caption>
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col" className="cell-num">Present</th>
                <th scope="col">Leave</th>
                <th scope="col" className="cell-num">LOP</th>
                <th scope="col" className="cell-num">Working days</th>
                <th scope="col" className="cell-num">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const rollup = rollups.get(emp.id);
                if (!rollup) return null;
                // No counted working-day records means no rate to show: a month
                // with nothing on a working day is "no data", not 0%.
                const countedDays =
                  rollup.presentDays + rollup.leaveDays + rollup.absentDays;
                return (
                  <tr key={emp.id}>
                    <th scope="row" className="attendance-register__name">
                      {emp.name}
                    </th>
                    <td className="cell-num">{rollup.presentDays}</td>
                    <td className="cell-muted">
                      {formatLeaveByType(rollup.leaveByType) ?? '—'}
                    </td>
                    <td className="cell-num">{rollup.lopDays}</td>
                    <td className="cell-num">{rollup.workingDays}</td>
                    <td className="cell-num">
                      {countedDays > 0
                        ? `${registerAttendancePct(rollup.presentDays, rollup.workingDays).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length === 0 && (
          <p className="attendance-hint">No employees match the current filters.</p>
        )}
      </div>

      {/* Holiday card */}
      <div className="omni-card attendance-holidays">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Holidays</h3>
            <p className="omni-card-sub">
              Company-wide holidays in {monthLabel}. Holidays and Sundays are
              excluded from working days everywhere.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setHolidayModal({ holiday: null })}
          >
            <Plus size={15} aria-hidden="true" /> Add holiday
          </button>
        </div>

        {monthHolidays.length === 0 ? (
          <p className="attendance-hint">
            No holidays in {monthLabel}. Add one to exclude the day from working
            days, the matrix and payroll.
          </p>
        ) : (
          <ul className="attendance-holiday-list">
            {monthHolidays.map((holiday) => (
              <li key={holiday.id} className="attendance-holiday">
                <div className="attendance-holiday__head">
                  <span className="attendance-holiday__name">{holiday.name}</span>
                  <span className="attendance-holiday__date">
                    {FULL_DAY_LABEL.format(parseDateKey(holiday.date))}
                  </span>
                </div>
                <div className="attendance-holiday__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={`Edit ${holiday.name}`}
                    onClick={() => setHolidayModal({ holiday })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    aria-label={`Delete ${holiday.name}`}
                    onClick={() => setPendingHolidayDelete(holiday)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cellModal && cellEmployee && (
        <AttendanceCellModal
          isOpen
          onClose={() => setCellModal(null)}
          onSave={onSaveRecord}
          onDeleteRecord={onDeleteRecord}
          employee={cellEmployee}
          date={cellModal.date}
          existing={
            recordsByEmployeeDate.get(`${cellModal.employeeId}|${cellModal.date}`) ?? null
          }
          // I5: an approved plan covering an unmarked cell starts the form from
          // the plan (Leave, or HalfDay for a half-day plan) instead of Present.
          ghost={
            recordsByEmployeeDate.has(`${cellModal.employeeId}|${cellModal.date}`)
              ? null
              : ghostPlanByEmployeeDate.get(`${cellModal.employeeId}|${cellModal.date}`) ?? null
          }
          offDayLabel={
            isSunday(cellModal.date)
              ? 'Weekly off (Sunday)'
              : monthHolidayNames.get(cellModal.date)
                ? `Holiday — ${monthHolidayNames.get(cellModal.date)}`
                : null
          }
        />
      )}

      {holidayModal && (
        <HolidayModal
          isOpen
          onClose={() => setHolidayModal(null)}
          onSave={onSaveHoliday}
          holidays={holidays}
          holidayToEdit={holidayModal.holiday}
        />
      )}

      {/* Asked last so it stacks above the cards, the same placement rule the
          planner and the Admin import dialog follow. */}
      {pendingHolidayDelete && (
        <ConfirmDialog
          isOpen
          title="Delete this holiday?"
          message={`This removes ${pendingHolidayDelete.name} (${FULL_DAY_LABEL.format(
            parseDateKey(pendingHolidayDelete.date),
          )}). The date becomes a working day again. This cannot be undone.`}
          confirmLabel="Delete holiday"
          onConfirm={() => {
            onDeleteHoliday(pendingHolidayDelete.id);
            setPendingHolidayDelete(null);
          }}
          onCancel={() => setPendingHolidayDelete(null)}
        />
      )}
    </div>
  );
};
