import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from './App';
import { DATA_SCHEMA_VERSION } from './utils/storage';
import { INITIAL_EMPLOYEES } from './data/initialData';

// jsdom has no 2D canvas, so a real Chart.js instance cannot be created and its
// teardown path throws asynchronously out of `cleanup()` - Vitest then blames whichever
// test happened to be running. Stubbing the chart components keeps the assertion about
// persistence from being drowned by a charting environment problem.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

// These are the payloads measured as permanently white-screening the app before
// `utils/storage.ts` existed. Each one is valid JSON, so the old `catch {}` around
// `JSON.parse` let all of them through and the throw happened later, inside a render -
// by which point the persistence effect had never run, the bad payload had not been
// overwritten, and the "Reset Demo State" sidebar button was unreachable.
const UNREADABLE_PAYLOADS: [string, string][] = [
  ['a legacy bare array under an object wrapper', '{"employees":[{}]}'],
  ['a bare JSON scalar', '42'],
  ['an array of nulls', '[null,null]'],
  ['an object whose rows is not an array', '{"v":2,"rows":{}}'],
  ['text that is not JSON at all', '{not json'],
  ['a null payload', 'null'],
  ['an envelope at a stale schema version', '{"v":1,"rows":[{"id":"EMP-1","name":"Ghost"}]}'],
];

const readEnvelope = (key: string) => JSON.parse(localStorage.getItem(key) as string);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App persistence', () => {
  it.each(UNREADABLE_PAYLOADS)(
    'mounts and recovers from %s instead of white-screening',
    (_label, payload) => {
      localStorage.setItem('omnihr_employees', payload);

      // The crash used to happen HERE, during render.
      const { container } = render(<App />);
      expect(container.firstChild).not.toBeNull();

      // The tree mounted, so the persistence effect ran, so the unusable payload was
      // replaced with a well-formed one. Before the fix this key still held the poison.
      const written = readEnvelope('omnihr_employees');
      expect(written.v).toBe(DATA_SCHEMA_VERSION);
      expect(Array.isArray(written.rows)).toBe(true);
      expect(written.rows.length).toBeGreaterThan(0);
      // Every row the app will render must survive its own consumer's dereferences.
      for (const row of written.rows) {
        expect(typeof row.name).toBe('string');
        expect(typeof row.id).toBe('string');
      }
    },
  );

  it('recovers from an unreadable policies payload the same way', () => {
    localStorage.setItem('omnihr_policies', '[null,null]');
    render(<App />);
    const written = readEnvelope('omnihr_policies');
    expect(written.v).toBe(DATA_SCHEMA_VERSION);
    expect(Array.isArray(written.rows)).toBe(true);
    expect(written.rows.every((row: unknown) => typeof row === 'object' && row !== null)).toBe(true);
  });

  it('loads a valid saved roster instead of discarding it', async () => {
    const saved = { ...INITIAL_EMPLOYEES[0] };
    localStorage.setItem(
      'omnihr_employees',
      JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [saved] }),
    );

    render(<App />);

    // A good payload must not be reported as a recovery, and must survive the round trip.
    await waitFor(() => {
      const written = readEnvelope('omnihr_employees');
      expect(written.rows).toHaveLength(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(readEnvelope('omnihr_employees').rows[0].id).toBe(saved.id);
  });

  it('shows no banner at all when nothing has gone wrong', async () => {
    // A first visit has no saved payload, and `loadPersisted` reports `recovered` for
    // that as well as for a poisoned one. The app must not greet a new user with a
    // recovery notice for data that never existed.
    render(<App />);
    await waitFor(() => {
      expect(readEnvelope('omnihr_employees').rows.length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns that a quota failure did NOT save the change, and never claims success', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);

    render(<App />);

    const banner = await screen.findByText(/was NOT saved/i);
    expect(banner).toBeInTheDocument();
    expect(screen.queryByText(/successfully saved|saved successfully|has been saved/i)).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('warns when storage is unavailable instead of throwing during render', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    render(<App />);

    expect(await screen.findByText(/was NOT saved/i)).toBeInTheDocument();
  });

  it('keeps the persistence banner dismissible and does not re-raise it on its own', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    const { rerender } = render(<App />);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/was NOT saved/i);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).toBeNull();

    // A re-render with no change to the roster must not resurrect a dismissed banner:
    // the save effect is keyed to `employees`, not to the banner, so there is nothing
    // to retry. (A fresh MOUNT does re-run the save, and legitimately fails again.)
    rerender(<App />);
    rerender(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the banner using the existing callout/alert classes, not raw values', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    render(<App />);
    const banner = await screen.findByRole('alert');
    expect(banner.className).toContain('alert');
    // No inline hex / rem / px: the tone has to come from the token layer in index.css.
    expect(banner.getAttribute('style')).toBeNull();
    expect(banner.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(banner.innerHTML).not.toMatch(/\d(px|rem)\b/);
  });
});