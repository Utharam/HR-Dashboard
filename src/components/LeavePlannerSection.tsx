import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Employee, LeavePlan, LeaveStatus, LeaveType, PlannerSettings } from '../types';
import {
  countWorkingDays,
  dailyLeaveCounts,
  filterLeavePlans,
  isValidDateKey,
  monthGrid,
  parseDateKey,
  peakDays,
  plansOnDate,
  toDateKey,
} from '../utils/leavePlanner';
import { LeavePlanModal } from './LeavePlanModal';

/**
 * The leave planner: a month calendar of who is away, the filters that narrow
 * it, and the day/coverage panels around it.
 *
 * This component is deliberately presentational. The parent owns employees,
 * leave plans and settings, and every change here - a saved entry, a deletion,
 * a new coverage threshold - is reported back through a callback. Nothing in
 * this file reads a store, localStorage or the App state.
 *
 * Coverage numbers count distinct PEOPLE, not entries: one person with two
 * overlapping bookings is still one desk empty. Cancelled plans are listed in
 * the day panel (they are records someone may want to reopen) but never count
 * toward who is away.
 */

const ACTIVE_STATUSES: LeaveStatus[] = ['Planned', 'Approved'];

const LEAVE_TYPES: LeaveType[] = [
  'CL', 'SL', 'EL', 'LOP', 'Maternity', 'Paternity', 'Comp Off', 'Other',
];
const LEAVE_STATUSES: LeaveStatus[] = ['Planned', 'Approved', 'Cancelled'];

const TYPE_BADGE_CLASS: Record<LeaveType, string> = {
  CL: 'badge-active',
  SL: 'badge-info',
  EL: 'badge-purple',
  LOP: 'badge-notice',
  Maternity: 'badge-pink',
  Paternity: 'badge-info',
  'Comp Off': 'badge-primary',
  Other: 'badge-neutral',
};

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const FULL_DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
const SHORT_DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TODAY_TILE_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || '?';

/** Human description of a plan's paid length; working days exclude Sundays. */
const describeDuration = (plan: LeavePlan): string => {
  if (!isValidDateKey(plan.startDate) || !isValidDateKey(plan.endDate) || plan.startDate > plan.endDate) {
    return 'invalid dates';
  }
  if (plan.halfDay && plan.startDate === plan.endDate) {
    return `0.5 day (${plan.halfDay})`;
  }
  const days = countWorkingDays(plan.startDate, plan.endDate);
  return `${days} working ${days === 1 ? 'day' : 'days'}`;
};

interface DayModal {
  mode: 'add' | 'edit';
  plan?: LeavePlan;
  anchorDate?: string;
}

interface LeavePlannerSectionProps {
  employees: Employee[];
  leavePlans: LeavePlan[];
  settings: PlannerSettings;
  onSave: (plan: LeavePlan) => void;
  onDelete: (id: string) => void;
  onSettingsChange: (settings: PlannerSettings) => void;
}

export const LeavePlannerSection: React.FC<LeavePlannerSectionProps> = ({
  employees,
  leavePlans,
  settings,
  onSave,
  onDelete,
  onSettingsChange,
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
  const [leaveType, setLeaveType] = useState<LeaveType | 'ALL'>('ALL');
  const [status, setStatus] = useState<LeaveStatus | 'ALL'>('ALL');

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [modal, setModal] = useState<DayModal | null>(null);

  // The threshold field keeps a local draft so clearing it (an empty input while
  // the user types a new number) is a visible state, not an instant snap-back to
  // the parent's value. The draft follows the parent's value whenever the prop
  // changes from outside; the reset happens during render, not in an effect -
  // the same pattern the paginated sections use for their page state.
  const [thresholdState, setThresholdState] = useState({
    prop: settings.maxConcurrentLeave,
    text: String(settings.maxConcurrentLeave),
  });
  if (thresholdState.prop !== settings.maxConcurrentLeave) {
    setThresholdState({
      prop: settings.maxConcurrentLeave,
      text: String(settings.maxConcurrentLeave),
    });
  }

  const departments = [...new Set(employees.map((emp) => emp.department))].sort();
  const locations = [...new Set(employees.map((emp) => emp.location))].sort();

  // `filterLeavePlans` treats an absent filter as `undefined`; the 'ALL' select
  // sentinel is the UI's word for that absence and must not leak in as a value.
  const filteredPlans = filterLeavePlans(leavePlans, employees, {
    department: department === 'ALL' ? undefined : department,
    location: location === 'ALL' ? undefined : location,
    search,
    type: leaveType === 'ALL' ? undefined : leaveType,
    status: status === 'ALL' ? undefined : status,
  });
  const activePlans = filteredPlans.filter((plan) => ACTIVE_STATUSES.includes(plan.status));

  const monthStartKey = toDateKey(new Date(view.year, view.monthIndex, 1));
  const monthEndKey = toDateKey(new Date(view.year, view.monthIndex + 1, 0));
  const cells = monthGrid(view.year, view.monthIndex);
  const monthLabel = MONTH_LABEL.format(new Date(view.year, view.monthIndex, 1));

  // Coverage: distinct people per day across the displayed month. Cancelled
  // entries are already excluded by `activePlans`.
  const counts = dailyLeaveCounts(activePlans, monthStartKey, monthEndKey);
  const threshold = settings.maxConcurrentLeave;
  const peaks = peakDays(counts, threshold);

  const employeeById = new Map(employees.map((emp) => [emp.id, emp]));
  const nameOf = (employeeId: string): string =>
    employeeById.get(employeeId)?.name ?? 'Unknown employee';

  /** Distinct active entries on a day; the cell chips match the count badge. */
  const activeEntriesOn = (dateKey: string): LeavePlan[] => {
    const seen = new Set<string>();
    const entries: LeavePlan[] = [];
    for (const plan of plansOnDate(filteredPlans, dateKey, ACTIVE_STATUSES)) {
      if (seen.has(plan.employeeId)) continue;
      seen.add(plan.employeeId);
      entries.push(plan);
    }
    return entries;
  };

  const goPrevMonth = () => {
    setView((current) =>
      current.monthIndex === 0
        ? { year: current.year - 1, monthIndex: 11 }
        : { ...current, monthIndex: current.monthIndex - 1 },
    );
  };
  const goNextMonth = () => {
    setView((current) =>
      current.monthIndex === 11
        ? { year: current.year + 1, monthIndex: 0 }
        : { ...current, monthIndex: current.monthIndex + 1 },
    );
  };
  const goToday = () => {
    setView({ year: today.getFullYear(), monthIndex: today.getMonth() });
  };

  // Summary tiles. Tile values are derived from the same filtered view the
  // calendar shows, so a filter narrows the numbers as well as the grid.
  const onLeaveToday = new Set(
    plansOnDate(filteredPlans, todayKey, ACTIVE_STATUSES).map((plan) => plan.employeeId),
  ).size;
  const horizonKey = toDateKey(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30),
  );
  const upcomingCount = activePlans.filter(
    (plan) =>
      isValidDateKey(plan.startDate) &&
      isValidDateKey(plan.endDate) &&
      plan.startDate <= horizonKey &&
      plan.endDate >= todayKey,
  ).length;
  let bookedWorkingDays = 0;
  for (const plan of activePlans) {
    if (!isValidDateKey(plan.startDate) || !isValidDateKey(plan.endDate)) continue;
    const from = plan.startDate > monthStartKey ? plan.startDate : monthStartKey;
    const to = plan.endDate < monthEndKey ? plan.endDate : monthEndKey;
    if (from > to) continue;
    bookedWorkingDays +=
      plan.halfDay && plan.startDate === plan.endDate && from === plan.startDate
        ? 0.5
        : countWorkingDays(from, to);
  }
  const bookedLabel = Number.isInteger(bookedWorkingDays)
    ? String(bookedWorkingDays)
    : bookedWorkingDays.toFixed(1);

  const selectedEntries = selectedDateKey ? plansOnDate(filteredPlans, selectedDateKey) : [];
  const selectedLongLabel = selectedDateKey
    ? FULL_DAY_LABEL.format(parseDateKey(selectedDateKey))
    : '';

  return (
    <div className="section-stack">
      {/* Month navigation and filters */}
      <div className="omni-card planner-toolbar">
        <div className="planner-toolbar__nav">
          <button
            type="button"
            className="planner-nav-btn"
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
            className="planner-nav-btn"
            onClick={goNextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <h2 className="planner-toolbar__month">{monthLabel}</h2>
        </div>

        <div className="planner-toolbar__filters">
          <div className="omni-field">
            <label className="omni-label" htmlFor="planner-filter-department">
              Department
            </label>
            <select
              id="planner-filter-department"
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
            <label className="omni-label" htmlFor="planner-filter-location">
              Location
            </label>
            <select
              id="planner-filter-location"
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
            <label className="omni-label" htmlFor="planner-filter-search">
              Search
            </label>
            <input
              id="planner-filter-search"
              type="text"
              className="omni-input"
              aria-label="Search employees"
              placeholder="Name or employee ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="planner-filter-type">
              Leave type
            </label>
            <select
              id="planner-filter-type"
              className="omni-select"
              aria-label="Filter by leave type"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType | 'ALL')}
            >
              <option value="ALL">All types</option>
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="planner-filter-status">
              Status
            </label>
            <select
              id="planner-filter-status"
              className="omni-select"
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeaveStatus | 'ALL')}
            >
              <option value="ALL">All statuses</option>
              {LEAVE_STATUSES.map((leaveStatus) => (
                <option key={leaveStatus} value={leaveStatus}>{leaveStatus}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              setModal({ mode: 'add', anchorDate: selectedDateKey ?? undefined })
            }
          >
            <Plus size={15} aria-hidden="true" /> Add leave
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">People on leave today</span>
          <div className="kpi-value">{onLeaveToday}</div>
          <span className="kpi-sub">{TODAY_TILE_LABEL.format(today)}</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Peak day this month</span>
          <div className="kpi-value text-warning">
            {peaks.length > 0 ? SHORT_DAY_LABEL.format(parseDateKey(peaks[0].dateKey)) : '—'}
          </div>
          <span className="kpi-sub">
            {peaks.length > 0
              ? `${peaks[0].count} people away`
              : `below the threshold of ${threshold}`}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Upcoming leave · 30 days</span>
          <div className="kpi-value text-info">{upcomingCount}</div>
          <span className="kpi-sub">active entries ahead</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Working days booked</span>
          <div className="kpi-value text-success">{bookedLabel}</div>
          <span className="kpi-sub">in {monthLabel}, Sundays excluded</span>
        </div>
      </div>

      {/* Calendar and day panel */}
      <div className="planner-layout">
        <div className="omni-card omni-card--flush">
          <table className="planner-calendar">
            <caption className="sr-only">Leave calendar for {monthLabel}</caption>
            <thead>
              <tr>
                <th scope="col">Mon</th>
                <th scope="col">Tue</th>
                <th scope="col">Wed</th>
                <th scope="col">Thu</th>
                <th scope="col">Fri</th>
                <th scope="col">Sat</th>
                <th scope="col">Sun</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={cells[week * 7].dateKey}>
                  {cells.slice(week * 7, week * 7 + 7).map((cell) => {
                    const date = parseDateKey(cell.dateKey);
                    const count = counts.get(cell.dateKey) ?? 0;
                    const entries = activeEntriesOn(cell.dateKey);
                    const chips = entries.slice(0, 3);
                    const extra = entries.length - chips.length;
                    const isSunday = date.getDay() === 0;
                    const isSelected = selectedDateKey === cell.dateKey;
                    const cellClass = [
                      'planner-day',
                      !cell.inMonth && 'planner-day--out',
                      isSunday && 'planner-day--sunday',
                      cell.dateKey === todayKey && 'planner-day--today',
                      count > 0 && count >= threshold && 'planner-day--peak',
                      isSelected && 'planner-day--selected',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <td key={cell.dateKey}>
                        <button
                          type="button"
                          className={cellClass}
                          aria-pressed={isSelected}
                          aria-label={`${FULL_DAY_LABEL.format(date)}, ${
                            count === 0
                              ? 'no leave'
                              : count === 1
                                ? '1 person on leave'
                                : `${count} people on leave`
                          }`}
                          onClick={() => setSelectedDateKey(cell.dateKey)}
                        >
                          <span className="planner-day__head">
                            <span className="planner-day__num">{date.getDate()}</span>
                            {count > 0 && (
                              <span className="planner-day__count">{count}</span>
                            )}
                          </span>
                          {chips.length > 0 && (
                            <span className="planner-day__chips">
                              {chips.map((plan) => (
                                <span
                                  key={plan.id}
                                  className="planner-chip"
                                  title={nameOf(plan.employeeId)}
                                >
                                  {initialsOf(nameOf(plan.employeeId))}
                                </span>
                              ))}
                              {extra > 0 && (
                                <span className="planner-day__more">+{extra}</span>
                              )}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="omni-card planner-panel" aria-label="Day details">
          <div>
            <h3 className="omni-card-title">Day details</h3>
            {selectedDateKey ? (
              <p className="planner-panel__date">{selectedLongLabel}</p>
            ) : (
              <p className="omni-card-sub">
                Select a day on the calendar to review its leave entries.
              </p>
            )}
          </div>

          {selectedDateKey && (
            <div>
              {selectedEntries.length === 0 ? (
                <p className="planner-empty">No leave entries for this day.</p>
              ) : (
                <ul className="planner-entries">
                  {selectedEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className={`planner-entry${
                        entry.status === 'Cancelled' ? ' planner-entry--cancelled' : ''
                      }`}
                    >
                      <div className="planner-entry__head">
                        <span className="planner-entry__name">
                          {nameOf(entry.employeeId)}
                        </span>
                        <span className={`badge ${TYPE_BADGE_CLASS[entry.type] ?? 'badge-neutral'}`}>
                          {entry.type}
                        </span>
                      </div>
                      <div className="planner-entry__meta">
                        <span>{entry.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>{describeDuration(entry)}</span>
                        {entry.note && (
                          <span className="planner-entry__note">· {entry.note}</span>
                        )}
                      </div>
                      <div className="planner-entry__actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setModal({ mode: 'edit', plan: entry })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onDelete(entry.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <h4 className="planner-panel__heading">Peak days</h4>
            {peaks.length === 0 ? (
              <p className="planner-empty">
                No day this month reaches {threshold} people on leave.
              </p>
            ) : (
              <ul className="planner-daylist">
                {peaks.map((peak) => (
                  <li key={peak.dateKey}>
                    <span>{SHORT_DAY_LABEL.format(parseDateKey(peak.dateKey))}</span>
                    <span className="planner-daylist__count">{peak.count} on leave</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="planner-threshold">
              Coverage threshold
            </label>
            <input
              id="planner-threshold"
              type="number"
              className="omni-input"
              min={1}
              max={26}
              value={thresholdState.text}
              onChange={(e) => {
                setThresholdState((current) => ({ ...current, text: e.target.value }));
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 1) {
                  onSettingsChange({ maxConcurrentLeave: next });
                }
              }}
            />
            <span className="planner-hint">
              Days with this many people on leave are highlighted as coverage risks.
            </span>
          </div>
        </aside>
      </div>

      {modal && (
        <LeavePlanModal
          isOpen
          onClose={() => setModal(null)}
          onSave={onSave}
          employees={employees}
          plans={leavePlans}
          planToEdit={modal.mode === 'edit' ? modal.plan ?? null : null}
          initialDates={
            modal.mode === 'add' && modal.anchorDate
              ? { startDate: modal.anchorDate, endDate: modal.anchorDate }
              : null
          }
        />
      )}
    </div>
  );
};
