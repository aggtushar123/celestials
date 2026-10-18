import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelMenu } from './LabelMenu';
import { MAIL_LABELS } from '../../features/mail/testMail';
import type { LabelState } from '../../features/mail/mailOptimistic';

// Unit tier: the label menu alone (D2 contract §4, Decision 13).

const PILOT = { id: 12, gmail_id: null, name: 'Pilot', color: null, unread: 0, pending: true };

function renderMenu(states: Record<number, LabelState>, onCreate = vi.fn<(name: string) => Promise<string | null>>(async () => null), disabled = false) {
  const onToggle = vi.fn();
  render(
    <LabelMenu
      variant="icon"
      labels={[PILOT, ...MAIL_LABELS]}
      stateOf={(id) => states[id] ?? 'none'}
      disabled={disabled}
      disabledReason={disabled ? 'Changes here cannot reach Gmail.' : null}
      onToggle={onToggle}
      onCreate={onCreate}
    />,
  );
  return { onToggle, onCreate };
}

describe('LabelMenu', () => {
  it('ticks what every message carries, shows mixed ones, and says which are not in Gmail yet', async () => {
    renderMenu({ 7: 'all', 11: 'some' });
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    const menu = screen.getByRole('dialog', { name: 'Labels' });
    expect(within(menu).getByRole('checkbox', { name: /Renewals/ })).toBeChecked();
    const q4 = within(menu).getByRole('checkbox', { name: /Q4/ }) as HTMLInputElement;
    expect(q4.checked).toBe(false);
    expect(q4.indeterminate).toBe(true);
    expect(within(menu).getByText('Not in Gmail yet')).toBeInTheDocument();
  });

  it('removes a label every message has, and adds one that some or none have', async () => {
    const { onToggle } = renderMenu({ 7: 'all', 11: 'some' });
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Renewals/ }));
    expect(onToggle).toHaveBeenLastCalledWith(7, false);
    await userEvent.click(screen.getByRole('checkbox', { name: /Q4/ }));
    expect(onToggle).toHaveBeenLastCalledWith(11, true);
  });

  it('creates a label from its own field, trimmed, and keeps a refusal inside the menu', async () => {
    const onCreate = vi.fn(async (name: string): Promise<string | null> => (name === 'INBOX' ? 'Gmail keeps that name for itself.' : null));
    renderMenu({}, onCreate);
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    const field = screen.getByLabelText('New label');
    await userEvent.type(field, 'INBOX');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gmail keeps that name for itself.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(field);
    await userEvent.type(field, '  Pilot ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenLastCalledWith('Pilot');
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('closes on Escape and hands focus back to its button', async () => {
    renderMenu({});
    const trigger = screen.getByRole('button', { name: 'Labels' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('stays shut while the mailbox cannot reach Gmail, and says why', () => {
    renderMenu({}, undefined, true);
    const trigger = screen.getByRole('button', { name: 'Labels' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'Changes here cannot reach Gmail.');
  });
});

describe('LabelMenu when the mailbox turns busy', () => {
  it('shuts an open panel, so no second label action starts', async () => {
    const props = { variant: 'icon' as const, labels: MAIL_LABELS, stateOf: () => 'none' as LabelState, onToggle: vi.fn(), onCreate: async () => null };
    const { rerender } = render(<LabelMenu {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    expect(screen.getByRole('dialog', { name: 'Labels' })).toBeInTheDocument();
    rerender(<LabelMenu {...props} disabled />);
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull();
  });
});
