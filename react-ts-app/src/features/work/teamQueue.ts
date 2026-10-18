// The Team queue's words and rules (work in one place delivery 2 contract
// §1; frontend Decisions 2, 6). Kept free of React. No em dash.
import { FEED_GROUP_LABEL } from './feed';
import { QUEUE } from './queues';
import type { FeedGroupKey, QueueScope } from './workTypes';

export const TEAM_QUEUE = {
  LOAD: 'Could not load what is waiting on your team.',
  LOADING: 'Loading what is waiting on your team',
  LOADING_QUEUE: 'Loading the queue',
  ROUTED_EMPTY_DETAIL: "Bundles made from customer messages show here when no one owns the record, or its owner can't read the message.",
  EMPTY_DETAIL: 'Bundles, decisions, overdue tasks and suggestions for the people below you show here.',
  ASK: 'Ask the agent',
  ASKING: 'Asking…',
  ASK_HINT: 'Runs the Ops agent now. Uses AI credits.',
  ASK_FAILED: 'Could not run the Ops agent.',
} as const;

export const TEAM_GROUP_ORDER: readonly FeedGroupKey[] = ['decide', 'overdue', 'suggested'];

export const TEAM_GROUP_LABEL: Record<FeedGroupKey, string> = { ...FEED_GROUP_LABEL, decide: 'To decide' };

export const queueTitle = (scope: QueueScope, label = ''): string => {
  if (scope === 'team') return QUEUE.TEAM_TITLE;
  if (scope === 'company') return QUEUE.COMPANY_TITLE;
  if (scope === 'unassigned') return 'Waiting for an owner';
  return `Waiting in ${label}`;
};

export const queueEmpty = (scope: QueueScope, label = ''): string => {
  if (scope === 'team') return 'Nothing is waiting on your team.';
  if (scope === 'company') return 'Nothing is waiting on the rest of the company.';
  if (scope === 'unassigned') return 'Nothing is waiting for an owner.';
  return `Nothing is waiting in ${label}.`;
};
