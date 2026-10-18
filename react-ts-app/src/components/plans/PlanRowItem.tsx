import { KIND_LABEL, STATUS_LABEL } from '../../features/plans/planOptions';
import type { PlanRow } from '../../features/plans/planTypes';
import { ListRow } from '../ui';
import { NextDue, PendingTasks, ProgressBar, RecordLink, StatusPill } from './parts';
import { PLAN_GRID } from './planGrid';

/** One plan (spec 2.1; UI foundations spec 4.2): the name opens it;
 *  record, kind and owner are the meta line; milestones, the next due date
 *  and the status sit in the plans grid's columns from a 44rem list, and
 *  below it the meta line leads with the status and the date, so
 *  truncation never hides Overdue. */
export function PlanRowItem({ row, showRecord = true }: { row: PlanRow; showRecord?: boolean }) {
  const due = row.status === 'draft' ? <PendingTasks n={row.pending_tasks} /> : <NextDue date={row.next_due} overdue={row.is_overdue} />;
  return (
    <ListRow
      dataAttrs={{ 'data-plan': row.id }}
      title={row.name}
      href={`/projects/${row.id}`}
      columns={PLAN_GRID.columns}
      gridAt={PLAN_GRID.gridAt}
      meta={
        <>
          <span data-part="status-narrow" className={PLAN_GRID.narrowOnly}>
            {STATUS_LABEL[row.status]} · {due} ·{' '}
          </span>
          {showRecord ? (
            <>
              <RecordLink record={row.record} /> ·{' '}
            </>
          ) : null}
          {KIND_LABEL[row.kind]} · {row.owner.name}
        </>
      }
      cells={[
        <ProgressBar key="progress" done={row.milestones_done} total={row.milestones_total} label="milestones" />,
        <span key="due" className="block">
          {due}
        </span>,
        <span key="status" className="block">
          <StatusPill status={row.status} />
        </span>,
      ]}
    />
  );
}
