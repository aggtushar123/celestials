import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Play } from 'lucide-react';
import { refusalBody, refusalCode, refusalDetail } from '../../features/agents/agentsApi';
import { startDraftPlan } from '../../features/plans/planApi';
import { draftNotice } from '../../features/plans/planText';
import type { Plan } from '../../features/plans/planTypes';
import { Figured } from '../brain/Figured';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Card, FOCUS, INLINE_TARGET, PRIMARY, TYPE } from '../ui';
import { useSubmitOnce } from './useSubmitOnce';

const ALERT_LINK = `${INLINE_TARGET} self-start font-semibold text-ink underline ${FOCUS}`;

type Refused = { text: string; planId: number | null };

/** A Draft plan's banner (Agents delivery 2, Decision 12): what Start plan
 *  will do, and Start plan for an editor (the page's one primary). NOT_DRAFT
 *  and PLAN_OPEN are the server's words: NOT_DRAFT goes up to the page
 *  (`onStale`), which says it and reads the plan again; PLAN_OPEN stays here
 *  and links the open plan. */
export function DraftPlanBanner({ plan, onStarted, onStale }: { plan: Plan; onStarted: (plan: Plan) => void; onStale: (text: string) => void }) {
  const textId = useId();
  const [refused, setRefused] = useState<Refused | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce();
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);

  async function start() {
    setRefused(null);
    const outcome = await run(() => startDraftPlan(plan.id));
    if (!outcome) return;
    if (outcome.ok) {
      onStarted(outcome.value);
      return;
    }
    const text = refusalDetail(outcome.error) ?? errorMessage(outcome.error, 'Could not start this plan.');
    if (refusalCode(outcome.error) === 'NOT_DRAFT') {
      onStale(text);
      return;
    }
    const body = refusalBody(outcome.error);
    const planId = refusalCode(outcome.error) === 'PLAN_OPEN' && body && typeof body.plan_id === 'number' ? body.plan_id : null;
    setRefused({ text, planId });
    setTick((n) => n + 1);
  }

  return (
    <Card as="section" aria-labelledby={textId} data-part="draft" className="flex flex-col gap-3">
      <p id={textId} className={`flex items-start gap-2 ${TYPE.body}`}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <Figured text={draftNotice(plan.pending_tasks)} />
        </span>
      </p>
      {plan.can_edit ? (
        <button type="button" disabled={busy} onClick={() => void start()} className={`${PRIMARY} self-start`}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Starting…' : 'Start plan'}
        </button>
      ) : (
        <p className={TYPE.meta}>Only the plan's owner or their managers can start it.</p>
      )}
      {refused ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-1 text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
          <p>{refused.text}</p>
          {refused.planId !== null ? (
            <Link to={`/projects/${refused.planId}`} className={ALERT_LINK}>
              Open that plan
            </Link>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
