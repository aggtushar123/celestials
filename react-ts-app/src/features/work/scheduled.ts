import type { FeedGroupKey, FeedPayload, TaskFeedItem } from './workTypes';

/** The dated groups, in the order the card reads them. */
const DATED: readonly FeedGroupKey[] = ['overdue', 'today', 'week', 'later'];
const SHOWN = 5;

/** The reader's own dated to-dos and tasks, soonest first, at most SHOWN. */
export function scheduled(payload: FeedPayload): { item: TaskFeedItem; group: FeedGroupKey }[] {
  const rows: { item: TaskFeedItem; group: FeedGroupKey }[] = [];
  for (const key of DATED) {
    const group = payload.groups.find((g) => g.key === key);
    for (const item of group?.items ?? []) {
      if ((item.kind === 'task' || item.kind === 'todo') && item.due_date) rows.push({ item, group: key });
    }
  }
  return rows.slice(0, SHOWN);
}

