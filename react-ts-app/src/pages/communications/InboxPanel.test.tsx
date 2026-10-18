import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxPanel } from './InboxPanel';

const STATS = {
  counts: { email: 1, question: 0, ticket: 1, call: 0 },
  total: 2,
  oldest_waiting_days: 9,
  stale_questions: 0,
  has_mailbox: true,
  scope: 'mine' as const,
  ticket_scope_note: 'Tickets are read by department.',
};

describe('InboxPanel', () => {
  it('draws the folders flat (no box in the glass shell) and the filters on the shared switch', async () => {
    const onNeedsOnly = vi.fn();
    render(<InboxPanel kind={null} stats={STATS} needsOnly mineOnly={false} hasMailbox onKind={vi.fn()} onNeedsOnly={onNeedsOnly} onMineOnly={vi.fn()} />);
    const folders = screen.getByRole('navigation', { name: 'Folders' });
    expect(folders.className).not.toMatch(/rv-glass-inner|border|rounded-xl/);
    expect(screen.getByRole('button', { name: /Inbox/ })).toHaveAttribute('aria-current', 'page');
    const needs = screen.getByRole('switch', { name: 'Needs you' });
    expect(needs).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(needs);
    expect(onNeedsOnly).toHaveBeenCalledWith(false);
  });
});
