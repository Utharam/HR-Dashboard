import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PolicySection } from '../PolicySection';
import type { HRPolicy } from '../../types';

const policies: HRPolicy[] = [
  {
    id: 'POL-MAT', title: 'Maternity Leave', category: 'Parental Provisions',
    shortDesc: 'Statutory maternity provision.', daysAllowed: 182, timeUnit: 'Days',
    isPaid: true, giftOrPerk: 'None', eligibility: 'All women staff.',
    rules: ['Applies uniformly.'], isActive: true,
  },
  {
    id: 'POL-CST-1', title: 'Four Day Week', category: 'Custom Rules',
    shortDesc: 'A custom rule someone wrote.', daysAllowed: 10, timeUnit: 'Days',
    isPaid: true, giftOrPerk: 'None', eligibility: 'All staff.',
    rules: ['Fridays are unpaid.'], isActive: true, isCustom: true,
  },
];

const renderSection = (over: Partial<React.ComponentProps<typeof PolicySection>> = {}) => {
  const onDeletePolicy = vi.fn();
  const onResetPolicies = vi.fn();
  render(
    <PolicySection
      policies={policies}
      onUpdatePolicy={vi.fn()}
      onAddPolicy={vi.fn()}
      onDeletePolicy={onDeletePolicy}
      onResetPolicies={onResetPolicies}
      {...over}
    />,
  );
  return { onDeletePolicy, onResetPolicies };
};

describe('PolicySection destructive actions', () => {
  it('asks before resetting, and names what the reset destroys', async () => {
    const { onResetPolicies } = renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Reset/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/custom policy you added or edited will be lost/i);
    expect(dialog).toHaveTextContent(/cannot be recovered/i);
    // Nothing has happened yet: the question is a question.
    expect(onResetPolicies).not.toHaveBeenCalled();
  });

  it('resets only when the answer is yes', async () => {
    const { onResetPolicies } = renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await userEvent.click(screen.getByRole('button', { name: /Reset all policies/ }));

    expect(onResetPolicies).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not reset when the question is dismissed', async () => {
    const { onResetPolicies } = renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await userEvent.keyboard('{Escape}');

    expect(onResetPolicies).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the policy being deleted, so the answer is about that policy and not "something"', async () => {
    const { onDeletePolicy } = renderSection();

    const card = screen.getByText('Four Day Week').closest('.omni-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /Delete/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Delete the custom policy "Four Day Week"\?/);
    expect(dialog).toHaveTextContent(/cannot be recovered once deleted/i);
    expect(onDeletePolicy).not.toHaveBeenCalled();
  });

  it('deletes only the named policy, and only on yes', async () => {
    const { onDeletePolicy } = renderSection();

    const card = screen.getByText('Four Day Week').closest('.omni-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete policy' }));

    expect(onDeletePolicy).toHaveBeenCalledExactlyOnceWith('POL-CST-1');
  });

  it('offers no delete control on a policy the user cannot delete', () => {
    renderSection();
    const card = screen.getByText('Maternity Leave').closest('.omni-card') as HTMLElement;
    expect(within(card).queryByRole('button', { name: /Delete/ })).toBeNull();
  });
});
