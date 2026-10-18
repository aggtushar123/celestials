import { Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../features/customers/formatters';
import { isOverdue } from '../../features/work/rows';
import { PRIORITY_LABEL, doneLabel, parentPath, personName, sourceText } from '../../features/work/workText';
import type { TaskRow } from '../../features/work/workTypes';
import { FOCUS, ICON_BUTTON, INLINE_TARGET, NUM, TYPE } from '../ui';
import { useTaskLink } from './useTaskLink';

const ROW_TITLE = `inline-flex min-h-11 max-w-full items-center self-start break-words text-left text-[13px] font-semibold text-ink hover:underline active:opacity-70 sm:min-h-0 ${FOCUS}`;
const META_LINK = `inline-flex items-center font-semibold text-ink-muted hover:text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/** One task (spec §1.5): flat inside its list. The title opens the task
 *  panel on this page; Today adds a quick Done; Team names the assignee. */
export function TaskRowItem({
  row,
  today,
  onDone,
  busy = false,
  error = null,
  showAssignee = false,
}: {
  row: TaskRow;
  today: string;
  onDone?: () => void;
  busy?: boolean;
  error?: string | null;
  showAssignee?: boolean;
}) {
  const taskLink = useTaskLink();
  const source = sourceText(row);
  return (
    <li data-task={row.id} className="flex items-start gap-2 px-4 py-2">
      {onDone ? (
        <button type="button" onClick={onDone} disabled={busy} aria-label={doneLabel(row.title)} className={ICON_BUTTON}>
          <Circle className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <Link {...taskLink(row.id)} className={ROW_TITLE}>
          {row.title}
        </Link>
        <p data-part="meta" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
          {row.parent ? (
            <>
              <Link to={parentPath(row.parent)} className={META_LINK}>
                {row.parent.name}
              </Link>
              <Dot />
            </>
          ) : null}
          <span>
            Due <span className={NUM}>{formatDate(row.due_date)}</span>
          </span>
          {isOverdue(row, today) ? (
            <>
              <Dot />
              <span className="font-semibold text-danger-ink">Overdue</span>
            </>
          ) : null}
          <Dot />
          <span>{PRIORITY_LABEL[row.priority]} priority</span>
          {row.status === 'in-progress' ? (
            <>
              <Dot />
              <span>In progress</span>
            </>
          ) : null}
          {showAssignee ? (
            <>
              <Dot />
              <span>{personName(row.assignee)}</span>
            </>
          ) : null}
          {source ? (
            <>
              <Dot />
              <span>{source}</span>
            </>
          ) : null}
        </p>
        {row.status === 'blocked' ? (
          <p data-part="blocked" className={`max-w-[68ch] break-words ${TYPE.body}`}>
            <span className="font-semibold text-warning-ink">Blocked:</span> {row.blocked_reason}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
