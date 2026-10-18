// Every source the product can actually ingest today.
//
// The list mirrors what the backend supports: mail providers from
// services/mail/providers, ticket sources from the ticket connectors, and
// calls from CallSense. Nothing here advertises a connector that does not
// exist.

import type { ReactNode } from 'react';
import { Phone, Webhook } from 'lucide-react';
import { FreshdeskIcon, GmailIcon, JiraIcon, OutlookIcon, SlackIcon, ZendeskIcon } from './sources';

export interface SourceDefinition {
  id: string;
  name: string;
  /** What this source contributes, in one short line. */
  blurb: string;
  icon: ReactNode;
}

/** Every source the product can actually ingest today. */
export const SOURCES: SourceDefinition[] = [
  { id: 'gmail', name: 'Gmail', blurb: 'Threads and replies owed', icon: <GmailIcon className="w-6 h-6" /> },
  { id: 'outlook', name: 'Outlook', blurb: 'Threads and replies owed', icon: <OutlookIcon className="w-6 h-6" /> },
  { id: 'slack', name: 'Slack', blurb: 'Shared channels with customers', icon: <SlackIcon className="w-6 h-6" /> },
  { id: 'zendesk', name: 'Zendesk', blurb: 'Support tickets and status', icon: <ZendeskIcon className="w-6 h-6" /> },
  { id: 'jira', name: 'Jira', blurb: 'Escalations and product bugs', icon: <JiraIcon className="w-6 h-6" /> },
  { id: 'freshdesk', name: 'Freshdesk', blurb: 'Support tickets and status', icon: <FreshdeskIcon className="w-6 h-6" /> },
  {
    id: 'calls',
    name: 'Call recordings',
    blurb: 'Transcripts summarised by CallSense',
    icon: <Phone className="w-5 h-5 text-ink-muted" />,
  },
  {
    id: 'webhook',
    name: 'Webhook',
    blurb: 'Anything else, pushed to Revenact',
    icon: <Webhook className="w-5 h-5 text-ink-muted" />,
  },
];

export function sourceIcon(id: string, className = 'w-3.5 h-3.5') {
  switch (id) {
    case 'gmail':
      return <GmailIcon className={className} />;
    case 'outlook':
      return <OutlookIcon className={className} />;
    case 'slack':
      return <SlackIcon className={className} />;
    case 'zendesk':
      return <ZendeskIcon className={className} />;
    case 'jira':
      return <JiraIcon className={className} />;
    case 'freshdesk':
      return <FreshdeskIcon className={className} />;
    default:
      return <Phone className={`${className} text-ink-muted`} aria-hidden="true" />;
  }
}
