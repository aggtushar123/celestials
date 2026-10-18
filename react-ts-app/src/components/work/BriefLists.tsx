import type { ComponentProps } from 'react';
import { BRIEF, groupIn } from '../../features/work/feed';
import type { FeedGroupKey } from '../../features/work/workTypes';
import { NUM, TYPE } from '../ui';
import { FeedGroups } from './FeedGroups';

/** The task groups under Your to-dos, in the contract's order. */
const TODO_GROUPS: readonly FeedGroupKey[] = ['overdue', 'today', 'week', 'later', 'no_date', 'blocked'];

/** Your to-dos (Work home): FeedGroups over the task groups, each with its
 *  own subheading, count and Show more, under one section heading. */
export function YourTodos({ id, ...feed }: { id: string } & Omit<ComponentProps<typeof FeedGroups>, 'order' | 'heading'>) {
  const total = TODO_GROUPS.reduce((sum, key) => sum + groupIn(feed.data, key).count, 0);
  const failed = feed.slots.some((slot) => TODO_GROUPS.includes(slot.at));
  return (
    <section aria-labelledby={id} data-part="todos" className="flex min-w-0 scroll-mt-4 flex-col gap-4">
      <h2 id={id} className={TYPE.title}>
        {BRIEF.TODOS} <span className={`${TYPE.meta} ${NUM}`}>{total}</span>
      </h2>
      {total === 0 && !failed && TODO_GROUPS.every((key) => groupIn(feed.data, key).next === null) ? (
        <p className={TYPE.bodyMuted}>{BRIEF.NO_TODOS}</p>
      ) : (
        <FeedGroups {...feed} order={TODO_GROUPS} heading="h3" />
      )}
    </section>
  );
}
