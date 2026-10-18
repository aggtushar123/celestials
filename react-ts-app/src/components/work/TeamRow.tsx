import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatDate } from '../../features/customers/formatters';
import { WORK, personName, teamRowLabel } from '../../features/work/workText';
import type { TeamPerson } from '../../features/work/workTypes';
import { BUTTON, FOCUS, LoadingState, NUM, TYPE } from '../ui';
import { TaskRowItem } from './TaskRowItem';
import { useDrill } from './useDrill';

const ROW = `flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

/** One person (spec §1.5): their open, overdue and blocked counts, overdue
 *  in the danger colour beside its word; the row opens into their tasks. */
export function TeamRow({ row, today }: { row: TeamPerson; today: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const drill = useDrill(row.person.id, open);
  const name = personName(row.person);

  let tasks: ReactNode = null;
  if (open) {
    if (!drill.tasks && drill.error) {
      tasks = (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {drill.error}
          </p>
          <button type="button" onClick={drill.reload} className={BUTTON}>
            {WORK.TRY_AGAIN}
          </button>
        </div>
      );
    } else if (!drill.tasks) {
      tasks = (
        <LoadingState label="Loading tasks" count={2} />
      );
    } else if (drill.tasks.length === 0) {
      tasks = <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>{WORK.NO_DRILL}</p>;
    } else {
      tasks = (
        <ul aria-label={`${name}: open tasks`} className="divide-y divide-line-subtle">
          {drill.tasks.map((task) => (
            <TaskRowItem key={task.id} row={task} today={today} />
          ))}
        </ul>
      );
    }
  }

  return (
    <li data-person={row.person.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={teamRowLabel(row)}
        onClick={() => setOpen((value) => !value)}
        className={ROW}
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>{name}</span>
        <span data-part="counts" className={`flex flex-wrap items-center gap-x-3 ${TYPE.bodyMuted}`}>
          <span>
            <span className={NUM}>{row.open}</span> open
          </span>
          {row.overdue > 0 ? (
            <span className="font-semibold text-danger-ink">
              <span className={NUM}>{row.overdue}</span> overdue
            </span>
          ) : null}
          {row.blocked > 0 ? (
            <span>
              <span className={NUM}>{row.blocked}</span> blocked
            </span>
          ) : null}
        </span>
        {row.oldest_overdue ? (
          <span data-part="oldest" className={`w-full pl-7 ${TYPE.meta}`}>
            Oldest due <span className={NUM}>{formatDate(row.oldest_overdue)}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="border-t border-line-subtle">
          {tasks}
        </div>
      ) : null}
    </li>
  );
}
