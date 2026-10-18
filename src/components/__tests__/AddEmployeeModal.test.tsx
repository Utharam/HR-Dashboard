import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AddEmployeeModal } from '../AddEmployeeModal';

const departments = [
  { id: 'D1', name: 'Engineering & Technology', head: 'A', roles: ['Engineer'] },
  { id: 'D2', name: 'People Operations', head: 'B', roles: ['Partner'] },
];
const locations = ['Bengaluru HQ', 'Pune Campus'];

/**
 * The modal is driven through a real trigger and closed with Escape, because the bug under
 * test is specifically about what the form is carrying when it is opened AGAIN.
 */
const Harness = ({ onAddEmployee = vi.fn() }: { onAddEmployee?: (e: unknown) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Add staff</button>
      <AddEmployeeModal
        isOpen={open}
        onClose={() => setOpen(false)}
        departments={departments}
        locations={locations}
        onAddEmployee={onAddEmployee as never}
        totalEmployeesCount={1}
      />
    </>
  );
};

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add staff' }));
};

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement;

/** Fills in the minimum needed for a genuine save, so the form's own state has moved. */
const completeTheForm = async () => {
  await userEvent.type(field(/Full Name/), 'Asha Menon');
  await userEvent.clear(field(/Monthly Gross CTC/));
  await userEvent.type(field(/Monthly Gross CTC/), '275000');
  await userEvent.selectOptions(field(/Gender/), 'Female');
  await userEvent.click(screen.getByRole('button', { name: /Save Staff Profile/ }));
};

describe('AddEmployeeModal', () => {
  it('starts the phone field empty, showing the example number only as a placeholder', async () => {
    render(<Harness />);
    await open();

    // A realistic-looking number sitting in a VALUE gets typed into the employee register.
    // Most users read the field, see something sensible, and submit it unchanged.
    const phone = field(/Phone Number/);
    expect(phone).toHaveValue('');
    expect(phone).toHaveAttribute('placeholder', '+91 9876543210');
  });

  it('does not pre-fill the previous hire when it is opened again', async () => {
    render(<Harness />);
    await open();
    await completeTheForm();

    await open();

    // Adding several people in a row silently duplicated the last one otherwise.
    expect(field(/Full Name/)).toHaveValue('');
    expect(field(/Designation/)).toHaveValue('Senior Software Engineer');
    expect(field(/Gender/)).toHaveValue('');
    expect(field(/Phone Number/)).toHaveValue('');
  });

  it('restores the default salary rather than the last one entered', async () => {
    render(<Harness />);
    await open();
    await completeTheForm();

    await open();

    expect(field(/Monthly Gross CTC/)).toHaveValue(150000);
  });

  it('restores the default department and location pickers', async () => {
    render(<Harness />);
    await open();
    await userEvent.selectOptions(field(/Department/), 'People Operations');
    await userEvent.selectOptions(field(/Office Location/), 'Pune Campus');
    await userEvent.keyboard('{Escape}');

    await open();

    expect(field(/Department/)).toHaveValue('Engineering & Technology');
    expect(field(/Office Location/)).toHaveValue('Bengaluru HQ');
  });

  it('still records the hire the user actually completed', async () => {
    const onAddEmployee = vi.fn();
    render(<Harness onAddEmployee={onAddEmployee} />);
    await open();
    await completeTheForm();

    expect(onAddEmployee).toHaveBeenCalledTimes(1);
    expect(onAddEmployee.mock.calls[0][0]).toMatchObject({
      name: 'Asha Menon',
      gender: 'Female',
      monthlyCTC: 275000,
    });
  });
});
