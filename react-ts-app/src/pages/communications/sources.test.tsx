import { describe, it, expect } from 'vitest';
import { sourcesFrom } from './sources';
import type { Connector } from '../../features/connectors/connectorsSlice';
import type { MailboxConnection } from '../../features/mail/mailSlice';

function connector(id: number, provider: string, name: string, extra: Partial<Connector> = {}): Connector {
  return {
    id, provider, provider_display: name, name, status: 'connected', is_enabled: true,
    department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true,
    ticket_count: 0, call_count: 0, last_record_at: null, has_credentials: true, config: {}, ...extra,
  } as unknown as Connector;
}
const mailbox = (provider: string) => ({ id: 1, provider, provider_display: provider, address: 'a@gmail.com', status: 'connected' }) as unknown as MailboxConnection;

// Owner, 2026-10-16: the Communications group shows only Gmail, Slack and
// Jira, after the inbox itself.
describe('sourcesFrom', () => {
  it('is the inbox, then Gmail, Slack and Jira, nothing else', () => {
    const sources = sourcesFrom(null, [connector(4, 'zendesk', 'Zendesk'), connector(9, 'intercom', 'Intercom')]);
    expect(sources.map((s) => s.label)).toEqual(['Everything', 'Gmail', 'Slack', 'Jira']);
    expect(sources.slice(1).every((s) => !s.connected)).toBe(true);
  });

  it('a connected Slack narrows to its threads and a connected Jira to tickets', () => {
    const sources = sourcesFrom(null, [connector(3, 'slack', 'Acme Slack'), connector(2, 'jira', 'Jira Software')]);
    expect(sources.find((s) => s.label === 'Slack')).toMatchObject({ id: 'connector:3', kind: 'slack', connected: true });
    expect(sources.find((s) => s.label === 'Jira')).toMatchObject({ id: 'connector:2', kind: 'ticket', connected: true });
  });

  it('a Slack connection that is not signed in yet, or a Jira without its token, is not connected', () => {
    const sources = sourcesFrom(null, [connector(3, 'slack', 'Slack', { has_credentials: false }), connector(2, 'jira', 'Jira', { has_credentials: false })]);
    expect(sources.find((s) => s.label === 'Slack')).toMatchObject({ id: 'provider:slack', connected: false });
    expect(sources.find((s) => s.label === 'Jira')).toMatchObject({ id: 'provider:jira', connected: false });
  });

  it('Gmail by app password (IMAP) is Gmail, connected, opening the mailbox', () => {
    expect(sourcesFrom(mailbox('imap'), [])[1]).toMatchObject({ id: 'mailbox:imap', label: 'Gmail', kind: 'email', connected: true });
    expect(sourcesFrom(mailbox('google'), [])[1]).toMatchObject({ id: 'mailbox:google', label: 'Gmail', connected: true });
  });
});
