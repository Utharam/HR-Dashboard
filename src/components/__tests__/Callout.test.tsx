import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Callout } from '../Callout';

describe('Callout', () => {
  it('reads its text out to a screen reader without interrupting it when it is good news', () => {
    render(<Callout tone="success">Added Asha Menon (EMP-1201) to the register.</Callout>);
    // `status` is the polite live region. Using `alert` for a success message would cut
    // across whatever the user was already being read.
    expect(screen.getByRole('status')).toHaveTextContent(/Added Asha Menon/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['danger', 'warning', 'info'] as const)('interrupts for a %s message', (tone) => {
    render(<Callout tone={tone}>Something needs attention.</Callout>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Something needs attention/);
  });

  it.each([
    ['success', 'tone-success'],
    ['danger', 'tone-danger'],
    ['warning', 'tone-warning'],
    ['info', 'tone-info'],
  ] as const)('takes its %s colour from the token layer, not an inline value', (tone, toneClass) => {
    render(<Callout tone={tone}>Message</Callout>);
    const el = screen.getByRole(tone === 'success' ? 'status' : 'alert');
    expect(el.className).toContain('alert');
    expect(el.className).toContain(toneClass);
    expect(el.getAttribute('style')).toBeNull();
    expect(el.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(el.innerHTML).not.toMatch(/\d(px|rem)\b/);
  });

  it('offers no dismiss control when there is nothing to dismiss', () => {
    render(<Callout tone="info">Message</Callout>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dismisses when asked to, and says which control it was', async () => {
    const onDismiss = vi.fn();
    render(
      <Callout tone="info" onDismiss={onDismiss}>
        Message
      </Callout>,
    );
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('offers a single action and runs it', async () => {
    const onClick = vi.fn();
    render(
      <Callout tone="warning" action={{ label: 'Retry', onClick }}>
        The change was NOT saved.
      </Callout>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('can offer both an action and a dismiss, without the two colliding', async () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Callout tone="info" onDismiss={onDismiss} action={{ label: 'Re-import', onClick }}>
        Message
      </Callout>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(onClick).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
