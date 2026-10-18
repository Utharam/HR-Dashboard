import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Dialog } from '../Dialog';

/**
 * A control the browser will focus on click but that is absent from the trap's computed
 * list - a `tabIndex={-1}` control, a control inside a disabled fieldset, anything the
 * selector does not recognise. It must never be reachable by Tab, and the trap has to
 * notice it has focus rather than assume it is looking at something it knows about.
 */
const Uncounted = () => <button tabIndex={-1}>Not tabbable</button>;

/**
 * The dialog under test always sits inside a page that has focusable controls of its own.
 * That is the whole point of the exercise: a trap that cannot be observed escaping is not a
 * trap, so every harness below has an "Open" button outside the scrim and the dialog itself
 * contains more than one control.
 *
 * Two placements here are load-bearing, and both were wrong at some point:
 *
 * - The disabled control is LAST among the things a keyboard can reach. Between "First" and
 *   "Last" it was invisible to the test: the wrap target was "Last" with or without the
 *   disabled filter, so deleting the filter from `Dialog` changed nothing and the test
 *   claiming to cover that line was green against a broken trap. Where it sits decides
 *   whether "Last" is the last focusable thing in here at all.
 * - `Uncounted` is LAST in document order, so focusing it and pressing Tab has somewhere to
 *   escape to. Sat between two reachable controls it would have proved nothing, because the
 *   browser's own tabbing would have kept focus inside the dialog either way. The backward
 *   direction needs it FIRST instead, so `WindowFirst` exists for that.
 */
const WindowLast = () => (
  <>
    <h2 id="t">Title</h2>
    <button>First</button>
    <button>Last</button>
    <button disabled>Disabled</button>
    <Uncounted />
  </>
);

const WindowFirst = () => (
  <>
    <h2 id="t">Title</h2>
    <Uncounted />
    <button>First</button>
    <button>Last</button>
  </>
);

const Window = () => <WindowLast />;

const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} labelledBy="t">
        <Window />
      </Dialog>
    </>
  );
};

/** As `Harness`, but the uncounted control is the first thing in the window. */
const ReverseHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} labelledBy="t">
        <WindowFirst />
      </Dialog>
    </>
  );
};

/** The dialog is mounted only while `mounted` is true, so closing it is an UNMOUNT. */
const UnmountHarness = () => {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button onClick={() => setMounted(true)}>Open</button>
      <button onClick={() => setMounted(false)}>Close</button>
      {mounted && (
        <Dialog isOpen onClose={() => setMounted(false)} labelledBy="t">
          <Window />
        </Dialog>
      )}
    </>
  );
};

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
};

const dialog = () => screen.getByRole('dialog');
const overlayOf = (el: HTMLElement) => el.parentElement as HTMLElement;

describe('Dialog', () => {
  it('renders nothing at all while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('is announced as a modal dialog named by the element labelledBy points at', async () => {
    render(<Harness />);
    await open();
    expect(screen.getByRole('dialog', { name: 'Title' })).toHaveAttribute('aria-modal', 'true');
  });

  it('is programmatically focusable so focus can be moved into it', async () => {
    render(<Harness />);
    await open();
    expect(dialog()).toHaveAttribute('tabindex', '-1');
  });

  it('applies an extra className to the window without losing modal-window', async () => {
    render(
      <Dialog isOpen onClose={() => {}} labelledBy="t" className="modal-window--narrow">
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    expect(dialog().className).toContain('modal-window');
    expect(dialog().className).toContain('modal-window--narrow');
  });

  it('threads an optional description through to the window', () => {
    render(
      <Dialog isOpen onClose={() => {}} labelledBy="t" describedBy="d">
        <h2 id="t">Title</h2>
        <p id="d">What agreeing to this costs you.</p>
      </Dialog>,
    );
    expect(dialog()).toHaveAccessibleDescription('What agreeing to this costs you.');
  });

  it('carries no description at all when none is given', () => {
    render(
      <Dialog isOpen onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    // Absent, not empty: `aria-describedby=""` points at nothing and some screen readers
    // announce the empty reference.
    expect(dialog().hasAttribute('aria-describedby')).toBe(false);
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a click on the backdrop', async () => {
    render(<Harness />);
    await open();
    await userEvent.click(overlayOf(dialog()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT close on a click inside the window, which would discard what was typed', async () => {
    render(<Harness />);
    await open();
    await userEvent.click(dialog());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('moves focus into the dialog on open', async () => {
    render(<Harness />);
    await open();
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });

  it('restores focus to the trigger on close', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    // Without this the keyboard user is dropped on <body> and has to tab from the top of
    // the page again to reach the control they just used.
    expect(document.activeElement).toBe(trigger);
  });

  it('restores focus to the trigger when the dialog is unmounted while still open', async () => {
    render(<UnmountHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('locks page scrolling while open and releases it on close', async () => {
    render(<Harness />);
    expect(document.body.style.overflow).toBe('');
    await open();
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab from the last control wraps to the first instead of leaving the dialog', async () => {
    render(<Harness />);
    await open();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await userEvent.click(last);
    await userEvent.tab();

    // The failure this replaces: focus walks straight off the scrim into the page behind.
    expect(document.activeElement).toBe(first);
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });

  it('Shift+Tab from the first control wraps to the last', async () => {
    render(<Harness />);
    await open();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await userEvent.click(first);
    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(last);
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });

  it('Tab from the window itself reaches the first control rather than the page behind', async () => {
    // This is the state a user is in the instant the dialog opens, before touching anything.
    render(<Harness />);
    await open();
    expect(document.activeElement).toBe(dialog());

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('wraps past a trailing disabled control instead of treating it as the last one', async () => {
    // The disabled button is the final element in the window (see `Window`). If the trap
    // counted it, "Last" would not be the last focusable thing and the wrap would never
    // fire - the browser would carry focus out through the scrim instead.
    render(<Harness />);
    await open();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await userEvent.click(last);
    await userEvent.tab();

    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Disabled' }));
    expect(document.activeElement).toBe(first);
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });

  it('recovers focus when it sits on a control the trap does not count', async () => {
    // Focusable by pointer, absent from the trap's computed list: a `tabIndex={-1}` control,
    // a control inside a disabled fieldset, anything the selector does not know about. It is
    // the last element in document order, so letting the browser have the Tab key here is
    // what walks a keyboard user straight off the scrim.
    render(<Harness />);
    await open();
    const first = screen.getByRole('button', { name: 'First' });

    await userEvent.click(screen.getByRole('button', { name: 'Not tabbable' }));
    expect(document.activeElement).not.toBe(first);

    await userEvent.tab();

    expect(document.activeElement).toBe(first);
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });

  it('recovers focus in the other direction from an uncounted control', async () => {
    // Mirror image of the test above, and just as load-bearing: with the uncounted control
    // LAST, Shift+Tab's natural destination was still inside the dialog and this assertion
    // passed against a trap that had no recovery for it. It only discriminates when the
    // control is the FIRST thing in the window.
    render(<ReverseHarness />);
    await open();
    const last = screen.getByRole('button', { name: 'Last' });

    await userEvent.click(screen.getByRole('button', { name: 'Not tabbable' }));
    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(last);
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
  });
});
