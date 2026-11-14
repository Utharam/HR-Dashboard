import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceCellModal } from '../AttendanceCellModal';
import type { AttendanceCellModalProps } from '../AttendanceCellModal';
import type { AttendanceRecord, Employee } from '../../types';

/*
 * The modal is mounted only while open, exactly the way AttendanceSection uses
 * it, so every test renders it fresh and asserts on the callbacks. Because the
 * parent owns `isOpen`, a render here stays mounted after onClose - the tests
 * assert on the CALLBACKS (what the parent receives), not on the dialog
 * disappearing.
 */

const EMPLOYEE: Employee = {
  id: 'EMP-1',
  name: 'Asha Menon',
  email: 'asha@omnixhr.io',
  phone: '+91 9000000000',
  department: 'Engineering & Technology',
  deptId: 'eng',
  role: 'Engineer',
  location: 'Bengaluru HQ',
  doj: '2020-01-01',
  monthlyCTC: 100000,
  basicSalary: 50000,
  hra: 25000,
  specialAllowance: 25000,
  status: 'Active',
  gender: 'Female',
  performanceRating: 4,
  reportsTo: null,
  presentDays: 25,
  clBalance: 8,
  slBalance: 8,
  elBalance: 12,
  lopDays: 0,
  uan: '100000000000',
};

const DATE = '2026-03-10';

const record = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: `EMP-1|${DATE}`,
  employeeId: 'EMP-1',
  date: DATE,
  status: 'Present',
  source: 'excel',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

type ModalProps = AttendanceCellModalProps;

const renderModal = (overrides: Partial<ModalProps> = {}) => {
  // Held as typed mocks OUTSIDE the props object, so the tests can read
  // `.mock.calls` without casting.
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onDeleteRecord = vi.fn();
  const props: ModalProps = {
    isOpen: true,
    onClose,
    onSave,
    onDeleteRecord,
    employee: EMPLOYEE,
    date: DATE,
    existing: null,
    offDayLabel: null,
    ...overrides,
  };
  render(<AttendanceCellModal {...props} />);
  return { onClose, onSave, onDeleteRecord };
};

const dialog = () => screen.getByRole('dialog');

describe('AttendanceCellModal', () => {
  it('is named by the employee and shows the date being edited', () => {
    renderModal();

    expect(dialog()).toHaveTextContent('Attendance — Asha Menon');
    expect(dialog()).toHaveTextContent(/Tuesday, March 10, 2026/);
    expect(dialog()).toHaveTextContent(/unmarked/);
  });

  it('saves a Present record with the canonical id by default', async () => {
    const { onClose, onSave } = renderModal();

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: `EMP-1|${DATE}`,
      employeeId: 'EMP-1',
      date: DATE,
      status: 'Present',
      source: 'manual',
    });
    // The parent (which owns `isOpen`) receives the close request.
    expect(onClose).toHaveBeenCalled();
  });

  it('requires a leave type when the status is Leave', async () => {
    const { onSave } = renderModal();

    await userEvent.selectOptions(within(dialog()).getByLabelText('Status'), 'On leave');
    expect(within(dialog()).getByLabelText('Leave type')).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog()).getByLabelText('Leave type'), 'LOP');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: 'Leave',
      leaveType: 'LOP',
    });
  });

  it('saves a half-day with its part and an optional leave type for the other half', async () => {
    const { onSave } = renderModal();

    await userEvent.selectOptions(within(dialog()).getByLabelText('Status'), 'Half day');
    await userEvent.selectOptions(within(dialog()).getByLabelText('Part of the day'), 'PM');
    await userEvent.selectOptions(
      within(dialog()).getByLabelText('Leave for the other half'),
      'LOP',
    );
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: 'HalfDay',
      halfDay: 'PM',
      leaveType: 'LOP',
    });
  });

  it('saves a half-day without a leave type when the other half was worked', async () => {
    const { onSave } = renderModal();

    await userEvent.selectOptions(within(dialog()).getByLabelText('Status'), 'Half day');
    await userEvent.selectOptions(
      within(dialog()).getByLabelText('Leave for the other half'),
      'Worked (no leave)',
    );
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    const saved = onSave.mock.calls[0][0] as AttendanceRecord;
    expect(saved.status).toBe('HalfDay');
    expect(saved.halfDay).toBe('AM');
    expect(saved.leaveType).toBeUndefined();
  });

  it('trims the note and omits it when blank', async () => {
    const { onSave } = renderModal();

    await userEvent.type(within(dialog()).getByLabelText('Note'), '  client visit  ');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));
    expect((onSave.mock.calls[0][0] as AttendanceRecord).note).toBe('client visit');

    // Remount fresh for the blank case: the modal is mounted per open.
    cleanup();
    const { onSave: onSaveFresh } = renderModal();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));
    expect((onSaveFresh.mock.calls[0][0] as AttendanceRecord).note).toBeUndefined();
  });

  it('prefills from the existing record and keeps its identity when saving', async () => {
    const { onSave } = renderModal({
      existing: record({ status: 'Leave', leaveType: 'SL', note: 'family' }),
    });

    expect(within(dialog()).getByLabelText('Status')).toHaveValue('Leave');
    expect(within(dialog()).getByLabelText('Leave type')).toHaveValue('SL');
    expect(within(dialog()).getByLabelText('Note')).toHaveValue('family');
    expect(dialog()).toHaveTextContent(/recorded via the monthly matrix import/);

    await userEvent.selectOptions(within(dialog()).getByLabelText('Leave type'), 'EL');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: `EMP-1|${DATE}`,
      status: 'Leave',
      leaveType: 'EL',
      note: 'family',
      source: 'manual',
    });
  });

  it('clears leave fields when an existing leave record becomes Present', async () => {
    const { onSave } = renderModal({
      existing: record({ status: 'Leave', leaveType: 'SL' }),
    });

    await userEvent.selectOptions(within(dialog()).getByLabelText('Status'), 'Present');
    expect(within(dialog()).queryByLabelText('Leave type')).toBeNull();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));

    const saved = onSave.mock.calls[0][0] as AttendanceRecord;
    expect(saved.status).toBe('Present');
    expect(saved.leaveType).toBeUndefined();
    expect(saved.halfDay).toBeUndefined();
  });

  it('asks before deleting an existing record and reports its id', async () => {
    const { onClose, onDeleteRecord } = renderModal({ existing: record({ status: 'Absent' }) });

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete record' }));

    const confirm = screen.getByRole('dialog', { name: /Delete this attendance record/ });
    expect(confirm).toHaveTextContent(/Asha Menon/);
    expect(onDeleteRecord).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete record' }));
    expect(onDeleteRecord).toHaveBeenCalledWith(`EMP-1|${DATE}`);
    expect(onClose).toHaveBeenCalled();
    // The confirm layer closed; the editor itself closes only when the parent
    // (which owns `isOpen`) reacts.
    expect(screen.queryByRole('dialog', { name: /Delete this attendance record/ })).toBeNull();
  });

  it('cancelling the delete keeps the record and the editor open', async () => {
    const { onDeleteRecord } = renderModal({ existing: record({ status: 'Absent' }) });

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete record' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: /Delete this attendance record/ })).getByRole('button', { name: 'Cancel' }),
    );

    expect(onDeleteRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Attendance — Asha Menon/ })).toBeInTheDocument();
  });

  it('offers no delete for an unmarked day', () => {
    renderModal();

    expect(screen.queryByRole('button', { name: 'Delete record' })).toBeNull();
  });

  it('warns when the day is a Sunday or holiday but still allows a mark', async () => {
    const { onSave } = renderModal({ offDayLabel: 'Weekly off (Sunday)' });

    expect(dialog()).toHaveTextContent(/Weekly off \(Sunday\)/);

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('starts from an approved full-day plan instead of Present', async () => {
    const { onSave } = renderModal({ ghost: { type: 'SL', halfDay: null } });

    expect(dialog()).toHaveTextContent(/Approved leave plan on this day: SL/);
    expect(within(dialog()).getByLabelText('Status')).toHaveValue('Leave');
    expect(within(dialog()).getByLabelText('Leave type')).toHaveValue('SL');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: 'Leave',
      leaveType: 'SL',
      source: 'manual',
    });
  });

  it('starts from an approved half-day plan with the opposite half worked', async () => {
    const { onSave } = renderModal({ ghost: { type: 'LOP', halfDay: 'AM' } });

    // Plan semantics: `AM only` means the MORNING is off, so the record works
    // the afternoon and carries the plan's type as its leave half.
    expect(dialog()).toHaveTextContent(/Approved leave plan on this day: LOP · AM off/);
    expect(within(dialog()).getByLabelText('Status')).toHaveValue('HalfDay');
    expect(within(dialog()).getByLabelText('Part of the day')).toHaveValue('PM');
    expect(within(dialog()).getByLabelText('Leave for the other half')).toHaveValue('LOP');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save attendance' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: 'HalfDay',
      halfDay: 'PM',
      leaveType: 'LOP',
    });
  });

  it('prefers the existing record over the ghost default', () => {
    renderModal({
      ghost: { type: 'SL', halfDay: null },
      existing: record({ status: 'Present' }),
    });

    expect(within(dialog()).getByLabelText('Status')).toHaveValue('Present');
    expect(dialog()).toHaveTextContent(/recorded via/);
  });

  it('does not save when cancelled', async () => {
    const { onClose, onSave } = renderModal();

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
