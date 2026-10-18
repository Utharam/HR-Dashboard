import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';

const noop = () => {};

const ConfirmHarness = ({ confirmLabel = 'Reset' }: { confirmLabel?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reset demo state</button>
      <ConfirmDialog
        isOpen={open}
        title="Reset demo state?"
        message="This discards 200 records."
        confirmLabel={confirmLabel}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};

describe('ConfirmDialog', () => {
  it('is announced as a dialog with its accessible name', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Reset demo state?"
        message="This discards 200 records."
        confirmLabel="Reset"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Reset demo state?' })).toBeInTheDocument();
  });

  it('states the consequence in the body, so the user knows what they are agreeing to', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Delete custom policy?"
        message="Custom policies cannot be recovered once deleted."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(/cannot be recovered once deleted/i);
  });

  it('announces the consequence as the dialog description, not as something to navigate to', () => {
    // The question alone is not enough to answer it. A screen-reader user has to be told
    // what agreeing costs them, and the way to do that is `aria-describedby` - a bare
    // paragraph in the dialog body is only read if they go looking for it.
    render(
      <ConfirmDialog
        isOpen
        title="Delete custom policy?"
        message="Custom policies cannot be recovered once deleted."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Custom policies cannot be recovered once deleted.',
    );
  });

  it('calls onCancel when Cancel is pressed', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when the confirm button is pressed', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset" onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('uses the caller-supplied cancel label', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        confirmLabel="Delete policy"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('treats Escape as a refusal, never as agreement', async () => {
    // The destructive action must not be reachable by a key the user pressed to get out.
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders the confirm button as destructive by default and as primary on request', () => {
    const { rerender } = render(
      <ConfirmDialog isOpen title="T" message="M" confirmLabel="Reset" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByRole('button', { name: 'Reset' }).className).toContain('btn-danger');

    rerender(
      <ConfirmDialog isOpen tone="primary" title="T" message="M" confirmLabel="Reset" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByRole('button', { name: 'Reset' }).className).toContain('btn-primary');
  });

  it('renders nothing at all when closed', () => {
    render(<ConfirmDialog isOpen={false} title="T" message="M" confirmLabel="Reset" onConfirm={noop} onCancel={noop} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the trigger that opened it', async () => {
    render(<ConfirmHarness />);
    const trigger = screen.getByRole('button', { name: 'Reset demo state' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Tab inside itself while it is open', async () => {
    render(<ConfirmHarness confirmLabel="Reset everything" />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo state' }));

    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 8; i += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
