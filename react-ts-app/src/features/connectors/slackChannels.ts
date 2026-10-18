// Slack escalations D3 (contract §2, §3, SC3-3 to SC3-15, SC3-30; frontend
// Decisions 2 to 5, 7, 8): a Slack connection's channels, their words and
// the two calls. Kept free of React. No em dash.
import { formatDistanceStrict } from 'date-fns';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Connector } from './connectorsSlice';

export interface SlackChannelRow {
  id: string;
  /** Without "#". */
  name: string;
  included: boolean;
  /** The Revenact bot is in it. */
  member: boolean;
  /** Slack Connect: people outside the company are in it. */
  shared: boolean;
  private: boolean;
  /** Null: each message files under the customer it names. */
  record: { type: 'customer' | 'account'; id: number; name: string } | null;
  conversations: number;
  /** Slack's code when it refused to let the bot join, 'removed' when someone took the bot out; '' when none. */
  join_error: string;
  read_at: string | null;
  chosen_by: { id: number; name: string } | null;
}

export interface SlackChannelList {
  channels: SlackChannelRow[];
  can_join: boolean;
  synced: number;
  total: number;
  /** When Slack's last event arrived (contract SC3-30); null: events are not set up. */
  events_at: string | null;
}

export interface ChannelChange {
  included?: boolean;
  record?: { type: 'customer' | 'account'; id: number } | null;
}

export const fetchSlackChannels = (connectorId: number) => apiFetch<SlackChannelList>(`/connectors/${connectorId}/slack-channels/`);

export const updateSlackChannel = (connectorId: number, channelId: string, change: ChannelChange) =>
  apiFetch<SlackChannelRow>(`/connectors/${connectorId}/slack-channels/${encodeURIComponent(channelId)}/`, { method: 'PATCH', body: change });

export const CHANNELS = {
  MENU: 'Choose channels',
  HEADING: 'Channels',
  LOADING: 'Loading channels…',
  LOAD_FAILED: "Couldn't load the channels.",
  EMPTY: 'No public channels yet',
  EMPTY_DETAIL: 'They appear after the next sync.',
  FIND: 'Find a channel',
  FIND_PLACEHOLDER: 'Find a channel',
  NONE_FOUND: 'No channel has that name.',
  CANT_JOIN: "Slack hasn't let Revenact join channels yet. Approve the app again so it can; until then it reads only the channels it is already in.",
  APPROVE: 'Approve again',
  CUSTOMER: 'Customer',
  DONE: 'Done',
  BUSY: 'Still saving this channel. Try again in a moment.',
  SAVE_FAILED: "Couldn't change the channel. Try again.",
  EVENTS_OFF: 'Events: not set up. Revenact checks one channel at each sync until they are.',
  summary: (synced: number, total: number) => `Syncs ${synced} of ${total} public ${total === 1 ? 'channel' : 'channels'}. New ones are added on their own.`,
  syncLabel: (name: string) => `Sync #${name}`,
  customerLabel: (name: string) => `Choose the customer of #${name}`,
  nowSyncing: (name: string) => `Now syncing #${name}.`,
  stopped: (name: string) => `Stopped syncing #${name}.`,
  filesUnder: (name: string, record: string) => `#${name} now files under ${record}.`,
  filesByName: (name: string) => `#${name} now files under the customer each message names.`,
} as const;

/** The row's meta line (Decisions 3 and 4), its parts in order. */
export function channelMeta(row: SlackChannelRow, canJoin: boolean): string[] {
  const parts: string[] = [];
  if (row.shared) parts.push('Shared with another company');
  if (!row.included) parts.push('Not synced');
  else if (!row.member) parts.push(row.join_error === 'removed' ? 'Someone removed Revenact from it' : row.join_error ? "Slack wouldn't let Revenact join it" : canJoin ? 'Joins on the next sync' : "Revenact isn't in it");
  if (row.included && row.shared) parts.push('Replies there never carry Jira links');
  parts.push(row.conversations === 0 ? 'No conversations yet' : `${row.conversations} ${row.conversations === 1 ? 'conversation' : 'conversations'}`);
  parts.push(row.record ? `Files under ${row.record.name}` : 'Files under the customer each message names');
  return parts;
}

/** Decision 7: whether Slack's events arrive, and when the last one did. */
export function eventsLine(at: string | null, now: Date = new Date()): string {
  if (!at) return CHANNELS.EVENTS_OFF;
  return `Events: receiving. The last one arrived ${formatDistanceStrict(new Date(at), now)} ago.`;
}

/** The Slack row's state part (Decision 5); null keeps D1's words. */
export function scopeText(connector: Connector): string | null {
  const counts = connector.slack_channels;
  if (connector.provider !== 'slack' || !counts) return null;
  return `syncs ${counts.synced} of ${counts.total} public ${counts.total === 1 ? 'channel' : 'channels'}`;
}

const firstOf = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §3.2's refusals, as one sentence for the row. */
export function readChannelRefusal(err: unknown): string {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return CHANNELS.SAVE_FAILED;
  const body = err.body as Record<string, unknown>;
  return firstOf(body.record) ?? firstOf(body.included) ?? (typeof body.detail === 'string' ? body.detail : CHANNELS.SAVE_FAILED);
}
