import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PageToolbar } from './components/PageToolbar';
import { OverviewSection } from './components/OverviewSection';
import { DirectorySection } from './components/DirectorySection';
import { AttendanceSection } from './components/AttendanceSection';
import { PayrollSection } from './components/PayrollSection';
import { PerformanceSection } from './components/PerformanceSection';
import { RecruitmentSection } from './components/RecruitmentSection';
import { RetentionSection } from './components/RetentionSection';
import { TrendsSection } from './components/TrendsSection';
import { ExcelHubSection } from './components/ExcelHubSection';
import { AdminSection } from './components/AdminSection';
import { PolicySection } from './components/PolicySection';
import { GuidesSection } from './components/GuidesSection';
import { PlannerSection } from './components/PlannerSection';
import { EmployeeModal } from './components/EmployeeModal';
import { AddEmployeeModal } from './components/AddEmployeeModal';
import { Callout } from './components/Callout';
import { ConfirmDialog } from './components/ConfirmDialog';

import type {
  AttendanceRecord,
  Employee,
  ActiveTab,
  Holiday,
  HRPolicy,
  LeavePlan,
  PayrollEmployee,
  PlannerEvent,
  PlannerSettings,
} from './types';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DataSnapshot,
  type DataStore,
  type StoreBackend,
} from './data/DataStore';
import { 
  INITIAL_EMPLOYEES, 
  INITIAL_DEPARTMENTS, 
  INITIAL_LOCATIONS, 
  INITIAL_TRACKER, 
  INITIAL_REQUISITIONS 
} from './data/initialData';
import { INITIAL_POLICIES } from './data/initialPolicies';
import { createInitialLeavePlans } from './data/initialLeavePlans';
import { createInitialAttendance } from './data/initialAttendance';
import { createInitialHolidays } from './data/initialHolidays';
import { createInitialPlannerEvents } from './data/initialPlannerEvents';
import { computePayroll, isActive } from './utils/payroll';
import { rollupMonth } from './utils/attendance';
import { buildStaffRosterRows, STAFF_ROSTER_COLUMNS } from './utils/excelSchema';
import { loadPersisted, savePersisted, clearPersisted } from './utils/storage';
import {
  isAttendanceRecordRow,
  isEmployeeRow,
  isHolidayRow,
  isLeavePlanRow,
  isPlannerEventRow,
  isPlannerSettingsRow,
  isPolicyRow,
} from './utils/rowValidators';

const EMPLOYEES_KEY = 'omnihr_employees';
const POLICIES_KEY = 'omnihr_policies';
// The leave planner's two keys. These are the same envelopes the IndexedDB
// migration and the localStorage fallback store read, so a browser that falls
// back between backends finds the same data either way. Duplicated as literals
// here to match the local pattern above (App reads storage itself on the legacy
// path and should not need the store module's key map to do so).
const LEAVE_PLANS_KEY = 'omnihr_leave_plans';
const PLANNER_SETTINGS_KEY = 'omnihr_planner_settings';
// The Planner's general-event calendar joins the leave plans and settings under
// the same rule: this literal is the exact key the store layer reads and writes
// (STORAGE_KEYS.plannerEvents), so a browser that switches backend finds the
// same data either way.
const PLANNER_EVENTS_KEY = 'omnihr_planner_events';
// The daily attendance ledger and the company holiday calendar join them under
// the same rule: these literals are the exact keys the store layer reads and
// writes, so a browser that switches backend finds the same data either way.
const ATTENDANCE_KEY = 'omnihr_attendance';
const HOLIDAYS_KEY = 'omnihr_holidays';

/**
 * The tabs whose sections work on the filtered roster (design decision D2): the
 * page-owned `PageToolbar` (search, department, location, Add Staff) renders on
 * exactly these. Attendance and the planner carry their own filters; Admin,
 * Policies and Guides filter nothing, so they render no toolbar at all.
 */
const TOOLBAR_TABS: ActiveTab[] = [
  'overview',
  'directory',
  'payroll',
  'performance',
  'recruitment',
  'retention',
  'trends',
];

/**
 * True when the sidebar is the off-canvas drawer (the 760px breakpoint in
 * index.css). Above that breakpoint the same header toggle collapses and
 * restores the in-grid sidebar, so choosing a page or pressing Escape must
 * not close it there. The fallback is the drawer behaviour: jsdom and any
 * environment without matchMedia exercise the mobile contract.
 */
function isDrawerViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(max-width: 760px)').matches;
}
/**
 * A one-shot snapshot of the register as it stood immediately before an import.
 *
 * Written through the same versioned envelope as the live key, so it comes back through
 * the same validating loader and a payload that cannot be trusted is refused rather than
 * restored. Cleared the moment it is used, so an old snapshot can never undo a later,
 * deliberate import.
 */
const EMPLOYEES_BACKUP_KEY = 'omnihr_employees_backup';

/**
 * Something the user has to know about their data, shown as one banner.
 *
 * - `discarded` (read side): a stored payload existed and could not be used, so seed data
 *   was substituted. This is the state the previous boolean contract could not express:
 *   it reported the same thing for a first visit, where nothing was lost, so any banner
 *   built on it greeted every new user with a warning about data that never existed.
 * - `not-saved` (write side): the change is on screen but was NOT written down.
 *
 * `scope` names the dataset the banner is about. `leave` covers both the leave plans
 * and the planner settings: one calendar and one number belong to the same planner,
 * and a failed write of either is the same "on screen but not written down" event.
 * `events` names the Planner's event calendar, which saves separately from the
 * leave plans even though the two share the page. `attendance` and `holidays` name
 * the daily ledger and the company calendar, which are separate datasets with
 * separate saves.
 *
 * A user must never have to guess whether the register they are looking at is the one
 * that will survive a refresh.
 */
type NoticeScope = 'employees' | 'policies' | 'leave' | 'events' | 'attendance' | 'holidays';

type AppNotice =
  | { kind: 'discarded'; scope: NoticeScope }
  | { kind: 'not-saved'; scope: NoticeScope; reason: 'quota' | 'unavailable' }
  | { kind: 'reload-failed' };

const GENERIC_SAVE_QUOTA =
  'Your change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove staff, or close other OmniHR tabs, then make the change again.';
const GENERIC_SAVE_UNAVAILABLE =
  'Your change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.';

const SAVE_NOTICE_COPY: Record<NoticeScope, Record<'quota' | 'unavailable', string>> = {
  employees: { quota: GENERIC_SAVE_QUOTA, unavailable: GENERIC_SAVE_UNAVAILABLE },
  policies: { quota: GENERIC_SAVE_QUOTA, unavailable: GENERIC_SAVE_UNAVAILABLE },
  leave: {
    quota:
      'Your leave planner change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove a leave entry, or close other OmniHR tabs, then make the change again.',
    unavailable:
      'Your leave planner change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.',
  },
  events: {
    quota:
      'Your planner event change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove an event, or close other OmniHR tabs, then make the change again.',
    unavailable:
      'Your planner event change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.',
  },
  attendance: {
    quota:
      'Your attendance change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove staff, or close other OmniHR tabs, then make the change again.',
    unavailable:
      'Your attendance change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.',
  },
  holidays: {
    quota:
      'Your holiday change is on screen but was NOT saved: this browser has run out of storage space for OmniHR. It will be lost when you close the tab. Remove staff, or close other OmniHR tabs, then make the change again.',
    unavailable:
      'Your holiday change is on screen but was NOT saved: this browser is blocking storage for this site (private mode, or a strict privacy setting). It will be lost when you close the tab.',
  },
};

const DISCARDED_NOTICE_COPY: Record<NoticeScope, string> = {
  employees:
    'The staff register saved in this browser could not be read and has been set aside. The demo dataset is showing in its place - anything you imported earlier is gone. Re-import your roster to continue.',
  policies:
    'The HR policies saved in this browser could not be read and have been set aside. The default policies are showing in their place - any policy you added or edited is gone.',
  leave:
    'The leave plans saved in this browser could not be read and have been set aside. The planner is empty in their place - any leave you recorded earlier is gone. Re-enter the leave to continue.',
  events:
    'The planner events saved in this browser could not be read and have been set aside. The event calendar is empty in their place - any event you added is gone. Re-add the events to continue.',
  attendance:
    'The attendance records saved in this browser could not be read and have been set aside. The daily ledger is empty in their place - any marks you made or imported earlier are gone. Mark attendance again or re-import the monthly matrix to continue.',
  holidays:
    'The company holidays saved in this browser could not be read and have been set aside. The holiday calendar is empty in their place - any holiday you added is gone. Re-add the holidays to continue.',
};

/**
 * A confirmed snapshot import was written into the store, but reading it back to
 * refresh the screen failed. The store now holds the imported data while the screen
 * still shows the pre-import state - a divergence the user has to be told about,
 * because the next edit they make is persisted from the screen and would silently
 * overwrite part of the import they were told had succeeded.
 */
const RELOAD_FAILED_NOTICE_COPY =
  'The snapshot import was saved, but reading it back to refresh the screen failed. What you see may still be the data from before the import. Close and reopen OmniHR to load the imported data before making further changes.';

export const App: React.FC<{
  onSignOut?: () => void;
  /**
   * Completed business data, handed over by the DataGate. When absent, App keeps its
   * original synchronous contract and reads localStorage itself - the path every
   * existing test exercises, which must not change (design decision D9).
   */
  initialData?: DataSnapshot;
  /**
   * Destination for saves. When absent, saves go through `savePersisted`, exactly as
   * they always have. The two props are independent: `initialData` replaces the read
   * path, `dataStore` the write path, so a test can exercise either alone.
   */
  dataStore?: DataStore;
  /**
   * Where business data lives in this session, reported by the Admin page's snapshot
   * card. It describes the ACTIVE backend, which only the DataGate knows: with the
   * legacy path the data is in localStorage by definition.
   */
  backend?: StoreBackend;
  /**
   * Whether the store's one-time migration found and kept the legacy localStorage
   * copy. The Admin page surfaces it; the legacy path has no migration, so no backup.
   */
  legacyBackup?: boolean;
}> = ({ onSignOut, initialData, dataStore, backend = 'localstorage', legacyBackup = false }) => {
  // Read once per mount. Two sources:
  //
  // - with `initialData`, the DataGate has already loaded and validated the data, and
  //   the console must NOT go back to localStorage - that is the point of the seam.
  //   A store load that had to substitute seed data is the STORE's recovery, not a
  //   localStorage loss, so no discarded banner is raised from here;
  // - without it, the validating loader reads localStorage. `loadPersisted` is a pure
  //   read of storage, so a re-run is harmless and returns the same answer.
  //
  // Only `status === 'recovered'` produces a notice. `'empty'` covers both a first visit
  // and a register the user deliberately emptied, and warning about either would be a
  // lie about data that does not exist.
  const initialLoad = useMemo(
    () => ({
      employees: initialData
        ? { rows: initialData.employees, status: 'loaded' as const }
        : loadPersisted(EMPLOYEES_KEY, isEmployeeRow, INITIAL_EMPLOYEES),
      policies: initialData
        ? { rows: initialData.policies, status: 'loaded' as const }
        : loadPersisted(POLICIES_KEY, isPolicyRow, INITIAL_POLICIES),
      // The leave planner's localStorage fallback is an EMPTY planner, not a demo
      // seed: the seed belongs to the stores (the IndexedDB migration and the
      // fallback store seed it themselves), and a planner the user never filled
      // must not be explained to them by invented entries. An unreadable stored
      // payload is still `recovered`, which is what raises the banner below.
      leavePlans: initialData
        ? { rows: initialData.leavePlans, status: 'loaded' as const }
        : loadPersisted(LEAVE_PLANS_KEY, isLeavePlanRow, []),
      // The Planner's event calendar follows the same rule as the leave plans on
      // the legacy path: an EMPTY calendar, not a demo seed - the seed belongs to
      // the stores, and a register the user built themselves must not be given
      // invented company events. An unreadable stored payload is still
      // `recovered`, which raises the events banner below.
      plannerEvents: initialData
        ? { rows: initialData.plannerEvents, status: 'loaded' as const }
        : loadPersisted(PLANNER_EVENTS_KEY, isPlannerEventRow, []),
      // Settings is a single object rather than a row list, so it travels in the
      // envelope as one row; an absent or unusable one falls back to the default
      // threshold. A lost threshold is a preference, not a record, so it never
      // raises the discarded banner on its own.
      settings: initialData
        ? initialData.settings
        : loadPersisted(PLANNER_SETTINGS_KEY, isPlannerSettingsRow, [
            DEFAULT_PLANNER_SETTINGS,
          ]).rows[0] ?? { ...DEFAULT_PLANNER_SETTINGS },
      // The daily ledger and the holiday calendar read the same keys the store
      // layer reads. Both fall back to EMPTY datasets on the legacy path: the
      // demo ledger and the holiday seed belong to the stores (the IndexedDB
      // migration and the fallback store install them themselves, and only for
      // the demo roster), so App inventing them here would seed a custom roster
      // with records for employees it does not contain. An unreadable stored
      // payload is still `recovered`, which is what raises the banner below.
      attendance: initialData
        ? { rows: initialData.attendance, status: 'loaded' as const }
        : loadPersisted(ATTENDANCE_KEY, isAttendanceRecordRow, []),
      holidays: initialData
        ? { rows: initialData.holidays, status: 'loaded' as const }
        : loadPersisted(HOLIDAYS_KEY, isHolidayRow, []),
    }),
    [initialData],
  );

  const [employees, setEmployees] = useState<Employee[]>(initialLoad.employees.rows);
  const [departments] = useState(INITIAL_DEPARTMENTS);
  const [locations] = useState(INITIAL_LOCATIONS);
  const [tracker] = useState(INITIAL_TRACKER);
  const [requisitions] = useState(INITIAL_REQUISITIONS);

  // The leave planner owns the same lifecycle as the register: read once at mount
  // (from the DataGate snapshot or localStorage), edited through the section's
  // callbacks, and written back by the save effects below.
  const [leavePlans, setLeavePlans] = useState<LeavePlan[]>(initialLoad.leavePlans.rows);
  const [plannerSettings, setPlannerSettings] = useState<PlannerSettings>(initialLoad.settings);
  // The Planner's event calendar shares that lifecycle: one more dataset read at
  // mount, edited through PlannerSection's event callbacks, persisted by its own
  // save effect below.
  const [plannerEvents, setPlannerEvents] = useState<PlannerEvent[]>(initialLoad.plannerEvents.rows);

  // Daily attendance and the company holidays share that lifecycle too: read once
  // at mount, edited through the Attendance section's callbacks, persisted by the
  // save effects below.
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialLoad.attendance.rows);
  const [holidays, setHolidays] = useState<Holiday[]>(initialLoad.holidays.rows);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedLocation, setSelectedLocation] = useState('ALL');

  // The header toggle owns the navigation's open state at every width: above
  // 760px it collapses and restores the in-grid sidebar, and below 760px it
  // opens the off-canvas drawer (see the shell breakpoints in index.css). The
  // state lives here because the control is in the Header and the scrim is a
  // sibling of both. Escape closes the drawer, not the desktop sidebar.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isDrawerViewport());

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerViewport()) setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Crossing the drawer breakpoint resets the navigation to the state that
  // breakpoint expects: the in-grid sidebar appears on desktop, the drawer
  // starts closed on a phone. Resizing within a breakpoint leaves the user's
  // explicit open/closed choice alone.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 760px)');
    const onChange = (event: MediaQueryListEvent) => setIsSidebarOpen(!event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const handleNavigate = (tab: ActiveTab) => {
    setActiveTab(tab);
    // A drawer covers the page it just navigated to; the desktop sidebar is
    // persistent and must stay open.
    if (isDrawerViewport()) setIsSidebarOpen(false);
  };

  // The one thing a "nothing matches" page can usefully offer: the way back. Each section
  // that can render an empty state takes this as its single action, so the reset lives here
  // next to the three pieces of state that caused the emptiness.
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedLocation('ALL');
  };

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [guideInitialSection, setGuideInitialSection] = useState<'general' | 'excel'>('general');

  // A destructive action is a QUESTION, and the question is state. It used to be a blocking
  // native prompt that froze the main thread, could not be themed, could not say what was
  // about to be lost, and told a screen-reader user nothing until focus came back.
  const [isResetRequested, setIsResetRequested] = useState(false);
  // Confirmation of something that DID happen, shown inline and dismissible.
  // `undoable` is carried here rather than as a second piece of state so the banner and
  // its Undo button cannot disagree about whether there is anything to undo.
  const [confirmation, setConfirmation] = useState<{ text: string; undoable?: boolean } | null>(null);

  const [policies, setPolicies] = useState<HRPolicy[]>(initialLoad.policies.rows);

  // One banner, one dismiss. A dismissed notice stays dismissed until the NEXT thing that
  // goes wrong: the save effect is keyed to the roster, not to the banner, so a re-render
  // has nothing to retry and nothing to re-raise.
  const [notice, setNotice] = useState<AppNotice | null>(() => {
    if (initialLoad.employees.status === 'recovered') {
      return { kind: 'discarded', scope: 'employees' };
    }
    if (initialLoad.policies.status === 'recovered') {
      return { kind: 'discarded', scope: 'policies' };
    }
    if (initialLoad.leavePlans.status === 'recovered') {
      return { kind: 'discarded', scope: 'leave' };
    }
    if (initialLoad.plannerEvents.status === 'recovered') {
      return { kind: 'discarded', scope: 'events' };
    }
    if (initialLoad.attendance.status === 'recovered') {
      return { kind: 'discarded', scope: 'attendance' };
    }
    if (initialLoad.holidays.status === 'recovered') {
      return { kind: 'discarded', scope: 'holidays' };
    }
    return null;
  });

  const handleNavigateToGuides = (sec: 'general' | 'excel' = 'general') => {
    setGuideInitialSection(sec);
    setActiveTab('guides');
  };

  const handleUpdatePolicy = (updated: HRPolicy) => {
    setPolicies(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleAddPolicy = (newPol: HRPolicy) => {
    setPolicies(prev => [newPol, ...prev]);
  };

  const handleDeletePolicy = (id: string) => {
    setPolicies(prev => prev.filter(p => p.id !== id));
  };

  // The reset is carried entirely by the state change; the sync effect below rewrites
  // the key on the next render. The `localStorage.removeItem` call that used to sit here
  // was dead code - it removed the key and the effect immediately put it back.
  const handleResetPolicies = () => {
    setPolicies(INITIAL_POLICIES);
  };

  // Leave planner intents, reported by PlannerSection. A save is an upsert by
  // id: the modal reuses the id of the entry it was opened to edit, so a replace and
  // an add are the same callback.
  const handleSaveLeavePlan = (plan: LeavePlan) => {
    setLeavePlans(prev =>
      prev.some(p => p.id === plan.id)
        ? prev.map(p => (p.id === plan.id ? plan : p))
        : [...prev, plan],
    );
  };

  const handleDeleteLeavePlan = (id: string) => {
    setLeavePlans(prev => prev.filter(p => p.id !== id));
  };

  // Planner event intents, reported by PlannerSection, following the identical
  // upsert-by-id contract: the event modal reuses the id of the event it edits.
  const handleSavePlannerEvent = (event: PlannerEvent) => {
    setPlannerEvents(prev =>
      prev.some(e => e.id === event.id)
        ? prev.map(e => (e.id === event.id ? event : e))
        : [...prev, event],
    );
  };

  const handleDeletePlannerEvent = (id: string) => {
    setPlannerEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleUpdatePlannerSettings = (next: PlannerSettings) => {
    setPlannerSettings(next);
  };

  // Attendance intents, reported by AttendanceSection. A save is an upsert by id:
  // the id is `${employeeId}|${date}`, so one record per employee per date is the
  // whole key space and a replace and an add are the same callback.
  const handleSaveRecord = (record: AttendanceRecord) => {
    setAttendance(prev =>
      prev.some(r => r.id === record.id)
        ? prev.map(r => (r.id === record.id ? record : r))
        : [...prev, record],
    );
  };

  const handleDeleteRecord = (id: string) => {
    setAttendance(prev => prev.filter(r => r.id !== id));
  };

  /**
   * A confirmed matrix import replaces ONE month, atomically as far as the state
   * is concerned: every record dated in `monthKey` is removed and the parsed rows
   * take their place. Other months are untouched - the prefix is the full
   * `YYYY-MM-`, so `2026-11` cannot reach into `2026-10`. Adding through a Map
   * keyed by id keeps one record per employee/date even if a file somehow carried
   * a repeat, because a keyed store would silently collapse a duplicate and then
   * refuse the whole save.
   */
  const handleReplaceMonth = (monthKey: string, records: AttendanceRecord[]) => {
    const monthPrefix = `${monthKey}-`;
    setAttendance(prev => {
      const byId = new Map(
        prev.filter(r => !r.date.startsWith(monthPrefix)).map(r => [r.id, r] as const),
      );
      for (const record of records) byId.set(record.id, record);
      return [...byId.values()];
    });
  };

  /**
   * Holidays are unique by DATE everywhere downstream: the matrix looks them up
   * by date and the store refuses a save that carries two rows for one day.
   * Replacing by date here (keeping the incoming id) means a differently-id'd
   * sibling for the same day can never reach a save that would have been refused
   * as a whole.
   */
  const handleSaveHoliday = (holiday: Holiday) => {
    setHolidays(prev => [
      ...prev.filter(h => h.id !== holiday.id && h.date !== holiday.date),
      holiday,
    ]);
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays(prev => prev.filter(h => h.id !== id));
  };

  /**
   * A confirmed snapshot import wrote EVERY dataset straight into the store, so the
   * state App holds is now stale from six directions at once. Reloading from the
   * same store is the one honest response: re-deriving six datasets by hand from
   * the file would be a second import path, and a page reload would throw away the
   * session for a change that is already in memory.
   *
   * The subsequent save effects write the reloaded datasets straight back; a
   * round-trip of data the store already holds is harmless.
   *
   * Once the reload succeeds, the Excel import's Undo is destroyed along with its
   * backup: it restores only the pre-import EMPLOYEES, and pressing it after a
   * snapshot import would write that stale roster over a store the snapshot has
   * since replaced in all six datasets. A rejected load is caught and reported -
   * an unhandled rejection leaves the stale screen AND the stale Undo banner in
   * place, which is the worse half of the same bug.
   */
  const handleSnapshotImported = () => {
    if (!dataStore) return;
    void dataStore
      .load()
      .then((loaded) => {
        setEmployees(loaded.snapshot.employees);
        setPolicies(loaded.snapshot.policies);
        setLeavePlans(loaded.snapshot.leavePlans);
        setPlannerSettings(loaded.snapshot.settings);
        setPlannerEvents(loaded.snapshot.plannerEvents);
        // The daily ledger and the holiday calendar are part of the snapshot too
        // (v2), so the screen follows the store for them as well.
        setAttendance(loaded.snapshot.attendance);
        setHolidays(loaded.snapshot.holidays);
        setConfirmation(null);
        clearPersisted(EMPLOYEES_BACKUP_KEY);
      })
      .catch(() => {
        // The screen never saw the imported data, so the confirmation it may still
        // be showing (and any Undo riding on it) describes a change that did not
        // land the way it claimed. Both go; the banner below tells the user.
        setConfirmation(null);
        setNotice({ kind: 'reload-failed' });
      });
  };

  // Sync to storage. Two targets, one contract: the change on screen is either
  // written down or loudly reported as not written down.
  //
  // - With `dataStore` (the DataGate path), the store is the single destination. Its
  //   contract is to report, never to throw, so a failed save arrives as a result and
  //   becomes the same `not-saved` notice as before. The `cancelled` guard keeps a
  //   late resolution from an unmounted tree from raising a banner nobody can see.
  //   `invalid`/`version` are import-time reasons a save cannot honestly produce; a
  //   write that failed in some unknown way is still a write the user was not told
  //   about, so it degrades to the generic `unavailable` copy rather than to silence.
  // - Without it, the legacy synchronous `savePersisted` path runs unchanged.
  //
  // The setState-in-effect warnings below are suppressed on purpose. Writing to an
  // external system and reporting that it failed is precisely an effect's job, and the
  // alternative - persisting from each event handler - silently stops persisting the
  // moment a future change arrives by some path that forgot to call the helper. This
  // cannot cascade: the notice only changes the banner, and the effect's dependency is
  // the roster, so the effect does not re-run.
  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.saveEmployees(employees).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'employees',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(EMPLOYEES_KEY, employees);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'employees', reason: result.reason });
    }
  }, [dataStore, employees]);

  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.savePolicies(policies).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'policies',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(POLICIES_KEY, policies);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'policies', reason: result.reason });
    }
  }, [dataStore, policies]);

  // The leave planner's two writes follow the identical contract. Settings is a
  // single object, so the legacy envelope carries it as a one-row list - the exact
  // shape the fallback store and the IndexedDB migration read back.
  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.saveLeavePlans(leavePlans).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'leave',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(LEAVE_PLANS_KEY, leavePlans);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'leave', reason: result.reason });
    }
  }, [dataStore, leavePlans]);

  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.saveSettings(plannerSettings).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'leave',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(PLANNER_SETTINGS_KEY, [plannerSettings]);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'leave', reason: result.reason });
    }
  }, [dataStore, plannerSettings]);

  // The event calendar persists under the same contract as the leave plans: a
  // whole-dataset save, reported loudly when storage refuses it.
  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.savePlannerEvents(plannerEvents).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'events',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(PLANNER_EVENTS_KEY, plannerEvents);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'events', reason: result.reason });
    }
  }, [dataStore, plannerEvents]);

  // The attendance ledger and the holiday calendar persist under the identical
  // contract. A whole-dataset save is deliberate: like the register, the ledger
  // is the unit the store and the snapshot vouch for, and a per-record write
  // would need a second failure story for a partial save.
  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.saveAttendance(attendance).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'attendance',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(ATTENDANCE_KEY, attendance);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'attendance', reason: result.reason });
    }
  }, [dataStore, attendance]);

  useEffect(() => {
    if (dataStore) {
      let cancelled = false;
      void dataStore.saveHolidays(holidays).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice({
            kind: 'not-saved',
            scope: 'holidays',
            reason: result.reason === 'quota' ? 'quota' : 'unavailable',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const result = savePersisted(HOLIDAYS_KEY, holidays);
    if (!result.ok) {
      // oxlint-disable-next-line react/set-state-in-effect -- see the note above
      setNotice({ kind: 'not-saved', scope: 'holidays', reason: result.reason });
    }
  }, [dataStore, holidays]);

  // Global Filtered Employees
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return employees.filter(emp => {
      const matchSearch = !q || 
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q);

      const matchDept = selectedDept === 'ALL' || emp.department === selectedDept;
      const matchLoc = selectedLocation === 'ALL' || emp.location === selectedLocation;

      return matchSearch && matchDept && matchLoc;
    });
  }, [employees, searchQuery, selectedDept, selectedLocation]);

  // The CURRENT month's daily rollup, feeding payroll and the overview. `today`
  // is captured once per mount, like AttendanceSection's own clock, so the
  // figures on screen cannot drift because a render straddled midnight.
  const [today] = useState(() => new Date());
  const currentYear = today.getFullYear();
  const currentMonthIndex = today.getMonth();

  const currentMonthRollup = useMemo(
    () => rollupMonth(attendance, employees, holidays, currentYear, currentMonthIndex),
    [attendance, employees, holidays, currentYear, currentMonthIndex],
  );

  /**
   * The register as payroll and the overview should see it (design decision D8).
   *
   * An employee with ANY daily record in the current month gets their
   * `presentDays`/`lopDays` replaced by the rollup; everyone else keeps the
   * legacy monthly fields exactly as they were. Derived counts pass through
   * unrounded - a half-day is 0.5 present days, and `computeLOP` prices
   * fractional days honestly - so a payroll figure never disagrees with the
   * ledger it was derived from.
   *
   * The month's true working-day figures ride along as the optional
   * `PayrollEmployee` seam: `workingDays` is the calendar count (days minus
   * Sundays and holidays) and `attendancePct` is `present / workingDays * 100`
   * (0 when a month has no working days at all), so the overview can rate
   * attendance against the real month instead of a fixed 26-day baseline. The
   * payroll MATH is deliberately NOT touched by these fields: the LOP wage cut
   * stays `(Basic / 26) * LOP Days`, a statutory/company constant, and
   * `computeLOP` semantics are unchanged by design.
   *
   * This starts from `filteredEmployees`, the register the sections already
   * receive, so the header's filters keep narrowing these tabs and only the
   * day-level figures change.
   */
  const payrollEmployees = useMemo<PayrollEmployee[]>(
    () =>
      filteredEmployees.map((emp) => {
        const rollup = currentMonthRollup.get(emp.id);
        if (!rollup || !rollup.hasRecords) return emp;
        return {
          ...emp,
          presentDays: rollup.presentDays,
          lopDays: rollup.lopDays,
          attendancePct:
            rollup.workingDays > 0 ? (rollup.presentDays / rollup.workingDays) * 100 : 0,
          workingDays: rollup.workingDays,
        };
      }),
    [filteredEmployees, currentMonthRollup],
  );

  // Export Complete Employee Roster to Excel
  const handleExportEmployees = () => {
    // One contract for the writer and the importer: see `utils/excelSchema.ts`. The old
    // inline literal omitted `reportsTo` and `deptId` while emitting the joining date as
    // text, so the file this app produced could not be read back as the register it came
    // from.
    const data = buildStaffRosterRows(filteredEmployees);

    const ws = XLSX.utils.json_to_sheet(data, {
      header: STAFF_ROSTER_COLUMNS.map((column) => column.header),
      dateNF: 'yyyy-mm-dd',
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Roster');
    XLSX.writeFile(wb, `OmniHR_Staff_Roster_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export Monthly Payroll Advice to Excel
  const handleExportPayroll = () => {
    // The register exported here must be the register the Payroll tab shows, so it
    // starts from `payrollEmployees` - the same list the tab receives, where the
    // current-month daily rollup has already replaced `presentDays`/`lopDays` for
    // every employee with records - and NOT from `filteredEmployees`, whose legacy
    // monthly numbers would price a half-day ledger as full attendance.
    //
    // The payroll run excludes Resigned and Unknown staff, and this register is a
    // statement of money payable - so it must be filtered by the same `isActive` the
    // Payroll tab uses. It was not: an Unknown import still had a Net Salary Payable
    // written into the file, which is how an unresolved import becomes a real payment.
    // The roster export above is deliberately NOT filtered — it is the master list,
    // not a disbursement.
    const payrollRun = payrollEmployees.filter(isActive);
    const data = payrollRun.map(e => {
      const p = computePayroll(e);

      return {
        'Employee ID': e.id,
        'Employee Name': e.name,
        'Department': e.department,
        'Designation': e.role,
        'Location': e.location,
        'Monthly Gross CTC': p.gross,
        'Basic (50%)': p.basic,
        'HRA (25%)': p.hra,
        'Special Allowance (25%)': p.specialAllowance,
        'EPF (12% @ ₹15k cap)': p.epf,
        'Professional Tax': p.professionalTax,
        'Loss of Pay (LOP)': p.lossOfPay,
        'Total Deductions': p.totalDeductions,
        'Net Salary Payable': p.netPayable
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll_Register');
    XLSX.writeFile(wb, `OmniHR_Payroll_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // As with `handleResetPolicies`, the state change is the whole reset; the sync effect
  // rewrites the key. The `removeItem` call here was dead code that the effect undid.
  //
  // This now only ASKS. The roster is replaced when the answer comes back through
  // `ConfirmDialog`, which is the only way the reset can now happen - so there is no
  // branch here that can discard the register on a stray click.
  const handleResetData = () => setIsResetRequested(true);

  const handleConfirmResetData = () => {
    // ALL SEVEN business datasets reset, not just the register. A reset that restored
    // employees but kept a half-edited policy set, a threshold someone had pushed to
    // 9, events someone added for a different demo story, or an attendance ledger
    // still carrying last week's corrections would not be the demo state the dialog
    // promises, and the next person demoing the app inherits the leftovers. The
    // ledger seed is the demo roster's current-month records (D11), the calendar
    // seed is the fixed 2026 national holidays (D9) and the event calendar seed is
    // the demo roster's coming-weeks events, exactly what the stores install on a
    // first visit.
    setEmployees(INITIAL_EMPLOYEES);
    setPolicies(INITIAL_POLICIES);
    setLeavePlans(createInitialLeavePlans());
    setPlannerSettings({ ...DEFAULT_PLANNER_SETTINGS });
    setPlannerEvents(createInitialPlannerEvents());
    setAttendance(createInitialAttendance(INITIAL_EMPLOYEES, createInitialHolidays(2026)));
    setHolidays(createInitialHolidays(2026));
    setIsResetRequested(false);
    setConfirmation({
      text:
        'Demo data reset: the register is back to the 200 staff Master Dataset, HR policies, leave plans, planner events and planner settings are back to their defaults, and the daily attendance ledger and company holiday calendar are back to their demo seed.',
    });
  };

  /**
   * The modal derives a new hire's ID from the register size (`EMP-1201 + count`),
   * which is only unique while IDs stay dense. An imported roster that already
   * occupies the next number would otherwise add a second record with the same ID -
   * and duplicate IDs are the one shape the stores and snapshots reject, so the hire
   * would be visible on screen but silently unpersistable. Suffixing (`-2`, `-3`,
   * ...) keeps the derived base readable and makes the record savable.
   */
  const handleAddEmployee = (newEmp: Employee) => {
    const existingIds = new Set(employees.map(e => e.id));
    let id = newEmp.id;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${newEmp.id}-${suffix}`;
      suffix += 1;
    }
    const record: Employee = id === newEmp.id ? newEmp : { ...newEmp, id };
    setEmployees(prev => [record, ...prev]);
    setConfirmation({
      text: `${record.name} (${record.id}) was added to the employee register.`,
    });
  };

  /**
   * The roster is only replaced once the user has answered the question in
   * `ExcelHubSection`, and the answer arrives as a MODE rather than as an implicit
   * "and you meant destroy everything".
   *
   * Duplicate IDs are resolved HERE, at the boundary, because everything downstream
   * rejects them: the stores refuse a save that carries duplicate IDs, and a roster
   * that slipped through would overwrite itself row by row in any keyed store.
   * Append skips rows whose ID is already in the register and later repeats within
   * the file; replace keeps the FIRST row per ID and skips later repeats. Either
   * way the skipped count is reported - rows that silently vanish are
   * indistinguishable from a parser bug.
   *
   * The snapshot is written HERE, before `setEmployees`, in the same tick as the
   * caller's click. Waiting for the persistence effect to take one would capture the
   * register AFTER the replacement and make the Undo a no-op that reports success.
   * And if that write cannot be made, the import still happens but Undo is
   * withheld: an undo button with nothing behind it is the same lie wearing a
   * different button.
   */
  const handleImportEmployees = (
    newEmps: Employee[],
    mode: 'replace' | 'append',
  ) => {
    const registerIds = new Set(employees.map(e => e.id));
    const fileIds = new Set<string>();
    const accepted: Employee[] = [];
    let skipped = 0;
    for (const emp of newEmps) {
      const duplicate =
        fileIds.has(emp.id) || (mode === 'append' && registerIds.has(emp.id));
      if (duplicate) {
        skipped += 1;
        continue;
      }
      fileIds.add(emp.id);
      accepted.push(emp);
    }

    if (accepted.length === 0) {
      // Every row was a duplicate: nothing changed, so there is no backup to take
      // and nothing to undo. Writing one here would arm an Undo button for a no-op.
      // A backup left over from an earlier import is cleared too: it describes a
      // register this no-op did not change, and offering to "undo" back to it would
      // silently discard changes made since that import.
      clearPersisted(EMPLOYEES_BACKUP_KEY);
      setActiveTab('directory');
      setConfirmation({
        text:
          'Nothing was added: every imported row was skipped because its staff ID is already in the register or is repeated within the file.',
      });
      return;
    }

    const recordNoun = `${accepted.length} imported staff record${accepted.length === 1 ? '' : 's'}`;
    const skipNote =
      skipped > 0
        ? ` ${skipped} duplicate ${skipped === 1 ? 'row was' : 'rows were'} skipped.`
        : '';
    const verb =
      mode === 'replace'
        ? `Replaced the register with ${recordNoun}.`
        : `Added ${recordNoun} to the register.`;
    const undoable = savePersisted(EMPLOYEES_BACKUP_KEY, employees).ok;
    setEmployees(mode === 'replace' ? accepted : [...employees, ...accepted]);
    setActiveTab('directory');
    setConfirmation({
      text: undoable
        ? `${verb}${skipNote}`
        : `${verb}${skipNote} This import cannot be undone: the pre-import backup could not be written to this browser's storage.`,
      undoable,
    });
  };

  /**
   * Puts the register back from the snapshot and destroys the snapshot.
   *
   * An unreadable snapshot is reported as such rather than swallowed. Restoring the
   * current roster and calling it an undo would leave the user believing their data was
   * back when nothing changed, which is the same failure this whole mechanism exists to
   * stop.
   */
  const handleUndoImport = () => {
    const restored = loadPersisted(EMPLOYEES_BACKUP_KEY, isEmployeeRow, employees);
    clearPersisted(EMPLOYEES_BACKUP_KEY);

    if (restored.status !== 'loaded' || restored.rows.length === 0) {
      setConfirmation({
        text:
          'There is nothing left to undo: the pre-import snapshot could not be read back.',
      });
      return;
    }

    setEmployees(restored.rows);
    setConfirmation({
      text: `Undo complete: the register is back to its ${restored.rows.length} pre-import records.`,
    });
  };

  const noticeCopy = notice
    ? notice.kind === 'not-saved'
      ? SAVE_NOTICE_COPY[notice.scope][notice.reason]
      : notice.kind === 'reload-failed'
        ? RELOAD_FAILED_NOTICE_COPY
        : DISCARDED_NOTICE_COPY[notice.scope]
    : '';
  const noticeTitle =
    notice?.kind === 'discarded'
      ? 'Saved data could not be read'
      : notice?.kind === 'reload-failed'
        ? 'Import could not be loaded'
        : 'Change not saved';

  return (
    <div className="app-shell" data-nav-open={isSidebarOpen}>
      {/* Sidebar Navigation - navigation only since the workspace actions moved
          to the Admin & Settings page. */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        isOpen={isSidebarOpen}
      />

      {/* Main Content Pane.
          The column sizes itself: `minmax(0, 1fr)` in `.app-shell` plus `min-width: 0`
          here is what lets it shrink below its content, and nothing here sets a width
          against the viewport any more. `100vw` included the scrollbar gutter, so the old
          `calc(100vw - 270px)` clipped a sliver even on a desktop. <main> does not scroll
          either - the document does, which is what makes `Dialog`'s body scroll lock
          actually lock something. */}
      <main className="app-shell__main">
        <Header
          activeTab={activeTab}
          onToggleNav={() => setIsSidebarOpen(open => !open)}
          navOpen={isSidebarOpen}
        />

        {/*
          The page-owned tool row (D2): the search / department / location / Add
          Staff controls the slim header no longer carries, on exactly the tabs
          whose sections work on the filtered roster. The state is unchanged -
          these are the same pieces of App state the header used to bind, so a
          search left behind survives a round trip through a tab without a
          toolbar and comes back with the values intact.
        */}
        {TOOLBAR_TABS.includes(activeTab) && (
          <PageToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            selectedLocation={selectedLocation}
            setSelectedLocation={setSelectedLocation}
            departments={departments}
            locations={locations}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        )}

        {/*
          Persistence problems are shown here, above the view and below the header, so
          they stay visible on every tab: a failed write is not a property of the section
          the user happens to be looking at. `tone-warning` supplies the colour through
          the `--tone-*` tokens in index.css - no inline hex, no blocking browser dialog.
        */}
        {notice && (
          <div
            className={`alert ${notice.kind === 'reload-failed' ? 'tone-danger' : 'tone-warning'}`}
            role="alert"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="section-stack" style={{ flex: 1 }}>
              <strong>{noticeTitle}</strong>
              <span>{noticeCopy}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setNotice(null)}
              aria-label="Dismiss this message"
            >
              <X size={14} aria-hidden="true" />
              Dismiss
            </button>
          </div>
        )}

        {/*
          A confirmation that something DID happen, in the same slot as the warnings above.
          It is inline rather than modal because nothing is at stake: the user is not being
          asked to decide anything, and a scrim over their own dashboard to say "saved" would
          cost them their place. It is dismissed explicitly, and it never claims a write
          succeeded - that is the `notice` banner's job, and the two are deliberately kept
          apart so a failed save can never be mistaken for this.
        */}
        {confirmation && (
          <Callout
            tone="success"
            onDismiss={() => setConfirmation(null)}
            action={confirmation.undoable ? { label: 'Undo', onClick: handleUndoImport } : undefined}
          >
            {confirmation.text}
          </Callout>
        )}

        {/* View Switching */}
        {activeTab === 'overview' && (
          <OverviewSection
            employees={payrollEmployees}
            departments={departments}
            onSelectEmployee={setSelectedEmployee}
            onClearFilters={handleClearFilters}
          />
        )}

        {activeTab === 'directory' && (
          <DirectorySection 
            employees={filteredEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {/*
          The attendance workspace receives the FULL register, like the leave
          planner: it owns its own department/location/search filters, and a
          global search left behind from another tab must not blank the matrix
          or the day panel. Sundays and holidays are derived inside the section;
          approved leave plans ride along as ghost cells only.
        */}
        {activeTab === 'attendance' && (
          <AttendanceSection
            employees={employees}
            attendance={attendance}
            holidays={holidays}
            leavePlans={leavePlans}
            onSaveRecord={handleSaveRecord}
            onDeleteRecord={handleDeleteRecord}
            onReplaceMonth={handleReplaceMonth}
            onSaveHoliday={handleSaveHoliday}
            onDeleteHoliday={handleDeleteHoliday}
          />
        )}

        {/*
          The Planner deliberately receives the FULL register, not `filteredEmployees`:
          it owns its own department/location/search filters, and its coverage view is
          org-wide. Feeding it the toolbar's filtered subset would both shrink the filter
          lists it offers and silently hide a person's leave whenever a global search
          was left behind from another tab - the calendar would lie by omission about
          who is away. The event calendar rides along as its own dataset.
        */}
        {activeTab === 'leave' && (
          <PlannerSection
            employees={employees}
            leavePlans={leavePlans}
            plannerEvents={plannerEvents}
            settings={plannerSettings}
            onSave={handleSaveLeavePlan}
            onDelete={handleDeleteLeavePlan}
            onSaveEvent={handleSavePlannerEvent}
            onDeleteEvent={handleDeletePlannerEvent}
            onSettingsChange={handleUpdatePlannerSettings}
          />
        )}

        {activeTab === 'payroll' && (
          <PayrollSection 
            employees={payrollEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'performance' && (
          <PerformanceSection 
            employees={filteredEmployees}
            onSelectEmployee={setSelectedEmployee}
          />
        )}

        {activeTab === 'recruitment' && (
          <RecruitmentSection
            requisitions={requisitions}
            departments={departments}
            onClearFilters={handleClearFilters}
          />
        )}

        {/*
          Every section that reads the register reads `filteredEmployees`, this one included.
          It was the one exception, which made its "Clear filters" action a control that
          could not help: the list it empties was never emptied by the filter in the first
          place. Its empty state now has a cause the reader can act on, like every other
          tab's.
        */}
        {activeTab === 'retention' && (
          <RetentionSection
            employees={filteredEmployees}
            onClearFilters={handleClearFilters}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsSection
            tracker={tracker}
            onClearFilters={handleClearFilters}
          />
        )}

        {/*
          The Admin & Settings page composes the workspace actions card, the
          snapshot exchange card and the existing Excel Hub. The card deliberately
          receives the FULL datasets - its counts and its export describe the
          store, which is not narrowed by the toolbar's filters, while the Excel
          Hub below keeps its filter-aware exports. The workspace actions ride
          the same handlers the sidebar footer used to bind.
        */}
        {activeTab === 'admin' && (
          <>
            <AdminSection
              employees={employees}
              policies={policies}
              leavePlans={leavePlans}
              plannerEvents={plannerEvents}
              attendance={attendance}
              holidays={holidays}
              settings={plannerSettings}
              store={dataStore}
              backend={backend}
              legacyBackup={legacyBackup}
              onImported={handleSnapshotImported}
              onExportRoster={handleExportEmployees}
              onResetData={handleResetData}
              onSignOut={onSignOut}
            />
            <ExcelHubSection
              employees={filteredEmployees}
              registerSize={employees.length}
              onImportEmployees={handleImportEmployees}
              onExportEmployees={handleExportEmployees}
              onExportPayroll={handleExportPayroll}
              onNavigateToGuides={(sec) => handleNavigateToGuides(sec || 'excel')}
            />
          </>
        )}

        {activeTab === 'policies' && (
          <PolicySection 
            policies={policies}
            onUpdatePolicy={handleUpdatePolicy}
            onAddPolicy={handleAddPolicy}
            onDeletePolicy={handleDeletePolicy}
            onResetPolicies={handleResetPolicies}
          />
        )}

        {activeTab === 'guides' && (
          <GuidesSection 
            initialGuide={guideInitialSection}
            onNavigateTab={setActiveTab}
          />
        )}
      </main>

      {/* Modals */}
      <EmployeeModal 
        employee={selectedEmployee} 
        onClose={() => setSelectedEmployee(null)} 
      />

      <AddEmployeeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        departments={departments}
        locations={locations}
        onAddEmployee={handleAddEmployee}
        totalEmployeesCount={employees.length}
      />

      {/*
        Asked last, and rendered last, so it stacks above the other modals. The message says
        what is actually lost, which the native prompt it replaced could not: this discards
        every imported and hand-added record, and every attendance mark and holiday edit,
        not merely the current view.
      */}
      <ConfirmDialog
        isOpen={isResetRequested}
        title="Reset application to the Master Demo state?"
        message="Every staff record you imported or added will be replaced by the 200-person Master Demo Dataset, HR policies, leave plans, planner events and planner settings return to their defaults, and the daily attendance ledger and company holiday calendar are restored to their demo seed. This cannot be undone."
        confirmLabel="Reset demo data"
        onConfirm={handleConfirmResetData}
        onCancel={() => setIsResetRequested(false)}
      />

      {/* Dismissal surface for the off-canvas navigation. Rendered only while the drawer
          is open, and below `--z-sticky` so it cannot cover the panel it is dismissing. It
          is a real button so that closing the drawer is not a pointer-only gesture; the
          header toggle and Escape do the same thing for a keyboard user. */}
      {isSidebarOpen && (
        <button
          type="button"
          className="app-shell__scrim"
          aria-label="Dismiss navigation overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
