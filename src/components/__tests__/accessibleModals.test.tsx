import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { EmployeeModal } from '../EmployeeModal';
import { AddEmployeeModal } from '../AddEmployeeModal';
import { PolicyModal } from '../PolicyModal';
import type { Employee } from '../../types';

const employee: Employee = {
  id: 'EMP-1', name: 'Asha Menon', email: 'asha@omnixhr.io', phone: '+91 9000000000',
  department: 'Engineering & Technology', deptId: 'engi', role: 'Staff Engineer',
  location: 'Bengaluru HQ', doj: '2021-04-01', monthlyCTC: 200000,
  basicSalary: 100000, hra: 50000, specialAllowance: 50000,
  status: 'Active', gender: 'Female', performanceRating: 4,
  reportsTo: null, presentDays: 25, clBalance: 8, slBalance: 8,
  elBalance: 12, lopDays: 0, uan: '100000000000',
};

const departments = [{ id: 'D1', name: 'Engineering & Technology', head: 'A', roles: ['Engineer'] }];
const locations = ['Bengaluru HQ'];

/**
 * Every harness puts the modal behind a real trigger, because the assertion that matters
 * most - focus coming back to the control the user actually pressed - is only meaningful
 * when there is one.
 */
const EmployeeHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>View payslip</button>
      <EmployeeModal employee={open ? employee : null} onClose={() => setOpen(false)} />
    </>
  );
};

const AddHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Add staff</button>
      <AddEmployeeModal
        isOpen={open}
        onClose={() => setOpen(false)}
        departments={departments}
        locations={locations}
        onAddEmployee={vi.fn()}
        totalEmployeesCount={1}
      />
    </>
  );
};

const PolicyHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>New policy</button>
      <PolicyModal isOpen={open} onClose={() => setOpen(false)} onSavePolicy={vi.fn()} />
    </>
  );
};

const MODALS: [string, () => ReactElement, RegExp][] = [
  ['EmployeeModal', () => <EmployeeHarness />, /^Asha Menon$/],
  ['AddEmployeeModal', () => <AddHarness />, /^Add New Staff Profile$/],
  ['PolicyModal', () => <PolicyHarness />, /^Create Custom HR Policy \/ Rule$/],
];

describe.each(MODALS)('%s as an accessible dialog', (_name, Harness, heading) => {
  it('is named by its visible heading, so a screen reader reads the title not a label', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /payslip|staff|policy/i }));

    const dialog = screen.getByRole('dialog', { name: heading });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into itself when it opens', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /payslip|staff|policy/i }));

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /payslip|staff|policy/i }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives its icon-only close button an accessible name', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /payslip|staff|policy/i }));

    // Identified by its class, because the accessible NAME is precisely what is under test.
    // A bare "button" in the accessibility tree is all a user hears when the only content
    // of the control is an SVG.
    const iconClose = document.querySelector('.modal-close') as HTMLElement;
    expect(iconClose.tagName).toBe('BUTTON');
    expect(iconClose).toHaveAccessibleName();
  });
});

describe.each(MODALS)('%s focus lifecycle', (_name, Harness) => {
  it('returns focus to the trigger that opened it', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /payslip|staff|policy/i });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Tab inside itself', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /payslip|staff|policy/i }));

    const dialog = screen.getByRole('dialog');
    // Whatever is focused when the dialog opens, tabbing must not leave the scrim.
    for (let i = 0; i < 25; i += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('two dialogs of the same kind open at once', () => {
  const noop = () => {};
  const TWICE: [string, () => ReactElement][] = [
    ['EmployeeModal', () => (
      <>
        <EmployeeModal employee={employee} onClose={noop} />
        <EmployeeModal employee={{ ...employee, id: 'EMP-2', name: 'Rahul Verma' }} onClose={noop} />
      </>
    )],
    ['AddEmployeeModal', () => (
      <>
        <AddEmployeeModal isOpen onClose={noop} departments={departments} locations={locations} onAddEmployee={noop} totalEmployeesCount={1} />
        <AddEmployeeModal isOpen onClose={noop} departments={departments} locations={locations} onAddEmployee={noop} totalEmployeesCount={2} />
      </>
    )],
    ['PolicyModal', () => (
      <>
        <PolicyModal isOpen onClose={noop} onSavePolicy={noop} />
        <PolicyModal isOpen onClose={noop} onSavePolicy={noop} />
      </>
    )],
  ];

  it('names each EmployeeModal after its own heading rather than both resolving to the first', () => {
    // A hard-coded id is fine right up until a second instance exists - a compare view, a
    // favourites pane, a second row opened on top of the first. `aria-labelledby` resolves
    // to the FIRST element with that id in the document, so both dialogs would announce the
    // first person's name. The primitive uses `useId()` for exactly this reason; these three
    // modals have to match it.
    render(<>{TWICE[0][1]()}</>);

    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0]).toHaveAccessibleName('Asha Menon');
    expect(dialogs[1]).toHaveAccessibleName('Rahul Verma');
  });

  it.each(TWICE)('%s points its ARIA references at one element each', (_name, twice) => {
    render(twice());

    // Scoped to ARIA reference targets on purpose. The three modals also carry hard-coded
    // ids on their own form fields (`add-name`, `policy-title`, ...), which collide the same
    // way when two instances render - a real defect, but a different one, and fixing it means
    // minting an id per field rather than per dialog.
    const referenced = Array.from(document.querySelectorAll('[aria-labelledby], [aria-describedby]')).flatMap((el) =>
      [el.getAttribute('aria-labelledby'), el.getAttribute('aria-describedby')]
        .filter((v): v is string => !!v)
        .flatMap((v) => v.split(/\s+/))
        .filter(Boolean),
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }
  });
});
