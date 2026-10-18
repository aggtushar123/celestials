import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPlan } from '../../features/plans/planApi';
import { isDraft, isEditable } from '../../features/plans/planText';
import type { Plan } from '../../features/plans/planTypes';
import { DraftPlanBanner } from '../../components/plans/DraftPlanBanner';
import { PlanHeader } from '../../components/plans/PlanHeader';
import { PlanFailed, PlanLoading, PlanMissing } from '../../components/plans/PlanStates';
import { Timeline } from '../../components/plans/Timeline';
import { usePlan } from '../../components/plans/usePlan';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { FOCUS, PageHeader, TYPE } from '../../components/ui';

const BACK = { to: '/projects', label: 'Project Management' } as const;

/** /projects/:id (spec §2.3). */
export function PlanPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Plan" />
        <PlanMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedPlan key={id} id={Number(id)} />;
}

function LoadedPlan({ id }: { id: number }) {
  const [load, replace, retry] = usePlan(id);
  if (load.status === 'ready') return <PlanView plan={load.plan} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} title="Plan" />
      {load.status === 'loading' ? <PlanLoading /> : null}
      {load.status === 'missing' ? <PlanMissing /> : null}
      {load.status === 'failed' ? <PlanFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function PlanView({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (tick > 0) noticeRef.current?.focus();
  }, [tick]);
  // Edit is for editors of an open plan or a Draft; cancelling or finishing leaves it.
  const on = editing && plan.can_edit && isEditable(plan.status);
  function say(text: string) {
    setNotice(text);
    setTick((n) => n + 1);
  }
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-6 pb-6">
        <PlanHeader plan={plan} editing={on} onEdit={setEditing} onReplace={onReplace} />
        {/* Always mounted and never hidden, so it stays in the accessibility tree (sr-only while empty, so no dead space): Start plan's answer lands here and takes focus (Decision 12). */}
        <p ref={noticeRef} role="status" tabIndex={-1} className={`empty:sr-only ${TYPE.bodyMuted} ${FOCUS}`}>
          {notice}
        </p>
        {isDraft(plan.status) ? (
          <DraftPlanBanner
            plan={plan}
            onStarted={(next) => {
              onReplace(next);
              say('Started the plan.');
            }}
            onStale={(text) => {
              // Someone started it first: say so, then read it again quietly so the page shows it as it is.
              say(text);
              fetchPlan(plan.id).then(onReplace, () => undefined);
            }}
          />
        ) : null}
        <Timeline plan={plan} editing={on} onReplace={onReplace} />
      </div>
    </OrganizationsFrame>
  );
}
