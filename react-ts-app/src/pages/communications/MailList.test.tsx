import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailList } from './MailList';
import { MAIL_DETAIL, MAIL_EARLIER, threadRowOf } from '../../features/mail/testMail';
import { rowOfMessage } from '../../features/mail/mailboxSlice';

const ROW = threadRowOf(MAIL_DETAIL);

describe('MailList: conversation rows', () => {
  it('shows two label chips and +1, and says the row has attachments', () => {
    render(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    // The Labels cell and the narrow meta line each carry the chips; CSS shows one.
    const groups = screen.getAllByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    expect(groups).toHaveLength(2);
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);
    expect(screen.getByText('Has attachments')).toHaveClass('sr-only');
  });

  it('shows neither for a row without labels or attachments', () => {
    render(<MailList rows={[{ ...ROW, labels: [], has_attachments: false }]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByRole('button', { name: /Ann Lee/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Labels/ })).toBeNull();
    expect(screen.queryByText('Has attachments')).toBeNull();
  });

  it('names a conversation by its senders with its count, and a sent message To its recipients', () => {
    const conversation = { ...ROW, message_count: 2, participants: [{ name: 'Dana Ruiz', address: 'dana@doughco.com' }, { name: 'Ann Lee', address: 'ann@pizzahut.com' }] };
    render(<MailList rows={[conversation, rowOfMessage(MAIL_EARLIER)]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(screen.getByText(/messages/).parentElement).toHaveTextContent('2 messages');
    expect(screen.getByRole('button', { name: 'To Ann Lee' })).toBeInTheDocument();
    expect(document.querySelector('[data-thread-id="1"]')).not.toBeNull();
  });

  it('ticks a row from its own box, hidden until hover from sm unless something is ticked', async () => {
    const onToggleCheck = vi.fn();
    const { rerender } = render(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} checked={[]} onToggleCheck={onToggleCheck} />);
    const box = screen.getByRole('checkbox', { name: 'Select Ann Lee' });
    expect(box.parentElement).toHaveClass('sm:opacity-0', 'min-h-11', 'min-w-11');
    await userEvent.click(box);
    expect(onToggleCheck).toHaveBeenCalledWith(1);
    rerender(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} checked={[1]} onToggleCheck={onToggleCheck} />);
    expect(screen.getByRole('checkbox', { name: 'Select Ann Lee' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Ann Lee' }).parentElement).not.toHaveClass('sm:opacity-0');
  });

  it('marks a row whose change did not reach Gmail, with the sentence for screen readers', () => {
    const issue = { text: "Couldn't label \"Q4\" in Gmail: the label no longer exists.", at: '2026-10-11T08:50:02Z' };
    render(<MailList rows={[{ ...ROW, sync_issue: issue }]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByTitle(issue.text)).toHaveTextContent(issue.text);
  });
});
