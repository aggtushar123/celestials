// What the sources rail shows, from what is connected. Kept apart from the
// rail component so fast refresh works.

import { Inbox } from 'lucide-react';
import { GmailIcon, JiraIcon, OutlookIcon, SlackIcon } from '../onboarding/sources';
import type { Connector } from '../../features/connectors/connectorsSlice';
import type { MailboxConnection } from '../../features/mail/mailSlice';
import type { CommunicationKind } from '../../features/communications/communicationsSlice';

/** Providers that are connected only once they hold credentials (a seeded
 *  connection is not). Every other provider counts as connected when it is
 *  set up and enabled: the same rule as Settings › Connections, so the
 *  sidebar never shows something Connections calls not connected. */
const CREDENTIAL_PROVIDERS = new Set(['zendesk', 'freshdesk', 'webhook', 'jira', 'slack']);

export function isConnected(connector: Connector): boolean {
  if (connector.status === 'error') return false;
  if (!connector.is_enabled) return false;
  return CREDENTIAL_PROVIDERS.has(connector.provider) ? connector.has_credentials : true;
}

export interface Source {
  id: string;
  label: string;
  /** Which kind of row this source produces; the list filters on it. */
  kind: CommunicationKind | null;
  icon: React.ReactNode;
  /** False for a channel the platform offers but this organisation has not
   *  connected yet: shown dimmed, and it leads to Integrations. */
  connected: boolean;
}

/** The tools the group offers after the mail entry (owner, 2026-10-16:
 *  Gmail, Slack and Jira only), each with what picking it narrows the inbox to. */
const CATALOGUE: { provider: string; label: string; kind: CommunicationKind; icon: React.ReactNode }[] = [
  { provider: 'slack', label: 'Slack', kind: 'slack', icon: <SlackIcon className="w-5 h-5" /> },
  { provider: 'jira', label: 'Jira', kind: 'ticket', icon: <JiraIcon className="w-5 h-5" /> },
];

/**
 * What the group shows: the whole inbox, the person's mail (Gmail, by Google
 * sign-in or app password; Outlook only when that is what they connected),
 * then Slack and Jira. Connected ones carry the id the inbox filters on; the
 * rest are shown dimmed and lead to Settings › Connections.
 */
export function sourcesFrom(mailbox: MailboxConnection | null, connectors: Connector[]): Source[] {
  const list = Array.isArray(connectors) ? connectors : [];
  const microsoft = mailbox?.provider === 'microsoft';
  const sources: Source[] = [
    { id: 'all', label: 'Everything', kind: null, icon: <Inbox className="w-[18px] h-[18px]" aria-hidden="true" />, connected: true },
    {
      id: mailbox ? `mailbox:${mailbox.provider}` : 'provider:gmail',
      label: microsoft ? 'Outlook' : 'Gmail',
      kind: 'email',
      icon: microsoft ? <OutlookIcon className="w-5 h-5" /> : <GmailIcon className="w-5 h-5" />,
      connected: Boolean(mailbox),
    },
  ];
  for (const entry of CATALOGUE) {
    const connected = list.find((c) => c.provider === entry.provider && isConnected(c));
    sources.push({
      id: connected ? `connector:${connected.id}` : `provider:${entry.provider}`,
      label: entry.label,
      kind: entry.kind,
      icon: entry.icon,
      connected: Boolean(connected),
    });
  }
  return sources;
}
