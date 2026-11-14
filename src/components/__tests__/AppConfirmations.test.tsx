import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { ThemeProvider } from '../../theme/ThemeContext';
import { DATA_SCHEMA_VERSION } from '../../utils/storage';

// Same reason as App.test.tsx: jsdom has no 2D canvas, so a real Chart.js instance cannot be
// constructed and its teardown throws asynchronously out of `cleanup()`.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

beforeEach(() => {
  localStorage.clear();
});

const storedRoster = () =>
  JSON.parse(localStorage.getItem('omnihr_employees') as string).rows as { id: string; name: string; phone: string }[];

/**
 * The master demo state is 200 rows, and so is a freshly loaded app. A reset test that only
 * counts rows therefore cannot tell a reset from a no-op, so every reset test first puts the
 * register into a state a reset would actually change.
 */
const addAHire = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Add Staff/ }));
  await userEvent.type(screen.getByLabelText(/Full Name/), 'Rhea Kapoor');
  await userEvent.selectOptions(screen.getByLabelText(/Gender/), 'Female');
  await userEvent.click(screen.getByRole('button', { name: /Save Staff Profile/ }));
  await screen.findByRole('status');
};

const dismissConfirmation = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Dismiss this message/ }));
};

/**
 * The workspace actions moved from the sidebar footer to the Admin & Settings
 * page (design decision D3), so a reset test navigates there before reaching
 * for the control - the same path a user takes.
 */
const openAdminSettings = async () => {
  const nav = screen.getByRole('navigation');
  await userEvent.click(within(nav).getByRole('button', { name: 'Admin & Settings' }));
};

describe('App destructive and confirmational actions', () => {
  it('asks before resetting the register, and says what is lost', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await addAHire();
    await dismissConfirmation();
    expect(storedRoster()).toHaveLength(201);

    await openAdminSettings();
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/replaced by the 200-person Master Demo Dataset/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    // Still 201 rows: the question has been asked, not answered.
    expect(storedRoster()).toHaveLength(201);
  });

  it('does not reset when the question is refused', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await addAHire();
    await dismissConfirmation();

    await openAdminSettings();
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/ }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(storedRoster()).toHaveLength(201);
    expect(storedRoster()[0].name).toBe('Rhea Kapoor');
  });

  it('resets only once the answer is yes, and says so inline', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await addAHire();
    await dismissConfirmation();

    await openAdminSettings();
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/ }));
    await userEvent.click(screen.getByRole('button', { name: /Reset demo data/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(storedRoster()).toHaveLength(200);
    // Confirmations are announced politely, so they do not interrupt whatever is being read.
    expect(await screen.findByRole('status')).toHaveTextContent(/Demo data reset/i);
  });

  it('lets the confirmation be dismissed', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await openAdminSettings();
    await userEvent.click(screen.getByRole('button', { name: /Reset Demo State/ }));
    await userEvent.click(screen.getByRole('button', { name: /Reset demo data/ }));
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: /Dismiss this message/ }));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('confirms a new hire inline rather than in a blocking dialog', async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await addAHire();

    const confirmation = screen.getByRole('status');
    expect(confirmation).toHaveTextContent(/Rhea Kapoor/);
    expect(confirmation).toHaveTextContent(/was added to the employee register/);
    // The hire landed, and it landed with the phone field left empty rather than with the
    // example number the form used to submit on the user's behalf.
    expect(storedRoster()[0]).toMatchObject({ name: 'Rhea Kapoor', phone: '' });
    expect(JSON.parse(localStorage.getItem('omnihr_employees') as string).v).toBe(DATA_SCHEMA_VERSION);
  });
});
