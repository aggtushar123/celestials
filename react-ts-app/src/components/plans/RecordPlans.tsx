import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchRecordPlans } from '../../features/plans/planApi';
import { isOpen, newPlanPath } from '../../features/plans/planText';
import type { PlanRow, RecordKind } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { BUTTON, CardHeader, EmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState, NUM, QUIET } from '../ui';
import { PlanRowItem } from './PlanRowItem';
import { PLAN_GRID } from './planGrid';

type Answer = { key: number; rows: PlanRow[] | null; error: string | null };

/** A record's plans (spec 2.5): one list card, open and draft plans as
 *  rows of it; the finished ones join it behind Show finished (N); Start
 *  a plan opens the modal over the page. */
export function RecordPlans({ record }: { record: { kind: RecordKind; id: number } }) {
  const { kind, id } = record;
  // The page's `?tab=` rides into the modal's route and back out on close.
  const { search } = useLocation();
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchRecordPlans({ kind, id }).then(
      ({ results }) => {
        if (alive) setAnswer({ key: attempt, rows: results, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, rows: null, error: errorMessage(err, 'Could not load plans.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id, attempt]);
  const current = answer?.key === attempt ? answer : null;
  const rows = current?.rows ?? null;
  const open = rows?.filter((row) => isOpen(row.status)) ?? [];
  // A Draft is neither open nor finished (Agents delivery 2, Decision 11).
  const drafts = rows?.filter((row) => row.status === 'draft') ?? [];
  const finished = rows?.filter((row) => !isOpen(row.status) && row.status !== 'draft') ?? [];

  const header = (
    <>
      <CardHeader
        title="Plans"
        id={headingId}
        action={
          <Link to={`${newPlanPath({ kind, id })}${search}`} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Start a plan
          </Link>
        }
      />
      {rows && open.length + drafts.length > 0 ? (
        <ListHeaderRow columns={PLAN_GRID.columns} labels={PLAN_GRID.labels} align={PLAN_GRID.aligns} show={PLAN_GRID.headerShow} />
      ) : null}
    </>
  );
  return (
    <div data-part="plans" className="@container">
      <ListCard
        label="Plans"
        header={header}
        state={!current ? <LoadingState label="Loading plans" count={2} /> : current.error ? <ErrorState message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : undefined}
        footer={
          finished.length > 0 ? (
            <button type="button" aria-expanded={showFinished} onClick={() => setShowFinished((value) => !value)} className={QUIET}>
              {showFinished ? (
                'Hide finished'
              ) : (
                <>
                  Show finished (<span className={NUM}>{finished.length}</span>)
                </>
              )}
            </button>
          ) : undefined
        }
      >
        {open.map((row) => (
          <PlanRowItem key={row.id} row={row} showRecord={false} />
        ))}
        {drafts.map((row) => (
          <PlanRowItem key={row.id} row={row} showRecord={false} />
        ))}
        {open.length + drafts.length === 0 ? (
          <li>
            <EmptyState size="inline" title="No open plans." />
          </li>
        ) : null}
        {showFinished ? finished.map((row) => <PlanRowItem key={row.id} row={row} showRecord={false} />) : null}
      </ListCard>
    </div>
  );
}
