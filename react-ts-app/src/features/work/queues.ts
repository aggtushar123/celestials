// The inbox's queues (agent bundles D1 contract §10.3; frontend Decisions 1
// to 3). Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import type { Department, QueueKey, QueueRow } from '../agents/bundleTypes';
import { FEED_CHIPS, type FeedChip } from './feed';

export const QUEUE = {
  RAIL: 'Queues',
  SELECT: 'Queue',
  LOAD: 'Could not load the queues.',
  TEAM_TITLE: 'Waiting on your team',
  COMPANY_TITLE: 'Waiting on the rest of the company',
  PEOPLE: 'People',
} as const;

const DEPARTMENTS = 'cs|engineering|sales|analytics|leadership|other';
const KEY = new RegExp(`^(mine|team|company|history|unassigned|department:(?:${DEPARTMENTS}))$`);

/** A queue a bundle was routed to (contract D2-5): bundles only, no chips (D2-7). */
export const isRoutedQueue = (key: QueueKey): key is 'unassigned' | `department:${Department}` => key === 'unassigned' || key.startsWith('department:');

export function queueOf(params: URLSearchParams): QueueKey {
  const asked = params.get('queue');
  return asked !== null && KEY.test(asked) ? (asked as QueueKey) : 'mine';
}

/** A queue's link: the queue only (its kind filter and an open panel stay behind). */
export const queueHref = (key: QueueKey): string => `/work?queue=${encodeURIComponent(key)}`;

/** A routed queue counts its bundles and its messages that need a customer
 *  (round 2 D3 Decision 5). A queue's count is what waits on it to decide
 *  plus what is overdue (contract §10.3), so 0 shows no figure at all: "Mine
 *  0" beside a full list of to-dos and suggestions read as a contradiction
 *  (Work home, 2026-10-17). */
export function railCount(row: QueueRow): number | null {
  if (row.count === null) return null;
  const count = row.count + (row.needs_customer ?? 0);
  return count === 0 ? null : count;
}

export function optionText(row: QueueRow): string {
  const count = railCount(row);
  return count === null ? row.label : `${row.label} (${count})`;
}

/** What the rail shows before GET /work/queues/ answers: never a spinner. */
export const FALLBACK_QUEUES: QueueRow[] = [
  { key: 'mine', label: 'Mine', count: null },
  { key: 'history', label: 'History', count: null },
];

/** Mine: every chip; the team queues: no To-dos (contract §10.2); History: none. */
export function chipsFor(queue: QueueKey): readonly { key: FeedChip | null; label: string }[] {
  if (queue === 'history' || isRoutedQueue(queue)) return [];
  if (queue === 'mine') return FEED_CHIPS;
  return FEED_CHIPS.filter((chip) => chip.key !== 'todo');
}

export function isQueueRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && typeof err.body === 'object' && err.body !== null && (err.body as { code?: unknown }).code === 'SCOPE_NOT_ALLOWED';
}

/** /work/team?scope=team|company (Work in one place) to its queue, the rest kept. */
export function teamRedirect(search: string): string {
  const query = new URLSearchParams(search);
  const scope = query.get('scope');
  query.delete('scope');
  query.set('queue', scope === 'company' ? 'company' : 'team');
  return `/work?${query.toString()}`;
}
