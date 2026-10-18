import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailsTab } from './EmailsTab';
import type { Email } from '../../../features/customers/customersSlice';

const synced: Email = {
  id: 1, subject: 'Renewal terms', sender_name: 'Dana', recipient_name: 'Sam Pizza', body: 'Shall we talk?',
  sent_at: '2026-09-16T09:00:00Z', links: 0, watchers: 0, is_starred: false,
  direction: 'sent', from_address: 'dana@acme.io', to_addresses: ['sam@pizzahut.com'], thread_id: 't1',
  mailbox_owner: { id: 3, name: 'Dana' },
};
const logged: Email = {
  id: 2, subject: 'Kickoff', sender_name: 'Sam Pizza', recipient_name: 'Dana', body: 'Welcome aboard',
  sent_at: '2026-09-15T09:00:00Z', links: 0, watchers: 0, is_starred: false,
};

describe('EmailsTab', () => {
  it('marks synced emails with their direction and offers Compose when the record can be emailed', async () => {
    const onCompose = vi.fn();
    const user = userEvent.setup();
    render(<EmailsTab emails={[synced, logged]} isLoading={false} error={null} onCompose={onCompose} />);

    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText(/You see your own and your team's emails/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    expect(onCompose).toHaveBeenCalledTimes(1);
  });

  it('has no Compose for a record that cannot be emailed', () => {
    render(<EmailsTab emails={[]} isLoading={false} error={null} />);
    expect(screen.queryByRole('button', { name: 'Compose' })).not.toBeInTheDocument();
    expect(screen.getByText('No emails found')).toBeInTheDocument();
  });

  // Review round 1, Important: the card's sender avatar used to load a
  // pravatar.cc placeholder image for every sender name; it now shares
  // UserAvatar, so it shows as an initial with no third-party request.
  it("shows the card's sender as an initial, with no third-party avatar request", () => {
    render(<EmailsTab emails={[synced]} isLoading={false} error={null} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('D')).toBeInTheDocument();
  });
});
