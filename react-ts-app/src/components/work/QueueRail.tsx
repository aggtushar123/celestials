import { Link, useNavigate } from 'react-router-dom';
import type { QueueKey, QueueRow } from '../../features/agents/bundleTypes';
import { QUEUE, optionText, queueHref, railCount } from '../../features/work/queues';
import { FOCUS, NUM, Select, TYPE } from '../ui';

const RAIL_LINK = `flex min-h-11 sm:min-h-9 items-center justify-between gap-2 rounded-lg px-3 hover:bg-subtle ${FOCUS}`;

/** The queues from sm (frontend Decision 2): a nav of links, the open one
 *  marked, each with its count as a tabular figure. */
export function QueueRail({ rows, current }: { rows: readonly QueueRow[]; current: QueueKey }) {
  return (
    <nav aria-label={QUEUE.RAIL} className="w-56 shrink-0">
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const open = row.key === current;
          const count = railCount(row);
          return (
            <li key={row.key}>
              <Link to={queueHref(row.key)} aria-current={open ? 'page' : undefined} className={`${RAIL_LINK} ${open ? 'bg-subtle' : ''}`}>
                <span className={open ? `${TYPE.body} font-semibold` : TYPE.bodyMuted}>{row.label}</span>
                {count !== null ? ' ' : null}
                {count !== null ? <span className={`${TYPE.meta} ${NUM}`}>{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The queues below sm: one select at the top. */
export function QueueSelect({ rows, current }: { rows: readonly QueueRow[]; current: QueueKey }) {
  const navigate = useNavigate();
  return (
    <Select
      label={QUEUE.SELECT}
      labelPosition="above"
      value={current}
      onChange={(key) => navigate(queueHref(key as QueueKey))}
      options={rows.map((row) => ({ value: row.key, label: optionText(row) }))}
    />
  );
}
