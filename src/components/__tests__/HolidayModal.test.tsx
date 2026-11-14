import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HolidayModal } from '../HolidayModal';
import type { Holiday } from '../../types';

const EXISTING_HOLIDAYS: Holiday[] = [
  { id: 'holiday-2026-01-26', date: '2026-01-26', name: 'Republic Day' },
  { id: 'holiday-2026-08-15', date: '2026-08-15', name: 'Independence Day' },
];

type ModalProps = Parameters<typeof HolidayModal>[0];

const renderModal = (overrides: Partial<ModalProps> = {}) => {
  const props: ModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    holidays: EXISTING_HOLIDAYS,
    holidayToEdit: null,
    ...overrides,
  };
  render(<HolidayModal {...props} />);
  return props;
};

const dialog = () => screen.getByRole('dialog');

describe('HolidayModal', () => {
  it('adds a holiday with the date-derived id and a trimmed name', async () => {
    const props = renderModal();

    expect(dialog()).toHaveTextContent(/Add holiday/);
    fireEvent.change(within(dialog()).getByLabelText('Date'), {
      target: { value: '2026-07-04' },
    });
    await userEvent.type(within(dialog()).getByLabelText('Name'), '  Founders Day  ');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save holiday' }));

    expect(props.onSave).toHaveBeenCalledWith({
      id: 'holiday-2026-07-04',
      date: '2026-07-04',
      name: 'Founders Day',
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('refuses a second holiday on an already-taken date', async () => {
    const props = renderModal();

    fireEvent.change(within(dialog()).getByLabelText('Date'), {
      target: { value: '2026-01-26' },
    });
    await userEvent.type(within(dialog()).getByLabelText('Name'), 'Extra Republic Day');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save holiday' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/2026-01-26 already carries the holiday "Republic Day"/);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('requires a valid date and a name', async () => {
    const props = renderModal();

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save holiday' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter the holiday date.');
    expect(alert).toHaveTextContent('Give the holiday a name.');
    expect(props.onSave).not.toHaveBeenCalled();

    // A date with no name is still refused.
    fireEvent.change(within(dialog()).getByLabelText('Date'), {
      target: { value: '2026-07-04' },
    });
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save holiday' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the holiday a name.');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('prefills the holiday being edited and keeps its id', async () => {
    const props = renderModal({
      holidayToEdit: EXISTING_HOLIDAYS[0],
    });

    expect(dialog()).toHaveTextContent(/Edit holiday/);
    expect(within(dialog()).getByLabelText('Date')).toHaveValue('2026-01-26');
    expect(within(dialog()).getByLabelText('Name')).toHaveValue('Republic Day');

    await userEvent.clear(within(dialog()).getByLabelText('Name'));
    await userEvent.type(within(dialog()).getByLabelText('Name'), 'Republic Day (observed)');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));

    expect(props.onSave).toHaveBeenCalledWith({
      id: 'holiday-2026-01-26',
      date: '2026-01-26',
      name: 'Republic Day (observed)',
    });
  });

  it('keeps an edited holiday out of its own duplicate check', async () => {
    const props = renderModal({
      holidayToEdit: EXISTING_HOLIDAYS[0],
    });

    // Saving without changes is not a duplicate of itself.
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onSave).toHaveBeenCalledWith({
      id: 'holiday-2026-01-26',
      date: '2026-01-26',
      name: 'Republic Day',
    });
  });

  it('lets an edit change the date to a free one and keeps the id', async () => {
    const props = renderModal({
      holidayToEdit: EXISTING_HOLIDAYS[0],
    });

    fireEvent.change(within(dialog()).getByLabelText('Date'), {
      target: { value: '2026-10-05' },
    });
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));

    // The id stays stable so the parent replaces the stored row it came from.
    expect(props.onSave).toHaveBeenCalledWith({
      id: 'holiday-2026-01-26',
      date: '2026-10-05',
      name: 'Republic Day',
    });
  });

  it('refuses re-dating an edit onto another holiday', async () => {
    const props = renderModal({
      holidayToEdit: EXISTING_HOLIDAYS[0],
    });

    fireEvent.change(within(dialog()).getByLabelText('Date'), {
      target: { value: '2026-08-15' },
    });
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/2026-08-15 already carries the holiday "Independence Day"/);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('does not save when cancelled', async () => {
    const props = renderModal();

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
