import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../features/customers/formatters';
import { localDay } from '../../features/organizations/storyDays';
import { WORK, parentPath, sourceText } from '../../features/work/workText';
import type { TaskDetail } from '../../features/work/workTypes';
import { LINK } from '../brain/styles';
import { MONO } from '../organizations/portfolio/styles';

const TERM = 'text-[13px] text-ink-muted';

/** Where the task lives and where it came from: the record, the plan (or the
 *  source), and who made it when. */
export function TaskFacts({ task }: { task: TaskDetail }) {
  const source = task.plan ? null : sourceText(task);
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-[13px] text-ink">
      <dt className={TERM}>On</dt>
      <dd className="min-w-0">
        {task.parent ? (
          <Link to={parentPath(task.parent)} className={LINK}>
            {task.parent.name}
          </Link>
        ) : (
          <span data-part="private" className="inline-flex items-center gap-1">
            <Lock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {WORK.ONLY_YOU}
          </span>
        )}
      </dd>
      {task.plan ? (
        <>
          <dt className={TERM}>Plan</dt>
          <dd className="min-w-0">
            <Link to={`/projects/${task.plan.id}`} className={LINK}>
              {task.milestone ? `${task.plan.name} · ${task.milestone.name}` : task.plan.name}
            </Link>
          </dd>
        </>
      ) : null}
      {source ? (
        <>
          <dt className={TERM}>Source</dt>
          <dd>{source}</dd>
        </>
      ) : null}
      <dt className={TERM}>Created</dt>
      <dd>
        <span className={MONO}>{formatDate(localDay(new Date(task.created_at)))}</span>
        {task.created_by ? ` by ${task.created_by.name}` : ''}
      </dd>
    </dl>
  );
}
