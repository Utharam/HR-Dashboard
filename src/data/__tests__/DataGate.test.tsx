import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataGate, useDataGate } from '../DataGate'
import { MemoryStore } from '../MemoryStore'
import {
  DEFAULT_PLANNER_SETTINGS,
  STORAGE_KEYS,
  type DataSnapshot,
  type DataStore,
  type StoreResult,
} from '../DataStore'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'
import type { LeavePlan } from '../../types'
import { INITIAL_EMPLOYEES } from '../initialData'
import { INITIAL_POLICIES } from '../initialPolicies'
import { createInitialLeavePlans } from '../initialLeavePlans'
import { renderApp } from '../../test/renderApp'

// jsdom has no 2D canvas; the console's charts must be stubbed or their async
// teardown throws out of cleanup and blames an unrelated test. Same reason as
// App.test.tsx and Root.test.tsx.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub }
})

// Distinct rows so a test can prove WHICH data reached the console: the store's seed
// and the localStorage seed must not be confused with each other.
const ONE_EMPLOYEE = { ...INITIAL_EMPLOYEES[0], id: 'EMP-GATE-1', name: 'Zora Gate' }
const ONE_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-GATE-1', title: 'Gate seed policy' }

// A state the reset must actually change in all four datasets. The demo defaults are
// also the app seed, so a reset test that starts from them proves nothing.
const CUSTOM_EMPLOYEE = { ...INITIAL_EMPLOYEES[0], id: 'EMP-RESET-1', name: 'Reset Candidate' }
const CUSTOM_POLICY = { ...INITIAL_POLICIES[0], id: 'POL-RESET-1', title: 'Reset policy' }
const CUSTOM_PLAN: LeavePlan = {
  id: 'plan-reset-1',
  employeeId: CUSTOM_EMPLOYEE.id,
  startDate: '2026-12-01',
  endDate: '2026-12-02',
  type: 'CL',
  status: 'Planned',
  halfDay: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    v: 2,
    dataVersion: DATA_SCHEMA_VERSION,
    exportedAt: '2026-11-14T09:30:00.000Z',
    employees: [ONE_EMPLOYEE],
    policies: [ONE_POLICY],
    leavePlans: [],
    attendance: [],
    holidays: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS },
    ...overrides,
  }
}

/** The demo leave seed carries its own clock timestamps; compare its content only. */
function leavePlanSignature(plans: LeavePlan[]): string[] {
  return plans.map((plan) =>
    [
      plan.id,
      plan.employeeId,
      plan.startDate,
      plan.endDate,
      plan.type,
      plan.status,
      plan.halfDay ?? '',
      plan.note ?? '',
    ].join('|'),
  )
}

/** A store that honours the interface but refuses the one call the gate cares about. */
function makeFailingStore(): DataStore {
  const failure = new Error('IndexedDB open blocked')
  return {
    backend: 'memory',
    load: () => Promise.reject(failure),
    saveEmployees: async () => ({ ok: true }),
    savePolicies: async () => ({ ok: true }),
    saveLeavePlans: async () => ({ ok: true }),
    saveAttendance: async () => ({ ok: true }),
    saveHolidays: async () => ({ ok: true }),
    saveSettings: async () => ({ ok: true }),
    exportSnapshot: () => Promise.reject(failure),
    importSnapshot: async () => ({ ok: true }),
    clearBusinessData: async () => ({ ok: true }),
  }
}

function makeMockStore(snapshot: DataSnapshot, overrides: Partial<DataStore> = {}): DataStore {
  // `vi.fn` infers its type from the implementation alone, so the result literal has
  // to be annotated back to `StoreResult` - without it, `{ ok: true }` widens to
  // `{ ok: boolean }` and stops matching the discriminated union.
  const okResult = async (): Promise<StoreResult> => ({ ok: true })
  return {
    backend: 'memory',
    load: vi.fn(async () => ({ snapshot, legacyBackup: false, recovered: false })),
    saveEmployees: vi.fn(okResult),
    savePolicies: vi.fn(okResult),
    saveLeavePlans: vi.fn(okResult),
    saveAttendance: vi.fn(okResult),
    saveHolidays: vi.fn(okResult),
    saveSettings: vi.fn(okResult),
    exportSnapshot: vi.fn(async () => snapshot),
    importSnapshot: vi.fn(okResult),
    clearBusinessData: vi.fn(okResult),
    ...overrides,
  }
}

/** Renders what the gate published, so a test can read the context without guessing. */
function GateProbe() {
  const { store, snapshot, legacyBackup, recovered } = useDataGate()
  return (
    <div data-testid="gate-probe">
      {`${store.backend}:${snapshot.employees.length}:${legacyBackup ? 'backup' : 'no-backup'}:${recovered ? 'recovered' : 'clean'}`}
    </div>
  )
}

/** Reads the v2 datasets specifically; the older probe only reports the roster. */
function DatasetProbe() {
  const { snapshot } = useDataGate()
  return <div data-testid="dataset-probe">{`${snapshot.attendance.length}:${snapshot.holidays.length}`}</div>
}

const storeLegacyEmployees = () =>
  localStorage.setItem(
    STORAGE_KEYS.employees,
    JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [ONE_EMPLOYEE] }),
  )

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DataGate', () => {
  it('shows the boot screen, then children once the load completes', async () => {
    const store = new MemoryStore({ employees: INITIAL_EMPLOYEES.slice(0, 5) })

    render(
      <DataGate store={store}>
        <GateProbe />
      </DataGate>,
    )

    // The boot screen is the FIRST paint: the load has started but not resolved, and
    // no child can render half-initialised.
    expect(screen.getByRole('status')).toHaveTextContent('Loading OmniHR…')
    expect(screen.queryByTestId('gate-probe')).not.toBeInTheDocument()

    const probe = await screen.findByTestId('gate-probe')
    expect(probe).toHaveTextContent('memory:5:no-backup:clean')
    // A healthy backend raises no warning.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('publishes the v2 attendance and holiday datasets through the snapshot', async () => {
    const snapshot = makeSnapshot({
      attendance: [
        {
          id: `${ONE_EMPLOYEE.id}|2026-11-02`,
          employeeId: ONE_EMPLOYEE.id,
          date: '2026-11-02',
          status: 'Present',
          source: 'manual',
          updatedAt: '2026-11-02T09:30:00.000Z',
        },
      ],
      holidays: [{ id: 'holiday-2026-01-01', date: '2026-01-01', name: 'New Year' }],
    })
    const store = makeMockStore(snapshot)

    render(
      <DataGate store={store}>
        <DatasetProbe />
      </DataGate>,
    )

    expect(await screen.findByTestId('dataset-probe')).toHaveTextContent('1:1')
    expect(snapshot.v).toBe(2)
  })

  it('warns that saved data was replaced when the store reports recovery', async () => {
    const snapshot = makeSnapshot()
    const store = makeMockStore(snapshot, {
      load: vi.fn(async () => ({ snapshot, legacyBackup: false, recovered: true })),
    })

    render(
      <DataGate store={store}>
        <GateProbe />
      </DataGate>,
    )

    const probe = await screen.findByTestId('gate-probe')
    expect(probe).toHaveTextContent('memory:1:no-backup:recovered')
    // The children still render: recovery is a warning about replaced rows, not a
    // reason to withhold the console.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some saved data could not be read and was replaced by demo data. Duplicate records were repaired.',
    )
  })

  it('falls back to local storage with a visible warning when the store fails to load', async () => {
    storeLegacyEmployees()

    render(
      <DataGate store={makeFailingStore()}>
        <GateProbe />
      </DataGate>,
    )

    // The fallback loaded the same localStorage envelope the legacy path would have.
    const probe = await screen.findByTestId('gate-probe')
    expect(probe).toHaveTextContent('localstorage:1:no-backup:clean')
    // The degradation is visible, never silent (D2).
    expect(screen.getByRole('alert')).toHaveTextContent(/older localStorage copy/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/may not merge back/i)
  })

  it('uses createDataStore() when no store prop is given, taking the backend the factory picks', async () => {
    // jsdom has no IndexedDB, so the real factory selects the localStorage fallback -
    // the same path production takes in a browser without IndexedDB.
    storeLegacyEmployees()

    render(
      <DataGate>
        <GateProbe />
      </DataGate>,
    )

    const probe = await screen.findByTestId('gate-probe')
    expect(probe).toHaveTextContent('localstorage:1:no-backup:clean')
    expect(screen.getByRole('alert')).toHaveTextContent(/older localStorage copy/i)
  })

  it('falls back when the factory\u2019s IndexedDB store cannot even open', async () => {
    // The real factory, not a mock: with a global that exists but cannot open a
    // database, createDataStore() returns IndexedDbStore, whose load() rejects - the
    // production failure the gate exists to absorb.
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('blocked')
      },
    })
    storeLegacyEmployees()

    render(
      <DataGate>
        <GateProbe />
      </DataGate>,
    )

    const probe = await screen.findByTestId('gate-probe')
    expect(probe).toHaveTextContent('localstorage:1:no-backup:clean')
    expect(screen.getByRole('alert')).toHaveTextContent(/older localStorage copy/i)
    // The app moved on: no boot screen is left dangling above the console.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('App through the data seam', () => {
  it('renders the seeded console from initialData without touching localStorage', async () => {
    const store = new MemoryStore({ employees: [ONE_EMPLOYEE], policies: [ONE_POLICY] })

    await renderApp({ dataStore: store })

    // The console is the store's seed, not the localStorage seed: the one row the
    // store holds is on screen once the Directory is opened.
    await userEvent.click(await screen.findByRole('button', { name: /employee directory/i }))
    expect(await screen.findByText('Zora Gate')).toBeInTheDocument()

    // Nothing was written back to localStorage: the whole point of the seam.
    expect(localStorage.getItem(STORAGE_KEYS.employees)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.policies)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.leavePlans)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.attendance)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.holidays)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull()

    // And no banner: a store load that seeded is not a "discarded" recovery.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves employees and policies through the store, on mount and on change', async () => {
    const snapshot = makeSnapshot()
    const store = makeMockStore(snapshot)

    await renderApp({ initialData: snapshot, dataStore: store })

    // The mount write persists what was seeded.
    await waitFor(() => expect(store.saveEmployees).toHaveBeenCalledWith(snapshot.employees))
    await waitFor(() => expect(store.savePolicies).toHaveBeenCalledWith(snapshot.policies))

    // An employee change goes to the store: reset the demo data through the sidebar
    // and confirm the dialog, the same path a user takes.
    await userEvent.click(screen.getByRole('button', { name: /reset demo state/i }))
    await userEvent.click(await screen.findByRole('button', { name: /reset demo data/i }))
    await waitFor(() => expect(store.saveEmployees).toHaveBeenLastCalledWith(INITIAL_EMPLOYEES))

    // A policy change does the same: HR Policy Hub -> Reset -> confirm.
    await userEvent.click(screen.getByRole('button', { name: /hr policy hub/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^reset$/i }))
    await userEvent.click(await screen.findByRole('button', { name: /reset all policies/i }))
    await waitFor(() => expect(store.savePolicies).toHaveBeenLastCalledWith(INITIAL_POLICIES))

    expect(store.saveEmployees).toHaveBeenCalledTimes(2)
    expect(store.savePolicies).toHaveBeenCalledTimes(2)
  })

  it('Reset Demo State restores all four datasets in the store, not just the register', async () => {
    const store = new MemoryStore({
      employees: [CUSTOM_EMPLOYEE],
      policies: [CUSTOM_POLICY],
      leavePlans: [CUSTOM_PLAN],
      settings: { maxConcurrentLeave: 8 },
    })

    await renderApp({ dataStore: store })

    await userEvent.click(screen.getByRole('button', { name: /reset demo state/i }))
    await userEvent.click(await screen.findByRole('button', { name: /reset demo data/i }))

    await waitFor(async () => {
      const { snapshot } = await store.load()
      expect(snapshot.employees).toEqual(INITIAL_EMPLOYEES)
      expect(snapshot.policies).toEqual(INITIAL_POLICIES)
      expect(leavePlanSignature(snapshot.leavePlans)).toEqual(
        leavePlanSignature(createInitialLeavePlans()),
      )
      expect(snapshot.settings).toEqual(DEFAULT_PLANNER_SETTINGS)
    })
  })

  it('reports a failed store write through the not-saved banner', async () => {
    const snapshot = makeSnapshot()
    const store = makeMockStore(snapshot, {
      saveEmployees: vi.fn(async (): Promise<StoreResult> => ({ ok: false, reason: 'quota' })),
    })

    await renderApp({ initialData: snapshot, dataStore: store })

    // The store got the write and reported failure; the notice is about persistence,
    // not about the UI, and never claims success.
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/was NOT saved/i)
    expect(store.saveEmployees).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/saved successfully|successfully saved/i)).toBeNull()
  })
})
