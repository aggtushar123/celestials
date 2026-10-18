import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import type { RecordRef } from '../../features/canvas/canvasTypes';
import { isOpen, newPlanPath } from '../../features/plans/planText';
import type { PlanRow } from '../../features/plans/planTypes';
import { BUTTON, FOCUS, INLINE_TARGET, TYPE } from '../ui';
import { NextDue, StatusPill } from '../plans/parts';

/** The record's open plans above the board (spec §2.2). */
export function OpenPlansStrip({ plans, record }: { plans: PlanRow[]; record: RecordRef }) {
  const headingId = useId();
  const open = plans.filter((plan) => isOpen(plan.status));
  return (
    <section aria-labelledby={headingId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${TYPE.bodyMuted}`}>
      <h2 id={headingId} className={TYPE.label}>
        Open plans
      </h2>
      {open.length === 0 ? (
        <>
          <span>{SAY.NO_PLANS}</span>
          <Link to={newPlanPath(record)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Start a plan
          </Link>
        </>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
          {open.map((plan) => (
            <li key={plan.id}>
              <Link to={`/projects/${plan.id}`} className={`${INLINE_TARGET} inline-flex items-center gap-2 text-ink hover:underline ${FOCUS}`}>
                <span className="truncate font-semibold">{plan.name}</span>
                <StatusPill status={plan.status} />
                <NextDue date={plan.next_due} overdue={plan.is_overdue} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
