// One Slack thread (Slack escalations D1 contract §4): read under the story's
// two rules (the record, then its department). Kept free of React. No em dash.
import { apiFetch } from '../../lib/apiClient';
import type { LinkedTicket } from './storyTypes';

export interface SlackMessage {
  ts: string;
  name: string;
  /** ISO 8601 UTC. */
  at: string;
  text: string;
  /** The app's own message (an agent's reply). */
  bot: boolean;
}

export interface SlackConversationDetail {
  id: number;
  record: { type: 'customer' | 'account'; id: number; name: string };
  /** "#all-alfiee", or '' when the channel has no name. */
  channel: string;
  url: string;
  title: string;
  started_by: { id: number | null; name: string };
  matched_by: 'channel' | 'name' | 'person' | 'earlier';
  messages: SlackMessage[];
  tickets?: LinkedTicket[];
  hidden_links?: number;
}

export const fetchSlackConversation = (id: number) => apiFetch<SlackConversationDetail>(`/slack-conversations/${id}/`);

export const SLACK = {
  OPENING: 'Opening the Slack thread',
  LOAD: 'Could not open this Slack thread.',
  GONE: 'This Slack thread is no longer available to you.',
  RETRY: 'Try again',
  OPEN: 'Open in Slack',
  APP: 'App',
} as const;

/** Why the thread sits on its record (contract §4); '' for one filed before conversations. */
export function filedText(detail: SlackConversationDetail): string {
  const name = detail.record.name;
  if (detail.matched_by === 'channel') return `Filed under ${name} because the channel is set to it.`;
  if (detail.matched_by === 'name') return `Filed under ${name} because the message names it.`;
  if (detail.matched_by === 'person') return `Matched to ${name} by hand.`;
  return '';
}

/** "#all-alfiee · 3 messages". */
export function threadDescription(detail: SlackConversationDetail): string {
  const n = detail.messages.length;
  return [detail.channel, `${n} ${n === 1 ? 'message' : 'messages'}`].filter(Boolean).join(' · ');
}
