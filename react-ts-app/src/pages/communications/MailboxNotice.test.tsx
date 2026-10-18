import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailboxNotice } from './MailboxNotice';
import { GOOGLE, MAIL_SUMMARY } from '../../features/mail/testMail';
import { mailActionGate, TWO_WAY_OFF_TEXT } from '../../features/mail/mailText';

describe('MailboxNotice', () => {
  it('says the import is running, with "about"', () => {
    render(<MailboxNotice summary={MAIL_SUMMARY} />);
    expect(screen.getByRole('status')).toHaveTextContent('Importing mail: 4,210 of about 18,000');
  });

  it('says why the mailbox is paused', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: null, paused_reason: 'token_revoked' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Google access was revoked. Reconnect it in Settings › Connections.');
  });

  it('stays mounted and empty when there is nothing to say', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: { state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' } }} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says changes cannot reach Gmail while two-way is off, with the way to Connections', () => {
    render(
      <MemoryRouter>
        <MailboxNotice summary={{ ...MAIL_SUMMARY, import: null }} gate={mailActionGate({ ...GOOGLE, two_way: false }, null)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(TWO_WAY_OFF_TEXT);
    expect(screen.getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });

  it('says it once when the mailbox is paused', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: null, paused_reason: 'no_seat' }} gate={mailActionGate({ ...GOOGLE, paused_reason: 'no_seat' }, null)} />);
    expect(screen.getAllByText(/no longer hold a seat/)).toHaveLength(1);
  });
});
