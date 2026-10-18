// Reply drafts' words and links (Agents delivery 2), kept free of React.
// Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { AGENT_LABEL } from './agentsText';
import type { AgentKind } from './agentTypes';
import type { ReplyDraft, TicketDraftSource } from './draftTypes';

export const DRAFTS = {
  REGION: 'Draft reply',
  LOADING: 'Loading the draft',
  LOAD: 'Could not load this draft.',
  MISSING_TITLE: 'Draft not found',
  MISSING: "That draft isn't there any more, or you can't open it.",
  BACK: 'Back to the inbox',
  SOURCE: 'What it answers',
  TO: 'To',
  SUBJECT: 'Subject',
  BODY: 'Reply',
  SAVE: 'Save',
  SAVING: 'Saving…',
  SAVED: 'Saved.',
  SEND: 'Send',
  SENDING: 'Sending…',
  IN_FLIGHT: 'Sending…',
  UNCONFIRMED: "We couldn't confirm this was sent. Check your Sent folder.",
  CONFIRM_SENT: 'It was sent',
  CONFIRMING: 'Saving…',
  REOPEN: 'Reopen draft',
  REOPENING: 'Reopening…',
  CONFIRMED: 'Marked as sent.',
  REOPENED: 'Reopened the draft.',
  CONFIRM_FAILED: 'Could not mark this draft as sent. Try again.',
  REOPEN_FAILED: 'Could not reopen this draft. Try again.',
  MARK_SENT: 'Mark as sent',
  MARKING: 'Marking…',
  COPY: 'Copy the reply',
  COPIED: 'Copied the reply.',
  COPY_FAILED: 'Could not copy the reply. Select it and copy it yourself.',
  DISCARD: 'Discard',
  DISCARD_TITLE: 'Discard this draft?',
  DISCARD_MESSAGE: 'The reply is deleted for good.',
  DISCARDED: 'Discarded the draft.',
  SAVE_FAILED: 'Could not save this draft. Try again.',
  SEND_FAILED: 'Could not send this draft. Try again.',
  MARK_FAILED: 'Could not mark this draft as sent. Try again.',
  DISCARD_FAILED: 'Could not discard this draft. Try again.',
  TICKET_HINT: 'Ticket replies are not sent from Revenact: copy it into the ticket, then mark it as sent.',
  CONNECT: 'Open Connections',
  EDITED: 'Edited',
  LIST_TITLE: 'From your agents',
  LIST_LABEL: 'Drafts from your agents',
  LIST_LOADING: 'Loading drafts from your agents',
  LIST_EMPTY: 'No drafts from your agents.',
  LIST_LOAD: 'Could not load drafts from your agents.',
  MAILBOX_TITLE: 'In your mailbox',
  IN_MAILBOX: 'Edit it in your mailbox',
  TRY_AGAIN: 'Try again',
} as const;

/** `?draft=<id>` (Activity's, the bell's, the queue's and the mailbox's link), or null. */
export function draftParam(params: URLSearchParams): number | null {
  const value = params.get('draft') ?? '';
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

/** The page's own query with `draft` set: the mailbox keeps its `source`. */
export function withDraft(search: string, id: number): string {
  const next = new URLSearchParams(search);
  next.set('draft', String(id));
  return `?${next.toString()}`;
}

/** Back to the inbox: the same Communications query without `draft`. */
export function withoutDraft(search: string): string {
  const next = new URLSearchParams(search);
  next.delete('draft');
  const text = next.toString();
  return `/communications${text ? `?${text}` : ''}`;
}

export const recipientsText = (to: [string, string][]): string => to.map(([name, address]) => (name ? `${name} <${address}>` : address)).join(', ');

export const draftByText = (agent: AgentKind): string => `The ${AGENT_LABEL[agent]} drafted a reply.`;

export function draftHeading(draft: ReplyDraft): string {
  if (draft.source.kind === 'email') return `Reply to ${draft.source.from.name || draft.source.from.address}`;
  return `Reply on ${draft.source.number}`;
}

/** What the draft answers, as one sentence. */
export function sourceText(draft: ReplyDraft): string {
  const source = draft.source;
  if (source.kind === 'email') {
    const who = source.from.name ? `${source.from.name} <${source.from.address}>` : source.from.address;
    return `${who} wrote "${source.subject}" on ${formatDate(source.sent_at.slice(0, 10))}.`;
  }
  return `${source.number} "${source.title}"${source.source_name ? ` in ${source.source_name}` : ''}.`;
}

export const notOwnerText = (draft: ReplyDraft): string => `Only ${draft.owner.name} can change or send this draft.`;

/** The read-only line on a sent draft. */
export function sentText(draft: ReplyDraft): string {
  const verb = draft.channel === 'email' ? 'Sent' : 'Marked as sent';
  const day = draft.sent_at ? ` on ${formatDate(draft.sent_at.slice(0, 10))}` : '';
  const by = draft.sent_by ? ` by ${draft.sent_by.name}` : '';
  return `${verb}${day}${by}.`;
}

/** The status line after Send or Mark as sent (Decision 6). */
export const sentNotice = (draft: ReplyDraft): string => (draft.channel === 'email' && draft.to ? `Sent to ${recipientsText(draft.to)}.` : 'Marked as sent.');

/** Decision 5: the source's name only when there is a place to open. */
export const copyLabel = (source: TicketDraftSource): string => (source.external_url && source.source_name ? `Copy and open in ${source.source_name}` : DRAFTS.COPY);

/** A linked Gmail draft in its owner's mailbox editor (two-way Gmail D3, Decision 14). */
export const mailboxDraftHref = (mailDraftId: number): string => `/communications?source=mailbox:google&folder=drafts&draft=${mailDraftId}`;
