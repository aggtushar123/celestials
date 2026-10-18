// The "Needs a customer" list (agent bundles round 2 D3 contract §3, §4;
// frontend Decisions 1 to 6). Kept free of React. No em dash.
import { ApiError, apiFetch } from '../../lib/apiClient';
import { whenText } from '../agents/whenText';

export interface MentionedRecord {
  type: 'customer' | 'account';
  id: number;
  name: string;
}

export interface UnmatchedItem {
  id: number;
  source: 'slack' | 'jira';
  connector: { id: number; name: string };
  number: string;
  title: string;
  text: string;
  from: { name: string; email: string };
  url: string;
  priority: string;
  opened_on: string;
  last_seen_at: string;
  deletes_on: string;
  can_add_contact: boolean;
  /** The customers or accounts a Slack message names (contract §6). */
  mentioned: MentionedRecord[];
}

export interface UnmatchedPage {
  queue: string;
  count: number;
  items: UnmatchedItem[];
  next: string | null;
}

export interface MatchBody {
  customer_id?: number;
  account_id?: number;
  add_contact?: boolean;
}

export interface MatchAnswer {
  record: { type: 'customer' | 'account'; id: number; name: string };
  ticket: { id: number; number: string; record: MatchAnswer['record'] } | null;
  conversation: { id: number } | null;
  contact_added: boolean;
}

export function fetchUnmatched(queue: string, cursor?: string | null) {
  const query = new URLSearchParams({ queue });
  if (cursor) query.set('cursor', cursor);
  return apiFetch<UnmatchedPage>(`/work/unmatched/?${query.toString()}`);
}

export const matchUnmatched = (id: number, body: MatchBody) => apiFetch<MatchAnswer>(`/work/unmatched/${id}/match/`, { method: 'POST', body });

export const dismissUnmatched = (id: number) => apiFetch<{ dismissed: true }>(`/work/unmatched/${id}/dismiss/`, { method: 'POST', body: {} });

export const UNMATCHED = {
  TITLE: 'Needs a customer',
  LOADING: 'Loading messages that need a customer',
  LOAD: 'Could not load the messages that need a customer.',
  MATCH: 'Match to a customer',
  MATCHING: 'Matching…',
  MATCH_TITLE: 'Match to a customer',
  MATCH_CONFIRM: 'Match',
  RECORD: 'Customer or account',
  MENTIONED: 'Mentioned',
  DISMISS: 'Dismiss',
  DISMISSING: 'Dismissing…',
  DISMISS_TITLE: 'Dismiss this message?',
  DISMISS_MESSAGE: "It leaves this list and its text is deleted now. Revenact won't list it again.",
  DISMISSED: 'Dismissed.',
  SHOW_ALL: 'Show all',
  SHOW_LESS: 'Show less',
  MORE: 'Show more',
  SOMEONE: 'someone',
  RETRY: 'Retry',
  DISMISS_FAILED: 'Could not dismiss that. Try again.',
  MATCH_FAILED: 'Could not match that. Try again.',
  CANCEL: 'Cancel',
  GONE: 'Someone else dealt with this message. Reload the list.',
  PICK_RECORD: 'Choose a customer or account first.',
} as const;

/** 409 GONE, or 404 (no waiting row, or a queue the reader may not use): the
 *  message is gone for this reader (contract §3.2, §3.3). */
export function isGone(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 404) return true;
  return err.status === 409 && typeof err.body === 'object' && err.body !== null && (err.body as { code?: unknown }).code === 'GONE';
}

/** The server's GONE sentence when it sent one, else the fixed one. */
export function goneText(err: unknown): string {
  const detail = err instanceof ApiError && err.status === 409 && typeof err.body === 'object' && err.body !== null ? (err.body as { detail?: unknown }).detail : null;
  return typeof detail === 'string' && detail ? detail : UNMATCHED.GONE;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = 280;
export const isLong = (text: string) => text.length > LONG;

/** "Jira SUP · SUP-31 · from Ann Lee (ann@newco.io) · 9:12 AM". */
export function metaLine(item: UnmatchedItem, now: Date = new Date()): string {
  const { name, email } = item.from;
  // A Slack sender is a colleague: the server sends their email, we never show it.
  const who = item.source === 'slack' ? name || UNMATCHED.SOMEONE : name && email ? `${name} (${email})` : name || email || UNMATCHED.SOMEONE;
  return [item.connector.name, item.number, `from ${who}`, whenText(item.last_seen_at, now)].join(' · ');
}

/** "Deleted on 13 Nov if no one matches it." */
export function deletesText(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00`);
  return `Deleted on ${day.getDate()} ${MONTHS[day.getMonth()]} if no one matches it.`;
}

export const addContactText = (email: string) => `Also add ${email} as a contact of the record, so their next messages match by themselves.`;
export const matchedText = (name: string) => `Matched to ${name}. An agent reads it at the next run.`;
export const openText = (source: UnmatchedItem['source']) => (source === 'jira' ? 'Open in Jira' : 'Open in Slack');
