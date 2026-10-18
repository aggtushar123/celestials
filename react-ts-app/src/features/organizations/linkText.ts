// Slack escalations D4 (contract §2.3 to §2.5, SE4-17; frontend Decision 6):
// the words that link a Slack thread and its Jira tickets. No em dash.
import type { FromSlack, LinkedTicket } from './storyTypes';

export const LINKS = {
  ISSUES: 'Jira issues',
  UNASSIGNED: 'Unassigned',
  THREAD: 'Slack thread',
} as const;

const STATUS: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  'on-hold': 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ticketLineText = (t: LinkedTicket): string => [t.number, STATUS[t.status] ?? t.status, t.assignee ?? LINKS.UNASSIGNED].join(' · ');

export const fromSlackText = (f: FromSlack): string => `From Slack: ${f.started_by}${f.channel ? ` in ${f.channel}` : ''}`;

export const hiddenText = (n: number): string => `Linked to ${n} ${n === 1 ? 'item' : 'items'} you can't see`;
